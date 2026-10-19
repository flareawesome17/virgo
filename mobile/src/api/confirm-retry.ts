/**
 * Retries the confirm that follows an upload.
 *
 * By the time confirm is called the bytes are already in the bucket, so a
 * 503 from a busy API or a dropped connection on the way back says nothing
 * about the file. Marking it failed there made people send the whole file
 * again. Asking again is safe: the server's confirm is idempotent, and joins
 * a thumbnail already being made rather than starting another.
 *
 * Kept free of imports, like multipart-upload.ts, so it can be tested with
 * plain node (confirm-retry.test.mjs).
 */

export interface ConfirmRetryOptions {
  /** Tries, the first included. */
  maxAttempts?: number;
  /** Wait before try `attempt + 1`. Injected so tests need not sleep. */
  backoff?: (attempt: number, signal?: AbortSignal) => Promise<void>;
  /** The upload's own signal: once aborted, no further tries are made. */
  signal?: AbortSignal;
}

/** 1 s, 2 s, 4 s, then 8 s at most. */
export function confirmBackoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** (attempt - 1), 8000);
}

/**
 * Whether asking again could work.
 *
 * No response at all (status 0, or a bare network error with no status), a
 * timeout, a rate limit and server errors, yes. Any other 4xx — an unusable
 * avatar, an album the caller may not upload into — will not change.
 */
export function isRetryableConfirmError(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status !== 'number') return true;
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

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

const defaultBackoff = (attempt: number, signal?: AbortSignal) =>
  sleep(confirmBackoffMs(attempt), signal);

/**
 * Runs `confirm`, trying again on a retryable failure.
 *
 * Rejects with the last error when the tries run out, the error is not
 * retryable, or the upload was cancelled.
 */
export async function withConfirmRetry<T>(
  confirm: () => Promise<T>,
  options: ConfirmRetryOptions = {},
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 4);
  const backoff = options.backoff ?? defaultBackoff;
  const { signal } = options;

  for (let attempt = 1; ; attempt++) {
    try {
      return await confirm();
    } catch (error) {
      if (signal?.aborted || attempt >= maxAttempts || !isRetryableConfirmError(error)) {
        throw error;
      }
      await backoff(attempt, signal);
      if (signal?.aborted) throw error;
    }
  }
}
