'use client';
/* eslint-disable @next/next/no-img-element -- stills from the media host, already the size they are drawn at; see PieceImage */

import Link from 'next/link';
import { Bookmark } from 'lucide-react';
import { makerOf, type ShelfEntry, type ShelfSummary } from '@/api';
import { cn } from '@/lib/utils';
import { opensInPlace } from './open-in-place';

/**
 * The stills on a shelf's cover: the four newest kept, in a 2×2 mosaic.
 *
 * Fewer than four still fill the square — one alone, two side by side, three
 * as one tall and two stacked — so a shelf with two things on it does not
 * look half-empty. An API from before the mosaic sends one cover, drawn alone.
 */
export function shelfCoverUrls(shelf: Pick<ShelfSummary, 'coverUrl' | 'coverUrls'>): string[] {
  if (shelf.coverUrls && shelf.coverUrls.length > 0) return shelf.coverUrls.slice(0, 4);
  return shelf.coverUrl ? [shelf.coverUrl] : [];
}

export function ShelfMosaic({ urls, className }: { urls: string[]; className?: string }) {
  const shown = urls.slice(0, 4);
  return (
    <span
      className={cn(
        'grid aspect-square overflow-hidden rounded-xl bg-muted',
        shown.length >= 2 && 'grid-cols-2 gap-0.5',
        shown.length >= 3 && 'grid-rows-2',
        className,
      )}
    >
      {shown.length === 0 ? (
        <span className="grid place-items-center">
          <Bookmark className="size-5 text-muted-foreground" />
        </span>
      ) : (
        shown.map((url, i) => (
          <img
            key={`${url}-${i}`}
            src={url}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            className={cn(
              'size-full min-h-0 object-cover',
              // Three: the newest tall on the left, the other two stacked.
              shown.length === 3 && i === 0 && 'row-span-2',
            )}
          />
        ))
      )}
    </span>
  );
}

/**
 * What is kept, as a contact sheet: square stills, three across. A click
 * opens the post over the grid (`onOpen`); a click for a new tab goes to the
 * post's own page. Who made each one is said on hover and to a screen
 * reader, and in full once it is opened — credit is why keeping somebody's
 * work is something they gain from.
 */
export function KeptGrid({
  entries,
  onOpen,
}: {
  entries: ShelfEntry[];
  onOpen: (entry: ShelfEntry) => void;
}) {
  return (
    <ul className="grid grid-cols-3 gap-0.5 overflow-hidden rounded-xl sm:gap-1">
      {entries.map((entry) => {
        const maker = makerOf(entry);
        const name = entry.title ?? `${maker.displayName}'s showcase`;
        return (
          <li key={entry.showcaseId}>
            <Link
              href={`/showcase/${entry.showcaseId}`}
              onClick={(event) => {
                if (opensInPlace(event)) onOpen(entry);
              }}
              aria-label={`${name}, by ${maker.displayName}`}
              className="group relative block aspect-square overflow-hidden bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <img
                src={entry.url}
                alt=""
                loading="lazy"
                decoding="async"
                draggable={false}
                className="size-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none"
              />
              <span className="pointer-events-none absolute inset-0 flex items-end bg-gradient-to-t from-black/70 to-transparent p-2 text-[11px] font-medium leading-tight text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                <span className="line-clamp-2">
                  {entry.title ? `${entry.title} · ` : ''}
                  {maker.displayName}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
