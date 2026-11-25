'use client';
/* eslint-disable @next/next/no-img-element -- signed storage URLs, not assets to optimise */

import { useEffect, useEffectEvent, type CSSProperties, type ReactNode } from 'react';
import { FileText, ImageIcon, Link2, MoreHorizontal, Music, Upload } from 'lucide-react';
import { formatBytes, kindOf, type Album, type AlbumSection, type StoredFile } from '@/api';
import { PageHeader } from '@/components/app-shell';
import { HintBar, Panel, StatusDot } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { IS_WINDOWS } from '@/lib/desktop';
import { cn } from '@/lib/utils';
import { plural } from '@/lib/workspaces';
import { takenSpan } from './album-grid';
import { useVideoPlayback } from './video-playback';
import { VideoThumbnail } from './video-thumbnail';

/** The key held with A, as the title bar names it beside K. */
const MOD = IS_WINDOWS ? 'Ctrl ' : '⌘';
/** The same key held for a click, in the line over the grid. */
const MOD_CLICK = IS_WINDOWS ? 'Ctrl-click' : '⌘-click';

/** Anything open over the page: its keys are its own while it is. */
const OVERLAY = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';

/** Whether a key press landed somewhere that takes typing. */
function isTyping(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target : null;
  return !!el?.closest(
    'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
  );
}

/** Whether Space already means something where it landed: a button or a link has its own. */
function takesSpace(el: Element | null): boolean {
  return !!el?.closest(
    'a[href], button, summary, [role="button"], [role="menuitem"], [role="tab"], [role="slider"]',
  );
}

/** A file's name as its tile gives it. */
function nameOf(file: StoredFile): string {
  return file.mediaTitle || file.originalName;
}

/**
 * "23 Dec", or "20 Dec to 23 Dec": when files reached Virgo, for the ones a
 * camera wrote no time on. An upload is a real instant, so this is parsed.
 */
function arrivedSpan(files: readonly StoredFile[]): string {
  let first = Infinity;
  let last = -Infinity;
  for (const file of files) {
    const at = Date.parse(file.createdAt);
    if (Number.isNaN(at)) continue;
    first = Math.min(first, at);
    last = Math.max(last, at);
  }
  if (first > last) return 'Unknown';
  const day = (at: number) => new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return day(first) === day(last) ? day(first) : `${day(first)} to ${day(last)}`;
}

/** A file as a small square: its picture, or the glyph for its kind. */
function Thumb({ file, className, style }: { file: StoredFile; className?: string; style?: CSSProperties }) {
  const kind = kindOf(file.contentType);
  const still = kind === 'video' ? file.posterUrl : kind === 'image' ? (file.thumbnailUrl ?? file.url) : null;
  return (
    <span
      className={cn('grid place-items-center overflow-hidden bg-muted text-muted-foreground', className)}
      style={style}
    >
      {still ? (
        <img src={still} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
      ) : kind === 'video' ? (
        <VideoThumbnail className="size-9" />
      ) : kind === 'audio' ? (
        <Music className="size-5" aria-hidden />
      ) : (
        <FileText className="size-5" aria-hidden />
      )}
    </span>
  );
}

/** One row of a Details panel: what it is on the left, its value on the right. */
function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[34px] items-center justify-between gap-2.5 px-3 py-1.5">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right font-semibold">{children}</dd>
    </div>
  );
}

/**
 * What is chosen: a fan of up to five of them, how many there are, and what
 * they come to. It is here to be read before anything is done with them; the
 * bar over the grid is where that happens.
 */
