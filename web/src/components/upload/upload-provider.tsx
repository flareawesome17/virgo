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
import { toast } from 'sonner';
import { queryKeys, storageApi, type UploadScope } from '@/api';
import {
  planUploads,
  possibleDuplicatesMessage,
  possibleDuplicatesTitle,
  type UploadCheckFile,
} from '@/api/upload-dedup';
import { usageQueryKey } from '@/hooks/useUsage';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ATTENTION_INFORMATIONAL, IS_DESKTOP, desktopWindow } from '@/lib/desktop';
import { UPLOAD_CONCURRENCY } from './upload-concurrency';

export interface UploadItem {
  id: string;
  name: string;
  sizeBytes: number;
  /** 0-1, from real bytes sent. */
  progress: number;
  /**
   * `skipped`: not sent, because the album already holds it or might
   * (`skipReason`). Kept, with its File, so it can be uploaded anyway.
   */
  status: 'queued' | 'uploading' | 'done' | 'failed' | 'cancelled' | 'skipped';
  /**
   * `duplicate`: same name, size and modified time as a file in the album.
   * `possible`: same name and size only, held back on the person's say-so.
   */
  skipReason?: 'duplicate' | 'possible';
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
  /** Files being checked against their album before they are queued. */
  checking: number;
  /** Sends the files skipped for that reason after all. */
  uploadSkipped: (reason: 'duplicate' | 'possible') => void;
}

/** How many files go up at once, across the whole app. See upload-concurrency.ts. */
const CONCURRENCY = UPLOAD_CONCURRENCY;

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
  checking: 0,
  uploadSkipped: noop,
});

/** What the pre-upload check is told about a file (upload-dedup.ts). */
function describeFile(file: File): UploadCheckFile {
  return {
    name: file.name,
    size: file.size,
    ...(Number.isInteger(file.lastModified) && file.lastModified > 0
      ? { lastModified: file.lastModified }
      : {}),
  };
}

