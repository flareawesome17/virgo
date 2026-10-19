/**
 * Which upload goes next, and what to do with one that could not reach the
 * network.
 *
 * The upload queue (src/providers/UploadProvider.tsx) used to mark a file
 * failed the moment a request went unanswered, which on a phone means every
 * lift, tunnel and dead zone produced a red row and a "try again" for a file
 * that had done nothing wrong. A file that failed for want of a connection is
 * queued again instead and waits: for the network to come back, and then for a
 * short, growing delay in case the network only says it is back.
 *
 * Imports nothing, so `node --experimental-strip-types --test` can load it
 * (upload-queue.test.mjs). Keep it that way.
 */

export interface Schedulable {
  status: string;
  /** Epoch ms before which this one is not tried again. */
  retryAt?: number;
}

/**
 * The next task to run, or when to look again.
 *
 * Offline, nothing runs and no wake-up is asked for: the connectivity listener
 * is what wakes the queue. Online, the first queued task that is not waiting
 * out a delay runs; when they all are, `wakeAt` is the earliest delay's end.
 */
export function nextRunnable<T extends Schedulable>(
  tasks: readonly T[],
  now: number,
  online: boolean,
): { task?: T; wakeAt?: number } {
  if (!online) return {};
  let wakeAt: number | undefined;
  for (const task of tasks) {
    if (task.status !== 'queued') continue;
    if (!task.retryAt || task.retryAt <= now) return { task };
    wakeAt = wakeAt === undefined ? task.retryAt : Math.min(wakeAt, task.retryAt);
  }
  return wakeAt === undefined ? {} : { wakeAt };
}

/**
 * Whether an upload failed only because nothing answered.
 *
 * Status 0 is what every layer here uses for "no response": the API client,
 * the part uploader and the single PUT. A cancellation is also status 0, and
 * is not this.
 */
export function isConnectivityFailure(error: unknown, cancelled: boolean): boolean {
  if (cancelled) return false;
  const status = (error as { status?: unknown } | null)?.status;
  return status === 0;
}

/** Wait before connectivity retry `failures` (1-based): 5 s doubling to 5 min. */
export function connectivityRetryDelayMs(failures: number): number {
  return Math.min(5_000 * 2 ** (Math.max(1, failures) - 1), 5 * 60_000);
}

/**
 * Whether a NetInfo state counts as online for uploading.
 *
 * Reachability is `null` until NetInfo has checked, and on some networks it
 * stays that way. Treating unknown as offline would park the queue forever on
 * those, so only an explicit `false` holds uploads back.
 */
export function isOnlineForUploads(state: {
  isConnected: boolean | null;
  isInternetReachable?: boolean | null;
}): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}
