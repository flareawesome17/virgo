'use client';

/* eslint-disable @next/next/no-img-element -- signed thumbnails, already the size they are drawn at, as in the album grid */

import { useState } from 'react';
import { ChevronRight, Images } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMediaAutoLoad } from '@/components/chat/connection';
import { albumCardCount, type AlbumCardContext } from '@/api';
import {
  BlurredStandIn,
  CardKindLabel,
  ClickToLoad,
  GoneNote,
  cardShell,
  firstName,
  type CardEnv,
} from '@/components/chat/cards/card-parts';

/** "Ana can save them", "everyone here can save them", "you can save them". */
function whoCanSave(env: CardEnv): string {
  if (!env.mine) return 'you can save them';
  return env.isGroup ? 'everyone here can save them' : `${firstName(env.others[0]?.name)} can save them`;
}

/** What the card says under its pictures, for the card and for a screen reader. */
export function albumCardLines(
  album: NonNullable<AlbumCardContext['album']>,
  env: CardEnv,
): [string, string] {
  const second = [album.sectionName, whoCanSave(env)].filter(Boolean).join(' · ');
  return [`${albumCardCount(album)} · ${album.name}`, second.charAt(0).toUpperCase() + second.slice(1)];
}

/**
 * Album photos (board ChatAlbumCard): four small thumbnails, the rest one
 * click away on the client link the server made for just these.
 *
 * Pictures follow "Load photos, films and voice notes automatically": held
 * back, each thumbnail is its blurred stand-in, the first click loads them and
 * the next one opens the link.
 */
export function AlbumPhotosCard({ context, env }: { context: AlbumCardContext | null; env: CardEnv }) {
  const { autoLoad } = useMediaAutoLoad();
  const [revealed, setRevealed] = useState(false);
  const album = context?.album;

  if (!context || !album) {
    return (
      <div className={cardShell(env.mine, 'flex w-[300px] flex-col gap-1.5 px-3.5 py-3')}>
        <CardKindLabel icon={Images}>Album photos</CardKindLabel>
        <GoneNote>These photos aren&apos;t shared any more.</GoneNote>
      </div>
    );
  }

  const thumbs = album.thumbs.slice(0, 4);
  const show = autoLoad || revealed;
  const held = !show && thumbs.length > 0;
  // What the four tiles leave out: "+8" on the fourth of twelve, as on the board.
  const more = thumbs.length > 0 && album.total > thumbs.length ? album.total - thumbs.length : 0;
  const [first, second] = albumCardLines(album, env);

  return (
    <a
      href={context.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => {
        // The first click on held-back pictures loads them; the next opens.
        if (!held) return;
        event.preventDefault();
        setRevealed(true);
      }}
      aria-label={held ? `Load the pictures: ${first}` : `Open ${first}`}
      className={cardShell(
        env.mine,
        'w-[300px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      {thumbs.length > 0 && (
        <span
          className={cn(
            'relative grid gap-0.5',
            thumbs.length === 1 ? 'grid-cols-1 auto-rows-[180px]' : 'grid-cols-2 auto-rows-[110px]',
          )}
        >
          {thumbs.map((src, i) => (
            <span
              key={`${i}-${src}`}
              className={cn(
                'relative overflow-hidden bg-muted',
                // Three: the first across the top.
                thumbs.length === 3 && i === 0 && 'col-span-2',
              )}
            >
              {show ? (
                <img src={src} alt="" loading="lazy" draggable={false} className="size-full object-cover" />
              ) : (
                <BlurredStandIn src={album.blurs[i]} />
              )}
              {i === 3 && more > 0 && (
                <span className="absolute inset-0 grid place-items-center bg-black/45 text-xl font-bold tabular-nums text-white">
                  +{more}
                </span>
              )}
            </span>
          ))}
          {held && <ClickToLoad />}
        </span>
      )}
      <span className="flex items-center gap-2.5 px-3 pb-3 pt-2.5">
        {thumbs.length === 0 && (
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Images className="size-4" aria-hidden />
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold leading-5">{first}</span>
          <span className="truncate text-xs leading-[18px] text-muted-foreground">{second}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </span>
    </a>
  );
}