function Chosen({
  files,
  sections,
  canMove,
}: {
  files: StoredFile[];
  sections: AlbumSection[];
  /** Whether a drag onto a section would move them. */
  canMove: boolean;
}) {
  const one = files.length === 1 ? files[0] : null;
  const fan = files.slice(0, 5);
  const counts = { image: 0, video: 0, audio: 0, other: 0 };
  let bytes = 0;
  let picked = 0;
  for (const file of files) {
    counts[kindOf(file.contentType)] += 1;
    bytes += file.sizeBytes;
    if (file.picked) picked += 1;
  }
  const kinds = [
    counts.image ? plural(counts.image, 'photo') : null,
    counts.video ? plural(counts.video, 'film') : null,
    counts.audio ? plural(counts.audio, 'recording') : null,
    counts.other ? plural(counts.other, 'file') : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const taken = takenSpan(files);
  const firstSection = files[0].sectionId;
  const filedIn = files.some((file) => file.sectionId !== firstSection)
    ? 'Several'
    : (sections.find((section) => section.id === firstSection)?.name ?? 'Unsorted');

  return (
    <>
      <div aria-hidden className="flex h-24 shrink-0 items-center pl-2">
        {fan.map((file, index) => (
          <Thumb
            key={file.key}
            file={file}
            className={cn('size-[72px] shrink-0 rounded-lg ring-2 ring-background', index > 0 && '-ml-11')}
            // Three degrees apart, about the one in the middle.
            style={{ transform: `rotate(${(index - (fan.length - 1) / 2) * 3}deg)` }}
          />
        ))}
      </div>

      <div className="flex shrink-0 flex-col gap-0.5">
        <h2 className="text-base leading-5 font-bold tabular-nums">{plural(files.length, 'file')} chosen</h2>
        {one && (
          <p className="truncate text-xs text-secondary-foreground" title={nameOf(one)}>
            {nameOf(one)}
          </p>
        )}
        <p className="text-xs tabular-nums text-muted-foreground">{kinds}</p>
      </div>

      <Panel title="Details" className="shrink-0">
        <dl className="divide-y divide-border/40">
          <Detail label="Size">{formatBytes(bytes)}</Detail>
          {taken ? (
            <Detail label="Taken">{taken}</Detail>
          ) : (
            // No camera's clock on any of them: say when they arrived, and
            // call it that.
            <Detail label="Uploaded">{arrivedSpan(files)}</Detail>
          )}
          {/* An album with no sections has nothing to say here. */}
          {sections.length > 0 && <Detail label="Section">{filedIn}</Detail>}
          <Detail label="Client picks">
            {one ? (one.picked ? 'Yes' : 'No') : `${picked.toLocaleString()} of ${files.length.toLocaleString()}`}
          </Detail>
        </dl>
      </Panel>

      {canMove && (
        <p className="shrink-0 text-xs leading-[17px] text-muted-foreground">
          {one ? 'Drag it onto a section to move it.' : 'Drag them onto a section to move them.'}
        </p>
      )}
    </>
  );
}

/** The album itself, while nothing is chosen: its cover, its name, and what it holds. */
function AboutAlbum({
  album,
  countsLine,
  total,
  retention,
  linkOn,
}: {
  album: Album | undefined;
  countsLine: string;
  total: number;
  retention: string | null;
  /** Whether the client link is on; undefined for someone who cannot share. */
  linkOn: boolean | undefined;
}) {
  return (
    <>
      <div className="grid aspect-[4/3] shrink-0 place-items-center overflow-hidden rounded-[10px] bg-muted text-muted-foreground">
        {album?.cover_url ? (
          <img src={album.cover_url} alt="" decoding="async" className="size-full object-cover" />
        ) : (
          <ImageIcon className="size-6" aria-hidden />
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-0.5">
        <h2 className="break-words text-base leading-5 font-bold">{album?.name ?? 'Album'}</h2>
        <p className="text-xs tabular-nums text-muted-foreground">{countsLine}</p>
      </div>

      {album && (
        <Panel title="Details" className="shrink-0">
          <dl className="divide-y divide-border/40">
            <Detail label="Files">{total.toLocaleString()}</Detail>
            {/* Absent from an API older than the album list's sizes. */}
            {album.size_bytes != null && <Detail label="Size">{formatBytes(album.size_bytes)}</Detail>}
            <Detail label="Kept">{retention ?? 'Until you delete them'}</Detail>
            {linkOn !== undefined && <Detail label="Client link">{linkOn ? 'On' : 'Off'}</Detail>}
          </dl>
        </Panel>
      )}
    </>
  );
}

/**
 * One album in the desktop app: its sections, its media and what is chosen,
 * side by side, each scrolling on its own.
 *
 * The web's page is one column to scroll, under a head that takes most of the
 * first screen. Here the head is a line in the shell's bar, so the window
 * starts with the grid; choosing is a click on a tile's circle, not a mode to
 * switch on; and the column on the right says what the choice comes to
 * before anything is done with it.
 *
 * The page keeps the queries, the selection, the mutations and the dialogs,
 * and builds the rail, the menus, the media and the selection's bar itself,
 * so that both layouts draw the same ones. This lays them out, draws the
 * inspector, and has the keys.
 */
export function DesktopAlbum({
  title,
  status,
  countsLine,
  retention,
  onKeep,
  uploadMenu,
  clientLink,
  albumMenu,
  rail,
  chips,
  toolbar,
  tiles,
  children,
  selectionBar,
  album,
  total,
  sections,
  files,
  selected,
  canSelect,
  canManage,
  busy,
  onSelectAll,
  onOpen,
  onDelete,
  onClear,
}: {
  /** Where the album sits, ending in its name: the bar's title. */
  title: ReactNode;
  status: { label: string; dot: string } | null;
  /** "142 photos · 6 films", as the web's head counts them. */
  countsLine: string;
  /** How long the files are kept, in the web's words; null when for good. */
  retention: string | null;
  /** Opens the setting for that. The owner's alone. */
  onKeep?: () => void;
  /** What Upload opens; absent for someone who may not add. */
  uploadMenu?: ReactNode;
  /** Absent for someone who may not share. */
  clientLink?: { on: boolean; open: () => void };
  /** What the "…" opens. The owner's alone. */
  albumMenu?: ReactNode;
  /** The sections as a rail, and as the chips they fold to in a narrow window. */
  rail: ReactNode;
  chips: ReactNode;
  /** The "Show and sort" menu. */
  toolbar: ReactNode;
  /** False on the recordings list, which has no tiles to choose or open. */
  tiles: boolean;
  /** The media: what is on its way in, the grid or the list, and their states. */
  children: ReactNode;
  selectionBar: ReactNode;
  album: Album | undefined;
  /** Every file in the album, whatever the grid is narrowed to. */
  total: number;
  sections: AlbumSection[];
  /** What the grid is showing, and which of those are chosen, in its order. */
  files: StoredFile[];
  selected: StoredFile[];
  canSelect: boolean;
  canManage: boolean;
  /** Something is already being done with the selection. */
  busy: boolean;
  onSelectAll: () => void;
  onOpen: (file: StoredFile) => void;
  /** Starts the delete the bar's Delete starts, with its confirmation. */
  onDelete: () => void;
  onClear: () => void;
}) {
  const { current: film, mode: filmMode } = useVideoPlayback();

  // The page's keys. Each does what something on screen also does: the bar's
  // "Select all", a click on a tile, the bar's Delete, its close mark.
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey) return;
    if (isTyping(event.target) || document.querySelector(OVERLAY)) return;
    // A film open over the page has the keyboard to itself.
    if (film && filmMode === 'full') return;

    if (event.ctrlKey || event.metaKey) {
      // Everything in the view on screen, as far as it has loaded.
      if (event.key.toLowerCase() === 'a' && !event.shiftKey && tiles && canSelect && files.length > 0) {
        event.preventDefault();
        onSelectAll();
      }
      return;
    }
    if (event.shiftKey) return;

    if (event.key === 'Escape') {
      if (selected.length === 0) return;
      event.preventDefault();
      onClear();
    } else if (event.key === 'Delete' || (!IS_WINDOWS && event.key === 'Backspace')) {
      // A Mac's delete key is Backspace; most of its keyboards have no other.
      if (!canManage || selected.length === 0) return;
      event.preventDefault();
      if (!busy && !event.repeat) onDelete();
    } else if (event.key === ' ') {
      // A film in the corner takes Space for play and pause.
      if (!tiles || film) return;
      const at = event.target instanceof Element ? event.target : null;
      const tile = at?.closest<HTMLElement>('[data-file-key]');
      // On a tile or its circle, the file is that one. On any other control
      // the key is the control's own. From anywhere else, the first chosen.
      if (!tile && takesSpace(at)) return;
      const file = tile ? files.find((candidate) => candidate.key === tile.dataset.fileKey) : selected[0];
      if (!file) return;
      // Taken here on the way down, so the button under it does not also
      // press itself on the way up.
      event.preventDefault();
      if (!event.repeat) onOpen(file);
    }
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKey(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  // Only the keys that would do something for this person, in this view.
  const hints = (
    [
      [`${MOD}A`, 'Select all', canSelect],
      ['Space', 'Open', true],
      ['Del', 'Delete', canManage],
      ['Esc', 'Stop selecting', canSelect],
    ] as const
  )
    .filter(([, , offered]) => tiles && offered)
    .map(([keys, does]): [string, string] => [keys, does]);

  return (
    <>
      <PageHeader
        title={title}
        // The web's head, as one line after the name. The window gives up
        // the far end of it first: the retention line, then the counts.
        beside={
          <p className="flex min-w-0 items-center gap-1.5 text-[13px] text-secondary-foreground">
            {status && (
              <>
                <StatusDot className={status.dot} />
                <span className="font-semibold text-foreground">{status.label}</span>
              </>
            )}
            <span className="hidden tabular-nums lg:inline">
              {status ? '· ' : ''}
              {countsLine}
            </span>
            {retention && (
              <span className="hidden items-center gap-1.5 xl:flex">
                <span aria-hidden>·</span>
                {/* The owner's way in to change it, as it is on the web. */}
                {onKeep ? (
                  <button
                    type="button"
                    onClick={onKeep}
                    title="Change how long the files are kept"
                    className="rounded hover:text-foreground hover:underline"
                  >
                    {retention}
                  </button>
                ) : (
                  retention
                )}
              </span>
            )}
          </p>
        }
        actions={
          <>
            {/* At the height of the shell's Create, which they sit beside.
                Upload is filled all the same: it is what this page is for. */}
            {uploadMenu && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="gap-1.5">
                    <Upload />
                    Upload
                  </Button>
                </DropdownMenuTrigger>
                {uploadMenu}
              </DropdownMenu>
            )}
            {clientLink && (
              <Button
                variant="secondary"
                size="sm"
                className="gap-1.5"
                onClick={clientLink.open}
                aria-label={clientLink.on ? 'Client link, on' : undefined}
              >
                <Link2 />
                Client link
                {clientLink.on && <span aria-hidden className="size-[7px] rounded-full bg-success" />}
              </Button>
            )}
            {albumMenu && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="icon-sm" aria-label="Album options">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                {albumMenu}
              </DropdownMenu>
            )}
          </>
        }
      />

      {/* A container, so the columns fold by the width of the sheet and not
          of the window: the shell's rail is not theirs to count. */}
      <div className="@container flex h-full min-h-0 flex-col text-[13px]">
        <div className="flex min-h-0 flex-1">
          <div className="hidden w-40 shrink-0 overflow-y-auto px-2 py-3 @min-[760px]:block">{rail}</div>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex shrink-0 flex-col gap-1.5 px-3 pt-2.5 pb-1.5">
              <div className="@min-[760px]:hidden">{chips}</div>
              <div className="flex min-h-[30px] items-center gap-2">
                {toolbar}
                <span className="flex-1" />
                {tiles && canSelect && (
                  <p className="min-w-0 truncate text-xs text-muted-foreground">
                    Shift-click for a run · {MOD_CLICK} to add one
                  </p>
                )}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3">
              {/* As tall as the column at least, so the selection's bar rests
                  at its foot under a short album too. */}
              <div className="flex min-h-full flex-col pb-4">
                <div className="flex flex-1 flex-col gap-1.5">{children}</div>
                {selectionBar}
              </div>
            </div>
          </div>

          <aside
            aria-label={selected.length > 0 ? 'Selection' : 'Album'}
            className="hidden w-60 shrink-0 flex-col gap-3 overflow-y-auto border-l border-border p-3 @min-[1000px]:flex"
          >
            {selected.length > 0 ? (
              <Chosen files={selected} sections={sections} canMove={canManage && sections.length > 0} />
            ) : (
              <AboutAlbum
                album={album}
                countsLine={countsLine}
                total={total}
                retention={retention}
                linkOn={clientLink?.on}
              />
            )}
          </aside>
        </div>

        {/* Gone with its last hint: an empty foot is a line across nothing. */}
        {hints.length > 0 && <HintBar className="shrink-0" hints={hints} />}
      </div>
    </>
  );
}
