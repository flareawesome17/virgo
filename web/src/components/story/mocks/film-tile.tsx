import { Play } from 'lucide-react';
import { FILM, FILM_SEEDS } from '../data/strings/ch5';
import { Plate } from './plate';

/**
 * Kenn's same-day edit as a tile (storyboard B7): three Plates crossfaded by
 * opacity stand in for its frames, with the duration badge each surface
 * really draws and a progress bar. No video file, and never a person.
 *
 * Looks, by where the tile sits:
 * - `web`: the album grid's badge (`album-grid.tsx`) — bottom-right, rounded,
 *   black/65, a filled 12 px Play and "3:48" in 11 px tabular white.
 * - `phone`: the album screen's (`MediaTile`) — bottom-right, foreground/70
 *   with a dark Play and dark text. The app sets it at 10 px; here it is
 *   11 px, the story's floor for text (§1.6). Square, no radius.
 * - `client`: the client page's — a mono pill at bottom-left, "▶ 3:48" on
 *   rgba(20,18,16,.74); a 14 px tile radius. For Ch6's client page.
 *
 * States, styled from the root's `data-state`, so a stage can flip a beat by
 * setting one attribute (or tween the parts' opacity itself):
 * - `poster` (rest): the first frame and the badge.
 * - `pulse`: the poster with a warm inner ring — the tile "pulses" at Kenn's
 *   laptop chip as the same-day edit plays (Ch5 p 0.30). Animate the ring's
 *   opacity, nothing else.
 * - `playing`: the second frame, the badge gone, the bar at `progress`.
 *   Crossfade the frames by opacity and drive the bar with scaleX.
 *
 * Parts: film-tile (data-state, data-look), film-frame (data-frame 0–2),
 * film-badge, film-pulse, film-progress, film-progress-fill.
 */

export type FilmTileState = 'poster' | 'pulse' | 'playing';
export type FilmTileLook = 'web' | 'phone' | 'client';

const ASPECT = { '1:1': 'aspect-square', '16:9': 'aspect-video', fill: 'size-full' } as const;
const RADIUS: Record<FilmTileLook, string> = { web: 'rounded-lg', phone: '', client: 'rounded-[14px]' };

/** Which frame shows in which state: the poster, then the second frame while it plays. */
const FRAME_CLASS = [
  'opacity-100 group-data-[state=playing]/film:opacity-0',
  'opacity-0 group-data-[state=playing]/film:opacity-100',
  'opacity-0',
] as const;

const BADGE_HIDE = 'group-data-[state=playing]/film:opacity-0';

/** The client page's badge font: `font: 11px ui-monospace, monospace`. */
const CLIENT_MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

export function FilmTile({
  look = 'web',
  state = 'poster',
  aspect = '1:1',
  progress = 0.42,
  className = '',
}: {
  look?: FilmTileLook;
  state?: FilmTileState;
  /** `fill` takes the parent's box (a grid cell). */
  aspect?: keyof typeof ASPECT;
  /** 0–1, how far the bar is in `playing`. */
  progress?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      data-part="film-tile"
      data-state={state}
      data-look={look}
      className={`group/film relative overflow-hidden bg-[#2A2522] ${ASPECT[aspect]} ${RADIUS[look]} ${className}`}
    >
      {FILM_SEEDS.map((seed, i) => (
        <div key={seed} data-part="film-frame" data-frame={i} className={`absolute inset-0 ${FRAME_CLASS[i]}`}>
          <Plate seed={seed} aspect="fill" />
        </div>
      ))}

      <span
        data-part="film-pulse"
        className="pointer-events-none absolute inset-0 z-20 rounded-[inherit] opacity-0 shadow-[inset_0_0_0_2px_#E0A97C,inset_0_0_24px_rgba(224,169,124,0.35)] group-data-[state=pulse]/film:opacity-100"
      />

      {look === 'web' && (
        <span
          data-part="film-badge"
          className={`absolute bottom-1.5 right-1.5 z-10 flex items-center gap-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white ${BADGE_HIDE}`}
        >
          <Play aria-hidden className="size-3 fill-current" />
          {FILM.duration}
        </span>
      )}
      {look === 'phone' && (
        <span
          data-part="film-badge"
          className={`absolute bottom-1 right-1 z-10 flex items-center gap-1 rounded-[14px] bg-[rgba(242,237,232,0.7)] px-1.5 py-0.5 ${BADGE_HIDE}`}
        >
          <Play aria-hidden size={9} className="fill-[#161311] text-[#161311]" />
          <span className="text-[11px] font-semibold leading-[13px] text-[#161311]">{FILM.duration}</span>
        </span>
      )}
      {look === 'client' && (
        <span
          data-part="film-badge"
          className={`absolute bottom-[10px] left-[10px] z-10 rounded-full bg-[rgba(20,18,16,0.74)] px-[9px] py-1 text-[11px] leading-[14px] text-white ${BADGE_HIDE}`}
          style={{ fontFamily: CLIENT_MONO }}
        >
          {FILM.clientPrefix}
          {FILM.duration}
        </span>
      )}

      <div
        data-part="film-progress"
        className="absolute inset-x-0 bottom-0 z-10 h-[3px] bg-[rgba(255,255,255,0.22)] opacity-0 group-data-[state=playing]/film:opacity-100"
      >
        <div
          data-part="film-progress-fill"
          className="h-full w-full origin-left bg-[rgba(255,255,255,0.92)]"
          style={{ transform: `scaleX(${Math.max(0, Math.min(1, progress))})` }}
        />
      </div>
    </div>
  );
}
