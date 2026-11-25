'use client';
/* eslint-disable @next/next/no-img-element */

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent,
} from 'react';
import { ChevronLeft, ChevronRight, Download, Heart, Info, Minus, Plus, Trash2, X } from 'lucide-react';
import { displaySrcSet, formatBytes, kindOf, largestDisplaySource, originalForDetail, type StoredFile } from '@/api';
import { takenLabel, typeLabel, uploadedLabel, whenLabel } from '@/components/media/media-labels';
import { VideoPlayer } from '@/components/media/video-player';
import { VIDEO_THUMBNAIL } from '@/components/media/video-thumbnail';
import { useAlbum } from '@/hooks/useAlbums';
import { useWorkspace } from '@/hooks/useWorkspaces';
import { downloadHref } from '@/lib/desktop';
import { cn } from '@/lib/utils';

const motion = 'transition-[transform,opacity,background-color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]';

const FOCUS = 'outline-none focus-visible:ring-3 focus-visible:ring-ring/60';

/**
 * Zoomed past this, the original joins the choices.
 *
 * The display copies cover the screen at 1x; by one and a half times the zoom
 * is magnifying pixels the copy does not have, which is where checking focus
 * turns into looking at mush.
 */
const DETAIL_AT = 1.5;

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;
const clampZoom = (value: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));

/**
 * The image's `srcset` and `sizes` at a zoom.
 *
 * `sizes` grows with the zoom, so the browser chooses for the size the
 * photograph is magnified to rather than the size of its frame — and past
 * DETAIL_AT the original is one of the choices, described by its own width.
 * The browser keeps drawing what it has until the larger one has loaded, so
 * a zoom never blanks the picture. The frame itself stays put: `sizes` also
 * sets the image's natural size, which is why nothing on the stage is sized
 * from it — see fittedSize.
 */
function zoomedSources(file: StoredFile, zoom: number): { srcSet?: string; sizes?: string } {
  const copies = displaySrcSet(file);
  if (!copies) return {};
  const original = zoom >= DETAIL_AT ? originalForDetail(file) : null;
  return {
    srcSet: original && file.width ? `${copies}, ${original} ${file.width}w` : copies,
    sizes: `${Math.round(Math.max(1, zoom) * 100)}vw`,
  };
}

/**
 * The picture's size on a stage at 100%: the whole of it, and never larger
 * than its own pixels.
 *
 * From the dimensions the API recorded, upright, rather than the image's
 * natural size. With a `srcset` described in widths that is whatever `sizes`
 * says — 100vw — so every photograph claimed to be as wide as the window, a
 * 500px logo included, and was drawn that size: a square one in a landscape
 * window ran off the bottom of the stage. Without the dimensions it fills the
 * stage, as it always did.
 */
function fittedSize(file: StoredFile, stage: { width: number; height: number }): { width: number; height: number } {
  if (!file.width || !file.height) return { width: stage.width, height: stage.height };
  const scale = Math.min(1, stage.width / file.width, stage.height / file.height);
  return { width: file.width * scale, height: file.height * scale };
}

