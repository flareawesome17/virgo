'use client';

import type { KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { pieceSource, type ShowcasePiece } from '@/api';
import { cn } from '@/lib/utils';
import { pieceSrcSet } from './showcase-media';

/**
 * The photographs of a post, one at a time and as large as the window allows.
 *
 * The post shows every piece whole but at the width of a column; this is
 * where somebody looks closely. Photographs only — a film plays where it sits
 * on the post, with its own controls, and a second player here would be two
 * of them for one film.
 *
 * Laid out as the phone's viewer is: where it is in the set along the top,
 * and along the bottom what it is, who made it and how, over a row of dots.
 * The words sit clear of the photograph rather than over it, which a window
 * this size has the room for.
 *
 * Arrow keys and the side buttons step through; Escape closes, as does the
 * button in the corner.
 */
export function PieceLightbox({
  pieces,
  index,
  title,
  makerName,
  craftTags,
  onIndexChange,
  onClose,
}: {
  /** The photographs, in the post's order. */
  pieces: ShowcasePiece[];
  /** Which is showing; null when the lightbox is closed. */
  index: number | null;
  title: string;
  /** Who made it, under the title. */
  makerName?: string | null;
  /** How it was made. The first three are shown, after the maker's name. */
  craftTags?: string[] | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const total = pieces.length;
  const current = index === null ? null : (pieces[index] ?? null);
  const many = total > 1 && index !== null;
  const credit = [makerName, ...(craftTags ?? []).slice(0, 3)].filter(Boolean).join(' · ');

  const step = (by: number) => {
    if (index === null) return;
    const next = index + by;
    if (next >= 0 && next < total) onIndexChange(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      step(1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      step(-1);
    }
  };

  const srcSet = current ? pieceSrcSet(current) : undefined;

  return (
    <Dialog open={current !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        // The photograph is the content; there is no sentence to describe it.
        aria-describedby={undefined}
        onKeyDown={onKeyDown}
        className="top-0 left-0 flex h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none bg-black/95 p-0 text-white ring-0 sm:max-w-none"
      >
        {/* The count in the middle whatever is beside it, so it does not
            move when the close button is the only other thing in the row. */}
        <header className="grid grid-cols-[1fr_auto_1fr] items-center px-3 py-2">
          <span />
          <span className="text-[15px] font-semibold leading-5 tabular-nums">
            {many ? `${index + 1} of ${total}` : null}
          </span>
          <DialogClose asChild>
            <button
              type="button"
              aria-label="Close"
              className="grid size-10 place-items-center justify-self-end rounded-full bg-white/10 text-white/80 outline-none transition-colors hover:bg-white/20 hover:text-white focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <X className="size-5" />
            </button>
          </DialogClose>
        </header>

        <div className="relative min-h-0 flex-1">
          {current && (
            <div className="absolute inset-0 flex items-center justify-center px-4 sm:px-16">
              {/* eslint-disable-next-line @next/next/no-img-element -- display copies come from the media host, which next/image may not load */}
              <img
                key={current.fileKey}
                src={pieceSource(current, 2048)}
                srcSet={srcSet}
                sizes={srcSet ? '100vw' : undefined}
                alt={many ? `${title}, ${index + 1} of ${total}` : title}
                draggable={false}
                className="max-h-full max-w-full select-none object-contain"
              />
            </div>
          )}

          {many && (
            <>
              <StepButton side="left" disabled={index === 0} onClick={() => step(-1)} />
              <StepButton side="right" disabled={index === total - 1} onClick={() => step(1)} />
            </>
          )}
        </div>

        <footer className="flex flex-col gap-3 px-5 pb-5 pt-3">
          <div className="min-w-0">
            <DialogTitle className="line-clamp-2 text-[15px] font-semibold leading-5">
              {title}
            </DialogTitle>
            {credit && <p className="truncate text-[13px] leading-[18px] text-white/70">{credit}</p>}
          </div>
          {many && (
            <div aria-hidden className="flex justify-center gap-[5px]">
              {pieces.map((piece, i) => (
                <span
                  key={piece.fileKey}
                  className={cn(
                    'h-1.5 rounded-full transition-[width,background-color] motion-reduce:transition-none',
                    i === index ? 'w-4 bg-white' : 'w-1.5 bg-white/55',
                  )}
                />
              ))}
            </div>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function StepButton({
  side,
  disabled,
  onClick,
}: {
  side: 'left' | 'right';
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={side === 'left' ? 'Previous photograph' : 'Next photograph'}
      className={cn(
        'absolute top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white/80 transition hover:bg-white/20 hover:text-white disabled:opacity-0',
        side === 'left' ? 'left-3' : 'right-3',
      )}
    >
      <Icon className="size-5" />
    </button>
  );
}
