'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Minus, RotateCcw, X } from 'lucide-react';
import { formatBytes } from '@/api';
import { skippedSummary } from '@/api/upload-dedup';
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
import { Button } from '@/components/ui/button';
import { dockFloorCss } from '@/lib/edge-offsets';
import { useBounce, useGenie } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { UploadDockIcon } from './upload-dock-icon';
import { badge as dockBadge, dockLabel, dockStatus, parseStoredBottom, summarize } from './upload-dock-state';
import { useUploadQueue, type UploadItem } from './upload-provider';
import { UploadThumb } from './upload-thumb';

const BOTTOM_KEY = 'virgo:upload-dock:bottom';

/** Rows drawn at most per group: a wedding is hundreds of files and the dock is a summary. */
const ROWS = 30;
/** Of the files waiting, how many get a row of their own before the rest are a count. */
const WAITING_ROWS = 8;

/**
 * A button on the dock's dark head. The page's quiet buttons hover to the
 * page's pale grey, which on the inverted card is the wrong way round.
 */
const HEAD_BUTTON =
  'grid h-8 shrink-0 place-items-center rounded-md outline-none transition-colors hover:bg-background/15 focus-visible:ring-2 focus-visible:ring-background/60';

/**
 * The accent on the inverted card: the terracotta pulled toward the card's own
 * ink, lighter on the dark card of the light theme and darker on the pale card
 * of the dark one. Plain `primary` is tuned for the page and is dim on both.
 */
const ON_INVERTED_ACCENT = 'bg-[color-mix(in_oklch,var(--primary),var(--background)_40%)]';

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
 * another. A dark head says how far the whole batch has got and how long is
 * left, with one line of progress; under it each file has a row that can be
 * stopped, and the failures sit on top where they can be retried together.
 */
