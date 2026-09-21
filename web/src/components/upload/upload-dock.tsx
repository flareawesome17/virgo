'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Loader2, RotateCcw, X, XCircle } from 'lucide-react';
import { formatBytes } from '@/api';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { MINI_PLAYER_OFFSET_VAR } from '@/components/media/video-surface';
import { useUploadQueue, type UploadItem } from './upload-provider';

/** Rows drawn at most per group: a wedding is hundreds of files and the dock is a summary. */
const ROWS = 30;

function duration(seconds: number): string {
  if (seconds < 60) return 'under a minute';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `about ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `about ${hours} h ${minutes % 60} min`;
}

/**
 * Every upload in flight, wherever you are in the app.
 *
 * Mounted by the app shell on every page, reading the queue the provider holds
 * above them, so a drop into one album keeps reporting while you work in
 * another. One bar for the whole batch, a rate and a time left, and the
 * failures on top where they can be retried together — a list of four hundred
 * per-file bars told you nothing at a glance.
 */
export function UploadDock() {
  const { items, active, bytesPerSecond, cancel, retryFailed, clearFinished } = useUploadQueue();
  const [open, setOpen] = useState(false);

  const summary = useMemo(() => {
    const counted = items.filter((item) => item.status !== 'cancelled');
    const by = (status: UploadItem['status']) => items.filter((item) => item.status === status);
    const totalBytes = counted.reduce((sum, item) => sum + item.sizeBytes, 0);
    const doneBytes = counted.reduce((sum, item) => sum + item.sizeBytes * item.progress, 0);
    const albums = new Set(counted.map((item) => item.albumName).filter(Boolean));
    return {
      total: counted.length,
      done: by('done'),
      failed: by('failed'),
      uploading: by('uploading'),
      queued: by('queued'),
      fraction: totalBytes > 0 ? doneBytes / totalBytes : 0,
      remainingBytes: totalBytes - doneBytes,
      album: albums.size === 1 ? [...albums][0] : null,
    };
  }, [items]);

  if (items.length === 0) return null;

  const { total, done, failed, uploading, queued } = summary;
  const headline = active
    ? `Uploading ${done.length.toLocaleString()} of ${total.toLocaleString()}`
    : failed.length > 0
      ? `${done.length.toLocaleString()} uploaded · ${failed.length.toLocaleString()} failed`
      : `${done.length.toLocaleString()} uploaded`;
  const detail = active
    ? [
        bytesPerSecond ? `${formatBytes(bytesPerSecond)}/s` : null,
        bytesPerSecond && bytesPerSecond > 0
          ? `${duration(summary.remainingBytes / bytesPerSecond)} left`
          : null,
        summary.album ? `to ${summary.album}` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : summary.album
      ? `to ${summary.album}`
      : null;
  // Spoken on milestones only. Announcing every percentage would drown out
  // everything else a screen reader has to say.
  const announcement = active
    ? `Uploading ${total} files`
    : `${done.length} uploaded${failed.length ? `, ${failed.length} failed` : ''}`;

  return (
    <section
      aria-label="Uploads"
      className="fixed right-4 z-40 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border bg-popover shadow-lg transition-[bottom] duration-200 motion-reduce:transition-none"
      // The minimised film player docks in this same corner at this same width,
      // one layer up. While one is there, sit above it rather than under it —
      // otherwise a film minimised during an upload hides the upload entirely.
      style={{ bottom: `calc(1rem + var(${MINI_PLAYER_OFFSET_VAR}, 0px))` }}
    >
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      <div className="flex items-start gap-2.5 px-3.5 pt-3 pb-2.5">
        <span className="mt-0.5">
          {active ? (
            <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
          ) : failed.length > 0 ? (
            <XCircle className="size-4 text-destructive" aria-hidden />
          ) : (
            <CheckCircle2 className="size-4 text-success" aria-hidden />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold tabular-nums">{headline}</p>
          {detail && <p className="mt-0.5 truncate text-xs text-muted-foreground tabular-nums">{detail}</p>}
          {active && <Progress value={summary.fraction * 100} className="mt-2 h-1.5" aria-label="Overall upload progress" />}
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={open ? 'Hide upload details' : 'Show upload details'}
        >
          {open ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
        </Button>
        {!active && (
          <Button size="icon" variant="ghost" className="size-7" onClick={clearFinished} aria-label="Dismiss uploads">
            <X className="size-4" />
          </Button>
        )}
      </div>

      {failed.length > 0 && (
        <div className="flex items-center justify-between gap-2 border-t bg-destructive/5 px-3.5 py-2">
          <p className="text-xs text-destructive">
            {failed.length === 1 ? '1 file' : `${failed.length} files`} did not upload.
          </p>
          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={retryFailed}>
            <RotateCcw className="size-3.5" />
            Retry
          </Button>
        </div>
      )}

      {open && (
        <ul className="max-h-72 overflow-y-auto border-t text-xs">
          {[...failed, ...uploading].slice(0, ROWS).map((item) => (
            <li key={item.id} className="border-b px-3.5 py-2 last:border-0">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate" title={item.name}>
                  {item.name}
                </span>
                {item.status === 'uploading' ? (
                  <button
                    type="button"
                    onClick={() => cancel(item.id)}
                    aria-label={`Cancel ${item.name}`}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="size-3.5" />
                  </button>
                ) : (
                  <XCircle className="size-3.5 shrink-0 text-destructive" aria-label="Failed" />
                )}
              </div>
              {item.status === 'uploading' ? (
                <Progress value={item.progress * 100} className="mt-1.5 h-1" aria-label={`${item.name} progress`} />
              ) : (
                <p className="mt-0.5 text-destructive">{item.error ?? 'Failed'}</p>
              )}
            </li>
          ))}
          {queued.length > 0 && (
            <li className="px-3.5 py-2 text-muted-foreground">
              {queued.length.toLocaleString()} waiting their turn
            </li>
          )}
          {done.slice(-ROWS).reverse().map((item) => (
            <li key={item.id} className="flex items-center gap-2 border-b px-3.5 py-1.5 last:border-0">
              <CheckCircle2 className="size-3.5 shrink-0 text-success" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-muted-foreground" title={item.name}>
                {item.name}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{formatBytes(item.sizeBytes)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

