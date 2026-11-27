import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system/legacy';
import { useQueryClient } from '@tanstack/react-query';
import { storageApi } from '@/src/api';
import { HANDOFF_MAX_FILES, MULTIPART_MIN_BYTES } from '@/src/api/endpoints/storage';
import { withConfirmRetry, withUploadRetry } from '@/src/api/confirm-retry';
import { useAuth, usageQueryKey } from '@/src/hooks';
import {
  fractionSent,
  handoffStanding,
  isWorthAnotherHandoff,
  itemsForTicket,
  nextHandoffBatch,
  taskIdOf,
  type HandoffTicket,
  type ItemResult,
} from '@/src/lib/handoff-plan';
import { MAX_RESUME_AGE_MS, type MultipartSession } from '@/src/lib/multipart-resume';
import { nativeUploads } from '@/src/lib/native-uploads';
import {
  connectivityRetryDelayMs,
  FOREGROUND_CONCURRENCY,
  isConnectivityFailure,
  isDisposableCopy,
  isOnlineForUploads,
  planStarts,
} from '@/src/lib/upload-queue';
import {
  clearUploadProgress,
  showUploadFinished,
  showUploadProgress,
} from '@/src/lib/notifications';
import { LEGACY_UPLOAD_QUEUE_KEY, uploadQueueKey } from '@/src/lib/upload-queue-storage';

export type UploadStatus = 'queued' | 'uploading' | 'done' | 'failed';

export interface UploadTask {
  id: string;
  uri: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  albumId: string;
  status: UploadStatus;
  /** 0–1, real bytes sent, from the upload task itself. */
  progress: number;
  error?: string;
  /**
   * The object key, once a ticket has been minted for this file.
   *
   * Recorded before any bytes are sent, because it is the only handle on an
   * upload that outlives the process. The transfer runs in a native
   * background session and can finish after the app is gone; the key is what
   * lets the next launch ask the server whether it did.
   */
  key?: string;
  /**
   * A large file's upload in parts, as far as it got: the upload id and the
   * ETag of every part B2 has acknowledged. Persisted with the queue, so a
   * relaunch or a retry carries on from the part it reached instead of
   * sending gigabytes again. Cleared once the file is assembled or released.
   */
  multipart?: MultipartSession;
  /** Epoch ms. Queued again after a connectivity failure, not before this. */
  retryAt?: number;
  /** Connectivity failures in a row, for the growing wait between tries. */
  networkFailures?: number;
  /**
   * Set once the file is handed to the system to send (builds with the
   * native module; docs/BACKGROUND_UPLOADS.md): its key, and the items the
   * system holds for it, one per PUT. No URL is kept here; only the system
   * has those. Cleared when it is filed, fails, or is handed over afresh.
   */
  handoff?: {
    key: string;
    expiresAt: string;
    items: { id: string; length?: number }[];
  };
}

/**
 * Whether this build sends uploads through the app's own native module, which
 * hands them to iOS or Android so they carry on with the app off screen. Older
 * builds have no module and send from JavaScript, as before.
 */
const NATIVE = Platform.OS !== 'web' && nativeUploads !== null;

/** What a caller hands over. Everything else is bookkeeping. */
export interface NewUpload {
  uri: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  albumId: string;
}

interface UploadContextValue {
  tasks: UploadTask[];
  /** Something is in flight or waiting to be. */
  active: boolean;
  /** 0–1 across everything in this batch, weighted by size. */
  overall: number;
  /** Still to finish, including the one in flight. */
  remaining: number;
  enqueue: (items: NewUpload[]) => void;
  retry: (id: string) => void;
  remove: (id: string) => void;
  /** Drops the finished ones, keeping anything still running or failed. */
  clearFinished: () => void;
}

/**
 * The no-op fallback.
 *
 * A method called on a context must exist on the type, in the provider value
 * *and* here — a screen rendered outside the provider (a designer preview, a
 * test) should do nothing rather than crash on `undefined is not a function`.
 */
const FALLBACK: UploadContextValue = {
  tasks: [],
  active: false,
  overall: 0,
  remaining: 0,
  enqueue: () => {},
  retry: () => {},
  remove: () => {},
  clearFinished: () => {},
};

const UploadContext = createContext<UploadContextValue>(FALLBACK);

/**
 * What the queue can be asked to do, apart from where it has got to.
 *
 * These four never change. Kept in a context of their own so that a screen
 * which only adds files does not hear about progress: the album asked for
 * `enqueue` from the one context there was, and so redrew itself, all of it,
 * for every percent of every file it was uploading.
 */
type UploadActions = Pick<UploadContextValue, 'enqueue' | 'retry' | 'remove' | 'clearFinished'>;
const UploadActionsContext = createContext<UploadActions>(FALLBACK);

/**
 * How often, at most, an album is read again while files are landing in it.
 *
 * Every read fetches each page of the album that is loaded and redraws its
 * grid, and the album also asks again every five seconds by itself while a
 * new file is still being processed (useAlbumFiles), which during a batch is
 * always. At 2.5 s the two together kept a growing album redrawing for the
 * whole of the upload. The tiles of what is still uploading are drawn above
 * the grid meanwhile, so nothing goes missing in the wait.
 */
const ALBUM_REFRESH_EVERY_MS = 6000;

/**
 * How often, at most, progress redraws anything.
 *
 * The provider sits above every screen, and the native uploader reports
 * every few kilobytes. It was one redraw per whole percent per file, which
 * for a 4 MB photograph on a good line is a hundred redraws in two seconds,
 * each through every view of the queue. Four a second is all a bar needs,
 * however many files are moving; the web app uses five.
 */
const PROGRESS_FLUSH_MS = 250;

/**
 * How many files are sent at once after the app has left the screen.
 *
 * In front, a few at a time (FOREGROUND_CONCURRENCY): more than that and they
 * split one uplink so finely that every bar crawls. Behind, there is no bar
 * to watch and no JavaScript to start the
 * next file when one ends, so whatever is going to be sent has to be started
 * before iOS suspends the app. The system queues them itself, a few
 * connections at a time. A ticket is good for fifteen minutes, which is what
 * keeps this a handful and not the whole queue: one started too far back in
 * the line would reach its turn with a dead ticket and be sent again later.
 */
const BACKGROUND_BURST = 8;

/** Only rewrite the drawer when the number visibly moved. */
const NOTIFY_EVERY_PERCENT = 5;

/**
 * Reads the queue this account left behind on a previous launch.
 *
 * Anything unparseable is discarded rather than thrown: a queue we cannot read
 * is not worth failing the app's startup over, and the objects it described are
 * still recoverable by the server's own accounting.
 */
