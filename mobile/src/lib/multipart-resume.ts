/**
 * Lets a multipart upload on the phone carry on from the part it reached.
 *
 * The shared uploader (src/api/multipart-upload.ts, byte-for-byte the same as
 * web's) always starts a fresh upload and always aborts when it gives up. That
 * is right in a browser tab. On a phone it throws away too much: the app is
 * killed, the train goes into a tunnel, and a 4 GB film that had 3.9 GB in the
 * bucket starts again from zero.
 *
 * So the deps it is handed are wrapped here rather than the uploader changed:
 *
 * - `start` hands back the saved session instead of opening a new upload, when
 *   there is one for this file and it is young enough to still exist in B2.
 * - A part the saved session already has an ETag for is not sent again.
 * - Every acknowledged part is reported through `onSession`, so the queue can
 *   persist it and the next launch can pick up from it.
 * - `abort` is deferred to `settle`, which sees the error the upload failed
 *   with. A dropped connection keeps the parts for a resume; a cancellation or
 *   a refusal releases them, exactly as web does.
 *
 * Parts kept for a resume that never comes are still released: by `remove` in
 * the upload queue, by the 24-hour limit below, and by the bucket's lifecycle
 * rule for anything this app never gets to run again (docs/LARGE_UPLOADS.md).
 *
 * Imports nothing but types, so `node --experimental-strip-types --test` can
 * load it (multipart-resume.test.mjs). Keep it that way.
 */

import type { MultipartDeps, PartTicket } from '../api/multipart-upload';

export interface MultipartSession {
  key: string;
  uploadId: string;
  partSize: number;
  partCount: number;
  /** The size of the file it was started for. Never reused for another size. */
  contentLength: number;
  /** ETag per acknowledged part, keyed by part number (a string after JSON). */
  etags: Record<string, string>;
  /** Epoch ms. Older than MAX_RESUME_AGE_MS and it is released, not resumed. */
  startedAt: number;
}

/**
 * How long a saved session is trusted.
 *
 * The bucket's lifecycle rule aborts incomplete uploads after a few days. A
 * session past that point has no parts left to resume, and its first part PUT
 * would fail with 404, so a day is a margin, not a guess at the rule.
 */
export const MAX_RESUME_AGE_MS = 24 * 60 * 60 * 1000;

/** Wait before part retry `attempt` (1-based): 1 s, 2 s, 4 s, 8 s, then 15 s. */
export function partRetryDelayMs(attempt: number): number {
  return Math.min(1000 * 2 ** (Math.max(1, attempt) - 1), 15_000);
}

/** Whether `session` can carry on an upload of a file of `contentLength` bytes. */
export function canResume(
  session: MultipartSession | undefined | null,
  contentLength: number,
  now: number,
): boolean {
  if (!session || typeof session !== 'object') return false;
  if (typeof session.key !== 'string' || !session.key) return false;
  if (typeof session.uploadId !== 'string' || !session.uploadId) return false;
  if (!(session.partSize > 0) || session.contentLength !== contentLength) return false;
  if (session.partCount !== Math.ceil(contentLength / session.partSize)) return false;
  if (!session.etags || typeof session.etags !== 'object') return false;
  const age = now - session.startedAt;
  return age >= 0 && age < MAX_RESUME_AGE_MS;
}

/** Parts a session already has, for "resuming from part n" style reporting. */
export function sentPartCount(session: MultipartSession | undefined | null): number {
  return session?.etags ? Object.keys(session.etags).length : 0;
}

/**
 * Whether a failed upload's parts are worth keeping for a later attempt.
 *
 * Only for failures that waiting can fix: no response at all (status 0), a
 * timeout, a rate limit, a server error. Not a cancellation, which is someone
 * asking for the parts to go; not a 403, which survived several fresh URLs and
 * so is a refusal rather than an expiry; not any other 4xx; and not an error
 * with no status, which here means the phone could not read its own file.
 */
