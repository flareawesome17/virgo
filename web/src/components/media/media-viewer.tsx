'use client';
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react';
import { ArrowLeft, ArrowRight, Download, Info, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { displaySrcSet, formatBytes, kindOf, largestDisplaySource, originalForDetail, type StoredFile } from '@/api';
import { VideoPlayer } from '@/components/media/video-player';
import { downloadHref } from '@/lib/desktop';

const motion = 'transition-[transform,opacity,background-color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]';

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

/**
 * "14 March 2026, 4:12 pm", as the camera wrote it.
 *
 * Built from its parts rather than parsed: it carries no zone, and parsing
 * would move a frame shot late at night onto another day for anyone outside
 * the zone it was taken in. The same helper as the phone's viewer.
 */
function takenLabel(takenAt: string): string {
  const [date, time = '00:00:00'] = takenAt.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** When it reached Virgo — a real instant, so this one is parsed. */
function uploadedLabel(createdAt: string): string {
  return new Date(createdAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
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
  // Which picture has painted, and which has had its display copies fail. A
  // copy that will not load falls back to the original rather than leaving the
  // 20px preview up, magnified, as if it were the photograph.
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [copiesFailedKey, setCopiesFailedKey] = useState<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const file = files[index];
  const kind = file ? kindOf(file.contentType) : 'other';

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
  const choose = useCallback((nextIndex: number) => {
    resetTransform();
    setShowInfo(false);
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
    const box = stageRef.current?.getBoundingClientRect();
    const picture = box ? fittedSize(file, box) : null;
    const limitX = box && picture ? Math.max(0, (picture.width * zoom - box.width) / 2) : Infinity;
    const limitY = box && picture ? Math.max(0, (picture.height * zoom - box.height) / 2) : Infinity;
    setOffset({
      x: Math.max(-limitX, Math.min(limitX, drag.current.ox + event.clientX - drag.current.x)),
      y: Math.max(-limitY, Math.min(limitY, drag.current.oy + event.clientY - drag.current.y)),
    });
  };

  return (
    <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={file.originalName} className="fixed inset-0 z-50 flex min-h-[100dvh] flex-col overflow-hidden bg-[#141210] text-white outline-none" onPointerMove={() => setChrome(true)}>
      <header className={`relative z-20 flex items-center gap-3 px-4 py-3 ${motion} ${chrome ? 'translate-y-0 opacity-100' : '-translate-y-3 opacity-0'}`}>
        <button onClick={onClose} aria-label="Close viewer" className="grid size-10 place-items-center rounded-full bg-white/[0.08] text-white/80 hover:bg-white/[0.14] hover:text-white"><X size={19} strokeWidth={1.5} /></button>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold tracking-[-0.015em]">{file.originalName}</p><p className="mt-0.5 font-mono text-[10px] tabular-nums text-white/40">{index + 1} / {files.length} · {formatBytes(file.sizeBytes)}</p></div>
        {kind === 'image' && <div className="hidden items-center gap-1 sm:flex"><ViewerButton label="Zoom out" disabled={zoom <= ZOOM_MIN} onClick={() => zoomBy(-ZOOM_STEP)}><ZoomOut size={18} strokeWidth={1.5} /></ViewerButton><button onClick={resetTransform} aria-label="Reset zoom to fit" title="Reset zoom (0)" className="min-w-14 rounded-full px-3 py-2 font-mono text-[10px] tabular-nums text-white/60 hover:bg-white/[0.08]">{Math.round(zoom * 100)}%</button><ViewerButton label="Zoom in" disabled={zoom >= ZOOM_MAX} onClick={() => zoomBy(ZOOM_STEP)}><ZoomIn size={18} strokeWidth={1.5} /></ViewerButton></div>}
        <ViewerButton label="File information" onClick={() => setShowInfo((value) => !value)}><Info size={18} strokeWidth={1.5} /></ViewerButton>
        {/* Marked as a download, or the desktop app sends it to the browser. */}
        {file.capabilities.download && file.downloadUrl && <a href={downloadHref(file.downloadUrl)} aria-label="Download original" className="grid size-10 place-items-center rounded-full text-white/65 hover:bg-white/[0.08] hover:text-white"><Download size={18} strokeWidth={1.5} /></a>}
        {file.capabilities.delete && onDelete && <ViewerButton label="Delete file" onClick={() => onDelete(file)} danger><Trash2 size={18} strokeWidth={1.5} /></ViewerButton>}
      </header>

      <main className="relative min-h-0 flex-1">
        {!file.url ? <div className="grid h-full place-items-center px-6 text-center text-sm text-white/55">This media URL has expired. Close the viewer and reload the album.</div> : kind === 'image' ? (
          <div ref={stageRef} className={`relative h-full select-none overflow-hidden ${zoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'}`} onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={() => { drag.current = null; setDragging(false); }} onPointerCancel={() => { drag.current = null; setDragging(false); }} onDoubleClick={() => zoom > 1 ? resetTransform() : zoomBy(1)} onClick={() => zoom === 1 && setChrome((value) => !value)}>
            { }
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
            <img key={`${file.key}:${copiesFailed}`} src={imageSrc} onLoad={() => setLoadedKey(file.key)} onError={() => (copiesFailed || !file.displaySources.length ? setFailedKey(file.key) : setCopiesFailedKey(file.key))} srcSet={sources.srcSet} sizes={sources.sizes} alt={file.originalName} draggable={false} className="absolute inset-0 m-auto size-full object-contain will-change-transform" style={{ ...(file.width && file.height ? { maxWidth: file.width, maxHeight: file.height } : {}), transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom})`, transition: dragging ? 'none' : 'transform 360ms cubic-bezier(0.16,1,0.3,1)', backgroundImage: file.blurDataUrl && !loaded ? `url("${file.blurDataUrl}")` : undefined, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }} />
            {failedKey === file.key && <p className="absolute inset-x-0 top-1/2 px-6 text-center text-sm text-white/60">This photo could not be loaded. Try the download button for the original.</p>}
          </div>
        ) : kind === 'video' ? <VideoPlayer file={file} /> : <div className="grid h-full place-items-center px-6 text-center text-sm text-white/55">Open audio from the album track list to use the listening queue.</div>}

        {files.length > 1 && zoom === 1 && <><button onClick={() => step(-1)} aria-label="Previous item" className={`absolute left-4 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-[#211d1a]/88 text-white/75 backdrop-blur-md hover:text-white ${motion} ${chrome ? 'opacity-100' : 'opacity-0'}`}><ArrowLeft size={19} strokeWidth={1.5} /></button><button onClick={() => step(1)} aria-label="Next item" className={`absolute right-4 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-[#211d1a]/88 text-white/75 backdrop-blur-md hover:text-white ${motion} ${chrome ? 'opacity-100' : 'opacity-0'}`}><ArrowRight size={19} strokeWidth={1.5} /></button></>}

        {showInfo && <aside className="absolute bottom-20 right-4 z-20 w-[min(22rem,calc(100%-2rem))] rounded-[1.5rem] bg-[#211d1a]/96 p-1.5 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.7)] backdrop-blur-xl"><div className="rounded-[1.15rem] border border-white/[0.08] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/40">File information</p><dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-5 gap-y-3 text-sm"><dt className="text-white/40">Name</dt><dd className="truncate text-right">{file.originalName}</dd>{/* When it was taken, from the camera, beside when it arrived. The panel had neither, and the grid's day headings were the only clue. */}{file.takenAt && <><dt className="text-white/40">Taken</dt><dd className="text-right">{takenLabel(file.takenAt)}</dd></>}<dt className="text-white/40">Uploaded</dt><dd className="text-right">{uploadedLabel(file.createdAt)}</dd><dt className="text-white/40">Type</dt><dd className="text-right">{file.contentType ?? 'Unknown'}</dd><dt className="text-white/40">Size</dt><dd className="text-right">{formatBytes(file.sizeBytes)}</dd><dt className="text-white/40">Dimensions</dt><dd className="text-right">{file.width && file.height ? `${file.width} × ${file.height}` : 'Not available'}</dd></dl></div></aside>}
      </main>

      {kind === 'image' && files.length > 1 && <footer className={`relative z-20 flex h-16 items-center justify-center gap-2 px-4 ${motion} ${chrome ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}>{files.slice(Math.max(0, index - 4), index + 5).map((item) => <button key={item.key} onClick={() => choose(files.indexOf(item))} aria-label={`View ${item.originalName}`} className={`h-10 w-10 overflow-hidden rounded-lg transition-transform active:scale-95 ${item.key === file.key ? 'ring-2 ring-[#c17745] ring-offset-2 ring-offset-[#141210]' : 'opacity-45 hover:opacity-80'}`}>{ }<img src={item.thumbnailUrl ?? item.url ?? ''} alt={item.originalName} className="size-full object-cover" /></button>)}</footer>}
    </div>
  );
}

function ViewerButton({ label, onClick, children, danger = false, disabled = false }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean; disabled?: boolean }) {
  return <button onClick={onClick} disabled={disabled} aria-label={label} className={`grid size-10 place-items-center rounded-full disabled:pointer-events-none disabled:opacity-30 ${danger ? 'text-white/55 hover:bg-[#9e433c]/20 hover:text-[#efa79e]' : 'text-white/65 hover:bg-white/[0.08] hover:text-white'}`}>{children}</button>;
}

