'use client';
/* eslint-disable @next/next/no-img-element */

import { useMemo, type DragEvent, type MouseEvent } from 'react';
import { Check, FileText, Heart, Music, Play, Video } from 'lucide-react';
import { kindOf, THUMBNAIL_EDGE, type StoredFile } from '@/api';
import { groupByDay, timeOfDay } from '@/lib/media-days';
import { cn } from '@/lib/utils';
import type { useSelection } from '@/hooks/useMediaSelection';
import { VideoThumbnail } from './video-thumbnail';

/** The type a drag of album files carries, so a section can tell it from a drop of new files. */
export const ALBUM_FILES_DRAG = 'application/x-virgo-files';

/**
 * How large the tiles are. `dense` is the desktop app's: smaller tiles, and
 * with them a grid worked by pointer, where every tile shows its circle and
 * a plain click always opens.
 */
export type Density = 'comfortable' | 'compact' | 'dense';

/** What the grid has been narrowed to. Films get their own layout. */
export type GridKind = 'all' | 'image' | 'video' | 'audio';

/**
 * The square grid's columns at each tile size, two pixels apart as on the
 * phone. Exported so the files still uploading line up on the same columns.
 */
export const TILE_GRID: Record<Density, string> = {
  comfortable: 'grid-cols-2 gap-0.5 sm:grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))]',
  compact: 'grid-cols-3 gap-0.5 sm:grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))]',
  dense: 'grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-0.5',
};

/** Films are 16:9 with their name under them: three or four across, two when the tiles are larger. */
const FILM_GRID: Record<Density, string> = {
  comfortable: 'grid-cols-[repeat(auto-fill,minmax(min(360px,100%),1fr))] gap-x-4 gap-y-5',
  compact: 'grid-cols-[repeat(auto-fill,minmax(min(260px,100%),1fr))] gap-x-4 gap-y-5',
  dense: 'grid-cols-[repeat(auto-fill,minmax(min(220px,100%),1fr))] gap-x-3 gap-y-4',
};

/**
 * How wide a tile is drawn, for choosing among its pictures.
 *
 * `auto` is the tile's real width, where the browser knows it — Chromium,
 * for a lazy image. Elsewhere the length after it stands in: the column's
 * minimum with room for the stretch an auto-fill grid gives it.
 */
const TILE_SIZES: Record<Density, string> = {
  comfortable: 'auto, 14rem',
  compact: 'auto, 10rem',
  dense: 'auto, 8rem',
};

/**
 * A `srcset` for a square, cropped tile: the thumbnail and every display copy,
 * each described by its SHORT edge.
 *
 * Cropped square, the short edge is what has to cover the tile, so that is
 * the width the browser should weigh — it then takes the thumbnail while that
 * covers the tile at the screen's density and a display copy once it does
 * not. On a large or high-density screen the thumbnail was drawn stretched.
 * Undefined when the photograph's size is unknown, and the thumbnail alone
 * is drawn as before.
 */
function tileSrcSet(file: StoredFile): string | undefined {
  const { width, height } = file;
  if (!width || !height) return undefined;
  const long = Math.max(width, height);
  const shortOf = (edge: number) => Math.max(1, Math.round((edge * Math.min(width, height)) / long));
  const candidates = [
    ...(file.thumbnailUrl
      ? [`${file.thumbnailUrl} ${shortOf(Math.min(THUMBNAIL_EDGE, long))}w`]
      : []),
    ...file.displaySources.map((source) => `${source.url} ${shortOf(source.width)}w`),
  ];
  return candidates.length > 1 ? candidates.join(', ') : undefined;
}

function clock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor(total / 60) % 60;
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "Sat, 21 Dec": the day short enough to sit on one line with its count.
 * Spelled out here rather than left to the browser's locale data, which puts
 * the comma in for some and leaves it out for others. "Today" and "Yesterday"
 * are kept as the shared grouping gives them.
 */
function shortDay(key: string, title: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match || title === 'Today' || title === 'Yesterday') return title;
  const [year, month, day] = match.slice(1).map(Number);
  const short = `${WEEKDAYS[new Date(year, month - 1, day).getDay()]}, ${day} ${MONTHS[month - 1]}`;
  return year === new Date().getFullYear() ? short : `${short} ${year}`;
}