/**
 * The upload queue, held above every page.
 *
 * It used to be state inside the album page, so leaving the page — to answer
 * a message, to check the schedule — unmounted the queue with it: the
 * transfers still in flight lost their progress, and the ones waiting their
 * turn never started. In the desktop app, where a photographer drops a card's
 * worth of files and carries on working, that was the whole use case. Here,
 * uploads carry on wherever you go, and closing the tab or the desktop window
 * asks first.
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
  // The desktop window's close, held while the app asks whether to stop.
  const [askingToClose, setAskingToClose] = useState(false);
  // Files waiting on the duplicate check, and the question about the ones it
  // could not be sure of.
  const [checking, setChecking] = useState(0);
  const [askingPossible, setAskingPossible] = useState<{
    count: number;
    albumName?: string;
  } | null>(null);
  const stopHoldingClose = useRef<(() => Promise<void>) | null>(null);

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
              // Browsers report progress many times a second per file; six
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

  /** Adds files to the list: queued to send, or set aside as skipped. */
  const add = useCallback(
    (list: File[], target: UploadTarget, skipReason?: UploadItem['skipReason']) => {
      if (list.length === 0) return;
      const added = list.map((file): UploadItem => {
        nextId.current += 1;
        const id = `upload-${nextId.current}`;
        files.current.set(id, { file, target });
        if (!skipReason) waiting.current.push(id);
        return {
          id,
          name: file.name,
          sizeBytes: file.size,
          progress: 0,
          status: skipReason ? 'skipped' : 'queued',
          skipReason,
          albumId: target.albumId,
          albumName: target.albumName,
        };
      });
      setItems((prev) => [...prev, ...added]);
    },
    [],
  );

  /*
   * Into an album, the batch is checked first against what the album already
   * holds (upload-dedup.ts), so re-sending a drop that half-failed sends only
   * what did not arrive. Files certainly there are skipped, and the dock can
   * send them anyway; files that only might be are asked about. A check that
   * fails or is slow sends everything, as before the check existed.
   */
  const enqueue = useCallback(
    (list: File[], target: UploadTarget) => {
      if (list.length === 0) return;
      const albumId = target.albumId;
      if (!albumId || target.scope !== 'albums') {
        add(list, target);
        pump();
        return;
      }
      setChecking((n) => n + list.length);
      void planUploads(list, describeFile, (described) =>
        storageApi.checkUploads(albumId, described),
      )
        // planUploads does not reject; if anything ever does, send it all.
        .catch(() => ({ upload: list, duplicates: [], possible: [], checked: false }))
        .then((plan) => {
          add(plan.upload, target);
          add(plan.duplicates, target, 'duplicate');
          add(plan.possible, target, 'possible');
          if (plan.possible.length > 0) {
            setAskingPossible((prev) => ({
              count: (prev?.count ?? 0) + plan.possible.length,
              albumName: !prev || prev.albumName === target.albumName ? target.albumName : undefined,
            }));
          }
        })
        .finally(() => {
          setChecking((n) => Math.max(0, n - list.length));
          pump();
        });
    },
    [add, pump],
  );

  const uploadSkipped = useCallback(
    (reason: 'duplicate' | 'possible') => {
      setItems((prev) =>
        prev.map((item) => {
          if (item.status !== 'skipped' || item.skipReason !== reason) return item;
          if (!files.current.has(item.id)) return item;
          // Guarded as in retryFailed: the updater may run twice.
          if (!waiting.current.includes(item.id)) waiting.current.push(item.id);
          return { ...item, status: 'queued', skipReason: undefined };
        }),
      );
      setTimeout(pump, 0);
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

  const unfinished = items.filter(
    (item) => item.status === 'queued' || item.status === 'uploading',
  ).length;

  // A question about uploads that have since finished is not worth answering:
  // it goes, and the next close goes straight through. Adjusted during render
  // rather than from an effect, so it never draws for a frame with nothing
  // left to lose — and is not still set when the next upload starts.
  if (askingToClose && !active) setAskingToClose(false);

  /*
   * Closing the desktop window, which beforeunload never hears about.
   *
   * The shell tears the webview down without unloading the page, so the guard
   * above stayed silent and a card's worth of files stopped halfway without a
   * word. While anything is still going up, the shell is asked to hold every
   * close — the X, Alt+F4, the red button, the taskbar, and the title bar's
   * own Close, which calls the same `close()` — and the question is put in
   * the app instead.
   *
   * Only while: a held close waits on the page, and a page that never answers
   * is a window that cannot be shut. So the listener goes the moment the queue
   * drains, and the hold with it.
   */
  useEffect(() => {
    if (!active) return;
    const win = desktopWindow();
    if (!win) return;

    let unlisten: (() => void | Promise<void>) | undefined;
    let gone = false;
    // Safe to call twice, and from Close anyway as well as from cleanup.
    const release = async () => {
      const off = unlisten;
      unlisten = undefined;
      await off?.();
    };

    win
      .onCloseRequested((event) => {
        event.preventDefault();
        setAskingToClose(true);
        // A close from the taskbar can reach a minimised window, where the
        // question would be asked out of sight, so the window comes forward
        // first. The flash is for a shell without that grant; it is ignored
        // when the window is already in front.
        void win
          .unminimize()
          .then(() => win.setFocus())
          .catch(() => undefined);
        void win.requestUserAttention(ATTENTION_INFORMATIONAL).catch(() => undefined);
      })
      .then((off) => {
        unlisten = off;
        // Registering is a round trip; uploads that ended first undo it as
        // soon as it lands.
        if (gone) void release().catch(() => undefined);
      })
      // A shell without the grant: closing is simply not asked about.
      .catch(() => undefined);
    stopHoldingClose.current = release;

    return () => {
      gone = true;
      if (stopHoldingClose.current === release) stopHoldingClose.current = null;
      void release().catch(() => undefined);
    };
  }, [active]);

  const closeAnyway = useCallback(() => {
    const win = desktopWindow();
    if (!win) return;
    win
      .destroy()
      .catch(async () => {
        // Refused: stop holding the close and make it the ordinary way. With
        // nothing listening, the shell lets it through.
        await stopHoldingClose.current?.();
        await win.close();
      })
      .catch((error: unknown) => {
        toast.error('Cannot close Virgo', {
          description: error instanceof Error ? error.message : String(error),
        });
      });
  }, []);

  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    },
    [],
  );

  const value = useMemo(
    () => ({
      items,
      active,
      bytesPerSecond,
      enqueue,
      cancel,
      retryFailed,
      clearFinished,
      checking,
      uploadSkipped,
    }),
    [items, active, bytesPerSecond, enqueue, cancel, retryFailed, clearFinished, checking, uploadSkipped],
  );

  return (
    <UploadContext.Provider value={value}>
      {children}
      {/* Files that might already be in the album. Asked, never skipped
          quietly: two different photographs can share a name and a size.
          Dismissing it leaves them skipped, and the dock can still send them. */}
      <AlertDialog
        open={askingPossible !== null}
        onOpenChange={(open) => {
          if (!open) setAskingPossible(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{possibleDuplicatesTitle(askingPossible?.count ?? 0)}</AlertDialogTitle>
            <AlertDialogDescription>
              {possibleDuplicatesMessage(askingPossible?.count ?? 0, askingPossible?.albumName)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Skip</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setAskingPossible(null);
                uploadSkipped('possible');
              }}
            >
              Upload anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {IS_DESKTOP && (
        <AlertDialog open={askingToClose} onOpenChange={setAskingToClose}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Uploads still running</AlertDialogTitle>
              <AlertDialogDescription>
                {unfinished === 1
                  ? "1 file hasn't finished."
                  : `${unfinished.toLocaleString()} files haven't finished.`}{' '}
                Closing Virgo stops them.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep uploading</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={closeAnyway}>
                Close anyway
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </UploadContext.Provider>
  );
}

export function useUploadQueue(): UploadQueue {
  return useContext(UploadContext);
}