async function loadPersisted(userId: string): Promise<UploadTask[]> {
  try {
    let raw = await AsyncStorage.getItem(uploadQueueKey(userId));
    if (raw === null) {
      // The one queue from before they were kept per account. It belongs to
      // whoever was signed in when this version arrived — the same session,
      // carried across the update — so the first account to load takes it.
      raw = await AsyncStorage.getItem(LEGACY_UPLOAD_QUEUE_KEY);
      if (raw !== null) await AsyncStorage.removeItem(LEGACY_UPLOAD_QUEUE_KEY);
    }
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as UploadTask[]) : [];
  } catch {
    return [];
  }
}

/** Shown on a file that is waiting for the network to come back. */
const WAITING_FOR_CONNECTION = 'Waiting for a connection';

/**
 * Releases the parts of an upload that will not be carried on.
 *
 * Best effort and never awaited by anything that matters: offline it fails,
 * and the bucket's lifecycle rule releases them in a few days instead.
 */
function releaseMultipart(session: MultipartSession | undefined): void {
  if (!session?.key || !session.uploadId) return;
  void storageApi.abortMultipart(session).catch(() => undefined);
}

/**
 * Deletes the picker's copy of a file that is uploaded, or that will not be.
 *
 * The pickers hand over a copy in the app's cache, not the original, and
 * nothing deleted those copies: every batch stayed on the phone a second
 * time, 3.7 GB for 3.7 GB, until there was no room left for a film's parts.
 * Only copies in the cache (isDisposableCopy): never a file the person owns.
 */
function discardCopy(uri: string | undefined): void {
  if (!uri || !isDisposableCopy(uri, FileSystem.cacheDirectory)) return;
  void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
}

/**
 * The same task for the saved queue: everything but progress, which a
 * relaunch never uses (it starts from the key or the parts).
 */
function samePersisted(a: UploadTask, b: UploadTask | undefined): boolean {
  if (a === b) return true;
  if (!b) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)] as (keyof UploadTask)[]);
  for (const key of keys) {
    if (key !== 'progress' && a[key] !== b[key]) return false;
  }
  return true;
}

/**
 * Uploads that outlive the screen that started them.
 *
 * The upload screen used to own the queue, the loop and the progress, all in
 * component state. Leaving the screen took them with it, so picking twenty
 * photographs meant watching a progress bar until it finished — the app was
 * unusable for the duration of its slowest job.
 *
 * Mounted at the root instead, so navigating away is just navigation. The
 * screen becomes one view onto this, and the bar in the tab bar is another.
 *
 * **It does not survive the app being backgrounded.** iOS suspends JavaScript
 * a few seconds after the app leaves the screen and an upload in flight stalls
 * there until it comes back. Surviving that needs a native background transfer
 * session — URLSession on iOS, WorkManager on Android — which is a native
 * module and a new binary, not something reachable from here. What this does
 * is make the app usable while an upload runs, which is the other half.
 *
 * Deliberately not in `src/hooks/`: that directory is compared byte-for-byte
 * against `web/src/hooks` and this has no meaning in a browser.
 */