/** "4:45 PM" from a wall clock's "16:45"; the AM or PM left off when the time after it says it. */
function twelveHour(time: string, meridiem = true): string {
  const [hh, mm] = time.split(':').map(Number);
  const text = `${hh % 12 === 0 ? 12 : hh % 12}:${String(mm).padStart(2, '0')}`;
  return meridiem ? `${text} ${hh < 12 ? 'AM' : 'PM'}` : text;
}

/**
 * "2:10 to 4:45 PM": what a day's frames span, off the camera's own clock.
 * Null when fewer than two carry a time, since a span of one time is a time.
 */
function spanOf(files: readonly StoredFile[]): string | null {
  const times = files
    .map(timeOfDay)
    .filter((time): time is string => time !== null)
    .sort();
  const first = times[0];
  const last = times[times.length - 1];
  if (times.length < 2 || first === last) return null;
  const sameHalf = Number(first.slice(0, 2)) < 12 === Number(last.slice(0, 2)) < 12;
  return `${twelveHour(first, !sameHalf)} to ${twelveHour(last)}`;
}

/** "21 Dec, 8:40 PM": when a film was shot, or when it arrived if the camera wrote no time. */
function shotAt(file: StoredFile): string {
  const taken = file.takenAt ? /^\d{4}-(\d{2})-(\d{2})T(\d{2}:\d{2})/.exec(file.takenAt) : null;
  if (taken) return `${Number(taken[2])} ${MONTHS[Number(taken[1]) - 1]}, ${twelveHour(taken[3])}`;
  const arrived = new Date(file.createdAt);
  if (Number.isNaN(arrived.getTime())) return '';
  return `${arrived.getDate()} ${MONTHS[arrived.getMonth()]}, ${twelveHour(`${arrived.getHours()}:${arrived.getMinutes()}`)}`;
}

/**
 * When a set of files was taken, for the desktop app's inspector: "21 Dec,
 * 2:14 PM" for one time, "21 Dec, 2:14 to 3:36 PM" for a run within a day,
 * "20 Dec to 21 Dec" across days, with the years when they are not the same
 * one. Off the camera's own clock, read as written; null when none of them
 * carries one.
 */
export function takenSpan(files: readonly StoredFile[]): string | null {
  // The earliest and the latest, compared as text: written this way, the
  // order of the characters is the order of the times.
  let first: RegExpExecArray | null = null;
  let last: RegExpExecArray | null = null;
  for (const file of files) {
    const stamp = file.takenAt ? /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?/.exec(file.takenAt) : null;
    if (!stamp) continue;
    if (!first || stamp[0] < first[0]) first = stamp;
    if (!last || stamp[0] > last[0]) last = stamp;
  }
  if (!first || !last) return null;
  const years = first[1] !== last[1];
  const day = (stamp: RegExpExecArray) =>
    `${Number(stamp[3])} ${MONTHS[Number(stamp[2]) - 1]}${years ? ` ${stamp[1]}` : ''}`;
  if (first[0].slice(0, 10) !== last[0].slice(0, 10)) return `${day(first)} to ${day(last)}`;
  const from: string | undefined = first[4];
  const to: string | undefined = last[4];
  if (!from || !to) return day(first);
  if (from === to) return `${day(first)}, ${twelveHour(from)}`;
  const sameHalf = Number(from.slice(0, 2)) < 12 === Number(to.slice(0, 2)) < 12;
  return `${day(first)}, ${twelveHour(from, !sameHalf)} to ${twelveHour(to)}`;
}

