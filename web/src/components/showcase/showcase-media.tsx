'use client';

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { ChevronLeft, ChevronRight, Layers } from 'lucide-react';
import { pieceAspect, pieceSource, type ShowcasePiece } from '@/api';
import { cn } from '@/lib/utils';

/**
 * The tallest and the widest a card's frame may be: a phone's 9:16 frame, and
 * a 3:1 panorama.
 *
 * Inside that range the frame is the cover's own shape, so nothing is cut and
 * the card is as tall as the work is. Outside it, the frame stops at the end
 * of the range and the piece is drawn whole inside it: one panorama does not
 * turn the feed into a strip, nor one tall frame into a wall. Cards used to be
 * cropped to 4:5–1.91:1, which cut the edges off anything outside that; the
 * owner asked for nothing to be cropped at all. The same numbers as the phone.
 */
export const FRAME_MIN_ASPECT = 9 / 16;
export const FRAME_MAX_ASPECT = 3;
/** For a piece whose size is not known: a portrait frame, drawn whole inside. */
const DEFAULT_ASPECT = 4 / 5;

export interface CardFrame {
  /** Width over height of the frame. */
  aspect: number;
  /** Whether the cover is exactly this shape, so filling the frame cuts nothing. */
  exact: boolean;
}

/** The frame a post is drawn in, from its cover. */
export function cardFrame(cover: ShowcasePiece | undefined): CardFrame {
  const own = cover ? pieceAspect(cover) : null;
  if (own === null) return { aspect: DEFAULT_ASPECT, exact: false };
  const aspect = Math.min(FRAME_MAX_ASPECT, Math.max(FRAME_MIN_ASPECT, own));
  return { aspect, exact: aspect === own };
}

/**
 * How a piece sits in its post's frame. The cover fills a frame cut to its own
 * shape; every other piece of a set, and a cover outside the range, is drawn
 * whole inside it on the frame's neutral ground. One frame for the whole set,
 * so the card does not change height as somebody steps through it.
 */
export function pieceFit(frame: CardFrame, index: number): 'cover' | 'contain' {
  return index === 0 && frame.exact ? 'cover' : 'contain';
}

/**
 * A `srcset` over a photograph's display copies, or undefined when it has
 * none (a film, or a piece posted before they were made).
 *
 * The widths the API names are long edges — a copy is fitted inside a square
 * — so a portrait copy is narrower than its label. Left as labelled, the
 * browser would pick the 1024 copy for a slot 1000 pixels wide and stretch an
 * 819-pixel picture across it, which is the softness this exists to stop.
 */
export function pieceSrcSet(piece: ShowcasePiece): string | undefined {
  const sources = piece.displaySources ?? [];
  if (sources.length === 0) return undefined;
  const aspect = pieceAspect(piece);
  const across = aspect && aspect < 1 ? aspect : 1;
  return sources.map((s) => `${s.url} ${Math.round(s.width * across)}w`).join(', ');
}

/**
 * A photograph, sharp at the size it is drawn.
 *
 * A plain <img> rather than next/image: the display copies are served by the
 * media host, which is deliberately not in next/image's allow-list (an open
 * list is an open proxy), and they are already the sizes a screen wants. The
 * feed drew the 640 px thumbnail full width before — twice upscaled on a
 * laptop's display, which photographers notice first.
 */
export function PieceImage({
  piece,
  alt,
  sizes,
  fit = 'cover',
  priority = false,
  className,
}: {
  piece: ShowcasePiece;
  alt: string;
  /** The `sizes` the srcset is chosen against: how wide this is drawn. */
  sizes: string;
  fit?: 'cover' | 'contain';
  /** The first card on the page, which is what the page is waiting for. */
  priority?: boolean;
  className?: string;
}) {
  const srcSet = pieceSrcSet(piece);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- see above
    <img
      src={pieceSource(piece, 1024)}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
      decoding="async"
      draggable={false}
      className={cn('size-full', fit === 'contain' ? 'object-contain' : 'object-cover', className)}
    />
  );
}

/**
 * Every piece of a set, side by side, swiped or stepped through.
 *
 * One frame for the whole set, shaped by the cover (see cardFrame), the way
 * the phone does it: the card does not change height as somebody steps
 * through, and no piece is cut to fit it.
 *
 * Scroll-snap rather than a transform, so a touch screen swipes it and a
 * trackpad scrolls it sideways with nothing written to make either work. The
 * arrows are for a mouse, which has no other way across; they are not there
 * at all on a touch screen, where a button over the picture would swallow
 * the tap meant for it.
 *
 * Where it is in the set is said twice over the frame: "1 of 5" in its
 * corner and a row of dots along its foot. A post's own page has the room
 * for the set's thumbnails under the frame, and draws those in place of the
 * dots.
 *
 * `touch-manipulation` turns off the browser's double-tap zoom on the frame,
 * which would otherwise eat the double tap that likes a photograph.
 */
