'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowDownToLine, Loader2, RotateCw, X } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Updates the desktop app in place.
 *
 * The app has no auto-update in the sense of doing it behind your back — it
 * runs the web client, so the product itself changes on every deploy and only
 * the shell needs replacing, which is rare. What this does is make that
 * replacement not feel like a chore: the update downloads inside the app with a
 * progress bar, and then asks before restarting.
 *
 * The previous version sent people to the browser to fetch an installer and run
 * it by hand. That worked, and felt like homework.
 *
 * Nothing here runs on the web. `NEXT_PUBLIC_VIRGO_DESKTOP` is set only by
 * `desktop/scripts/stage-web.mjs`, and the plugin globals below exist only
 * inside the shell.
 */

const IS_DESKTOP = process.env.NEXT_PUBLIC_VIRGO_DESKTOP === '1';
const DISMISS_KEY = 'virgo.desktop.updateDismissed';

/** Progress events emitted by the plugin while the update downloads. */
type DownloadEvent =
  | { event: 'Started'; data?: { contentLength?: number } }
  | { event: 'Progress'; data?: { chunkLength?: number } }
  | { event: 'Finished' };

/**
 * The slice of the updater plugin this uses.
 *
 * Declared rather than imported: `@tauri-apps/plugin-updater` is a dependency
 * of the desktop shell, not of `web/`, and pulling it in would ship it to every
 * browser for an API that only exists inside the app.
 *
 * `download` and `install` are deliberately separate. `downloadAndInstall`
 * exists and does both, but on Windows the install step exits the app
 * immediately — so the download would finish and the window would vanish with
 * no warning. Splitting them is what allows "downloaded, restart when you're
 * ready".
 */
interface TauriUpdate {
  version: string;
  currentVersion: string;
  download(onEvent?: (event: DownloadEvent) => void): Promise<void>;
  install(): Promise<void>;
}

interface UpdaterGlobal {
  check?: () => Promise<TauriUpdate | null>;
}

function updater(): UpdaterGlobal | null {
  if (typeof window === 'undefined') return null;
  return (
    (window as unknown as { __TAURI_PLUGIN_UPDATER__?: UpdaterGlobal })
      .__TAURI_PLUGIN_UPDATER__ ?? null
  );
}

function relaunch(): void {
  const process = (
    window as unknown as {
      __TAURI_PLUGIN_PROCESS__?: { relaunch?: () => Promise<void> };
    }
  ).__TAURI_PLUGIN_PROCESS__;
  void process?.relaunch?.();
}

type Phase = 'idle' | 'downloading' | 'ready';

export function DesktopUpdateBanner() {
  const [update, setUpdate] = useState<TauriUpdate | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [percent, setPercent] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!IS_DESKTOP) return;
    const plugin = updater();
    if (!plugin?.check) return;

    let cancelled = false;

    void plugin
      .check()
      .then((found) => {
        if (cancelled || !found) return;
        // Dismissal is per version, so "not now" on 1.9.1 does not also
        // silence 1.10.0.
        const silenced =
          typeof localStorage !== 'undefined' &&
          localStorage.getItem(DISMISS_KEY) === found.version;
        setUpdate(found);
        setDismissed(silenced);
      })
      .catch((error: unknown) => {
        // Deliberately quiet. A failed update check is not something to
        // interrupt somebody's work with — the app is running fine, and the
        // check runs again next launch.
        console.warn('[updater] check failed', error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const startDownload = useCallback(() => {
    if (!update) return;
    setPhase('downloading');
    setPercent(null);

    let total = 0;
    let received = 0;

    void update
      .download((event) => {
        if (event.event === 'Started') {
          total = event.data?.contentLength ?? 0;
          setPercent(total > 0 ? 0 : null);
        } else if (event.event === 'Progress') {
          received += event.data?.chunkLength ?? 0;
          // Without a content length there is nothing to be a percentage of,
          // so the bar stays indeterminate rather than inventing a number.
          if (total > 0) setPercent(Math.min(99, Math.round((received / total) * 100)));
        } else if (event.event === 'Finished') {
          setPercent(100);
        }
      })
      .then(() => setPhase('ready'))
      .catch((error: unknown) => {
        setPhase('idle');
        setPercent(null);
        toast.error('Could not download the update', {
          description: error instanceof Error ? error.message : String(error),
        });
      });
  }, [update]);

  const installAndRestart = useCallback(() => {
    if (!update) return;
    // On Windows this hands over to the installer and the app exits, so
    // anything after it may never run. `relaunch` is called anyway for the
    // platforms where install returns.
    void update
      .install()
      .then(relaunch)
      .catch((error: unknown) => {
        toast.error('Could not install the update', {
          description: error instanceof Error ? error.message : String(error),
        });
      });
  }, [update]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      if (update) localStorage.setItem(DISMISS_KEY, update.version);
    } catch {
      // Private browsing, or storage full. Dismissing for this session only is
      // a fine outcome; failing to dismiss is not.
    }
  }, [update]);

  if (!update || dismissed) return null;

  return (
    <div className="flex items-center gap-3 border-b bg-primary/5 px-4 py-2.5">
      {phase === 'downloading' ? (
        <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
      ) : (
        <ArrowDownToLine className="size-4 shrink-0 text-primary" aria-hidden />
      )}

      <p className="min-w-0 flex-1 text-sm">
        {phase === 'idle' && (
          <>
            <span className="font-medium">Virgo {update.version} is available.</span>{' '}
            <span className="text-muted-foreground">
              You have {update.currentVersion}.
            </span>
          </>
        )}
        {phase === 'downloading' && (
          <span className="text-muted-foreground">
            {percent === null
              ? 'Downloading the update…'
              : `Downloading the update… ${percent}%`}
          </span>
        )}
        {phase === 'ready' && (
          <>
            <span className="font-medium">Update ready.</span>{' '}
            <span className="text-muted-foreground">
              Virgo will restart to finish installing.
            </span>
          </>
        )}
      </p>

      {phase === 'downloading' && percent !== null && (
        <div
          className="hidden h-1.5 w-32 shrink-0 overflow-hidden rounded-full bg-primary/15 sm:block"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-200"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}

      {phase === 'idle' && (
        <button
          type="button"
          onClick={startDownload}
          className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          Update
        </button>
      )}

      {phase === 'ready' && (
        <button
          type="button"
          onClick={installAndRestart}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <RotateCw className="size-3" aria-hidden />
          Restart now
        </button>
      )}

      {/* No way out mid-download: the file is already being fetched, and a
          dismiss that leaves it running would be a lie. */}
      {phase !== 'downloading' && (
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss until the next version"
          className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
