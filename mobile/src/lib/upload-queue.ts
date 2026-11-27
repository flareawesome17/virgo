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

/**
 * Files sent side by side while the app is in front.
 *
 * It was one. A batch of photographs is mostly round trips, not bytes: a
 * ticket, the PUT, a confirm, each a second or so from the Philippines, and
 * one file at a time spent most of a 294-file batch waiting on them. Worse,
 * one transfer that stopped moving held every file behind it at "Waiting".
 * Three keeps the uplink busy through each file's round trips without
 * splitting it so finely that every bar crawls. The web app runs six; a
 * phone's uplink is narrower.
 */
export const FOREGROUND_CONCURRENCY = 3;

export interface Startable extends Schedulable {
  id: string;
}

/**
 * Which files to start now, given what is already running.
 *
 * A large file (`isLarge`, sent in parts) goes alone while the app is in
 * front: it runs four parts of its own at once, and anything beside it
 * slows it down. When one reaches the head of the line it waits for the
 * files ahead of it to land, and nothing behind it jumps ahead meanwhile,
 * so the order is the order picked.
 *
 * Off screen (`offScreen`) only files sent in one piece are worth starting
 * beside others: a file in parts needs JavaScript between its parts, which
 * the system suspends. A large one is passed over there, not waited for.
 *
 * `wakeAt` is when to look again, when a slot is free and every queued file
 * is waiting out a delay.
 */
export function planStarts<T extends Startable>(
  tasks: readonly T[],
  options: {
    inFlight: ReadonlySet<string>;
    limit: number;
    offScreen: boolean;
    now: number;
    online: boolean;
    isLarge: (task: T) => boolean;
  },
): { start: T[]; wakeAt?: number } {
  const { inFlight, limit, offScreen, now, online, isLarge } = options;
  const start: T[] = [];
  const running = tasks.filter((task) => inFlight.has(task.id));
  // In front, a large file in flight has the line to itself.
  if (!offScreen && running.some(isLarge)) return { start };

  let candidates = tasks.filter((task) => !inFlight.has(task.id));
  let busy = inFlight.size;
  while (busy < limit) {
    const { task: next, wakeAt } = nextRunnable(candidates, now, online);
    if (!next) return wakeAt === undefined ? { start } : { start, wakeAt };
    candidates = candidates.filter((task) => task.id !== next.id);
    if (isLarge(next) && busy > 0) {
      if (offScreen) continue;
      break;
    }
    start.push(next);
    busy += 1;
    if (isLarge(next) && !offScreen) break;
  }
  return { start };
}

/**
 * Whether a queued file is the app's own copy, safe to delete once it is
 * uploaded or dropped.
 *
 * Both pickers copy what was chosen into the app's cache before handing it
 * over (the image picker even on iOS, to keep the original's format), and
 * nothing ever deleted those copies: a 3.7 GB batch left 3.7 GB behind, every
 * time, until the phone was short of space for the parts of the next film.
 * Only a file under `cacheDirectory` counts. The image picker's own folder
 * name is not relied on: on iOS a precedence slip in expo-image-picker puts
 * its copies at the top of the cache when that path ends in a slash.
 */
export function isDisposableCopy(uri: string, cacheDirectory: string | null | undefined): boolean {
  if (!cacheDirectory || !uri.startsWith('file://')) return false;
  const root = cacheDirectory.endsWith('/') ? cacheDirectory : `${cacheDirectory}/`;
  if (!uri.startsWith(root)) return false;
  const rest = uri.slice(root.length);
  // Something in the cache, never the cache itself or a walk out of it.
  return rest.length > 0 && !rest.split('/').includes('..');
}

/**
 * How long a transfer in front may send nothing before it is given up and
 * queued again. A whole minute without one byte is not a slow line.
 */
export const UPLOAD_STALL_MS = 60_000;

/** How often the stall watch looks. */
export const STALL_TICK_MS = 5_000;

/**
 * The longest a part may take, sent with no progress to watch: 16 KB a
 * second at worst, and never under three minutes. A 16 MB part gets 17.
 */
export function partDeadlineMs(bytes: number): number {
  return Math.max(3 * 60_000, Math.ceil(bytes / 16_384) * 1000);
}

/**
 * Notices a transfer that has stopped moving.
 *
 * On iOS every upload runs in a background URL session, and a background
 * session never fails for want of a network: it waits, and tries again by
 * itself, for up to a week. So a file whose connection died sat at 0% for as
 * long as anyone watched, and the queue behind it sat at "Waiting".
 *
 * `touch` on every sign of progress; `tick` every STALL_TICK_MS, true once
 * nothing has moved for `limitMs` of time the app was running in front.
 * Time off screen does not count, and neither does a gap between ticks long
 * enough to mean JavaScript was suspended: the transfer carried on without
 * anyone to tell, and its progress is about to arrive.
 */
export function stallWatch(limitMs: number, clock: () => number = Date.now) {
  let last = clock();
  let lastTick = last;
  let limit = limitMs;
  return {
    /** `sentAll`: the last byte is out, and only the answer is awaited. */
    touch(sentAll = false) {
      last = clock();
      if (sentAll) limit = limitMs * 3;
    },
    tick(active: boolean): boolean {
      const now = clock();
      const suspended = now - lastTick > STALL_TICK_MS * 3;
      lastTick = now;
      if (!active || suspended) {
        last = now;
        return false;
      }
      return now - last >= limit;
    },
  };
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
