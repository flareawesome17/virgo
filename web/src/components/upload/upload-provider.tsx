'use client';

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
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys, storageApi, type UploadScope } from '@/api';
import { usageQueryKey } from '@/hooks/useUsage';

export interface UploadItem {
  id: string;
  name: string;
  sizeBytes: number;
  /** 0-1, from real bytes sent. */
  progress: number;
  status: 'queued' | 'uploading' | 'done' | 'failed' | 'cancelled';
  error?: string;
  /** Where it is going, so the dock can say so and a finish refreshes that album. */
  albumId?: string;
  albumName?: string;
}

export interface UploadTarget {
  scope: UploadScope;
  albumId?: string;
  /** For the dock's "to Reyes Wedding". */
  albumName?: string;
}

interface UploadQueue {
  items: UploadItem[];
  /** Anything still queued or sending. */
  active: boolean;
  /** Bytes a second over the last few seconds, or null before there is a rate. */
  bytesPerSecond: number | null;
  enqueue: (files: File[], target: UploadTarget) => void;
  cancel: (id: string) => void;
  retryFailed: () => void;
  clearFinished: () => void;
}

/**
 * How many files go up at once, across the whole app.
 *
 * Browsers cap concurrent connections per host at around six, and B2 is a
 * different host from the API — but a wedding drop can be hundreds of files,
 * and firing them all at once means the browser queues them opaquely with no
 * useful progress. Three keeps the bar moving and leaves headroom for the
 * app's own requests. It used to be three per drop, so two quick drops ran
 * six; one queue means three is three.
 */
const CONCURRENCY = 3;

/** How often a long upload refreshes the album it is filling. */
const REFRESH_EVERY_MS = 4000;

const noop = () => undefined;
const UploadContext = createContext<UploadQueue>({
  items: [],
  active: false,
  bytesPerSecond: null,
  enqueue: noop,
  cancel: noop,
  retryFailed: noop,
  clearFinished: noop,
});

/**
 * The upload queue, held above every page.
 *
 * It used to be state inside the album page, so leaving the page — to answer
 * a message, to check the schedule — unmounted the queue with it: the
 * transfers still in flight lost their progress, and the ones waiting their
 * turn never started. In the desktop app, where a photographer drops a card's
 * worth of files and carries on working, that was the whole use case. Here,
 * uploads carry on wherever you go, and closing the tab asks first.
 */
