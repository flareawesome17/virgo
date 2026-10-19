/**
 * Retries the API requests around an upload: the confirm that follows it, and
 * the ticket, multipart start, part-URL and complete requests that lead up to
 * it.
 *
 * By the time confirm is called the bytes are already in the bucket, so a
 * 503 from a busy API or a dropped connection on the way back says nothing
 * about the file. Marking it failed there made people send the whole file
 * again. Asking again is safe: the server's confirm is idempotent, and joins
 * a thumbnail already being made rather than starting another.
 *
 * The requests before the bytes are the same story told earlier. A
 * 1,167-file album lost 366 files to "Too many attempts" because a 429 on the
 * ticket request failed the file outright; nothing was wrong with any of them
 * but the pace. They are now waited out and asked again (withUploadRetry), and
 * a 429 pauses every upload request in the app, not just the one that drew it
 * (UploadPause), so the workers back off together instead of each spending
 * its own tries against a limit they all share.
 *
 * Kept free of imports, like multipart-upload.ts, so it can be tested with
 * plain node (confirm-retry.test.mjs).
 */

export interface ConfirmRetryOptions {
  /** Tries, the first included. */
  maxAttempts?: number;
  /**
   * Wait before try `attempt + 1`, replacing the computed delay. Injected so
   * tests need not sleep.
   */
  backoff?: (attempt: number, signal?: AbortSignal) => Promise<void>;
  /** The upload's own signal: once aborted, no further tries are made. */
  signal?: AbortSignal;
  /** The pause every upload request honours. The app-wide one by default. */
  pause?: UploadPause;
  /** How to wait `ms`. Injected so tests need not sleep. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

/** 1 s, 2 s, 4 s, then 8 s at most. */
export function confirmBackoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** (attempt - 1), 8000);
}

/**
 * 2 s, 4 s, 8 s, then 15 s at most, for the requests before the bytes.
 *
 * Slower than confirm's: what these mostly wait out is a rate limit counted
 * over a minute, and asking again in one second only draws another 429.
 */
export function uploadRetryDelayMs(attempt: number): number {
  return Math.min(2000 * 2 ** (attempt - 1), 15_000);
}

/**
 * The longest Retry-After honoured. The API's windows are a minute long, so
 * anything above this is a misconfiguration, not advice worth an idle queue.
 */
export const MAX_RETRY_AFTER_MS = 60_000;

/**
 * Whether asking again could work.
 *
 * No response at all (status 0, or a bare network error with no status), a
 * timeout, a rate limit and server errors, yes. Any other 4xx — an unusable
 * avatar, an album the caller may not upload into — will not change.
 */
export function isRetryableConfirmError(error: unknown): boolean {
  const status = statusOf(error);
  if (status === undefined) return true;
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

/** The same rule, for the requests before the bytes. A full quota is a 4xx. */
export const isRetryableRequestError = isRetryableConfirmError;

function statusOf(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : undefined;
}

/**
 * A Retry-After header as milliseconds from `now`.
 *
 * Either delay-seconds or an HTTP date (RFC 9110 §10.2.3). A date already past
 * is no wait at all. Undefined when there is no header or it makes no sense.
 */
export function parseRetryAfter(
  value: string | null | undefined,
  now: number = Date.now(),
): number | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  if (/^\d+$/.test(text)) return Number(text) * 1000;
  // An HTTP date always names its day and zone. Without the check, Date.parse
  // reads "-3" as the year 3 BC, which is in the past and so "no wait".
  if (!/[a-z]/i.test(text)) return undefined;
  const at = Date.parse(text);
  if (Number.isNaN(at)) return undefined;
  return Math.max(0, at - now);
}

/**
 * How long a failed request asked to be left, if it said: the `retryAfterMs`
 * the API client attaches to an error from the response's Retry-After.
 */
export function retryAfterMs(error: unknown): number | undefined {
  const value = (error as { retryAfterMs?: unknown } | null)?.retryAfterMs;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return Math.min(value, MAX_RETRY_AFTER_MS);
}

