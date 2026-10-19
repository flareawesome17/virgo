/**
 * Sends one large file as independent parts (docs/LARGE_UPLOADS.md).
 *
 * start -> N x (part-url -> PUT part) -> complete, with B2 assembling the parts.
 * A part that fails is retried on its own with a fresh URL, so a dropped
 * connection costs seconds rather than the whole file, and no transfer has to
 * fit inside one presigned window.
 *
 * Kept free of imports and of the browser's network objects: the four API calls
 * and the part PUT arrive as `deps`, which is what lets the retry, ordering and
 * cleanup behaviour be tested without a network (multipart-upload.test.ts).
 */

export interface MultipartStart {
  key: string;
  uploadId: string;
  partSize: number;
  partCount: number;
}

export interface PartTicket {
  uploadUrl: string;
  requiredHeaders: Record<string, string>;
  expiresAt: string;
}

export interface MultipartDeps {
  start(body: {
    contentType: string;
    scope: string;
    contentLength: number;
    albumId?: string;
  }): Promise<MultipartStart>;
  partUrl(body: {
    key: string;
    uploadId: string;
    partNumber: number;
    contentLength: number;
  }): Promise<PartTicket>;
  /** Sends one part and resolves with its ETag. Reports bytes sent so far. */
  putPart(
    part: Blob,
    ticket: PartTicket,
    onLoaded: (loaded: number) => void,
    signal?: AbortSignal,
  ): Promise<string>;
  complete(body: {
    key: string;
    uploadId: string;
    parts: { partNumber: number; etag: string }[];
    albumId?: string;
  }): Promise<{ key: string; size: number }>;
  abort(body: { key: string; uploadId: string }): Promise<void>;
}

export interface MultipartOptions {
  contentType: string;
  scope: string;
  albumId?: string;
  /** 0-1 across the whole file. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  /** Parts in flight at once. */
  concurrency?: number;
  /** Tries per part, the first included. */
  maxAttempts?: number;
  /** Wait before try `attempt` (1-based). Injected so tests need not sleep. */
  backoff?: (attempt: number) => Promise<void>;
}

/** A cancelled upload. Distinct so the caller can tell it from a failure. */
export class UploadCancelled extends Error {
  constructor() {
    super('Upload was cancelled.');
    this.name = 'UploadCancelled';
  }
}

const defaultBackoff = (attempt: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, Math.min(500 * 2 ** (attempt - 1), 8000)));

/**
 * Whether trying the same part again could work.
 *
 * Network failures (status 0), an expired or mismatched signature (403 — the
 * retry mints a new URL), a timeout, a rate limit and server errors, yes. Any
 * other 4xx will not become true by asking again.
 */
export function isRetryablePartError(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status !== 'number') return true;
  return status === 0 || status === 403 || status === 408 || status === 429 || status >= 500;
}

export async function uploadInParts(
  file: Blob,
  options: MultipartOptions,
  deps: MultipartDeps,
): Promise<{ key: string; size: number }> {
  const { signal } = options;
  const concurrency = Math.max(1, options.concurrency ?? 4);
  const maxAttempts = Math.max(1, options.maxAttempts ?? 4);
  const backoff = options.backoff ?? defaultBackoff;

  if (signal?.aborted) throw new UploadCancelled();

  const started = await deps.start({
    contentType: options.contentType,
    scope: options.scope,
    contentLength: file.size,
    albumId: options.albumId,
  });
  const { key, uploadId, partSize, partCount } = started;

  // Cancelling or failing one part stops the others, rather than letting them
  // keep sending bytes for an upload that is already lost.
  const stop = new AbortController();
  const onOuterAbort = () => stop.abort();
  signal?.addEventListener('abort', onOuterAbort);

  const loaded = new Array<number>(partCount).fill(0);
  const report = () => {
    const sent = loaded.reduce((a, b) => a + b, 0);
    options.onProgress?.(Math.min(sent / file.size, 1));
  };

  const etags = new Array<string>(partCount);
  let next = 0;

  const sendPart = async (index: number) => {
    const partNumber = index + 1;
    const blob = file.slice(index * partSize, Math.min((index + 1) * partSize, file.size));

    for (let attempt = 1; ; attempt++) {
      if (stop.signal.aborted) throw new UploadCancelled();
      try {
        const ticket = await deps.partUrl({
          key,
          uploadId,
          partNumber,
          contentLength: blob.size,
        });
        loaded[index] = 0;
        etags[index] = await deps.putPart(
          blob,
          ticket,
          (n) => {
            loaded[index] = Math.min(n, blob.size);
            report();
          },
          stop.signal,
        );
        loaded[index] = blob.size;
        report();
        return;
      } catch (error) {
        if (stop.signal.aborted) throw new UploadCancelled();
        loaded[index] = 0;
        report();
        if (attempt >= maxAttempts || !isRetryablePartError(error)) throw error;
        await backoff(attempt);
      }
    }
  };

  const worker = async () => {
    while (next < partCount) {
      const index = next++;
      await sendPart(index);
    }
  };

  try {
    await Promise.all(
      Array.from({ length: Math.min(concurrency, partCount) }, () =>
        worker().catch((error) => {
          stop.abort();
          throw error;
        }),
      ),
    );

    if (signal?.aborted) throw new UploadCancelled();

    const done = await deps.complete({
      key,
      uploadId,
      parts: etags.map((etag, i) => ({ partNumber: i + 1, etag })),
      albumId: options.albumId,
    });
    options.onProgress?.(1);
    return done;
  } catch (error) {
    // The parts of an unfinished upload are billed until something removes
    // them. This is the first of the two safeguards; the bucket's lifecycle
    // rule is the second, for when this code never gets to run.
    stop.abort();
    await deps.abort({ key, uploadId }).catch(() => undefined);
    throw signal?.aborted && !(error instanceof UploadCancelled) ? new UploadCancelled() : error;
  } finally {
    signal?.removeEventListener('abort', onOuterAbort);
  }
}
