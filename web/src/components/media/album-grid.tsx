'use client';
/* eslint-disable @next/next/no-img-element */

import { useMemo, type DragEvent, type MouseEvent } from 'react';
import { Check, FileText, Heart, Music, Play, Video } from 'lucide-react';
import { kindOf, type StoredFile } from '@/api';
import { daySpan, groupByDay } from '@/lib/media-days';
import { cn } from '@/lib/utils';
import type { useSelection } from '@/hooks/useMediaSelection';

/** The type a drag of album files carries, so a section can tell it from a drop of new files. */
export const ALBUM_FILES_DRAG = 'application/x-virgo-files';

export type Density = 'comfortable' | 'compact';

const TILE: Record<Density, string> = {
  comfortable: 'grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-2',
  compact: 'grid-cols-[repeat(auto-fill,minmax(6.75rem,1fr))] gap-1',
};

function clock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor(total / 60) % 60;
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/**
 * An album's media, under the day each thing was taken.
 *
 * Replaces a masonry wall with no dates on it, while the phone app showed the
 * same album in days: the two clients now agree, and both group by capture
 * time rather than by the evening it was uploaded.
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
  canDrag,
  onOpen,
}: {
  files: StoredFile[];
  selection: ReturnType<typeof useSelection>;
  /** Selection mode: a plain click chooses rather than opens. */
  selecting: boolean;
  density: Density;
  /** Only someone who can organise the album may drag files onto sections. */
  canDrag: boolean;
  onOpen: (file: StoredFile) => void;
}) {
  const days = useMemo(() => groupByDay(files), [files]);
  const order = useMemo(() => files.map((file) => file.key), [files]);

  const click = (event: MouseEvent, file: StoredFile) => {
    if (event.shiftKey) {
      event.preventDefault();
      selection.extendTo(file.key, order);
    } else if (event.metaKey || event.ctrlKey || selecting) {
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
    <div className="space-y-8">
      {days.map((day) => {
        const keys = day.items.map((file) => file.key);
        const allChosen = keys.every((key) => selection.has(key));
        const span = daySpan(day.items);
        const headingId = `day-${day.key}`;
        return (
          <section key={`${day.key}-${day.start}`} aria-labelledby={headingId}>
            <header className="group/day mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 id={headingId} className="text-base font-semibold tracking-tight">
                {day.title}
              </h2>
              <p className="text-xs tabular-nums text-muted-foreground">
                {day.items.length.toLocaleString()} item{day.items.length === 1 ? '' : 's'}
                {span ? ` · ${span}` : ''}
              </p>
              <button
                type="button"
                onClick={() => selection.setMany(keys, !allChosen)}
                className={cn(
                  'rounded-md px-2 py-0.5 text-xs font-medium text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100',
                  selecting ? 'opacity-100' : 'opacity-0 group-hover/day:opacity-100',
                )}
              >
                {allChosen ? 'Clear day' : 'Select day'}
              </button>
            </header>

            <ul className={cn('grid', TILE[density])}>
              {day.items.map((file, offset) => (
                <Tile
                  key={file.key}
                  file={file}
                  index={day.start + offset}
                  chosen={selection.has(file.key)}
                  selecting={selecting}
                  draggable={canDrag}
                  onClick={click}
                  onToggle={() => selection.toggle(file.key)}
                  onDragStart={drag}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function Tile({
  file,
  index,
  chosen,
  selecting,
  draggable,
  onClick,
  onToggle,
  onDragStart,
}: {
  file: StoredFile;
  index: number;
  chosen: boolean;
  selecting: boolean;
  draggable: boolean;
  onClick: (event: MouseEvent, file: StoredFile) => void;
  onToggle: () => void;
  onDragStart: (event: DragEvent, file: StoredFile) => void;
}) {
  const kind = kindOf(file.contentType);
  const still = kind === 'video' ? file.posterUrl : kind === 'image' ? (file.thumbnailUrl ?? file.url) : null;
  const what = kind === 'image' ? 'Photograph' : kind === 'video' ? 'Film' : kind === 'audio' ? 'Recording' : 'File';
  const name = file.mediaTitle || file.originalName;

  return (
    <li className="group relative aspect-square">
      <button
        type="button"
        draggable={draggable}
        onDragStart={(event) => onDragStart(event, file)}
        onClick={(event) => onClick(event, file)}
        aria-label={`${what} ${index + 1}, ${name}${file.picked ? ', picked by your client' : ''}`}
        className={cn(
          'relative block size-full overflow-hidden rounded-lg bg-muted bg-cover bg-center text-left outline-offset-2 transition-[transform,box-shadow] duration-200',
          chosen && 'ring-3 ring-primary ring-offset-2 ring-offset-background',
        )}
        style={file.blurDataUrl ? { backgroundImage: `url("${file.blurDataUrl}")` } : undefined}
      >
        {still ? (
          <img
            src={still}
            alt=""
            loading="lazy"
            decoding="async"
            className={cn('size-full object-cover transition-[transform,opacity] duration-500', chosen ? 'scale-[0.94] opacity-85' : 'group-hover:scale-[1.03]')}
          />
        ) : (
          <span className="grid size-full place-items-center bg-secondary px-3 text-center">
            <span>
              {kind === 'audio' ? (
                <Music className="mx-auto size-6 text-muted-foreground" aria-hidden />
              ) : kind === 'video' ? (
                <Video className="mx-auto size-6 text-muted-foreground" aria-hidden />
              ) : (
                <FileText className="mx-auto size-6 text-muted-foreground" aria-hidden />
              )}
              <span className="mt-2 line-clamp-2 block text-xs text-muted-foreground">{name}</span>
            </span>
          </span>
        )}

        {kind === 'video' && (
          <span className="absolute right-1.5 bottom-1.5 flex items-center gap-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">
            <Play className="size-3 fill-current" aria-hidden />
            {file.durationMs ? clock(file.durationMs) : null}
          </span>
        )}

        {file.processingStatus === 'pending' && (
          <span className="absolute left-1.5 bottom-1.5 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-medium text-white">
            Preparing
          </span>
        )}

        {file.picked && (
          <span className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full bg-background/90 shadow-sm" title="Picked by your client">
            <Heart className="size-3.5 fill-primary text-primary" aria-hidden />
          </span>
        )}

        {/* The filename, on hover, where the old grid showed it. */}
        {still && (
          <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2.5 pt-8 pb-2 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
            {name}
          </span>
        )}
      </button>

      {/* The tick. Its own button so it can be reached by keyboard and does
          not open the file; always there in selection mode, on hover otherwise. */}
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={chosen}
        aria-label={`${chosen ? 'Deselect' : 'Select'} ${name}`}
        className={cn(
          'absolute top-1.5 left-1.5 grid size-6 place-items-center rounded-full border-2 transition-opacity focus-visible:opacity-100',
          chosen
            ? 'border-transparent bg-action text-action-foreground opacity-100'
            : 'border-white bg-black/30 text-transparent hover:bg-black/45',
          selecting || chosen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        )}
      >
        <Check className="size-3.5" strokeWidth={3} aria-hidden />
      </button>
    </li>
  );
}
