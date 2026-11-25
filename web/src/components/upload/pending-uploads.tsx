'use client';

import { useMemo } from 'react';
import { TILE_GRID, type Density } from '@/components/media/album-grid';
import { cn } from '@/lib/utils';
import { UploadThumb } from './upload-thumb';
import { useUploadQueue, type UploadItem } from './upload-provider';

/** How many of the files on their way are drawn before "+N". */
const SHOWN = 6;

/** One album's share of the queue, and where it has got to. */
export function useAlbumUploads(albumId: string) {
  const { items } = useUploadQueue();
  return useMemo(() => {
    // Skipped and stopped files were never part of the transfer.
    const mine = items.filter(
      (item) => item.albumId === albumId && item.status !== 'cancelled' && item.status !== 'skipped',
    );
    const uploading = mine.filter((item) => item.status === 'uploading');
    const queued = mine.filter((item) => item.status === 'queued');
    const failed = mine.filter((item) => item.status === 'failed');
    return {
      total: mine.length,
      done: mine.filter((item) => item.status === 'done').length,
      running: uploading.length + queued.length,
      failed: failed.length,
      // What is sending first, then what failed, then what is waiting.
      pending: [...uploading, ...failed, ...queued] as UploadItem[],
    };
  }, [items, albumId]);
}

/**
 * The files on their way into this album, at the top of its grid: sending,
 * waiting, or failed.
 *
 * Once a file has arrived it is the album's, and shows in the grid below like
 * any other; these are only the ones that are not there yet. Each opens the
 * uploads, where it can be stopped or tried again.
 */
export function PendingUploads({ albumId, density }: { albumId: string; density: Density }) {
  const { total, done, running, failed, pending } = useAlbumUploads(albumId);
  const { setMinimised } = useUploadQueue();
  if (pending.length === 0) return null;
  const shown = pending.slice(0, SHOWN);
  const more = pending.length - shown.length;

  return (
    <section aria-labelledby="uploading-now">
      <header className="flex items-baseline gap-2 pt-1 pb-3">
        <h2 id="uploading-now" className="text-[15px] leading-5 font-bold">
          {running > 0 ? 'Uploading now' : 'Didn’t upload'}
        </h2>
        <p className="text-[13px] tabular-nums text-muted-foreground">
          {running > 0 ? `${done.toLocaleString()} of ${total.toLocaleString()}` : failed.toLocaleString()}
        </p>
      </header>
      <ul className={cn('grid', TILE_GRID[density])}>
        {shown.map((item) => {
          const percent = Math.round(Math.min(item.progress, 1) * 100);
          const state =
            item.status === 'failed' ? 'did not upload' : item.status === 'uploading' ? `${percent} percent` : 'waiting';
          return (
            <li key={item.id} className="relative aspect-square">
              <button
                type="button"
                onClick={() => setMinimised(false)}
                aria-label={`${item.name}, ${state}. Open uploads`}
                className="relative block size-full overflow-hidden -outline-offset-2"
              >
                <UploadThumb
                  name={item.name}
                  glyphClassName="size-5"
                  className={cn(
                    'size-full',
                    item.status === 'failed' && 'bg-destructive/10 text-destructive',
                    item.status === 'queued' && 'opacity-55',
                  )}
                />
                {item.status === 'failed' ? (
                  <span
                    aria-hidden
                    className="absolute top-1.5 right-1.5 grid size-[22px] place-items-center rounded-full bg-destructive text-xs font-extrabold text-white"
                  >
                    !
                  </span>
                ) : (
                  <span aria-hidden className="absolute inset-x-1.5 bottom-1.5 flex h-1 overflow-hidden rounded-full bg-foreground/10">
                    <span className="bg-primary transition-[width] duration-200" style={{ width: `${percent}%` }} />
                  </span>
                )}
              </button>
            </li>
          );
        })}
        {more > 0 && (
          <li className="aspect-square">
            <button
              type="button"
              onClick={() => setMinimised(false)}
              aria-label={`${more.toLocaleString()} more. Open uploads`}
              className="grid size-full place-items-center bg-muted text-[15px] font-bold tabular-nums text-secondary-foreground -outline-offset-2"
            >
              +{more.toLocaleString()}
            </button>
          </li>
        )}
      </ul>
    </section>
  );
}
