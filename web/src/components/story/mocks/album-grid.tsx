import type { CSSProperties } from 'react';
import { FolderUp, ImageIcon, Upload } from 'lucide-react';
import { CAST } from '../data/story';
import {
  ALBUM_TILES,
  EMPTY_ALBUM,
  SECTION_COUNTS,
  TILE_SETS,
  uploadStamp,
  type AlbumTile,
  type SectionKey,
  type TileCount,
} from '../data/strings/ch5';
import { Avatar } from './avatar';
import { DayHeading } from './day-heading';
import { FilmTile } from './film-tile';
import { Plate } from './plate';

/**
 * Saturday in the album: its day heading over a grid of abstract Plates, in
 * the order the frames were taken, with Kenn's same-day edit among the
 * reception (storyboard B7, B10). Twelve, nine or six tiles stand for the
 * day's 413; every size spans Prep to Reception and keeps the film.
 *
 * Capture order runs forward here, 05:52 first: the apps open an album
 * newest first, and Mika has switched it to oldest (the phone's toggle in
 * `SectionChips` reads "Oldest"), so the day reads as it happened.
 *
 * - `platform="web"` follows `album-grid.tsx`: the day header (mb-3), then
 *   `repeat(auto-fill, minmax(10.5rem, 1fr))` with 8 px gaps and 12 px tile
 *   radius on the muted surface. The grid is a container: at any width it
 *   crops to whole rows (at most `maxRows`), dropping the tiles that matter
 *   least first, so a row never ends half full.
 * - `platform="phone"` follows the album screen: three square columns with
 *   2 px hairlines and no radius, full-bleed, under the sticky day header.
 *
 * `section` narrows the grid the way a section chip does in the apps (a
 * filter, never a scroll position): only that section's frames, and the day
 * heading counts that section. Pair it with the same `SectionChips` state.
 *
 * States, styled from the root's `data-state` (one attribute flips a beat):
 * - `empty`: the album before anything is in it, as each app shows it —
 *   "Nothing here yet" and its line (web: a dashed panel with Choose a folder
 *   and Choose files; phone: a muted disc and Upload). No heading, no tiles
 *   (they stay in the markup, undisplayed, for a stage to bring in).
 * - `arriving`: the tiles in the order they *arrived* — Kenn's film at
 *   9:24 PM, Ernie's batch, then Mika's — each with its uploader's face and
 *   an upload stamp ("Sat 10:48 PM"), so the flight reads as later that
 *   night. Story chrome, not app UI (the apps always sort by capture time):
 *   it is the moment before the tiles fall into order.
 * - `sorted` (rest): capture order, the app's grid exactly, the full heading.
 *
 * The reorder is CSS `order` from per-tile variables (`--arrive`,
 * `--capture`), so a stage can flip `data-state` and FLIP the tiles with
 * transforms. Hidden tiles (the crop) are the same tiles in both orders.
 *
 * Parts: album-grid (data-state, data-count, data-section), grid, tile
 * (data-index, data-who, data-section, data-kind), tile-media, tile-source,
 * tile-stamp, album-empty; plus day-heading and, for the film, film-tile.
 */

export type AlbumGridState = 'empty' | 'arriving' | 'sorted';

/**
 * Hiding by the auto-fill column count: 10.5rem tiles with 0.5rem gaps give
 * n columns from (n × 11 − 0.5) rem. Literal strings, so Tailwind sees them.
 */
const HIDE_AT_COLUMNS = [
  '@max-[21.5rem]:hidden',
  '@min-[21.5rem]:@max-[32.5rem]:hidden',
  '@min-[32.5rem]:@max-[43.5rem]:hidden',
  '@min-[43.5rem]:@max-[54.5rem]:hidden',
  '@min-[54.5rem]:@max-[65.5rem]:hidden',
  '@min-[65.5rem]:@max-[76.5rem]:hidden',
  '@min-[76.5rem]:hidden',
] as const;

/** How many tiles show at `columns`: whole rows, at most `maxRows` of them. */
function visibleAt(columns: number, count: number, maxRows: number): number {
  return Math.min(count, columns * Math.max(1, Math.min(maxRows, Math.floor(count / columns))));
}

const NAME: Record<AlbumTile['who'], string> = {
  mika: CAST.mika.name,
  ernie: CAST.ernie.name,
  kenn: CAST.kenn.name,
};

/** Shown only in the empty state, and the grid only outside it. */
const ONLY_EMPTY = 'hidden group-data-[state=empty]/grid:flex';
const NOT_EMPTY = 'group-data-[state=empty]/grid:hidden';