/**
 * One pause shared by every upload request in the app.
 *
 * The API's limits are per account, so every file going up at once draws on
 * one allowance. When one of them is told to wait, the others would be told
 * the same a moment later; holding them all back is what lets the allowance
 * refill instead of being spent on requests that cannot pass.
 */
export class UploadPause {
  private until = 0;
  private readonly now: () => number;

  // Not a parameter property: plain node strips types but cannot compile those.
  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  /** Holds every upload request for at least `ms`. Never shortens a pause. */
  hold(ms: number): void {
    this.until = Math.max(this.until, this.now() + ms);
  }

  remainingMs(): number {
    return Math.max(0, this.until - this.now());
  }
}

/** The app's one pause. */
export const uploadPause = new UploadPause();

/** Waits, waking early when the upload is cancelled. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done);
  });
}

/** Status 0, which is how every cancelled upload in the clients reports itself. */
function cancelled(): Error {
  return Object.assign(new Error('Upload was cancelled.'), { status: 0 });
}

/**
 * The loop both retries share: wait out the shared pause, try, and on a
 * retryable failure wait — Retry-After when the server gave one, `delayMs`
 * otherwise — and try again. A 429 also holds the shared pause for that long.
 */
async function retrying<T>(
  call: () => Promise<T>,
  options: ConfirmRetryOptions,
  defaultAttempts: number,
  delayMs: (attempt: number) => number,
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? defaultAttempts);
  const pause = options.pause ?? uploadPause;
  const wait = options.sleep ?? sleep;
  const { signal } = options;
  let lastError: unknown = undefined;

  for (let attempt = 1; ; attempt++) {
    // A loop, not one wait: another request can lengthen the pause while
    // this one sleeps through it.
    let paused = false;
    for (let left = pause.remainingMs(); left > 0 && !signal?.aborted; left = pause.remainingMs()) {
      paused = true;
      await wait(left, signal);
    }
    // Cancelled while held back. A request not held back goes out as it
    // always did: a confirm for bytes already sent is still worth making.
    if (paused && signal?.aborted) throw attempt === 1 ? cancelled() : lastError;

    try {
      return await call();
    } catch (error) {
      lastError = error;
      if (signal?.aborted || attempt >= maxAttempts || !isRetryableRequestError(error)) {
        throw error;
      }
      const ms = retryAfterMs(error) ?? delayMs(attempt);
      if (statusOf(error) === 429) pause.hold(ms);
      if (options.backoff) await options.backoff(attempt, signal);
      else await wait(ms, signal);
      if (signal?.aborted) throw error;
    }
  }
}

/**
 * Runs `confirm`, trying again on a retryable failure: four tries, 1 s apart
 * and doubling, or as long as a 429's Retry-After says.
 *
 * Rejects with the last error when the tries run out, the error is not
 * retryable, or the upload was cancelled.
 */
export function withConfirmRetry<T>(
  confirm: () => Promise<T>,
  options: ConfirmRetryOptions = {},
): Promise<T> {
  return retrying(confirm, options, 4, confirmBackoffMs);
}

/**
 * Runs one of the requests before the bytes — the ticket, a multipart start,
 * a part URL, a complete — trying again on a rate limit, a server error or a
 * dropped connection: five tries, 2 s, 4 s, 8 s and 15 s apart, or as long as
 * Retry-After says.
 *
 * Each of these is safe to repeat. A ticket or a part URL is only a
 * signature; a start whose answer was lost leaves an empty multipart upload
 * the bucket's lifecycle rule clears; a complete whose answer was lost is
 * refused the second time, which fails the file exactly as it did before
 * this retried anything; and a 429 is refused before the route runs at all.
 */
export function withUploadRetry<T>(
  call: () => Promise<T>,
  options: ConfirmRetryOptions = {},
): Promise<T> {
  return retrying(call, options, 5, uploadRetryDelayMs);
}