export function MediaViewer({ files, index, onIndexChange, onClose, onDelete }: {
  files: StoredFile[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onDelete?: (file: StoredFile) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [chrome, setChrome] = useState(true);
  const [showInfo, setShowInfo] = useState(false);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  // Which picture has painted, and which has had its display copies fail. A
  // copy that will not load falls back to the original rather than leaving the
  // 20px preview up, magnified, as if it were the photograph.
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [copiesFailedKey, setCopiesFailedKey] = useState<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const file = files[index];
  const kind = file ? kindOf(file.contentType) : 'other';
  // Where it is filed, for the line under the date and the top of Info. Both
  // are already held from the album page this opens over, so neither asks the
  // server again; opened anywhere they are not held, the lines go without.
  const { data: album } = useAlbum(file?.albumId ?? undefined);
  const { data: workspace } = useWorkspace(album?.workspace_id ?? undefined);

  const resetTransform = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);
  // Zoom by a step, keeping the picture inside the stage: back at 100% it is
  // centred again, and below the maximum it cannot be left stranded off-screen.
  const zoomBy = useCallback((delta: number) => {
    setZoom((current) => {
      const next = clampZoom(Math.round((current + delta) * 100) / 100);
      if (next <= ZOOM_MIN) setOffset({ x: 0, y: 0 });
      return next;
    });
  }, []);
  // Info stays as it is from one photograph to the next: it is a panel beside
  // the picture now, not a card over it, and closing it at every step made
  // the picture jump in size.
  const choose = useCallback((nextIndex: number) => {
    resetTransform();
    onIndexChange(nextIndex);
  }, [onIndexChange, resetTransform]);
  const step = useCallback((by: number) => {
    if (files.length < 2 || zoom > 1) return;
    choose((index + by + files.length) % files.length);
  }, [choose, files.length, index, zoom]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    const handle = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input,select,button,a')) return;
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') step(1);
      if (event.key === 'ArrowLeft') step(-1);
      if (kind === 'image' && (event.key === '+' || event.key === '=')) zoomBy(ZOOM_STEP);
      if (kind === 'image' && event.key === '-') zoomBy(-ZOOM_STEP);
      if (kind === 'image' && event.key === '0') resetTransform();
    };
    window.addEventListener('keydown', handle);
    return () => {
      window.removeEventListener('keydown', handle);
      document.body.style.overflow = previous;
    };
  }, [kind, onClose, resetTransform, step, zoomBy]);

  useEffect(() => {
    for (const near of [files[index - 1], files[index + 1]]) {
      if (!near || kindOf(near.contentType) !== 'image') continue;
      // A display copy if there is one. Preloading `url` here meant fetching
      // both neighbouring ORIGINALS on every step through an album — two
      // camera files nobody had asked to see yet. Chosen the way the viewer
      // will choose it, from the same `srcset` and `sizes`, so the copy
      // fetched is the one drawn and not merely the widest.
      const source = largestDisplaySource(near) ?? near.url;
      if (!source) continue;
      const image = new Image();
      const { srcSet, sizes } = zoomedSources(near, 1);
      if (srcSet && sizes) {
        image.sizes = sizes;
        image.srcset = srcSet;
      }
      image.src = source;
    }
  }, [files, index]);

  if (!file) return null;
  const copiesFailed = copiesFailedKey === file.key;
  const sources = copiesFailed ? {} : zoomedSources(file, zoom);
  const imageSrc = (copiesFailed ? file.url : (largestDisplaySource(file) ?? file.url)) ?? undefined;
  const loaded = loadedKey === file.key;
  const onWheel = (event: WheelEvent) => {
    if (kind !== 'image') return;
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
  };
  const onPointerDown = (event: ReactPointerEvent) => {
    if (zoom <= 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
    setDragging(true);
  };
  const onPointerMove = (event: ReactPointerEvent) => {
    if (!drag.current) return;
    // Held to the zoomed picture's edge, so a drag cannot lose it — the
    // picture's, not the stage's, which is wider than a portrait photograph.
    // The picture is fitted to the image's own box, which leaves room at the
    // sides for the arrows; it may travel to the edge of the whole stage.
    const box = stageRef.current?.getBoundingClientRect();
    const frame = imageRef.current
      ? { width: imageRef.current.offsetWidth, height: imageRef.current.offsetHeight }
      : box;
    const picture = frame ? fittedSize(file, frame) : null;
    const limitX = box && picture ? Math.max(0, (picture.width * zoom - box.width) / 2) : Infinity;
    const limitY = box && picture ? Math.max(0, (picture.height * zoom - box.height) / 2) : Infinity;
    setOffset({
      x: Math.max(-limitX, Math.min(limitX, drag.current.ox + event.clientX - drag.current.x)),
      y: Math.max(-limitY, Math.min(limitY, drag.current.oy + event.clientY - drag.current.y)),
    });
  };

  const fade = chrome ? 'translate-y-0 opacity-100' : 'pointer-events-none opacity-0';
  const saveHref = file.capabilities.download && file.downloadUrl ? downloadHref(file.downloadUrl) : null;
  const place = `${index + 1} of ${files.length}${album?.name ? ` · ${album.name}` : ''}`;

  return (
    // Wears the dark palette in both themes: a photograph is judged on black.
    <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={file.originalName} className="dark fixed inset-0 z-50 flex min-h-[100dvh] flex-col overflow-hidden bg-background text-sm text-foreground outline-none" onPointerMove={() => setChrome(true)}>
      {/* When it was taken, not what the camera called it. "DSC_0421.JPG" led
          the screen; the name is in Info for whoever needs it. */}
      <header className={cn('relative z-20 flex min-h-[60px] flex-wrap items-center gap-2 px-4 py-2', motion, fade, !chrome && '-translate-y-3')}>
        <button type="button" onClick={onClose} aria-label="Close" className={cn('grid size-10 shrink-0 place-items-center rounded-full hover:bg-foreground/10', FOCUS)}><X size={20} /></button>
        <div className="flex min-w-0 flex-[1_1_13.75rem] flex-col">
          <span className="truncate text-[15px] font-semibold">{whenLabel(file)}</span>
          <span className="truncate text-xs text-muted-foreground">{place}</span>
        </div>
        {file.picked && (
          <span className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-primary/25 pl-2 pr-2.5 text-xs font-semibold">
            <Heart size={12} aria-hidden className="fill-primary text-primary" />
            Picked by your client
          </span>
        )}
        {kind === 'image' && (
          <span className="hidden shrink-0 items-center rounded-[10px] bg-foreground/[0.08] sm:flex">
            <button type="button" onClick={() => zoomBy(-ZOOM_STEP)} disabled={zoom <= ZOOM_MIN} aria-label="Zoom out" className={cn('grid size-9 place-items-center rounded-[10px] hover:bg-foreground/10 disabled:pointer-events-none disabled:opacity-30', FOCUS)}><Minus size={14} /></button>
            <button type="button" onClick={resetTransform} aria-label="Reset zoom to fit" title="Reset zoom (0)" className={cn('h-9 w-11 rounded-[10px] text-center text-xs font-semibold tabular-nums hover:bg-foreground/10', FOCUS)}>{Math.round(zoom * 100)}%</button>
            <button type="button" onClick={() => zoomBy(ZOOM_STEP)} disabled={zoom >= ZOOM_MAX} aria-label="Zoom in" className={cn('grid size-9 place-items-center rounded-[10px] hover:bg-foreground/10 disabled:pointer-events-none disabled:opacity-30', FOCUS)}><Plus size={14} /></button>
          </span>
        )}
        {/* Each with its word, as on the phone: Info and a tray with an arrow
            are not glyphs everybody reads. */}
        {/* Marked as a download, or the desktop app sends it to the browser. */}
        {saveHref && <a href={saveHref} className={cn(HEADER_ACTION, FOCUS)}><Download size={16} aria-hidden />Save</a>}
        <HeaderAction onClick={() => setShowInfo((value) => !value)} pressed={showInfo}><Info size={16} aria-hidden />Info</HeaderAction>
        {file.capabilities.delete && onDelete && <HeaderAction onClick={() => onDelete(file)} danger><Trash2 size={16} aria-hidden />Remove</HeaderAction>}
      </header>

      {/* The picture and Info side by side, so the picture makes room for the
          panel. On a window too narrow for both, the panel lies over it. */}
      <div className="relative flex min-h-0 flex-1">
        <main className="relative min-h-0 min-w-0 flex-1">
          {!file.url ? <div className="grid h-full place-items-center px-6 text-center text-sm text-muted-foreground">This media URL has expired. Close the viewer and reload the album.</div> : kind === 'image' ? (
            <div ref={stageRef} className={`relative h-full select-none overflow-hidden ${zoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'}`} onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={() => { drag.current = null; setDragging(false); }} onPointerCancel={() => { drag.current = null; setDragging(false); }} onDoubleClick={() => zoom > 1 ? resetTransform() : zoomBy(1)} onClick={() => zoom === 1 && setChrome((value) => !value)}>
              {/* Display copies when there are any, the original when there are
                  not, and the original as well once zoomed far enough to need
                  it — see zoomedSources. */}
              {/* The preview sits behind the image rather than in front of it:
                  it is 20px upscaled, so it only has to fill the frame until
                  the real one paints over it. No extra request — the string
                  arrived with the listing. */}
              {/* Pinned to the stage and centred in it, at most the picture's
                  own size: the frame is set before anything loads, so the
                  preview fills the same box the photograph will. It used to be
                  a grid item, and an auto grid row grows to its item — so
                  h-full measured the image against itself. See fittedSize. */}
              {/* Narrower than the stage by the arrows' width on each side,
                  so at 100% no photograph sits under them; zoomed, it grows
                  over that margin to the stage's own edge. */}
              <img ref={imageRef} key={`${file.key}:${copiesFailed}`} src={imageSrc} onLoad={() => setLoadedKey(file.key)} onError={() => (copiesFailed || !file.displaySources.length ? setFailedKey(file.key) : setCopiesFailedKey(file.key))} srcSet={sources.srcSet} sizes={sources.sizes} alt={file.originalName} draggable={false} className="absolute inset-0 m-auto h-[calc(100%-1rem)] w-full rounded-[4px] object-contain will-change-transform sm:w-[calc(100%-9.5rem)]" style={{ ...(file.width && file.height ? { maxWidth: file.width, maxHeight: file.height } : {}), transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom})`, transition: dragging ? 'none' : 'transform 360ms cubic-bezier(0.16,1,0.3,1)', backgroundImage: file.blurDataUrl && !loaded ? `url("${file.blurDataUrl}")` : undefined, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }} />
              {failedKey === file.key && <p className="absolute inset-x-0 top-1/2 px-6 text-center text-sm text-muted-foreground">This photo could not be loaded. Try the download button for the original.</p>}
            </div>
          ) : kind === 'video' ? <VideoPlayer file={file} /> : <div className="grid h-full place-items-center px-6 text-center text-sm text-muted-foreground">Open audio from the album track list to use the listening queue.</div>}

          {files.length > 1 && zoom === 1 && <><button type="button" onClick={() => step(-1)} aria-label="Previous photo" className={cn('absolute left-4 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-foreground/10 backdrop-blur-md hover:bg-foreground/20', FOCUS, motion, chrome ? 'opacity-100' : 'pointer-events-none opacity-0')}><ChevronLeft size={20} /></button><button type="button" onClick={() => step(1)} aria-label="Next photo" className={cn('absolute right-4 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-foreground/10 backdrop-blur-md hover:bg-foreground/20', FOCUS, motion, chrome ? 'opacity-100' : 'pointer-events-none opacity-0')}><ChevronRight size={20} /></button></>}
        </main>

        {showInfo && (
          <aside aria-label="Info" className="absolute inset-y-0 right-0 z-20 flex w-[min(21.25rem,100%)] shrink-0 flex-col gap-4 overflow-y-auto border-l border-border bg-card p-5 md:static">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">Info</h2>
              <button type="button" onClick={() => setShowInfo(false)} aria-label="Close Info" className={cn('grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-foreground/10 hover:text-foreground', FOCUS)}><X size={16} /></button>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="break-words text-[15px] font-semibold">{file.originalName}</span>
              {album?.name && <span className="text-[13px] text-muted-foreground">{album.name}{workspace?.name ? ` · ${workspace.name}` : ''}</span>}
            </div>
            <dl className="flex flex-col">
              {/* When it was taken, from the camera, beside when it arrived. */}
              {file.takenAt && <InfoRow label="Taken" first>{takenLabel(file.takenAt)}</InfoRow>}
              <InfoRow label="Uploaded" first={!file.takenAt}>{uploadedLabel(file.createdAt)}</InfoRow>
              <InfoRow label="Size">{formatBytes(file.sizeBytes)}</InfoRow>
              <InfoRow label="Dimensions">{file.width && file.height ? `${file.width} × ${file.height}` : 'Not available'}</InfoRow>
              <InfoRow label="Type">{typeLabel(file)}</InfoRow>
            </dl>
          </aside>
        )}
      </div>

      {kind === 'image' && files.length > 1 && <Strip files={files} currentKey={file.key} onChoose={choose} className={cn(motion, fade, !chrome && 'translate-y-3')} />}
    </div>
  );
}

const HEADER_ACTION = 'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] pl-2.5 pr-3 text-[13px] font-semibold hover:bg-foreground/10';

/** A button in the viewer's bar, with its word beside its glyph. */
function HeaderAction({ onClick, pressed, danger = false, children }: { onClick: () => void; pressed?: boolean; danger?: boolean; children: ReactNode }) {
  return <button type="button" onClick={onClick} aria-pressed={pressed} className={cn(HEADER_ACTION, FOCUS, pressed && 'bg-foreground/[0.14]', danger && 'hover:bg-destructive/20 hover:text-destructive')}>{children}</button>;
}

function InfoRow({ label, first = false, children }: { label: string; first?: boolean; children: ReactNode }) {
  return (
    <div className={cn('flex min-h-11 items-center justify-between gap-3', !first && 'border-t border-border')}>
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className="text-right text-[13px] font-semibold">{children}</dd>
    </div>
  );
}

/**
 * Every photograph in the set, in one strip that scrolls, with the one on
 * screen larger, ringed and kept in the middle.
 *
 * It was a window of nine cut from the list around the current one, so the
 * strip jumped at every step and could not be scrolled to see what was ahead.
 *
 * Memoised: panning a zoomed photograph redraws the viewer at every pointer
 * move, and an album's worth of thumbnails has no part in that.
 */
const Strip = memo(function Strip({ files, currentKey, onChoose, className }: { files: StoredFile[]; currentKey: string; onChoose: (index: number) => void; className?: string }) {
  const stripRef = useRef<HTMLDivElement>(null);
  const settled = useRef(false);

  // Before paint, so the strip never shows scrolled to the wrong place; it
  // glides only after the first time, and not for somebody who has asked for
  // less motion.
  useLayoutEffect(() => {
    const strip = stripRef.current;
    const thumb = strip?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!strip || !thumb) return;
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    strip.scrollTo({
      left: thumb.offsetLeft - (strip.clientWidth - thumb.offsetWidth) / 2,
      behavior: settled.current && !calm ? 'smooth' : 'instant',
    });
    settled.current = true;
  }, [currentKey, files.length]);

  return (
    <div
      ref={stripRef}
      aria-label="Every photo in the album"
      // A wheel turns down the page; over a strip that only runs sideways, it
      // runs the strip.
      onWheel={(event) => {
        if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) event.currentTarget.scrollLeft += event.deltaY;
      }}
      className={cn('no-scrollbar relative z-20 flex min-h-[84px] shrink-0 items-center gap-1 overflow-x-auto', className)}
    >
      {/* Half the strip of nothing at either end, so the first photograph and
          the last can sit in the middle like any other. */}
      <span aria-hidden className="w-1/2 shrink-0" />
      {files.map((item, index) => {
        const current = item.key === currentKey;
        const picture = item.thumbnailUrl ?? item.url;
        return (
          <button key={item.key} type="button" onClick={() => onChoose(index)} aria-label={`View ${item.originalName}`} aria-current={current ? 'true' : undefined} className={cn('shrink-0 overflow-hidden rounded-md transition-[opacity,transform] active:scale-95', FOCUS, current ? 'size-[60px] ring-2 ring-foreground' : 'size-11 opacity-60 hover:opacity-100')}>
            {/* A film here is its poster or the video icon: its url is the film itself, which an img cannot draw. */}
            {kindOf(item.contentType) === 'video' ? <img src={item.posterUrl ?? VIDEO_THUMBNAIL} alt="" loading="lazy" className={item.posterUrl ? 'size-full object-cover' : 'size-full bg-card object-contain p-1.5'} /> : picture ? <img src={picture} alt="" loading="lazy" className="size-full object-cover" /> : <span className="block size-full bg-muted" />}
          </button>
        );
      })}
      <span aria-hidden className="w-1/2 shrink-0" />
    </div>
  );
});