export function UploadProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  /**
   * The account `tasks` belongs to. Set with the tasks it loaded, and cleared
   * the moment the signed-in account changes, so nothing is saved under — or
   * run for — the wrong one in between.
   */
  const [owner, setOwner] = useState<string | null>(null);

  // The loop reads these without re-subscribing. The files in flight are a
  // ref rather than state because two renders in the same tick must not both
  // start the same upload — state would still read as it was in the second.
  const inFlight = useRef(new Set<string>());
  /**
   * Set while the app is off screen on iOS: the runner then starts several
   * files instead of one (see BACKGROUND_BURST).
   */
  const burst = useRef(false);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const lastNotifiedPercent = useRef(-1);

  /**
   * Whether this provider is still on screen.
   *
   * The runner used to decide that with a `cancelled` flag closed over by its
   * effect and set in the effect's cleanup. That flag was tripped by the
   * runner's own first action: marking a task `uploading` writes to `tasks`,
   * `tasks` is a dependency, so React tore the effect down and `cancelled`
   * went true while the upload was still in flight — every time, within a
   * tick of starting.
   *
   * Everything behind the flag was then dropped: no progress was ever
   * recorded, so the bar sat at 0%, and the task was never marked `done`, so
   * the bar never went away and the finished notification never fired. The
   * bytes still went to B2 and the album still refreshed, because neither of
   * those was behind the flag — which is exactly why it looked like a display
   * bug rather than a dead guard.
   *
   * A ref set once, on unmount, is what the guard was always meant to be: it
   * cannot be reset by a state update, because it does not depend on one.
   */
  const mounted = useRef(true);
  useEffect(() => () => {
    mounted.current = false;
  }, []);

  /**
   * The last whole percent seen for each running task, so a callback that
   * changes nothing visible costs nothing.
   */
  const lastPatchedPercent = useRef(new Map<string, number>());

  /**
   * Progress waiting to be drawn, by task id, and the timer that draws it:
   * every running file's at once, at most every PROGRESS_FLUSH_MS.
   */
  const pendingProgress = useRef(new Map<string, number>());
  const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (progressTimer.current) clearTimeout(progressTimer.current);
    },
    [],
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const was = appState.current;
      appState.current = next;
      // With the native module every file is already with the system; there
      // is nothing to hand over on the way out.
      if (Platform.OS !== 'ios' || NATIVE) return;

      if (next === 'active') {
        burst.current = false;
        return;
      }
      if (next !== 'background' || was === 'background') return;

      /*
       * Leaving. iOS suspends JavaScript within seconds, and with it the loop
       * that starts each next file; a transfer already handed to the system
       * carries on in its own session. So the next few are handed over now.
       *
       * Only files sent in one piece: one sent in parts needs JavaScript
       * between the parts, and stops where it is until the app is back.
       */
      const queued = tasksRef.current.filter(
        (task) => task.status === 'queued' && !inFlight.current.has(task.id),
      );
      const handed = Math.min(
        Math.max(0, BACKGROUND_BURST - inFlight.current.size),
        queued.filter((task) => task.sizeBytes < MULTIPART_MIN_BYTES).length,
      );
      const waiting = queued.length - handed;
      burst.current = true;
      if (handed > 0) setTasks((prev) => [...prev]);

      // Said, since it cannot all be helped: a batch left to "carry on" was
      // found an hour later exactly where it was, with nothing to say why.
      if (waiting > 0) {
        const going = handed + inFlight.current.size;
        void showUploadFinished(
          going > 0 ? 'Some uploads are waiting' : 'Uploads paused',
          `${going > 0 ? `${going} ${going === 1 ? 'file is' : 'files are'} still uploading. ` : ''}${waiting} ${
            waiting === 1 ? 'waits' : 'wait'
          } until you open Virgo again.`,
        );
      }
    });
    return () => sub.remove();
  }, []);

  /** The list as last rendered, for callbacks that must not re-subscribe. */
  const tasksRef = useRef<UploadTask[]>([]);
  tasksRef.current = tasks;

  /** Set below; the launch path calls it once the saved list is in place. */
  const reconcileRef = useRef<((list: UploadTask[]) => Promise<void>) | null>(null);

  /**
   * How to stop the upload in flight, by task id.
   *
   * Removing a task used to leave a running upload running: the row went, the
   * bytes kept going, and the file then turned up in the album anyway. The
   * controller exists from the moment the runner picks a task, so one removed
   * before its transfer has started is stopped the moment it does.
   */
  const controllers = useRef(new Map<string, AbortController>());

  /** Wakes the runner when a file's wait after a connectivity failure ends. */
  const wakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (wakeTimer.current) clearTimeout(wakeTimer.current);
    },
    [],
  );

  /**
   * Whether uploads may run. Offline, the queue holds rather than burning
   * through every file with "could not reach storage".
   *
   * Starts true: NetInfo answers within a moment, and until it does an upload
   * that cannot connect is simply queued again.
   */
  const [online, setOnline] = useState(true);
  const wasOnline = useRef(true);
  useEffect(
    () =>
      NetInfo.addEventListener((state) => {
        const next = isOnlineForUploads(state);
        if (next && !wasOnline.current) {
          // Back. A file waiting out a delay goes now, not minutes from now:
          // the delay was a guess at when the network would return.
          setTasks((prev) =>
            prev.some((task) => task.retryAt)
              ? prev.map((task) => (task.retryAt ? { ...task, retryAt: undefined } : task))
              : prev,
          );
        }
        wasOnline.current = next;
        setOnline(next);
      }),
    [],
  );

  /**
   * Nothing runs until the previous launch's queue has been accounted for.
   *
   * Without this the runner would start on an empty list, and a file whose
   * bytes are already in the bucket would be uploaded a second time.
   */
  const [hydrated, setHydrated] = useState(false);

  // Once per account: on launch, and again whenever someone else signs in.
  // Signing out empties the list and loads nothing. An upload already in
  // flight finishes or fails on its own; its row stays in its own account's
  // saved queue, and that account picks it up — by its key, like any upload
  // cut off by the process ending — the next time it signs in here.
  useEffect(() => {
    let cancelled = false;
    setHydrated(false);
    setOwner(null);
    setTasks([]);
    if (!userId) return;

    (async () => {
      const saved = await loadPersisted(userId);
      if (cancelled) return;

      // Settle each interrupted task against the server before the runner is
      // allowed to touch the list. Sequential on purpose: this is a handful of
      // rows at most, and it runs while the app is starting.
      const settled: UploadTask[] = [];
      for (const task of saved) {
        if (task.status === 'done' || task.status === 'failed') {
          // A failed large file keeps its parts so "try again" carries on. Not
          // forever: past the age a resume is trusted for, they are released
          // rather than billed until the bucket's lifecycle rule gets to them.
          if (
            task.multipart &&
            !(Date.now() - task.multipart.startedAt < MAX_RESUME_AGE_MS)
          ) {
            releaseMultipart(task.multipart);
            settled.push({ ...task, multipart: undefined });
            continue;
          }
          settled.push(task);
          continue;
        }

        // Handed to the system to send: what the system holds, what it
        // reported while the app was gone, and what the server has are
        // compared once the list is in place (reconcileHandoffs).
        if (task.handoff) {
          settled.push({ ...task, status: 'queued', progress: 0, retryAt: undefined });
          continue;
        }

        // No key means no ticket was ever minted, so nothing was sent.
        if (!task.key) {
          settled.push({ ...task, status: 'queued', progress: 0, retryAt: undefined });
          continue;
        }

        try {
          // The server is the only authority on whether the object landed —
          // the transfer finished in a process that no longer exists, so there
          // is nothing local that knows. This is also what attaches it to its
          // album, which is the step the dead process never reached.
          const stat = await storageApi.confirm(task.key, task.albumId, task.name);
          if (stat.exists) discardCopy(task.uri);
          settled.push(
            stat.exists
              ? { ...task, status: 'done', progress: 1, multipart: undefined }
              : // Not there. An upload in parts keeps its key and session: the
                // object only exists once assembled, and the parts sent so far
                // are what the next attempt carries on from.
                {
                  ...task,
                  status: 'queued',
                  progress: 0,
                  retryAt: undefined,
                  key: task.multipart ? task.key : undefined,
                },
          );
        } catch {
          // Offline, or the API having a bad moment. Queue it rather than
          // failing it: a retry costs an upload, and giving up costs the file.
          // The key stays, so the runner asks once more before sending.
          settled.push({ ...task, status: 'queued', progress: 0, retryAt: undefined });
        }
      }

      // A file picked from the gallery lives in a cache directory the system
      // may clear. Re-queueing one that is gone would fail on every attempt
      // forever, so it is marked once, with a reason someone can act on.
      const checked = await Promise.all(
        settled.map(async (task) => {
          // A handed-over file's copy may already be sent and deleted; the
          // system says what became of it.
          if (task.status !== 'queued' || task.handoff) return task;
          const info = await FileSystem.getInfoAsync(task.uri).catch(() => null);
          if (info?.exists) return task;
          // Sent in one piece and ticketed: it may well have arrived, and its
          // copy been deleted for that reason, with only the word "done" lost
          // to the app ending. The runner asks the server before anything
          // else, and fails it as gone only if the server has nothing.
          if (task.key && !task.multipart) return task;
          // Nothing left to send the rest from, so its parts are let go.
          releaseMultipart(task.multipart);
          return {
            ...task,
            status: 'failed' as const,
            error: 'That file is no longer on this device.',
            multipart: undefined,
          };
        }),
      );

      if (!cancelled) {
        setTasks(checked);
        setOwner(userId);
        setHydrated(true);
        if (NATIVE) void reconcileRef.current?.(checked);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Written whenever something a relaunch needs has changed, so a process that
  // ends without warning leaves behind whatever was true a moment ago.
  // Finished rows are dropped: their only purpose was to be displayed, and a
  // batch from last week should not greet somebody on launch.
  //
  // Progress is not one of those things. A relaunch starts a file again from
  // its key or its parts, never from a percentage, and writing the whole queue
  // for every percent of every file was a hundred serialisations and disk
  // writes a file, all on the thread that answers taps.
  //
  // Nor is it worth turning the queue into text to find that out. That is
  // what this did: the whole queue, 294 files of it, made into a string on
  // every progress redraw only to be compared with the last one and thrown
  // away. The tasks are compared field by field instead, which costs next to
  // nothing, and text is made only when something a relaunch needs changed.
  const lastSaved = useRef<{ owner: string; tasks: UploadTask[] } | null>(null);
  useEffect(() => {
    if (!hydrated || !owner) return;
    const worth = tasks.filter((task) => task.status !== 'done');
    const prev = lastSaved.current;
    if (
      prev?.owner === owner &&
      prev.tasks.length === worth.length &&
      worth.every((task, at) => samePersisted(task, prev.tasks[at]))
    ) {
      return;
    }
    lastSaved.current = { owner, tasks: worth };
    const json = JSON.stringify(
      worth.map((task) => (task.progress === 0 ? task : { ...task, progress: 0 })),
    );
    void AsyncStorage.setItem(uploadQueueKey(owner), json).catch(() => {});
  }, [tasks, hydrated, owner]);

  /**
   * Shows files in their album as they land, without reading the album again
   * for every one of them.
   *
   * A batch of photographs finishes a file every second or two, and each
   * refresh fetches and redraws the whole album. Twenty files were twenty of
   * those back to back, which is the album stuttering under the thumb for the
   * length of the upload. At most one every few seconds now, and always one
   * after the last file.
   */
  const albumRefresh = useRef<{
    albums: Set<string>;
    timer: ReturnType<typeof setTimeout> | null;
  }>({ albums: new Set(), timer: null });
  const refreshAlbumSoon = useCallback(
    (albumId: string) => {
      const pending = albumRefresh.current;
      pending.albums.add(albumId);
      if (pending.timer) return;
      pending.timer = setTimeout(() => {
        pending.timer = null;
        const albums = [...pending.albums];
        pending.albums.clear();
        for (const id of albums) {
          // The prefix, not albumFilesQueryKey(albumId), which resolves to
          // `[…, albumId, 'all']` and so matches only the combined view. An
          // audio file landing has to refresh the Audio tab as well, and that
          // key ends in 'audio'.
          queryClient.invalidateQueries({ queryKey: ['storage', 'files', id] });
        }
      }, ALBUM_REFRESH_EVERY_MS);
    },
    [queryClient],
  );
  useEffect(
    () => () => {
      const pending = albumRefresh.current;
      if (pending.timer) clearTimeout(pending.timer);
    },
    [],
  );

  const patch = useCallback((id: string, next: Partial<UploadTask>) => {
    setTasks((prev) =>
      prev.map((task) => (task.id === id ? { ...task, ...next } : task)),
    );
  }, []);

  /** Draws all the progress gathered since the last time, in one update. */
  const flushProgress = useCallback(() => {
    progressTimer.current = null;
    const pending = pendingProgress.current;
    if (pending.size === 0) return;
    const updates = new Map(pending);
    pending.clear();
    setTasks((prev) =>
      prev.map((task) => {
        const progress = updates.get(task.id);
        // A file that finished, failed or was retried meanwhile keeps what
        // that wrote: a late callback must not pull a done file back to 97%.
        return progress === undefined || task.status !== 'uploading' || progress === task.progress
          ? task
          : { ...task, progress };
      }),
    );
  }, []);

  const reportProgress = useCallback(
    (id: string, fraction: number) => {
      pendingProgress.current.set(id, fraction);
      if (!progressTimer.current) {
        progressTimer.current = setTimeout(flushProgress, PROGRESS_FLUSH_MS);
      }
    },
    [flushProgress],
  );

  // ── Background uploads (builds with the native module) ──────────────────
  //
  // The files are not sent from here. They are handed to the system in
  // batches (handOver), and from then on this only listens: progress moves
  // the bars, a finished item is collected from the module (drain), and a
  // file whose items are all in is filed by the server (finish). The server
  // also files them itself, every minute, for when the app is not running.
  // docs/BACKGROUND_UPLOADS.md.

  /** Bytes each item has sent, as last reported. */
  const nativeSent = useRef(new Map<string, number>());
  /** How each item ended, until its file is settled. */
  const nativeDone = useRef(new Map<string, ItemResult>());
  /** A handoff request is on its way. One at a time. */
  const handing = useRef(false);
  /** Files marked 'uploading' since their first byte, so it is said once. */
  const markedUploading = useRef(new Set<string>());

  /** Forgets what was heard about a file's items. */
  const forgetItems = useCallback((task: UploadTask) => {
    for (const item of task.handoff?.items ?? []) {
      nativeSent.current.delete(item.id);
      nativeDone.current.delete(item.id);
    }
    markedUploading.current.delete(task.id);
  }, []);

  /**
   * Keys the server is to let go of, sent together: "Stop all" on a batch of
   * 294 was 294 requests at once, past the rate limit. Best effort: what is
   * not cancelled expires on the server within a day.
   */
  const cancelKeys = useRef(new Set<string>());
  const cancelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelOnServer = useCallback((key: string) => {
    cancelKeys.current.add(key);
    if (cancelTimer.current) return;
    cancelTimer.current = setTimeout(function send() {
      const keys = [...cancelKeys.current].slice(0, HANDOFF_MAX_FILES);
      keys.forEach((each) => cancelKeys.current.delete(each));
      void storageApi.cancelHandoffs(keys).catch(() => undefined);
      cancelTimer.current = cancelKeys.current.size > 0 ? setTimeout(send, 250) : null;
    }, 300);
  }, []);

  /** Lets go of a handoff: the system stops sending, the server forgets it. */
  const dropHandoff = useCallback(
    (task: UploadTask) => {
      if (!task.handoff) return;
      void nativeUploads?.cancel(task.handoff.items.map((item) => item.id)).catch(() => undefined);
      cancelOnServer(task.handoff.key);
      forgetItems(task);
    },
    [cancelOnServer, forgetItems],
  );

  /** Files waiting for the server to file them, by task id, and how often asked. */
  const finishing = useRef(new Map<string, number>());
  const finishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishSoon = useRef<(taskId: string, delayMs?: number) => void>(() => {});

  const runFinish = useCallback(async () => {
    finishTimer.current = null;
    const due = [...finishing.current.keys()].slice(0, HANDOFF_MAX_FILES);
    const list = due
      .map((id) => tasksRef.current.find((task) => task.id === id))
      .filter((task): task is UploadTask & { handoff: NonNullable<UploadTask['handoff']> } =>
        Boolean(task?.handoff),
      );
    for (const id of due) {
      if (!list.some((task) => task.id === id)) finishing.current.delete(id);
    }
    if (list.length === 0) return;

    let results: Awaited<ReturnType<typeof storageApi.finishHandoffs>>['results'];
    try {
      ({ results } = await withConfirmRetry(() =>
        storageApi.finishHandoffs(list.map((task) => task.handoff.key)),
      ));
    } catch {
      // The server files them itself within minutes; asked again meanwhile.
      for (const task of list) finishSoon.current(task.id, 15_000);
      return;
    }
    if (!mounted.current) return;

    for (const result of results) {
      const task = list.find((each) => each.handoff.key === result.key);
      if (!task) continue;
      const asked = finishing.current.get(task.id) ?? 0;
      finishing.current.delete(task.id);
      if (result.state === 'filed') {
        discardCopy(task.uri);
        forgetItems(task);
        patch(task.id, {
          status: 'done',
          progress: 1,
          handoff: undefined,
          multipart: undefined,
          retryAt: undefined,
          networkFailures: 0,
          error: undefined,
        });
        refreshAlbumSoon(task.albumId);
      } else if (result.state === 'waiting') {
        // Every byte is in but the store has not caught up: soon, then less
        // often. The server's own job files it regardless.
        finishing.current.set(task.id, asked + 1);
        finishSoon.current(task.id, Math.min(5_000 * 2 ** asked, 60_000));
      } else if (result.state === 'refused') {
        forgetItems(task);
        patch(task.id, { status: 'failed', handoff: undefined, key: undefined, error: result.reason });
      } else {
        // Gone, or never recorded: handed over afresh.
        forgetItems(task);
        patch(task.id, { status: 'queued', progress: 0, handoff: undefined, key: undefined });
      }
    }
  }, [forgetItems, patch, refreshAlbumSoon]);

  finishSoon.current = (taskId: string, delayMs = 400) => {
    if (!finishing.current.has(taskId)) finishing.current.set(taskId, 0);
    if (finishTimer.current) return;
    finishTimer.current = setTimeout(() => {
      void runFinish().finally(() => {
        // More may have arrived, or still be waiting their turn.
        if (finishing.current.size > 0 && !finishTimer.current && mounted.current) {
          finishSoon.current([...finishing.current.keys()][0], 1_000);
        }
      });
    }, delayMs);
  };
  useEffect(
    () => () => {
      if (finishTimer.current) clearTimeout(finishTimer.current);
    },
    [],
  );

  /**
   * Settles every handed-over file in `list` whose items have all reported:
   * all sent is filed with the server; one failed lets the rest of the file
   * go and either hands it over afresh (no answer, a dead URL, a server
   * fault, the app swiped away) or marks it failed.
   */
  const settleHandoffs = useCallback(
    (list: readonly UploadTask[]) => {
      for (const task of list) {
        if (!task.handoff || (task.status !== 'queued' && task.status !== 'uploading')) continue;
        const standing = handoffStanding(
          task.handoff.items.map((item) => item.id),
          nativeDone.current,
        );
        if (standing.state === 'sending') continue;
        if (standing.state === 'sent') {
          finishSoon.current(task.id);
          continue;
        }
        dropHandoff(task);
        const failed = standing.result;
        if (isWorthAnotherHandoff(failed)) {
          const failures = (task.networkFailures ?? 0) + 1;
          patch(task.id, {
            status: 'queued',
            progress: 0,
            handoff: undefined,
            key: undefined,
            error: WAITING_FOR_CONNECTION,
            networkFailures: failures,
            retryAt: Date.now() + connectivityRetryDelayMs(failures),
          });
        } else {
          patch(task.id, {
            status: 'failed',
            handoff: undefined,
            key: undefined,
            error: 'Upload failed. Please try again.',
          });
        }
      }
    },
    [dropHandoff, patch],
  );

  /** Collects what finished from the module, then settles what it can. */
  const drain = useCallback(async () => {
    if (!nativeUploads) return;
    const results = await nativeUploads.takeResults().catch(() => []);
    // Only items of a file still with the system: a removed or re-sent
    // file's items report "cancelled", and there is nothing to do about it.
    const current = new Set(
      tasksRef.current.flatMap((task) => task.handoff?.items.map((item) => item.id) ?? []),
    );
    for (const result of results) {
      if (current.has(result.id)) nativeDone.current.set(result.id, result);
    }
    if (mounted.current) settleHandoffs(tasksRef.current);
  }, [settleHandoffs]);

  /**
   * On launch: what ended while the app was gone is collected; a file the
   * system still holds stays with it; a file the system lost (the app was
   * swiped away, or reinstalled) is asked of the server by its key, and
   * handed over afresh only if the server has nothing.
   */
  const reconcileHandoffs = useCallback(
    async (list: UploadTask[]) => {
      if (!nativeUploads) return;
      const [results, active] = await Promise.all([
        nativeUploads.takeResults().catch(() => []),
        nativeUploads.active().catch(() => null),
      ]);
      for (const result of results) nativeDone.current.set(result.id, result);
      if (!mounted.current) return;
      settleHandoffs(list);
      if (!active) return;

      const held = new Set(active);
      const lost = list.filter((task) => {
        if (!task.handoff || task.status !== 'queued') return false;
        if (handoffStanding(task.handoff.items.map((item) => item.id), nativeDone.current).state !== 'sending') {
          return false;
        }
        return task.handoff.items.some(
          (item) => !held.has(item.id) && !nativeDone.current.has(item.id),
        );
      });
      if (lost.length === 0) return;

      let results2: Awaited<ReturnType<typeof storageApi.finishHandoffs>>['results'] = [];
      try {
        ({ results: results2 } = await storageApi.finishHandoffs(
          lost.slice(0, HANDOFF_MAX_FILES).map((task) => task.handoff?.key ?? ''),
        ));
      } catch {
        // Asked again on the next launch; meanwhile they wait as they are.
        return;
      }
      for (const task of lost) {
        const result = results2.find((each) => each.key === task.handoff?.key);
        if (result?.state === 'filed') {
          discardCopy(task.uri);
          forgetItems(task);
          patch(task.id, { status: 'done', progress: 1, handoff: undefined });
        } else if (result) {
          dropHandoff(task);
          patch(task.id, { status: 'queued', progress: 0, handoff: undefined, key: undefined });
        }
      }
      if (mounted.current) setTasks((prev) => [...prev]);
    },
    [dropHandoff, forgetItems, patch, settleHandoffs],
  );
  reconcileRef.current = reconcileHandoffs;

  /**
   * Asks the server for every URL these files need and hands them to the
   * system. All for one album, up to HANDOFF_MAX_FILES (nextHandoffBatch).
   */
  const handOver = useCallback(
    async (batch: UploadTask[]) => {
      if (!nativeUploads) return;
      // A picker can report a size of 0; the server signs the real one.
      const sized = await Promise.all(
        batch.map(async (task) => {
          if (task.sizeBytes > 0) return task;
          const info = await FileSystem.getInfoAsync(task.uri).catch(() => null);
          return { ...task, sizeBytes: info?.exists ? (info.size ?? 0) : 0 };
        }),
      );
      for (const task of sized.filter((each) => each.sizeBytes <= 0)) {
        patch(task.id, {
          status: 'failed',
          error: 'That file is empty, or no longer on this device.',
        });
      }
      const going = sized.filter((task) => task.sizeBytes > 0);
      if (going.length === 0) return;

      let tickets: HandoffTicket[];
      try {
        ({ handoffs: tickets } = await withUploadRetry(() =>
          storageApi.createHandoffs(
            going[0].albumId,
            going.map((task) => ({
              contentType: task.mimeType,
              contentLength: task.sizeBytes,
              originalName: task.name,
            })),
          ),
        ));
      } catch (error) {
        if (!mounted.current) return;
        if (isConnectivityFailure(error, false)) {
          for (const task of going) {
            const failures = (task.networkFailures ?? 0) + 1;
            patch(task.id, {
              sizeBytes: task.sizeBytes,
              error: WAITING_FOR_CONNECTION,
              networkFailures: failures,
              retryAt: Date.now() + connectivityRetryDelayMs(failures),
            });
          }
          return;
        }
        const message = error instanceof Error ? error.message : 'Upload failed';
        for (const task of going) patch(task.id, { status: 'failed', error: message });
        return;
      }

      const entries = going.map((task, at) => ({
        task,
        ticket: tickets[at],
        items: itemsForTicket(task.id, task.uri, tickets[at]),
      }));
      // Recorded before the system has them: an app that ends now leaves the
      // keys for the next launch to ask about.
      for (const { task, ticket, items } of entries) {
        releaseMultipart(task.multipart);
        patch(task.id, {
          sizeBytes: task.sizeBytes,
          key: ticket.key,
          multipart: undefined,
          retryAt: undefined,
          error: undefined,
          handoff: {
            key: ticket.key,
            expiresAt: ticket.expiresAt,
            items: items.map((item) => ({ id: item.id, length: item.length })),
          },
        });
      }
      try {
        await nativeUploads.enqueue(entries.flatMap((entry) => entry.items));
      } catch {
        void storageApi.cancelHandoffs(entries.map((entry) => entry.ticket.key)).catch(() => undefined);
        for (const { task } of entries) {
          patch(task.id, {
            status: 'failed',
            handoff: undefined,
            key: undefined,
            error: 'Could not hand this file to the phone to send.',
          });
        }
        return;
      }
      // Removed while this was on its way: let those go again.
      const present = new Set(tasksRef.current.map((task) => task.id));
      for (const entry of entries) {
        if (present.has(entry.task.id)) continue;
        void nativeUploads.cancel(entry.items.map((item) => item.id)).catch(() => undefined);
        cancelOnServer(entry.ticket.key);
        discardCopy(entry.task.uri);
      }
      // Anything that ended at once (a file that could not be read).
      void drain();
    },
    [cancelOnServer, drain, patch],
  );

  // Hears the module: progress moves the bars, a finished item is collected.
  useEffect(() => {
    if (!NATIVE || !nativeUploads) return;
    let drainTimer: ReturnType<typeof setTimeout> | null = null;
    const progress = nativeUploads.addListener('progress', ({ id, sent }) => {
      nativeSent.current.set(id, sent);
      const taskId = taskIdOf(id);
      const task = tasksRef.current.find((each) => each.id === taskId);
      if (!task?.handoff || !mounted.current) return;
      if (task.status === 'queued' && !markedUploading.current.has(taskId)) {
        markedUploading.current.add(taskId);
        patch(taskId, { status: 'uploading', error: undefined });
      }
      const fraction = fractionSent(task.handoff.items, task.sizeBytes, nativeSent.current, nativeDone.current);
      const percent = Math.round(fraction * 100);
      if (percent === lastPatchedPercent.current.get(taskId)) return;
      lastPatchedPercent.current.set(taskId, percent);
      reportProgress(taskId, fraction);
    });
    const finished = nativeUploads.addListener('finished', () => {
      if (drainTimer) return;
      drainTimer = setTimeout(() => {
        drainTimer = null;
        void drain();
      }, 250);
    });
    // Back in front: what finished meanwhile is collected now.
    const resumed = AppState.addEventListener('change', (next) => {
      if (next === 'active') void drain();
    });
    return () => {
      progress.remove();
      finished.remove();
      resumed.remove();
      if (drainTimer) clearTimeout(drainTimer);
    };
  }, [drain, patch, reportProgress]);

  const enqueue = useCallback((items: NewUpload[]) => {
    if (items.length === 0) return;
    setTasks((prev) => [
      // A batch started after the last one finished begins from nothing. The
      // finished rows were only there for its "3 of 5"; left in, they counted
      // toward the new batch, which then started at 90-odd percent. Failures
      // stay until they are retried or removed.
      ...(prev.some((task) => task.status === 'queued' || task.status === 'uploading')
        ? prev
        : prev.filter((task) => task.status !== 'done')),
      ...items.map((item) => ({
        ...item,
        // Date.now() alone collides when twenty files are added in one tick.
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        status: 'queued' as const,
        progress: 0,
      })),
    ]);
  }, []);

  // Keeps `multipart`: a retry of a large file carries on from its last part.
  const retry = useCallback(
    (id: string) =>
      patch(id, {
        status: 'queued',
        progress: 0,
        error: undefined,
        retryAt: undefined,
        networkFailures: 0,
      }),
    [patch],
  );

  const remove = useCallback((id: string) => {
    const handed = tasksRef.current.find((each) => each.id === id && each.handoff);
    if (handed) {
      // With the system: it stops sending, and the server lets go of it.
      dropHandoff(handed);
      discardCopy(handed.uri);
      setTasks((prev) => prev.filter((task) => task.id !== id));
      return;
    }
    const controller = controllers.current.get(id);
    if (controller) {
      // The upload releases its own parts, and the picker's copy, once it
      // sees the cancellation.
      controller.abort();
    } else {
      const task = tasksRef.current.find((each) => each.id === id);
      // Kept for a resume that is now not coming.
      releaseMultipart(task?.multipart);
      discardCopy(task?.uri);
    }
    setTasks((prev) => prev.filter((task) => task.id !== id));
  }, [dropHandoff]);

  const clearFinished = useCallback(
    () => setTasks((prev) => prev.filter((task) => task.status !== 'done')),
    [],
  );

  /** Sends one file, start to finish, and says how it went. */
  const run = useCallback(
    (next: UploadTask) => {
      const controller = new AbortController();
      controllers.current.set(next.id, controller);
      inFlight.current.add(next.id);

      void (async () => {
        lastPatchedPercent.current.delete(next.id);
        pendingProgress.current.delete(next.id);
        patch(next.id, { status: 'uploading', progress: 0, error: undefined });
        try {
          // A key from an earlier attempt means bytes may already be in the
          // bucket: the native transfer can finish after the attempt that
          // started it gave up, a large file may have been assembled with only
          // the reply lost, or the bytes landed and only the confirm timed out.
          // Asked first — on a tap on Retry as much as after a restart — so a
          // file that arrived is not sent, and stored, twice. A failure to ask
          // is handled like any other failure below.
          if (next.key) {
            const stat = await withConfirmRetry(
              () => storageApi.confirm(next.key as string, next.albumId, next.name),
              { signal: controller.signal },
            );
            if (stat.exists) {
              discardCopy(next.uri);
              if (mounted.current) {
                patch(next.id, {
                  status: 'done',
                  progress: 1,
                  multipart: undefined,
                  retryAt: undefined,
                  networkFailures: 0,
                });
              }
              refreshAlbumSoon(next.albumId);
              return;
            }
          }

          await storageApi.uploadFile(next.uri, {
            contentType: next.mimeType,
            scope: 'albums',
            originalName: next.name,
            // Without this the object is stored but attached to nothing, so it
            // uploads "successfully" and then appears in no album at all.
            albumId: next.albumId,
            // Recorded before the first byte goes out, and not guarded by
            // `mounted`: if this process is about to end, the key is the only
            // thing that makes the upload findable afterwards, so it has to be
            // written even on the way out.
            onTicket: (key) => patch(next.id, { key }),
            onProgress: (fraction) => {
              if (!mounted.current) return;
              const percent = Math.round(fraction * 100);
              if (percent === lastPatchedPercent.current.get(next.id)) return;
              lastPatchedPercent.current.set(next.id, percent);
              reportProgress(next.id, fraction);
            },
            signal: controller.signal,
            // A large file carries on from the part an earlier attempt reached.
            resume: next.multipart,
            // Written on every acknowledged part, and like onTicket not guarded
            // by `mounted`: it is what a relaunch resumes from.
            onSession: (multipart) => patch(next.id, { multipart }),
          });
          // In the album now; the copy on the phone has done its job.
          discardCopy(next.uri);
          if (mounted.current) {
            patch(next.id, {
              status: 'done',
              progress: 1,
              multipart: undefined,
              retryAt: undefined,
              networkFailures: 0,
            });
          }

          // As they land, not all at the end; but gathered, so a run of small
          // files is not a run of whole-album refreshes (see refreshAlbumSoon).
          refreshAlbumSoon(next.albumId);
        } catch (error) {
          const cancelled = controller.signal.aborted;
          // Removed while running: the row is already gone, and so is any
          // reason to keep the copy.
          if (cancelled) discardCopy(next.uri);
          if (!mounted.current || cancelled) return;

          // Nothing answered. Queued again rather than failed: the file did
          // nothing wrong, and on a phone the network comes back. It waits for
          // NetInfo to say so, then a growing delay, in case it only says so.
          // Not if the file itself has gone, which no amount of waiting fixes.
          if (isConnectivityFailure(error, cancelled)) {
            const info = await FileSystem.getInfoAsync(next.uri).catch(() => null);
            if (info?.exists && mounted.current) {
              const failures = (next.networkFailures ?? 0) + 1;
              patch(next.id, {
                status: 'queued',
                progress: 0,
                error: WAITING_FOR_CONNECTION,
                networkFailures: failures,
                retryAt: Date.now() + connectivityRetryDelayMs(failures),
              });
              return;
            }
          }

          if (mounted.current) {
            patch(next.id, {
              status: 'failed',
              error: error instanceof Error ? error.message : 'Upload failed',
            });
          }
        } finally {
          controllers.current.delete(next.id);
          inFlight.current.delete(next.id);
          lastPatchedPercent.current.delete(next.id);
          pendingProgress.current.delete(next.id);
          // Nudges the runner to look for the next one. Without it the queue
          // stops after the first file, because nothing else changes `tasks`
          // once the last patch has landed.
          if (mounted.current) setTasks((prev) => [...prev]);
        }
      })();
    },
    [patch, refreshAlbumSoon, reportProgress],
  );

  // The runner. A few files at once while the app is in front
  // (FOREGROUND_CONCURRENCY), so one file's round trips, or one transfer
  // that has stopped moving, no longer holds up every file behind it. A file
  // sent in parts goes alone, since it runs four parts of its own. Off screen
  // on iOS, a handful of one-piece files at once (see BACKGROUND_BURST).
  // planStarts (upload-queue.ts) is the rule, with its tests.
  useEffect(() => {
    // Not before the previous launch has been settled, or a file already in
    // the bucket gets sent again. And only for the account signed in now.
    if (!hydrated || !owner || owner !== userId) return;

    if (wakeTimer.current) {
      clearTimeout(wakeTimer.current);
      wakeTimer.current = null;
    }

    // With the native module: hand the waiting files to the system, a batch
    // at a time, and nothing else. The system sends them; see handOver.
    if (NATIVE) {
      if (!online || handing.current) return;
      const now = Date.now();
      const waiting = tasks.filter(
        (task) => task.status === 'queued' && !task.handoff && !inFlight.current.has(task.id),
      );
      const ready = waiting.filter((task) => !task.retryAt || task.retryAt <= now);
      const batch = nextHandoffBatch(ready, HANDOFF_MAX_FILES);
      if (batch.length === 0) {
        const wakeAt = Math.min(...waiting.map((task) => task.retryAt ?? Infinity));
        if (Number.isFinite(wakeAt)) {
          wakeTimer.current = setTimeout(() => {
            wakeTimer.current = null;
            if (mounted.current) setTasks((prev) => [...prev]);
          }, Math.max(0, wakeAt - now));
        }
        return;
      }
      handing.current = true;
      void handOver(batch).finally(() => {
        handing.current = false;
        // The next batch, if there is one.
        if (mounted.current) setTasks((prev) => [...prev]);
      });
      return;
    }

    // Offline, nothing starts; the NetInfo listener re-runs this on return.
    // A file still waiting out its delay is passed over, and the runner is
    // woken when the earliest delay ends.
    const now = Date.now();
    const { start, wakeAt } = planStarts(tasks, {
      inFlight: inFlight.current,
      limit: burst.current ? BACKGROUND_BURST : FOREGROUND_CONCURRENCY,
      offScreen: burst.current,
      now,
      online,
      isLarge: (task) => task.sizeBytes >= MULTIPART_MIN_BYTES,
    });
    for (const task of start) run(task);
    if (wakeAt !== undefined) {
      wakeTimer.current = setTimeout(() => {
        wakeTimer.current = null;
        if (mounted.current) setTasks((prev) => [...prev]);
      }, Math.max(0, wakeAt - now));
    }

    // No cleanup. This effect re-runs constantly — every progress patch writes
    // to `tasks`, which is a dependency — and a cleanup that stopped a
    // running upload would therefore stop it immediately. `inFlight` guards
    // against a second copy starting; `mounted` guards against writing state
    // after teardown. Neither belongs in a cleanup here.
    //
    // `hydrated` belongs in the deps as well as in the guard above: it flips false to
    // true once, and this effect has to re-run on that flip to pick up a queue
    // restored from the last launch. Without it a recovered upload would sit
    // there until something else changed `tasks`. `online` likewise: coming
    // back online is what starts a queue that was held. `owner` and `userId`
    // because the runner only works the signed-in account's own queue.
  }, [tasks, run, handOver, hydrated, online, owner, userId]);

  const pending = tasks.filter((task) => task.status !== 'done');
  const active = pending.some(
    (task) => task.status === 'queued' || task.status === 'uploading',
  );

  // Weighted by size, so one large video does not race to 100% alongside the
  // thumbnails queued behind it.
  //
  // Falling back to a flat average matters more than it looks. Both pickers
  // can report a size of 0 — `getInfoAsync` on an asset it cannot stat,
  // DocumentPicker on a provider that omits it — and a queue of those sums to
  // zero bytes, which pinned the bar at 0% for the whole upload no matter how
  // much real progress had been reported. An unweighted average is less
  // truthful about the remaining time; it is not silently wrong.
  // Failures are left out: one stuck at 40% held the bar short of the end
  // of a batch that had otherwise finished.
  const batch = tasks.filter((task) => task.status !== 'failed');
  const totalBytes = batch.reduce((sum, task) => sum + task.sizeBytes, 0);
  const overall =
    totalBytes > 0
      ? batch.reduce((sum, task) => sum + task.sizeBytes * task.progress, 0) /
        totalBytes
      : batch.length > 0
        ? batch.reduce((sum, task) => sum + task.progress, 0) / batch.length
        : 0;
  const remaining = pending.filter((task) => task.status !== 'failed').length;

  // The drawer. Only while the app is off screen: a banner over the app saying
  // what the app is already showing is noise, and on iOS every one of these
  // would be a separate interruption.
  useEffect(() => {
    if (!active) return;
    if (appState.current === 'active') return;
    // Android's upload service keeps its own notification up to date.
    if (NATIVE && Platform.OS === 'android') return;

    const percent = Math.round(overall * 100);
    if (Math.abs(percent - lastNotifiedPercent.current) < NOTIFY_EVERY_PERCENT) {
      return;
    }
    lastNotifiedPercent.current = percent;

    const done = tasks.filter((task) => task.status === 'done').length;
    void showUploadProgress(
      'Uploading to Virgo',
      `${done} of ${tasks.length} · ${percent}%`,
    );
  }, [active, overall, tasks]);

  // The batch ending. Clears the progress line, then says how it went — once,
  // and only if the app is not the thing the user is looking at.
  const wasActive = useRef(false);
  useEffect(() => {
    if (active) {
      wasActive.current = true;
      return;
    }
    if (!wasActive.current) return;
    wasActive.current = false;
    lastNotifiedPercent.current = -1;

    void clearUploadProgress();

    const failed = tasks.filter((task) => task.status === 'failed').length;
    const done = tasks.filter((task) => task.status === 'done').length;
    if (done === 0 && failed === 0) return;

    // The album itself, once more now that the batch is over: the gathered
    // refresh may still be waiting on its timer.
    queryClient.invalidateQueries({ queryKey: ['storage', 'files'] });
    // Storage and album counts are derived server-side, so both need a refetch
    // once rather than per file.
    queryClient.invalidateQueries({ queryKey: ['albums'] });
    queryClient.invalidateQueries({ queryKey: usageQueryKey });
    // The workspace's file and storage counts, and the storage breakdown,
    // are counted from the same files and stayed as they were.
    queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    queryClient.invalidateQueries({ queryKey: ['storage', 'breakdown'] });

    if (appState.current !== 'active') {
      void showUploadFinished(
        failed > 0 ? 'Some uploads did not finish' : 'Upload complete',
        failed > 0
          ? `${done} uploaded, ${failed} failed. Open Virgo to try again.`
          : `${done} ${done === 1 ? 'file' : 'files'} added.`,
      );
    }
  }, [active, tasks, queryClient]);

  const actions = useMemo(
    () => ({ enqueue, retry, remove, clearFinished }),
    [enqueue, retry, remove, clearFinished],
  );

  // The same object until the queue moves, so a redraw of this provider for
  // anything else (the network, the account) does not redraw every view of it.
  const queue = useMemo(
    () => ({ tasks, active, overall, remaining, ...actions }),
    [tasks, active, overall, remaining, actions],
  );

  return (
    <UploadActionsContext.Provider value={actions}>
      <UploadContext.Provider value={queue}>{children}</UploadContext.Provider>
    </UploadActionsContext.Provider>
  );
}

/** The queue and its progress. Re-renders whoever reads it as files move. */
export function useUploadQueue(): UploadContextValue {
  return useContext(UploadContext);
}

/** Adding to the queue and tidying it, with no progress attached. */
export function useUploadActions(): UploadActions {
  return useContext(UploadActionsContext);
}