export function UploadDock() {
  const {
    items,
    active,
    bytesPerSecond,
    cancel,
    retryFailed,
    clearFinished,
    checking,
    uploadSkipped,
    minimised,
    setMinimised,
  } = useUploadQueue();
  // The list is there until it is put away: each file is a row to stop or remove.
  const [open, setOpen] = useState(true);
  const [confirmingStop, setConfirmingStop] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const iconRef = useRef<HTMLButtonElement>(null);
  const minimiseRef = useRef<HTMLButtonElement>(null);
  const genie = useGenie();
  const { ref: bounceRef, bounce } = useBounce<HTMLButtonElement>();
  // Only a person's own minimise/expand moves focus; an auto-open must not.
  const moveFocus = useRef<'icon' | 'panel' | null>(null);
  const wasMinimised = useRef(minimised);
  const [bottom, setBottom] = useState<number | null>(null);

  // The saved position is read after mount so server and client render alike.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBottom(parseStoredBottom(window.localStorage.getItem(BOTTOM_KEY)));
  }, []);

  const minimise = async () => {
    const panel = panelRef.current;
    const icon = iconRef.current;
    if (panel && icon) await genie.play(panel, icon, 'close');
    moveFocus.current = 'icon';
    setMinimised(true);
  };
  const expand = () => {
    moveFocus.current = 'panel';
    setMinimised(false);
  };

  // Expanding (click or auto-open): spring out of the icon once the panel is mounted.
  useLayoutEffect(() => {
    const was = wasMinimised.current;
    wasMinimised.current = minimised;
    if (was && !minimised && panelRef.current && iconRef.current) {
      void genie.play(panelRef.current, iconRef.current, 'open');
    }
  }, [minimised, genie]);
  useEffect(() => {
    if (moveFocus.current === 'icon' && minimised) iconRef.current?.focus();
    if (moveFocus.current === 'panel' && !minimised) minimiseRef.current?.focus();
    moveFocus.current = null;
  }, [minimised]);

  const summary = useMemo(() => {
    // Skipped files were never part of the transfer, so they are left out of
    // its count and its bar, and reported on their own.
    const counted = items.filter((item) => item.status !== 'cancelled' && item.status !== 'skipped');
    const by = (status: UploadItem['status']) => items.filter((item) => item.status === status);
    const skipped = by('skipped');
    const totalBytes = counted.reduce((sum, item) => sum + item.sizeBytes, 0);
    const doneBytes = counted.reduce((sum, item) => sum + item.sizeBytes * item.progress, 0);
    const albums = new Set(counted.map((item) => item.albumName).filter(Boolean));
    return {
      total: counted.length,
      done: by('done'),
      failed: by('failed'),
      uploading: by('uploading'),
      queued: by('queued'),
      duplicates: skipped.filter((item) => item.skipReason === 'duplicate'),
      possible: skipped.filter((item) => item.skipReason === 'possible'),
      fraction: totalBytes > 0 ? doneBytes / totalBytes : 0,
      totalBytes,
      doneBytes,
      remainingBytes: totalBytes - doneBytes,
      album: albums.size === 1 ? [...albums][0] : null,
    };
  }, [items]);

  const batch = useMemo(() => summarize(items), [items]);
  const status = dockStatus(batch, checking);

  // A finished or failed batch bounces its icon once.
  const previousStatus = useRef(status);
  useEffect(() => {
    if (previousStatus.current !== status && (status === 'done' || status === 'failed')) {
      bounceRef.current = iconRef.current;
      bounce();
    }
    previousStatus.current = status;
  }, [status, bounce, bounceRef]);

  // A question about uploads that have since finished is not worth answering,
  // and must not be waiting, already open, for the next batch.
  if (confirmingStop && !active) setConfirmingStop(false);

  if (items.length === 0 && checking === 0) return null;

  const { total, done, failed, uploading, queued, duplicates, possible } = summary;
  const skippedCount = duplicates.length + possible.length;
  const busy = active || checking > 0;
  const running = uploading.length + queued.length;
  const headline = active
    ? `Uploading ${done.length.toLocaleString()} of ${total.toLocaleString()}`
    : checking > 0
      ? `Checking ${checking.toLocaleString()} file${checking === 1 ? '' : 's'}`
      : done.length + failed.length + skippedCount === 0
        ? // Everything was stopped before any of it arrived.
          'Uploads stopped'
        : [
            `${done.length.toLocaleString()} uploaded`,
            failed.length > 0 ? `${failed.length.toLocaleString()} failed` : null,
            skippedCount > 0 ? `${skippedCount.toLocaleString()} skipped` : null,
          ]
            .filter(Boolean)
            .join(' · ');
  const detail =
    !active && checking > 0
      ? 'Looking for files already in the album'
      : [
          summary.album ? `to ${summary.album}` : null,
          active && bytesPerSecond && bytesPerSecond > 0
            ? `${duration(summary.remainingBytes / bytesPerSecond)} left`
            : null,
        ]
          .filter(Boolean)
          .join(' · ') || null;
  // Spoken on milestones only. Announcing every percentage would drown out
  // everything else a screen reader has to say.
  const announcement = active
    ? `Uploading ${total} files`
    : checking > 0
      ? 'Checking for files already uploaded'
      : `${done.length} uploaded${failed.length ? `, ${failed.length} failed` : ''}${
          skippedCount ? `, ${skippedCount} skipped` : ''
        }`;

  const stopAll = () => {
    setConfirmingStop(false);
    // Those waiting first: stopping a file that is sending starts the next in line.
    for (const item of queued) cancel(item.id);
    for (const item of uploading) cancel(item.id);
  };

  return (
    <>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      <p id="upload-dock-hint" className="sr-only">
        Arrow keys move it along the edge
      </p>
      <UploadDockIcon
        ref={iconRef}
        status={status}
        fraction={batch.fraction}
        badge={dockBadge(status, batch, checking)}
        label={dockLabel(status, batch, checking)}
        bottom={bottom}
        hidden={!minimised}
        onBottomChange={(value, final) => {
          setBottom(value);
          if (final) window.localStorage.setItem(BOTTOM_KEY, String(Math.round(value)));
        }}
        onOpen={expand}
      />
      {!minimised && (
        <section
          id="upload-dock-panel"
          ref={panelRef}
          aria-label="Uploads"
          className={cn(
            'fixed right-4 z-40 w-[22.5rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl bg-card shadow-xl ring-1 ring-border/60',
            'transition-[bottom] duration-200 motion-reduce:transition-none',
          )}
          // The minimised film player docks in this same corner, one layer up,
          // and on chat pages the message box sits at the bottom. Sit above
          // whichever is there rather than under it.
          style={{ bottom: `calc(1rem + ${dockFloorCss()})` }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') void minimise();
          }}
        >
          <div className="flex flex-col gap-2.5 bg-foreground py-3 pr-3 pl-4 text-background">
            <div className="flex items-center gap-1">
              <div className="min-w-0 flex-1 pr-1">
                <p className="truncate text-sm font-semibold tabular-nums">{headline}</p>
                {detail && <p className="truncate text-xs tabular-nums text-background/65">{detail}</p>}
              </div>
              {active && (
                <button
                  type="button"
                  // One file is stopped as its own row is; a batch asks first.
                  onClick={() => (running > 1 ? setConfirmingStop(true) : stopAll())}
                  className={cn(HEAD_BUTTON, 'bg-background/12 px-2.5 text-[13px] font-semibold')}
                >
                  {running > 1 ? 'Stop all' : 'Stop'}
                </button>
              )}
              <button
                ref={minimiseRef}
                type="button"
                onClick={() => void minimise()}
                aria-label="Minimise uploads"
                className={cn(HEAD_BUTTON, 'motion-icon w-8')}
              >
                <Minus className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                aria-expanded={open}
                aria-label={open ? 'Hide the list' : 'Show the list'}
                className={cn(HEAD_BUTTON, 'motion-icon w-8')}
              >
                {open ? <ChevronDown className="size-4" aria-hidden /> : <ChevronUp className="size-4" aria-hidden />}
              </button>
              {!busy && (
                <button type="button" onClick={clearFinished} aria-label="Dismiss uploads" className={cn(HEAD_BUTTON, 'w-8')}>
                  <X className="size-4" aria-hidden />
                </button>
              )}
            </div>
            {active && (
              <span
                role="progressbar"
                aria-label="Overall upload progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(summary.fraction * 100)}
                className="flex h-1 overflow-hidden rounded-full bg-background/20"
              >
                <span
                  className={cn('transition-[width] duration-200', ON_INVERTED_ACCENT)}
                  style={{ width: `${Math.min(summary.fraction, 1) * 100}%` }}
                />
              </span>
            )}
          </div>

          {failed.length > 0 && (
            <div className="flex items-center justify-between gap-2 border-t border-border/40 bg-destructive/5 px-3.5 py-2">
              <p className="text-xs text-destructive">
                {failed.length === 1 ? '1 file' : `${failed.length} files`} did not upload.
              </p>
              <Button size="sm" variant="secondary" className="h-7 gap-1.5 text-xs" onClick={retryFailed}>
                <RotateCcw className="size-3.5" />
                Retry
              </Button>
            </div>
          )}

          {/* Skipped, and why, with the way to send them after all. Exact
              duplicates are skipped without asking; possible ones were asked
              about, and are here if the answer was "skip". */}
          {duplicates.length > 0 && (
            <div className="flex items-center justify-between gap-2 border-t border-border/40 px-3.5 py-2">
              <p className="text-xs text-muted-foreground">{skippedSummary(duplicates.length)}.</p>
              <Button
                size="sm"
                variant="secondary"
                className="h-7 shrink-0 text-xs"
                onClick={() => uploadSkipped('duplicate')}
              >
                Upload anyway
              </Button>
            </div>
          )}
          {possible.length > 0 && (
            <div className="flex items-center justify-between gap-2 border-t border-border/40 px-3.5 py-2">
              <p className="text-xs text-muted-foreground">
                {possible.length === 1
                  ? '1 possible duplicate not uploaded.'
                  : `${possible.length.toLocaleString()} possible duplicates not uploaded.`}
              </p>
              <Button
                size="sm"
                variant="secondary"
                className="h-7 shrink-0 text-xs"
                onClick={() => uploadSkipped('possible')}
              >
                Upload anyway
              </Button>
            </div>
          )}

          {/* What is sending, what failed, what is waiting, then what is done. */}
          {open && uploading.length + failed.length + queued.length + done.length > 0 && (
            <ul className="max-h-[16.25rem] overflow-y-auto border-t border-border/40">
              {[...uploading, ...failed].slice(0, ROWS).map((item) => (
                <Row key={item.id} item={item} onStop={() => cancel(item.id)} />
              ))}
              {queued.slice(0, WAITING_ROWS).map((item) => (
                <Row key={item.id} item={item} onStop={() => cancel(item.id)} />
              ))}
              {queued.length > WAITING_ROWS && (
                <li className="border-t border-border/40 px-3.5 py-2 text-xs tabular-nums text-muted-foreground first:border-t-0">
                  {(queued.length - WAITING_ROWS).toLocaleString()} more waiting their turn
                </li>
              )}
              {done
                .slice(-ROWS)
                .reverse()
                .map((item) => (
                  <Row key={item.id} item={item} />
                ))}
            </ul>
          )}

          {active && (
            <p className="border-t border-border/40 px-3.5 py-2.5 text-xs tabular-nums text-muted-foreground">
              {formatBytes(summary.doneBytes)} of {formatBytes(summary.totalBytes)}
              {bytesPerSecond ? `, ${formatBytes(bytesPerSecond)}/s` : ''}. It carries on if you leave this page.
            </p>
          )}
        </section>
      )}

      {/* Beside the panel, not inside it: the panel minimises on Escape, and
          a dialog drawn in it would hand it the Escape that closes the dialog. */}
      <AlertDialog open={confirmingStop} onOpenChange={setConfirmingStop}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop these uploads?</AlertDialogTitle>
            <AlertDialogDescription>Files already uploaded stay in the album.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep going</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={stopAll}>
              Stop all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * One file: what it is, its name, and where it has got to. Anything not
 * finished can be taken out: a file already sending is stopped, one waiting
 * or failed is removed from the list.
 */