function EmptyAlbum({ web }: { web: boolean }) {
  if (web) {
    // albums/[id]/page-client.tsx › EmptyState, for an album with nothing in it.
    return (
      <div
        data-part="album-empty"
        className={`${ONLY_EMPTY} flex-col items-center rounded-xl border border-dashed border-[#362F2B] px-6 py-20 text-center`}
      >
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#2A2522] text-[#A08E84]">
          <Upload aria-hidden className="size-6" />
        </span>
        <p className="mt-5 text-lg font-semibold tracking-tight">{EMPTY_ALBUM.title}</p>
        <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-[#A08E84]">{EMPTY_ALBUM.web}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <span className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#A85D35] px-2.5 text-sm font-medium whitespace-nowrap text-white">
            <FolderUp aria-hidden className="size-4" />
            {EMPTY_ALBUM.webFolder}
          </span>
          <span className="inline-flex h-8 items-center rounded-lg border border-[#362F2B] bg-[rgba(54,47,43,0.3)] px-2.5 text-sm font-medium whitespace-nowrap">
            {EMPTY_ALBUM.webFiles}
          </span>
        </div>
      </div>
    );
  }
  // The album screen's ListEmptyComponent, for an album with nothing in it.
  return (
    <div data-part="album-empty" className={`${ONLY_EMPTY} flex-col items-center px-8 pb-10 pt-20`}>
      <span className="grid size-16 place-items-center rounded-full bg-[#2A2522]">
        <ImageIcon aria-hidden size={26} className="text-[#A08E84]" />
      </span>
      <p className="mt-4 text-lg font-bold leading-7">{EMPTY_ALBUM.title}</p>
      <p className="mt-1 text-center text-sm leading-5 text-[#A08E84]">{EMPTY_ALBUM.phone}</p>
      {/* rounded-2xl is 16 px in the phone app; React Native's text defaults to 14 px. */}
      <span className="mt-6 flex items-center gap-2 rounded-[16px] bg-[#A85D35] px-6 py-3.5 text-white">
        <Upload aria-hidden size={17} />
        <span className="text-[14px] font-semibold leading-[18px]">{EMPTY_ALBUM.phoneUpload}</span>
      </span>
    </div>
  );
}

export function AlbumGrid({
  platform,
  count = 12,
  state = 'sorted',
  section = 'all',
  now,
  heading = true,
  maxRows = 3,
  className = '',
}: {
  platform: 'web' | 'phone';
  count?: TileCount;
  state?: AlbumGridState;
  /** Narrow to one section, as its chip does. */
  section?: SectionKey;
  /** When the album is looked at (the day heading's `now`); Ch5's Monday morning by default. */
  now?: string;
  /** The day heading above the grid. */
  heading?: boolean;
  /** Web only: the most rows the crop keeps. */
  maxRows?: number;
  className?: string;
}) {
  const only = SECTION_COUNTS.find((s) => s.key === section);
  // Everything: the fixed set for this size. One section: as many of its own
  // frames as the size holds, the ones that matter most, in capture order.
  const tiles = only
    ? ALBUM_TILES.filter((t) => t.section === only.name)
        .sort((a, b) => a.keep - b.keep)
        .slice(0, count)
        .sort((a, b) => a.index - b.index)
    : TILE_SETS[count].map((i) => ALBUM_TILES[i]);
  const arrival = [...tiles].sort((a, b) => Date.parse(a.uploadedAt) - Date.parse(b.uploadedAt));
  const byKeep = [...tiles].sort((a, b) => a.keep - b.keep);
  const web = platform === 'web';

  const hideClasses = (tile: AlbumTile) => {
    if (!web) return '';
    const rank = byKeep.indexOf(tile);
    return HIDE_AT_COLUMNS.filter((_, i) => rank >= visibleAt(i + 1, tiles.length, maxRows)).join(' ');
  };

  return (
    <div
      aria-hidden
      data-part="album-grid"
      data-state={state}
      data-count={count}
      data-section={section}
      className={`group/grid @container text-[#F2EDE8] ${web ? 'font-sans' : ''} ${className}`}
    >
      {heading && (
        <div className={NOT_EMPTY}>
          <DayHeading
            platform={platform}
            state={state === 'sorted' ? 'full' : 'title'}
            section={section}
            now={now}
            className={web ? 'mb-3' : ''}
          />
        </div>
      )}
      <div
        data-part="grid"
        className={`${NOT_EMPTY} ${
          web ? 'grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-2' : 'grid grid-cols-3 gap-[2px]'
        }`}
      >
        {tiles.map((tile, i) => (
          <div
            key={tile.index}
            data-part="tile"
            data-index={tile.index}
            data-who={tile.who}
            data-section={tile.section}
            data-kind={tile.kind}
            className={`relative aspect-square overflow-hidden bg-[#2A2522] [order:var(--capture)] group-data-[state=arriving]/grid:[order:var(--arrive)] group-data-[state=arriving]/grid:[&_[data-part=film-badge]]:opacity-0 ${
              web ? 'rounded-lg' : ''
            } ${hideClasses(tile)}`}
            style={{ '--capture': i, '--arrive': arrival.indexOf(tile) } as CSSProperties}
          >
            <div data-part="tile-media" className="absolute inset-0">
              {tile.kind === 'video' ? (
                <FilmTile look={web ? 'web' : 'phone'} aspect="fill" />
              ) : (
                <Plate seed={tile.seed} aspect="fill" />
              )}
            </div>
            <span
              data-part="tile-source"
              className={`absolute z-20 opacity-0 group-data-[state=arriving]/grid:opacity-100 ${web ? 'left-1.5 top-1.5' : 'left-1 top-1'}`}
            >
              <Avatar surface="workspace" name={NAME[tile.who]} size={22} ring="rgba(22,19,17,0.85)" />
            </span>
            <span
              data-part="tile-stamp"
              className={`absolute z-20 whitespace-nowrap rounded-md bg-[rgba(22,19,17,0.84)] py-0.5 font-mono text-[11px] leading-[14px] text-[#F2EDE8] opacity-0 group-data-[state=arriving]/grid:opacity-100 ${
                web ? 'bottom-1.5 left-1.5 px-1.5' : 'bottom-1 left-1 px-1'
              }`}
            >
              {uploadStamp(tile.uploadedAt)}
            </span>
          </div>
        ))}
      </div>
      <EmptyAlbum web={web} />
    </div>
  );
}