export function PieceCarousel({
  pieces,
  aspect,
  label,
  renderPage,
  overlay,
  maxHeight,
  thumbnails = false,
}: {
  pieces: ShowcasePiece[];
  /** Width over height of the frame. */
  aspect: number;
  /** What the set is, for a screen reader: usually its title. */
  label: string;
  renderPage: (piece: ShowcasePiece, index: number) => ReactNode;
  /** Drawn over the frame and still while the set moves under it: a badge. */
  overlay?: ReactNode;
  /**
   * The tallest the frame may be, in pixels. Past it the frame keeps its
   * width and is no longer the cover's shape, so whoever sets this draws
   * each piece whole inside.
   */
  maxHeight?: number;
  /** The set's thumbnails under the frame, in place of the dots. */
  thumbnails?: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const total = pieces.length;
  const frame: CSSProperties = { aspectRatio: aspect, maxHeight };

  // From the offset as it moves, so the count follows the swipe rather than
  // waiting for it to settle.
  const onScroll = () => {
    const el = scroller.current;
    if (!el || el.clientWidth === 0) return;
    const next = Math.min(total - 1, Math.max(0, Math.round(el.scrollLeft / el.clientWidth)));
    setIndex((current) => (current === next ? current : next));
  };

  const go = (to: number) => {
    const el = scroller.current;
    if (!el) return;
    const target = Math.min(total - 1, Math.max(0, to));
    const still =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ left: target * el.clientWidth, behavior: still ? 'auto' : 'smooth' });
  };

  // The frame itself takes the arrow keys once it has focus. A browser
  // scrolls it a few pixels per press, which snap then drags back — a key
  // that seems to do nothing. Home and End go to either end of the set.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: total - 1,
    };
    if (!(event.key in keys)) return;
    event.preventDefault();
    go(keys[event.key]);
  };

  // A long set's strip is wider than the column, so it follows the piece
  // showing. Its own scroll position is set rather than scrollIntoView
  // called, which would move the page as well.
  useEffect(() => {
    const row = strip.current;
    const thumb = row?.children[index];
    if (!row || !(thumb instanceof HTMLElement)) return;
    const start = thumb.offsetLeft;
    const end = start + thumb.offsetWidth;
    if (start < row.scrollLeft) row.scrollLeft = start - 8;
    else if (end > row.scrollLeft + row.clientWidth) row.scrollLeft = end - row.clientWidth + 8;
  }, [index]);

  if (total <= 1) {
    return (
      <div
        className="relative w-full touch-manipulation overflow-hidden rounded-2xl bg-muted"
        style={frame}
      >
        {pieces[0] ? renderPage(pieces[0], 0) : null}
        {overlay}
      </div>
    );
  }

  const set = (
    <div className="relative">
      <div
        ref={scroller}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        tabIndex={0}
        role="region"
        aria-roledescription="carousel"
        aria-label={`${label}. ${total} pieces; the arrow keys move between them.`}
        className="no-scrollbar flex w-full touch-manipulation snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-2xl bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        style={frame}
      >
        {pieces.map((piece, i) => (
          <div
            key={piece.fileKey}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${total}`}
            className="relative h-full w-full shrink-0 snap-center snap-always overflow-hidden"
          >
            {renderPage(piece, i)}
          </div>
        ))}
      </div>

      {overlay}

      <span
        aria-hidden
        className="pointer-events-none absolute right-3 top-3 flex items-center gap-[5px] rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold tabular-nums text-white"
      >
        {!thumbnails && <Layers className="size-3" />}
        {index + 1} of {total}
      </span>

      {index > 0 && <CarouselArrow side="left" onClick={() => go(index - 1)} />}
      {index < total - 1 && <CarouselArrow side="right" onClick={() => go(index + 1)} />}

      {!thumbnails && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-[5px]"
        >
          {pieces.map((piece, i) => (
            <span
              key={piece.fileKey}
              className={cn(
                // White on any photograph, in either theme, with a faint
                // edge so a dot still reads on a white wall.
                'h-1.5 rounded-full shadow-[0_0_2px_rgb(0_0_0/0.35)] transition-[width,background-color] motion-reduce:transition-none',
                i === index ? 'w-4 bg-white' : 'w-1.5 bg-white/55',
              )}
            />
          ))}
        </div>
      )}
    </div>
  );

  if (!thumbnails) return set;

  return (
    <div className="flex flex-col gap-2.5">
      {set}
      {/* Padded by the width of the ring round the one showing, which the
          scrolling of the strip would otherwise clip. */}
      <div
        ref={strip}
        role="group"
        aria-label={`${label}. Every piece of the set.`}
        className="no-scrollbar relative -m-1 flex gap-1.5 overflow-x-auto p-1"
      >
        {pieces.map((piece, i) => (
          <button
            key={piece.fileKey}
            type="button"
            onClick={() => go(i)}
            aria-label={`${i + 1} of ${total}`}
            aria-current={i === index ? 'true' : undefined}
            className={cn(
              'h-[70px] w-14 shrink-0 overflow-hidden rounded-lg bg-muted outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ring',
              i === index
                ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background'
                : 'opacity-70 hover:opacity-100',
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- see PieceImage */}
            <img
              src={piece.url}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
              className="size-full object-cover"
            />
          </button>
        ))}
      </div>
    </div>
  );
}

function CarouselArrow({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? 'Previous photograph' : 'Next photograph'}
      className={cn(
        'absolute top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-background/90 text-foreground shadow-sm outline-none transition-colors hover:bg-background focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:hidden',
        side === 'left' ? 'left-3' : 'right-3',
      )}
    >
      <Icon className="size-[18px]" />
    </button>
  );
}