/** "64 items", or "4 films" when the grid is showing only those. */
function countOf(n: number, kind: GridKind): string {
  const [one, many] = kind === 'video' ? ['film', 'films'] : kind === 'image' ? ['photo', 'photos'] : ['item', 'items'];
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

interface TileProps {
  file: StoredFile;
  index: number;
  chosen: boolean;
  selecting: boolean;
  selectable: boolean;
  /** The desktop app's tile: its circle always drawn, its marks a size down. */
  dense: boolean;
  draggable: boolean;
  onClick: (event: MouseEvent, file: StoredFile) => void;
  onToggle: () => void;
  onDragStart: (event: DragEvent, file: StoredFile) => void;
}

/**
 * An album's media, under the day each thing was taken.
 *
 * Replaces a masonry wall with no dates on it, while the phone app showed the
 * same album in days: the two clients now agree, and both group by capture
 * time rather than by the evening it was uploaded. Narrowed to films, the
 * tiles are 16:9 with each film's name and time under it, as on the phone.
 *
 * Selecting works the way a desktop file browser does — the tick in a tile's
 * corner, ⌘ or Ctrl-click to add one, Shift-click to take a run — and a
 * selected set can be dragged onto a section to file it.
 */
export function AlbumGrid({
  files,
  selection,
  selecting,
  density,
  kind = 'all',
  canDrag,
  canSelect = true,
  onOpen,
}: {
  files: StoredFile[];
  selection: ReturnType<typeof useSelection>;
  /** Selection mode: a plain click chooses rather than opens. Not when the tiles are `dense`. */
  selecting: boolean;
  density: Density;
  /** What the list was narrowed to, for the count's word and the films' layout. */
  kind?: GridKind;
  /** Only someone who can organise the album may drag files onto sections. */
  canDrag: boolean;
  /**
   * Whether there is anything a selection could be used for. Without it the
   * ticks, the modifier clicks and Select day are gone, and a click opens.
   */
  canSelect?: boolean;
  onOpen: (file: StoredFile) => void;
}) {
  const days = useMemo(() => groupByDay(files), [files]);
  const order = useMemo(() => files.map((file) => file.key), [files]);
  const films = kind === 'video';
  // The desktop app has no Select button to turn choosing on and off: the
  // circle chooses, and a plain click on the tile opens it whatever is chosen.
  const dense = density === 'dense';

  const click = (event: MouseEvent, file: StoredFile) => {
    if (!canSelect) {
      onOpen(file);
    } else if (event.shiftKey) {
      event.preventDefault();
      selection.extendTo(file.key, order);
    } else if (event.metaKey || event.ctrlKey || (selecting && !dense)) {
      event.preventDefault();
      selection.toggle(file.key);
    } else {
      onOpen(file);
    }
  };

  const drag = (event: DragEvent, file: StoredFile) => {
    // Dragging a chosen tile carries the whole choice; dragging any other one
    // carries just that tile, the way a file manager does.
    const keys = selection.has(file.key) ? selection.keys() : [file.key];
    event.dataTransfer.setData(ALBUM_FILES_DRAG, JSON.stringify(keys));
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className={dense ? 'space-y-1.5' : 'space-y-4'}>
      {days.map((day) => {
        const keys = day.items.map((file) => file.key);
        const allChosen = keys.every((key) => selection.has(key));
        // A film says when it was shot under its own tile.
        const span = films ? null : spanOf(day.items);
        const headingId = `day-${day.key}`;
        return (
          <section key={`${day.key}-${day.start}`} aria-labelledby={headingId}>
            <header className={cn('group/day flex items-baseline gap-2', dense ? 'pt-1.5 pb-2' : 'pt-1 pb-3')}>
              <h2 id={headingId} className={cn('shrink-0 font-bold', dense ? 'text-[13px]' : 'text-[15px]', 'leading-5')}>
                {shortDay(day.key, day.title)}
              </h2>
              <p
                className={cn(
                  'min-w-0 flex-1 truncate tabular-nums text-muted-foreground',
                  dense ? 'text-xs' : 'text-[13px]',
                )}
              >
                {countOf(day.items.length, kind)}
                {span ? ` · ${span}` : ''}
              </p>
              {canSelect && (
                <button
                  type="button"
                  onClick={() => selection.setMany(keys, !allChosen)}
                  className={cn(
                    'shrink-0 rounded-md text-xs font-semibold text-secondary-foreground transition-opacity hover:text-foreground focus-visible:opacity-100',
                    selecting || dense ? 'opacity-100' : 'opacity-0 group-hover/day:opacity-100',
                  )}
                >
                  {allChosen ? 'Clear day' : 'Select day'}
                </button>
              )}
            </header>

            <ul className={cn('grid', films ? FILM_GRID[density] : TILE_GRID[density])}>
              {day.items.map((file, offset) => {
                const props: TileProps = {
                  file,
                  index: day.start + offset,
                  chosen: selection.has(file.key),
                  selecting,
                  selectable: canSelect,
                  dense,
                  draggable: canDrag,
                  onClick: click,
                  onToggle: () => selection.toggle(file.key),
                  onDragStart: drag,
                };
                return films ? (
                  <FilmTile key={file.key} {...props} />
                ) : (
                  <Tile key={file.key} {...props} sizes={TILE_SIZES[density]} />
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/**
 * The length of a film, at the foot of its tile. On the desktop app's small
 * tile the time alone says it is a film; the glyph is kept for one whose
 * length is not known, which would otherwise pass for a photograph.
 */
function Length({ ms, dense = false }: { ms: number | null | undefined; dense?: boolean }) {
  return (
    <span
      className={cn(
        'absolute flex items-center gap-1 bg-black/70 font-semibold tabular-nums text-white',
        dense
          ? 'right-1 bottom-1 rounded-[5px] px-[5px] py-px text-[10px]'
          : 'right-1.5 bottom-1.5 rounded-md px-1.5 py-0.5 text-[11px]',
      )}
    >
      {(!dense || !ms) && <Play className="size-2.5 fill-current" aria-hidden />}
      {ms ? clock(ms) : null}
    </span>
  );
}

/**
 * The client's pick. Top right, across from the tick: on the web the tick
 * comes up under the pointer, and the two cannot share a corner.
 */
function Picked({ dense = false }: { dense?: boolean }) {
  return (
    <span
      className={cn(
        'absolute grid place-items-center rounded-full bg-action text-action-foreground',
        dense ? 'top-[5px] right-[5px] size-[18px]' : 'top-1.5 right-1.5 size-[22px]',
      )}
      title="Picked by your client"
    >
      <Heart className={cn('fill-current', dense ? 'size-2.5' : 'size-3')} aria-hidden />
    </span>
  );
}

/**
 * The tick. Its own button so it can be reached by keyboard and does not open
 * the file; always there in selection mode, on hover otherwise. Dark when
 * chosen, never terracotta: that is the page's one action. In the desktop
 * app it is always there: it is the only way in to choosing.
 */
function Tick({
  name,
  chosen,
  selecting,
  dense,
  onToggle,
}: {
  name: string;
  chosen: boolean;
  selecting: boolean;
  dense: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={chosen}
      aria-label={`${chosen ? 'Deselect' : 'Select'} ${name}`}
      className={cn(
        'absolute grid place-items-center rounded-full transition-opacity focus-visible:opacity-100',
        dense ? 'top-[5px] left-[5px] size-[18px] border-[1.5px]' : 'top-1.5 left-1.5 size-[22px] border-2',
        chosen
          ? 'border-transparent bg-foreground text-background opacity-100'
          : cn(
              'border-white text-transparent hover:bg-black/40',
              // Always there, so nearly clear: a ring over the picture, with
              // just enough under it to show on a white sky.
              dense ? 'bg-black/10' : 'bg-black/25',
            ),
        selecting || chosen || dense ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
      )}
    >
      <Check className={dense ? 'size-[11px]' : 'size-3'} strokeWidth={dense ? 3 : 3.5} aria-hidden />
    </button>
  );
}

function Tile({
  file,
  sizes,
  index,
  chosen,
  selecting,
  selectable,
  dense,
  draggable,
  onClick,
  onToggle,
  onDragStart,
}: TileProps & {
  /** The tile's drawn width, as an `<img sizes>` value. */
  sizes: string;
}) {
  const kind = kindOf(file.contentType);
  const still = kind === 'video' ? file.posterUrl : kind === 'image' ? (file.thumbnailUrl ?? file.url) : null;
  const srcSet = kind === 'image' ? tileSrcSet(file) : undefined;
  const what = kind === 'image' ? 'Photograph' : kind === 'video' ? 'Film' : kind === 'audio' ? 'Recording' : 'File';
  const name = file.mediaTitle || file.originalName;

  return (
    // Its key is on the tile so the desktop app's Space can open the file
    // the keyboard is on.
    <li className="group relative aspect-square" data-file-key={file.key}>
      <button
        type="button"
        draggable={draggable}
        onDragStart={(event) => onDragStart(event, file)}
        onClick={(event) => onClick(event, file)}
        aria-label={`${what} ${index + 1}, ${name}${file.picked ? ', picked by your client' : ''}`}
        // The focus ring is drawn inside the tile: two pixels from its
        // neighbours, one drawn outside would be under them.
        className="relative block size-full overflow-hidden bg-muted bg-cover bg-center text-left -outline-offset-2"
        style={file.blurDataUrl ? { backgroundImage: `url("${file.blurDataUrl}")` } : undefined}
      >
        {still ? (
          <img
            src={still}
            srcSet={srcSet}
            sizes={srcSet ? sizes : undefined}
            alt=""
            loading="lazy"
            decoding="async"
            className={cn('size-full object-cover transition-transform duration-500', !chosen && 'group-hover:scale-[1.03]')}
          />
        ) : (
          <span className="grid size-full place-items-center px-3 text-center">
            <span>
              {kind === 'audio' ? (
                <Music className="mx-auto size-6 text-muted-foreground" aria-hidden />
              ) : kind === 'video' ? (
                <VideoThumbnail className={cn('mx-auto block', dense ? 'size-9' : 'size-12 sm:size-14')} />
              ) : (
                <FileText className="mx-auto size-6 text-muted-foreground" aria-hidden />
              )}
              <span className="mt-2 line-clamp-2 block text-xs text-muted-foreground">{name}</span>
            </span>
          </span>
        )}

        {kind === 'video' && <Length ms={file.durationMs} dense={dense} />}

        {file.processingStatus === 'pending' && (
          <span className="absolute left-1.5 bottom-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            Getting ready
          </span>
        )}

        {file.picked && <Picked dense={dense} />}

        {/* The filename, on hover, where the old grid showed it. */}
        {still && (
          <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2.5 pt-8 pb-2 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
            {name}
          </span>
        )}

        {/* Over the picture, which would cover a ring drawn on the button. */}
        {chosen && <span aria-hidden className="pointer-events-none absolute inset-0 ring-3 ring-foreground ring-inset" />}
      </button>

      {selectable && <Tick name={name} chosen={chosen} selecting={selecting} dense={dense} onToggle={onToggle} />}
    </li>
  );
}

/**
 * A film among films: wide, with its name and when it was shot under it.
 *
 * The length is on the picture, so the line under the name is the time. One
 * still being processed is a pale tile that says so; it has no frame to show.
 */
function FilmTile({
  file,
  index,
  chosen,
  selecting,
  selectable,
  dense,
  draggable,
  onClick,
  onToggle,
  onDragStart,
}: TileProps) {
  const name = file.mediaTitle || file.originalName;
  const length = file.durationMs ? clock(file.durationMs) : null;
  const pending = file.processingStatus === 'pending';

  return (
    <li className="group relative min-w-0" data-file-key={file.key}>
      <button
        type="button"
        draggable={draggable}
        onDragStart={(event) => onDragStart(event, file)}
        onClick={(event) => onClick(event, file)}
        aria-label={`Film ${index + 1}, ${name}${length ? `, ${length}` : ''}${pending ? ', getting ready' : ''}${file.picked ? ', picked by your client' : ''}`}
        className="block w-full rounded-lg text-left outline-offset-4"
      >
        <span className="relative flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-muted">
          {pending ? (
            <span className="flex flex-col items-center gap-1.5 text-[13px] font-semibold text-secondary-foreground">
              <Video className="size-5" aria-hidden />
              Getting ready
            </span>
          ) : file.posterUrl ? (
            <>
              <img
                src={file.posterUrl}
                alt=""
                loading="lazy"
                decoding="async"
                className={cn('absolute inset-0 size-full object-cover transition-transform duration-500', !chosen && 'group-hover:scale-[1.03]')}
              />
              <span className="relative grid size-11 place-items-center rounded-full bg-black/55 text-white">
                <Play className="size-4 translate-x-px fill-current" aria-hidden />
              </span>
            </>
          ) : (
            // No frame of its own: a film has one only once it has been posted.
            <VideoThumbnail className="size-16" />
          )}
          {length && !pending && <Length ms={file.durationMs} dense={dense} />}
          {file.picked && <Picked dense={dense} />}
          {chosen && <span aria-hidden className="pointer-events-none absolute inset-0 rounded-lg ring-3 ring-foreground ring-inset" />}
        </span>
        <span className="mt-2 block truncate text-sm leading-5 font-semibold" title={name}>
          {name}
        </span>
        <span className="block text-xs leading-4 text-muted-foreground">{shotAt(file)}</span>
      </button>

      {selectable && <Tick name={name} chosen={chosen} selecting={selecting} dense={dense} onToggle={onToggle} />}
    </li>
  );
}
