import type { CSSProperties, ReactNode } from 'react';
import { ALBUM, CLIENT } from '../../data/story';
import { ALBUM_TILES, TILE_SETS } from '../../data/strings/ch5';
import { Plate } from '../../mocks/plate';

/**
 * Ch5's album, drawn once for both halves (server-safe, no hooks): a card
 * with the album's name, its sections and twelve abstract frames in capture
 * order, each stamped with the time it was taken. The static page shows it
 * at rest; the film (ch5-scene.tsx) flies each frame in from the tool that
 * made it.
 */

/** Scroll length of Ch5's one shot, in svh beyond the stage (the server reserves it). */
export const CH5_LENGTH = 150;

/** The twelve frames, in capture order. */
export const SLOTS = TILE_SETS[12].map((i) => ALBUM_TILES[i]);

export const COLS = 4;
export const ROWS = 3;

/** "2026-12-12T15:41:00" → "3:41 PM", as the page writes times. */
export function clock(iso: string): string {
  const h = Number(iso.slice(11, 13));
  const min = iso.slice(14, 16);
  return `${h % 12 || 12}:${min} ${h < 12 ? 'AM' : 'PM'}`;
}

/** A frame's cell in the grid box, in % of the box. */
export function cellStyle(i: number): CSSProperties {
  return {
    left: `${(i % COLS) * (100 / COLS)}%`,
    top: `${Math.floor(i / COLS) * (100 / ROWS)}%`,
    width: `${100 / COLS}%`,
    height: `${100 / ROWS}%`,
  };
}

/** One frame: a plate, its capture time, and a play mark on the film. */
export function AlbumFrame({ i }: { i: number }) {
  const slot = SLOTS[i];
  return (
    <Plate seed={slot.seed} aspect="fill" label={clock(slot.takenAt)} className="rounded-[6px]">
      {slot.kind === 'video' && (
        <span className="absolute left-1/2 top-1/2 grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[rgba(0,0,0,0.45)]">
          <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden>
            <path d="M0 0v12l10-6z" fill="#F2EDE8" />
          </svg>
        </span>
      )}
    </Plate>
  );
}

/**
 * The card. `grid` fills the 4 × 3 grid box (positioned children, see
 * `cellStyle`); without it the frames sit at rest.
 */
export function AlbumCard({ grid, className = '' }: { grid?: ReactNode; className?: string }) {
  return (
    <div
      aria-hidden
      className={`rounded-[18px] bg-[#1E1B18] p-3 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.75),0_0_0_1px_rgba(240,200,142,0.18)] sm:p-4 ${className}`}
    >
      <div className="mb-3 flex items-baseline justify-between gap-3 px-0.5">
        <p className="truncate text-[15px] font-semibold tracking-[-0.01em] text-[#F2EDE8]">{CLIENT.album}</p>
        <p className="hidden shrink-0 font-mono text-[11px] uppercase tracking-[0.12em] text-[#A08E84] sm:block">
          {ALBUM.sections.map((s) => s.name).join(' · ')}
        </p>
      </div>
      <div className="relative aspect-[4/3] w-full">
        {grid ??
          SLOTS.map((_, i) => (
            <div key={i} className="absolute p-[2px]" style={cellStyle(i)}>
              <AlbumFrame i={i} />
            </div>
          ))}
      </div>
    </div>
  );
}