function Row({ item, onStop }: { item: UploadItem; onStop?: () => void }) {
  const size = formatBytes(item.sizeBytes);
  const failed = item.status === 'failed';
  const sending = item.status === 'uploading';
  return (
    <li className="flex min-h-[52px] items-center gap-2.5 border-t border-border/40 px-3 first:border-t-0">
      <UploadThumb
        name={item.name}
        className={cn('size-9 shrink-0 rounded-md', failed && 'bg-destructive/10 text-destructive')}
      />
      <div className="min-w-0 flex-1 py-1.5">
        <p className="truncate text-[13px] font-semibold" title={item.name}>
          {item.name}
        </p>
        <p className={cn('text-xs tabular-nums', failed ? 'text-destructive' : 'truncate text-muted-foreground')}>
          {failed
            ? (item.error ?? 'Failed')
            : sending
              ? `${size} · ${Math.round(Math.min(item.progress, 1) * 100)}%`
              : item.status === 'queued'
                ? `${size} · Waiting`
                : `${size} · Uploaded`}
        </p>
      </div>
      {item.status === 'done' ? (
        <Check className="mr-1.5 size-4 shrink-0 text-success" strokeWidth={2.5} aria-hidden />
      ) : (
        <button
          type="button"
          onClick={onStop}
          aria-label={sending ? `Stop ${item.name}` : `Remove ${item.name}`}
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </li>
  );
}
