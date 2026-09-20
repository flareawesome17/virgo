'use client';
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react';
import { ArrowLeft, ArrowRight, DownloadSimple, Info, MagnifyingGlassMinus, MagnifyingGlassPlus, Trash, X } from '@phosphor-icons/react';
import { displaySrcSet, formatBytes, kindOf, largestDisplaySource, type StoredFile } from '@/api';
import { VideoPlayer } from '@/components/media/video-player';

const motion = 'transition-[transform,opacity,background-color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]';

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
  const file = files[index];
  const kind = file ? kindOf(file.contentType) : 'other';

  const resetTransform = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
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
      if (kind === 'image' && (event.key === '+' || event.key === '=')) setZoom((value) => Math.min(4, value + 0.25));
      if (kind === 'image' && event.key === '-') setZoom((value) => Math.max(1, value - 0.25));
      if (kind === 'image' && event.key === '0') resetTransform();
    };
    window.addEventListener('keydown', handle);
    return () => {
      window.removeEventListener('keydown', handle);
      document.body.style.overflow = previous;
    };
  }, [kind, onClose, resetTransform, step]);

  useEffect(() => {
    for (const near of [files[index - 1], files[index + 1]]) {
      if (!near || kindOf(near.contentType) !== 'image') continue;
      // A display copy if there is one. Preloading `url` here meant fetching
      // both neighbouring ORIGINALS on every step through an album — two
      // camera files nobody had asked to see yet.
      const source = largestDisplaySource(near) ?? near.url;
      if (!source) continue;
      const image = new Image();
      image.src = source;
    }
  }, [files, index]);

  if (!file) return null;
  const onWheel = (event: WheelEvent) => {
    if (kind !== 'image') return;
    event.preventDefault();
    setZoom((value) => Math.max(1, Math.min(4, value + (event.deltaY < 0 ? 0.25 : -0.25))));
  };
  const onPointerDown = (event: ReactPointerEvent) => {
    if (zoom <= 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
    setDragging(true);
  };
  const onPointerMove = (event: ReactPointerEvent) => {
    if (!drag.current) return;
    setOffset({ x: drag.current.ox + event.clientX - drag.current.x, y: drag.current.oy + event.clientY - drag.current.y });
  };

  return (
    <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={file.originalName} className="fixed inset-0 z-50 flex min-h-[100dvh] flex-col overflow-hidden bg-[#141210] text-white outline-none" onPointerMove={() => setChrome(true)}>
      <header className={`relative z-20 flex items-center gap-3 px-4 py-3 ${motion} ${chrome ? 'translate-y-0 opacity-100' : '-translate-y-3 opacity-0'}`}>
        <button onClick={onClose} aria-label="Close viewer" className="grid size-10 place-items-center rounded-full bg-white/[0.08] text-white/80 hover:bg-white/[0.14] hover:text-white"><X size={19} weight="light" /></button>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold tracking-[-0.015em]">{file.originalName}</p><p className="mt-0.5 font-mono text-[10px] tabular-nums text-white/40">{index + 1} / {files.length} · {formatBytes(file.sizeBytes)}</p></div>
        {kind === 'image' && <div className="hidden items-center gap-1 sm:flex"><ViewerButton label="Zoom out" onClick={() => setZoom((value) => Math.max(1, value - 0.25))}><MagnifyingGlassMinus size={18} weight="light" /></ViewerButton><button onClick={resetTransform} className="min-w-14 rounded-full px-3 py-2 font-mono text-[10px] tabular-nums text-white/60 hover:bg-white/[0.08]">{Math.round(zoom * 100)}%</button><ViewerButton label="Zoom in" onClick={() => setZoom((value) => Math.min(4, value + 0.25))}><MagnifyingGlassPlus size={18} weight="light" /></ViewerButton></div>}
        <ViewerButton label="File information" onClick={() => setShowInfo((value) => !value)}><Info size={18} weight="light" /></ViewerButton>
        {file.capabilities.download && file.downloadUrl && <a href={file.downloadUrl} aria-label="Download original" className="grid size-10 place-items-center rounded-full text-white/65 hover:bg-white/[0.08] hover:text-white"><DownloadSimple size={18} weight="light" /></a>}
        {file.capabilities.delete && onDelete && <ViewerButton label="Delete file" onClick={() => onDelete(file)} danger><Trash size={18} weight="light" /></ViewerButton>}
      </header>

      <main className="relative min-h-0 flex-1">
        {!file.url ? <div className="grid h-full place-items-center px-6 text-center text-sm text-white/55">This media URL has expired. Close the viewer and reload the album.</div> : kind === 'image' ? (
          <div className={`grid h-full select-none place-items-center overflow-hidden ${zoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'}`} onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={() => { drag.current = null; setDragging(false); }} onPointerCancel={() => { drag.current = null; setDragging(false); }} onDoubleClick={() => zoom > 1 ? resetTransform() : setZoom(2)} onClick={() => zoom === 1 && setChrome((value) => !value)}>
            { }
            {/* Display copies when there are any, the original when there are
                not. `sizes` is 100vw because this is a full-screen viewer —
                but only up to zoom 1; past that the browser is scaling what it
                already has, which is the trade for not refetching on a pinch. */}
            {/* The preview sits behind the image rather than in front of it:
                it is 20px upscaled, so it only has to fill the frame until
                the real one paints over it. No extra request — the string
                arrived with the listing. */}
            <img src={largestDisplaySource(file) ?? file.url} srcSet={displaySrcSet(file) ?? undefined} sizes={displaySrcSet(file) ? '100vw' : undefined} alt={file.originalName} draggable={false} className="max-h-full max-w-full object-contain will-change-transform" style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom})`, transition: dragging ? 'none' : 'transform 360ms cubic-bezier(0.16,1,0.3,1)', backgroundImage: file.blurDataUrl ? `url("${file.blurDataUrl}")` : undefined, backgroundSize: 'cover', backgroundPosition: 'center' }} />
          </div>
        ) : kind === 'video' ? <VideoPlayer file={file} /> : <div className="grid h-full place-items-center px-6 text-center text-sm text-white/55">Open audio from the album track list to use the listening queue.</div>}

        {files.length > 1 && zoom === 1 && <><button onClick={() => step(-1)} aria-label="Previous item" className={`absolute left-4 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-[#211d1a]/88 text-white/75 backdrop-blur-md hover:text-white ${motion} ${chrome ? 'opacity-100' : 'opacity-0'}`}><ArrowLeft size={19} weight="light" /></button><button onClick={() => step(1)} aria-label="Next item" className={`absolute right-4 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-[#211d1a]/88 text-white/75 backdrop-blur-md hover:text-white ${motion} ${chrome ? 'opacity-100' : 'opacity-0'}`}><ArrowRight size={19} weight="light" /></button></>}

        {showInfo && <aside className="absolute bottom-20 right-4 z-20 w-[min(22rem,calc(100%-2rem))] rounded-[1.5rem] bg-[#211d1a]/96 p-1.5 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.7)] backdrop-blur-xl"><div className="rounded-[1.15rem] border border-white/[0.08] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/40">File information</p><dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-5 gap-y-3 text-sm"><dt className="text-white/40">Name</dt><dd className="truncate text-right">{file.originalName}</dd><dt className="text-white/40">Type</dt><dd className="text-right">{file.contentType ?? 'Unknown'}</dd><dt className="text-white/40">Size</dt><dd className="text-right">{formatBytes(file.sizeBytes)}</dd><dt className="text-white/40">Dimensions</dt><dd className="text-right">{file.width && file.height ? `${file.width} × ${file.height}` : 'Not available'}</dd></dl></div></aside>}
      </main>

      {kind === 'image' && files.length > 1 && <footer className={`relative z-20 flex h-16 items-center justify-center gap-2 px-4 ${motion} ${chrome ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}>{files.slice(Math.max(0, index - 4), index + 5).map((item) => <button key={item.key} onClick={() => choose(files.indexOf(item))} aria-label={`View ${item.originalName}`} className={`h-10 w-10 overflow-hidden rounded-lg transition-transform active:scale-95 ${item.key === file.key ? 'ring-2 ring-[#c17745] ring-offset-2 ring-offset-[#141210]' : 'opacity-45 hover:opacity-80'}`}>{ }<img src={item.thumbnailUrl ?? item.url ?? ''} alt={item.originalName} className="size-full object-cover" /></button>)}</footer>}
    </div>
  );
}

function ViewerButton({ label, onClick, children, danger = false }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return <button onClick={onClick} aria-label={label} className={`grid size-10 place-items-center rounded-full ${danger ? 'text-white/55 hover:bg-[#9e433c]/20 hover:text-[#efa79e]' : 'text-white/65 hover:bg-white/[0.08] hover:text-white'}`}>{children}</button>;
}