export function shouldKeepForResume(error: unknown, cancelled: boolean): boolean {
  if (cancelled) return false;
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status !== 'number') return false;
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

export interface ResumableOptions {
  /** The session saved by an earlier attempt at this same file, if any. */
  resume?: MultipartSession;
  /**
   * Whether a failure may keep its parts for a later attempt. Off, `settle`
   * always aborts, which is the web behaviour.
   */
  keepForResume: boolean;
  /** Called with the session whenever it changes, and undefined once it is over. */
  onSession?: (session: MultipartSession | undefined) => void;
  now?: () => number;
}

export interface Resumable {
  deps: MultipartDeps;
  /**
   * Call once `uploadInParts` has rejected. Keeps the parts for a resume or
   * aborts the upload, by the rule in `shouldKeepForResume`. Never rejects.
   */
  settle(error: unknown, cancelled: boolean): Promise<void>;
  /** Parts that were skipped because an earlier attempt had sent them. */
  resumedParts(): number;
}

export function resumable(base: MultipartDeps, options: ResumableOptions): Resumable {
  const now = options.now ?? Date.now;
  let session: MultipartSession | undefined;
  let resumed = 0;

  // Which part a ticket is for, and the ETag of a part that needs no sending.
  // The uploader hands putPart the ticket partUrl returned, not the part
  // number, so the ticket object itself is the link between the two calls.
  const partOf = new WeakMap<PartTicket, number>();
  const alreadySent = new WeakMap<PartTicket, string>();

  const publish = () => options.onSession?.(session ? { ...session, etags: { ...session.etags } } : undefined);

  const deps: MultipartDeps = {
    async start(body) {
      const saved = options.resume;
      if (saved && canResume(saved, body.contentLength, now())) {
        session = { ...saved, etags: { ...saved.etags } };
        return {
          key: session.key,
          uploadId: session.uploadId,
          partSize: session.partSize,
          partCount: session.partCount,
        };
      }
      // A saved session that cannot be used still holds parts in the bucket.
      if (saved?.key && saved.uploadId) {
        void base.abort({ key: saved.key, uploadId: saved.uploadId }).catch(() => undefined);
      }

      const started = await base.start(body);
      session = {
        key: started.key,
        uploadId: started.uploadId,
        partSize: started.partSize,
        partCount: started.partCount,
        contentLength: body.contentLength,
        etags: {},
        startedAt: now(),
      };
      publish();
      return started;
    },

    async partUrl(body) {
      const etag = session?.etags[String(body.partNumber)];
      if (etag) {
        // Never sent anywhere: putPart below recognises it and returns at once.
        const ticket: PartTicket = { uploadUrl: '', requiredHeaders: {}, expiresAt: '' };
        alreadySent.set(ticket, etag);
        return ticket;
      }
      const ticket = await base.partUrl(body);
      partOf.set(ticket, body.partNumber);
      return ticket;
    },

    async putPart(part, ticket, onLoaded, signal) {
      const saved = alreadySent.get(ticket);
      if (saved) {
        resumed++;
        onLoaded(part.size);
        return saved;
      }
      const etag = await base.putPart(part, ticket, onLoaded, signal);
      const partNumber = partOf.get(ticket);
      if (session && partNumber) {
        session = { ...session, etags: { ...session.etags, [String(partNumber)]: etag } };
        publish();
      }
      return etag;
    },

    async complete(body) {
      const done = await base.complete(body);
      session = undefined;
      publish();
      return done;
    },

    // Deferred: the uploader calls this before it rethrows, without the error,
    // and the error is what decides. See `settle`.
    async abort() {},
  };

  return {
    deps,
    resumedParts: () => resumed,
    async settle(error, cancelled) {
      if (!session) return;
      if (options.keepForResume && shouldKeepForResume(error, cancelled)) return;
      const { key, uploadId } = session;
      session = undefined;
      publish();
      await base.abort({ key, uploadId }).catch(() => undefined);
    },
  };
}
