'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';
import { IS_DESKTOP, revealInFolder } from '@/lib/desktop';

/** What the shell sends when a download ends. */
interface DownloadFinished {
  /** The saved file's name, or "The file" when the shell could not tell. */
  name: string;
  /** Where it was saved; null on macOS, which does not say, and on a failure. */
  path: string | null;
  ok: boolean;
}

/** Dispatched on `window` by the shell, the one channel that reaches the page. */
const EVENT = 'virgo:download-finished';

/**
 * Says where a download went, in the desktop app.
 *
 * A browser shows its own downloads bar. In the app the shell takes the
 * download over and saves it straight to the Downloads folder, so without
 * this an original or a zip arrived without a word, and a failed one simply
 * never arrived. The shell announces the end; this turns that into a toast,
 * with a way to the file when the shell knows where it is.
 *
 * Renders nothing, and on the web does not listen.
 */
export function DesktopDownloads() {
  useEffect(() => {
    if (!IS_DESKTOP) return;

    const onFinished = (event: Event) => {
      const detail = (event as CustomEvent<DownloadFinished | undefined>).detail;
      if (!detail) return;
      if (!detail.ok) {
        toast.error('Download failed', { description: detail.name });
        return;
      }
      const { path } = detail;
      toast.success('Saved to Downloads', {
        description: detail.name,
        action: path
          ? {
              label: 'Show in folder',
              onClick: () => {
                void revealInFolder(path).catch((error: unknown) => {
                  toast.error('Cannot show the file', {
                    description: error instanceof Error ? error.message : String(error),
                  });
                });
              },
            }
          : undefined,
      });
    };

    window.addEventListener(EVENT, onFinished);
    return () => window.removeEventListener(EVENT, onFinished);
  }, []);

  return null;
}