export function UploadProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [bytesPerSecond, setBytesPerSecond] = useState<number | null>(null);

  // Outside state: a File is not something to copy on every render, and the
  // pump below must see the queue as it is now, not as of its last closure.
  const files = useRef(new Map<string, { file: File; target: UploadTarget }>());
  const waiting = useRef<string[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  const running = useRef(0);
  const nextId = useRef(0);
  const sent = useRef(new Map<string, number>());
  const samples = useRef<{ at: number; bytes: number }[]>([]);
  const touched = useRef(new Set<string>());
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPatch = useRef(new Map<string, number>());
  const lastSample = useRef(0);

  /** How often progress may re-render the app while bytes are moving. */
  const PROGRESS_EVERY_MS = 200;

  const patch = useCallback((id: string, changes: Partial<UploadItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }, []);

  /** Refreshes what the finished files changed, at most every few seconds. */
  const refresh = useCallback(
    (now = false) => {
      const flush = () => {
        refreshTimer.current = null;
        for (const albumId of touched.current) {
          void queryClient.invalidateQueries({ queryKey: ['storage', 'files', albumId] });
          void queryClient.invalidateQueries({ queryKey: queryKeys.albums.sections(albumId) });
        }
        touched.current.clear();
        void queryClient.invalidateQueries({ queryKey: usageQueryKey });
        void queryClient.invalidateQueries({ queryKey: queryKeys.albums.all });
      };
      if (now) {
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        flush();
      } else if (!refreshTimer.current) {
        refreshTimer.current = setTimeout(flush, REFRESH_EVERY_MS);
      }
    },
    [queryClient],
  );

  /** Bytes sent so far, sampled for a rate over the last five seconds. */
  const sample = useCallback(() => {
    const now = Date.now();
    if (now - lastSample.current < 500) return;
    lastSample.current = now;
    let total = 0;
    for (const value of sent.current.values()) total += value;
    const list = samples.current;
    list.push({ at: now, bytes: total });
    while (list.length > 2 && now - list[0].at > 5000) list.shift();
    const first = list[0];
    const span = (now - first.at) / 1000;
    setBytesPerSecond(span >= 1 ? Math.max(0, (total - first.bytes) / span) : null);
  }, []);

  const pump = useCallback(() => {
    // A local function so a finished upload can start the next one without
    // the callback referring to itself.
    const start = () => {
      while (running.current < CONCURRENCY && waiting.current.length > 0) {
        const id = waiting.current.shift() as string;
        const entry = files.current.get(id);
        if (!entry) continue;
        running.current += 1;
        const controller = new AbortController();
        controllers.current.set(id, controller);
        patch(id, { status: 'uploading', progress: 0, error: undefined });

        void storageApi
          .uploadFile(entry.file, {
            scope: entry.target.scope,
            albumId: entry.target.albumId,
            signal: controller.signal,
            onProgress: (fraction) => {
              sent.current.set(id, fraction * entry.file.size);
              // Browsers report progress many times a second per file; three
              // files at that rate re-rendered every consumer constantly.
              const now = Date.now();
              if (fraction >= 1 || now - (lastPatch.current.get(id) ?? 0) >= PROGRESS_EVERY_MS) {
                lastPatch.current.set(id, now);
                patch(id, { progress: fraction });
              }
              sample();
            },
          })
          .then(() => {
            patch(id, { status: 'done', progress: 1 });
            // The File is no longer needed once it is safely stored.
            files.current.delete(id);
            if (entry.target.albumId) touched.current.add(entry.target.albumId);
            refresh();
          })
          .catch((error: unknown) => {
            sent.current.delete(id);
            patch(id, {
              status: controller.signal.aborted ? 'cancelled' : 'failed',
              error: error instanceof Error ? error.message : 'Upload failed.',
            });
          })
          .finally(() => {
            controllers.current.delete(id);
            lastPatch.current.delete(id);
            running.current -= 1;
            if (running.current === 0 && waiting.current.length === 0) {
              // The queue has drained: refresh now rather than in a few seconds,
              // and stop reporting a speed for transfers that have ended.
              refresh(true);
              samples.current = [];
              sent.current.clear();
              setBytesPerSecond(null);
            }
            start();
          });
      }
    };
    start();
  }, [patch, refresh, sample]);

  const enqueue = useCallback(
    (list: File[], target: UploadTarget) => {
      if (list.length === 0) return;
      const added = list.map((file) => {
        nextId.current += 1;
        const id = `upload-${nextId.current}`;
        files.current.set(id, { file, target });
        waiting.current.push(id);
        return {
          id,
          name: file.name,
          sizeBytes: file.size,
          progress: 0,
          status: 'queued' as const,
          albumId: target.albumId,
          albumName: target.albumName,
        };
      });
      setItems((prev) => [...prev, ...added]);
      pump();
    },
    [pump],
  );

  const cancel = useCallback(
    (id: string) => {
      const controller = controllers.current.get(id);
      if (controller) {
        controller.abort();
        return;
      }
      // Not started yet: take it out of line.
      waiting.current = waiting.current.filter((queued) => queued !== id);
      files.current.delete(id);
      patch(id, { status: 'cancelled' });
    },
    [patch],
  );

  const retryFailed = useCallback(() => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.status !== 'failed' || !files.current.has(item.id)) return item;
        // Guarded, because React may run this updater twice in development
        // and a file must not be queued twice.
        if (!waiting.current.includes(item.id)) waiting.current.push(item.id);
        return { ...item, status: 'queued', progress: 0, error: undefined };
      }),
    );
    // After the state above is queued for commit; pump reads refs, not state.
    setTimeout(pump, 0);
  }, [pump]);

  const clearFinished = useCallback(() => {
    setItems((prev) => {
      const keep = prev.filter((item) => item.status === 'uploading' || item.status === 'queued');
      for (const item of prev) {
        if (!keep.includes(item)) files.current.delete(item.id);
      }
      return keep;
    });
  }, []);

  const active = items.some((item) => item.status === 'queued' || item.status === 'uploading');

  // Leaving mid-upload loses what has not been sent. The browser's own dialog
  // is the only one allowed here, and it is enough: it names the risk.
  useEffect(() => {
    if (!active) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [active]);

  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    },
    [],
  );

  const value = useMemo(
    () => ({ items, active, bytesPerSecond, enqueue, cancel, retryFailed, clearFinished }),
    [items, active, bytesPerSecond, enqueue, cancel, retryFailed, clearFinished],
  );

  return <UploadContext.Provider value={value}>{children}</UploadContext.Provider>;
}

export function useUploadQueue(): UploadQueue {
  return useContext(UploadContext);
}
