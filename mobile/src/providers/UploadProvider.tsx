import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { useQueryClient } from '@tanstack/react-query';
import { storageApi } from '@/src/api';
import { usageQueryKey } from '@/src/hooks';
import {
  clearUploadProgress,
  showUploadFinished,
  showUploadProgress,
} from '@/src/lib/notifications';

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
}

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

/** Only rewrite the drawer when the number visibly moved. */
const NOTIFY_EVERY_PERCENT = 5;

/** Where the queue survives a process that ended without being asked. */
const QUEUE_STORAGE_KEY = 'virgo.upload.queue.v1';

/**
 * Reads the queue left behind by a previous launch.
 *
 * Anything unparseable is discarded rather than thrown: a queue we cannot read
 * is not worth failing the app's startup over, and the objects it described are
 * still recoverable by the server's own accounting.
 */
async function loadPersisted(): Promise<UploadTask[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as UploadTask[]) : [];
  } catch {
    return [];
  }
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

  // The loop reads these without re-subscribing. `running` is a ref rather
  // than state because two renders in the same tick must not both start an
  // upload — state would still read `false` in the second.
  const running = useRef(false);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const lastNotifiedPercent = useRef(-1);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      appState.current = next;
    });
    return () => sub.remove();
  }, []);

  /**
   * Nothing runs until the previous launch's queue has been accounted for.
   *
   * Without this the runner would start on an empty list, and a file whose
   * bytes are already in the bucket would be uploaded a second time.
   */
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const saved = await loadPersisted();
      if (cancelled) return;

      // Settle each interrupted task against the server before the runner is
      // allowed to touch the list. Sequential on purpose: this is a handful of
      // rows at most, and it runs while the app is starting.
      const settled: UploadTask[] = [];
      for (const task of saved) {
        if (task.status === 'done' || task.status === 'failed') {
          settled.push(task);
          continue;
        }

        // No key means no ticket was ever minted, so nothing was sent.
        if (!task.key) {
          settled.push({ ...task, status: 'queued', progress: 0 });
          continue;
        }

        try {
          // The server is the only authority on whether the object landed —
          // the transfer finished in a process that no longer exists, so there
          // is nothing local that knows. This is also what attaches it to its
          // album, which is the step the dead process never reached.
          const stat = await storageApi.confirm(task.key, task.albumId, task.name);
          settled.push(
            stat.exists
              ? { ...task, status: 'done', progress: 1 }
              : { ...task, status: 'queued', progress: 0, key: undefined },
          );
        } catch {
          // Offline, or the API having a bad moment. Queue it rather than
          // failing it: a retry costs an upload, and giving up costs the file.
          settled.push({ ...task, status: 'queued', progress: 0, key: undefined });
        }
      }

      // A file picked from the gallery lives in a cache directory the system
      // may clear. Re-queueing one that is gone would fail on every attempt
      // forever, so it is marked once, with a reason someone can act on.
      const checked = await Promise.all(
        settled.map(async (task) => {
          if (task.status !== 'queued') return task;
          const info = await FileSystem.getInfoAsync(task.uri).catch(() => null);
          return info?.exists
            ? task
            : {
                ...task,
                status: 'failed' as const,
                error: 'That file is no longer on this device.',
              };
        }),
      );

      if (!cancelled) {
        setTasks(checked);
        setHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Written on every change, so a process that ends without warning leaves
  // behind whatever was true a moment ago. Finished rows are dropped: their
  // only purpose was to be displayed, and a batch from last week should not
  // greet somebody on launch.
  useEffect(() => {
    if (!hydrated) return;
    const worth = tasks.filter((task) => task.status !== 'done');
    void AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(worth)).catch(
      () => {},
    );
  }, [tasks, hydrated]);

  const patch = useCallback((id: string, next: Partial<UploadTask>) => {
    setTasks((prev) =>
      prev.map((task) => (task.id === id ? { ...task, ...next } : task)),
    );
  }, []);

  const enqueue = useCallback((items: NewUpload[]) => {
    if (items.length === 0) return;
    setTasks((prev) => [
      ...prev,
      ...items.map((item) => ({
        ...item,
        // Date.now() alone collides when twenty files are added in one tick.
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        status: 'queued' as const,
        progress: 0,
      })),
    ]);
  }, []);

  const retry = useCallback(
    (id: string) => patch(id, { status: 'queued', progress: 0, error: undefined }),
    [patch],
  );

  const remove = useCallback(
    (id: string) => setTasks((prev) => prev.filter((task) => task.id !== id)),
    [],
  );

  const clearFinished = useCallback(
    () => setTasks((prev) => prev.filter((task) => task.status !== 'done')),
    [],
  );

  // The runner. One at a time: several large videos at once compete for the
  // same uplink and make every bar crawl, which reads as broken rather than
  // busy.
  useEffect(() => {
    // Not before the previous launch has been settled, or a file already in
    // the bucket gets sent again.
    if (!hydrated) return;
    if (running.current) return;
    const next = tasks.find((task) => task.status === 'queued');
    if (!next) return;

    running.current = true;
    let cancelled = false;

    (async () => {
      patch(next.id, { status: 'uploading', progress: 0, error: undefined });
      try {
        await storageApi.uploadFile(next.uri, {
          contentType: next.mimeType,
          scope: 'albums',
          originalName: next.name,
          // Without this the object is stored but attached to nothing, so it
          // uploads "successfully" and then appears in no album at all.
          albumId: next.albumId,
          // Recorded before the first byte goes out, and not guarded by
          // `cancelled`: if this process is about to end, the key is the only
          // thing that makes the upload findable afterwards, so it has to be
          // written even on the way out.
          onTicket: (key) => patch(next.id, { key }),
          onProgress: (fraction) => {
            if (!cancelled) patch(next.id, { progress: fraction });
          },
        });
        if (!cancelled) patch(next.id, { status: 'done', progress: 1 });

        // Per file, not per batch: twenty photographs should appear in the
        // album as they land, not all at the end.
        //
        // The prefix, not albumFilesQueryKey(albumId), which resolves to
        // `[…, albumId, 'all']` and so matches only the combined view. An
        // audio file landing has to refresh the Audio tab as well, and that
        // key ends in 'audio'.
        queryClient.invalidateQueries({
          queryKey: ['storage', 'files', next.albumId],
        });
      } catch (error) {
        if (!cancelled) {
          patch(next.id, {
            status: 'failed',
            error: error instanceof Error ? error.message : 'Upload failed',
          });
        }
      } finally {
        running.current = false;
        // Nudges this effect to look for the next one. Without it the queue
        // stops after the first file, because nothing else changes `tasks`
        // once the last patch has landed.
        setTasks((prev) => [...prev]);
      }
    })();

    return () => {
      cancelled = true;
    };
    // `hydrated` belongs here as well as in the guard above: it flips false to
    // true once, and this effect has to re-run on that flip to pick up a queue
    // restored from the last launch. Without it a recovered upload would sit
    // there until something else changed `tasks`.
  }, [tasks, patch, queryClient, hydrated]);

  const pending = tasks.filter((task) => task.status !== 'done');
  const active = pending.some(
    (task) => task.status === 'queued' || task.status === 'uploading',
  );

  const totalBytes = tasks.reduce((sum, task) => sum + task.sizeBytes, 0);
  const sentBytes = tasks.reduce(
    (sum, task) => sum + task.sizeBytes * task.progress,
    0,
  );
  const overall = totalBytes > 0 ? sentBytes / totalBytes : 0;
  const remaining = pending.filter((task) => task.status !== 'failed').length;

  // The drawer. Only while the app is off screen: a banner over the app saying
  // what the app is already showing is noise, and on iOS every one of these
  // would be a separate interruption.
  useEffect(() => {
    if (!active) return;
    if (appState.current === 'active') return;

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

    // Storage and album counts are derived server-side, so both need a refetch
    // once rather than per file.
    queryClient.invalidateQueries({ queryKey: ['albums'] });
    queryClient.invalidateQueries({ queryKey: usageQueryKey });

    if (appState.current !== 'active') {
      void showUploadFinished(
        failed > 0 ? 'Some uploads did not finish' : 'Upload complete',
        failed > 0
          ? `${done} uploaded, ${failed} failed. Open Virgo to try again.`
          : `${done} ${done === 1 ? 'file' : 'files'} added.`,
      );
    }
  }, [active, tasks, queryClient]);

  return (
    <UploadContext.Provider
      value={{
        tasks,
        active,
        overall,
        remaining,
        enqueue,
        retry,
        remove,
        clearFinished,
      }}
    >
      {children}
    </UploadContext.Provider>
  );
}

export function useUploadQueue(): UploadContextValue {
  return useContext(UploadContext);
}
