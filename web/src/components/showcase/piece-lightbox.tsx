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
 * Arrow keys and the side buttons step through; Escape closes, as does the
 * button in the corner.
 */
export function PieceLightbox({
  pieces,
  index,
  title,
  onIndexChange,
  onClose,
}: {
  /** The photographs, in the post's order. */
  pieces: ShowcasePiece[];
  /** Which is showing; null when the lightbox is closed. */
  index: number | null;
  title: string;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const total = pieces.length;
  const current = index === null ? null : (pieces[index] ?? null);

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
        <header className="flex items-center gap-3 px-4 py-3">
          <DialogTitle className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</DialogTitle>
          {total > 1 && index !== null && (
            <span className="text-xs tabular-nums text-white/60">
              {index + 1} / {total}
            </span>
          )}
          <DialogClose asChild>
            <button
              type="button"
              aria-label="Close"
              className="grid size-10 place-items-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
            >
              <X className="size-5" />
            </button>
          </DialogClose>
        </header>

        <div className="relative min-h-0 flex-1">
          {current && (
            <div className="absolute inset-0 flex items-center justify-center px-4 pb-4 sm:px-16">
              {/* eslint-disable-next-line @next/next/no-img-element -- display copies come from the media host, which next/image may not load */}
              <img
                key={current.fileKey}
                src={pieceSource(current, 2048)}
                srcSet={srcSet}
                sizes={srcSet ? '100vw' : undefined}
                alt={total > 1 && index !== null ? `${title}, ${index + 1} of ${total}` : title}
                draggable={false}
                className="max-h-full max-w-full select-none object-contain"
              />
            </div>
          )}

          {total > 1 && index !== null && (
            <>
              <StepButton side="left" disabled={index === 0} onClick={() => step(-1)} />
              <StepButton side="right" disabled={index === total - 1} onClick={() => step(1)} />
            </>
          )}
        </div>
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
