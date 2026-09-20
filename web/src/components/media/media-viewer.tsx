'use client';
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react';
import { ArrowLeft, ArrowRight, ArrowsOut, DownloadSimple, Info, MagnifyingGlassMinus, MagnifyingGlassPlus, Pause, PictureInPicture, Play, SpeakerHigh, SpeakerSlash, Trash, X } from '@phosphor-icons/react';
import { displaySrcSet, formatBytes, kindOf, largestDisplaySource, type StoredFile } from '@/api';

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

function VideoPlayer({ file }: { file: StoredFile }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [playing, setPlaying] = useState(true);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(file.durationMs ? file.durationMs / 1000 : 0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.9);
  const [rate, setRate] = useState(1);
  const [controls, setControls] = useState(true);
  const [failed, setFailed] = useState(false);
  const [libraryFailed, setLibraryFailed] = useState(false);

  /**
   * Who drives an HLS ladder here.
   *
   * Safari and iOS play it from a plain <source>; everywhere else it is
   * hls.js over Media Source Extensions, and while the library is driving,
   * the element must have NO <source> of its own or the browser races the
   * two. If the library cannot attach — an old engine, a blocked import —
   * `libraryFailed` puts the proxy sources back.
   *
   * useMemo over an effect so there is no first paint with the wrong source:
   * this viewer only ever mounts on a click, so `document` is always there.
   */
  const hlsNative = useMemo(
    () =>
      typeof document !== 'undefined' &&
      !!document.createElement('video').canPlayType('application/vnd.apple.mpegurl'),
    [],
  );
  const hlsViaLibrary = !!file.hlsUrl && !hlsNative && !libraryFailed;

  const showControls = useCallback(() => {
    setControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (playing) hideTimer.current = setTimeout(() => setControls(false), 2500);
  }, [playing]);

  useEffect(() => {
    const mountedVideo = videoRef.current;
    const handle = (event: KeyboardEvent) => {
      const video = videoRef.current;
      if (!video) return;
      if (event.key === ' ' || event.key.toLowerCase() === 'k') { event.preventDefault(); if (video.paused) void video.play(); else video.pause(); }
      else if (event.key === 'ArrowLeft') video.currentTime -= 5;
      else if (event.key === 'ArrowRight') video.currentTime += 5;
      else if (event.key.toLowerCase() === 'm') setMuted((value) => !value);
      else if (event.key.toLowerCase() === 'f') frameRef.current?.requestFullscreen();
    };
    window.addEventListener('keydown', handle);
    return () => { window.removeEventListener('keydown', handle); if (hideTimer.current) clearTimeout(hideTimer.current); mountedVideo?.pause(); };
  }, []);
  useEffect(() => { const video = videoRef.current; if (video) { video.muted = muted; video.volume = volume; video.playbackRate = rate; } }, [muted, rate, volume]);

  /**
   * Attaches the adaptive ladder, when there is one and the browser needs help.
   *
   * Safari and iOS play HLS natively and are left alone — hls.js on top of a
   * native implementation is strictly worse. Everywhere else it is Media
   * Source Extensions or nothing, which is what the library is for.
   *
   * Imported dynamically so the bundle only pays for it when a film that has
   * a ladder is actually opened. Loading is async, so the effect has to cope
   * with unmounting mid-import and with `file` changing underneath it.
   */
  useEffect(() => {
    const video = videoRef.current;
    const source = file.hlsUrl;
    if (!video || !source || !hlsViaLibrary) return;

    let cancelled = false;
    let instance: { destroy: () => void } | null = null;

    void import('hls.js')
      .then(({ default: Hls }) => {
        if (cancelled) return;
        if (!Hls.isSupported()) {
          setLibraryFailed(true);
          return;
        }
        const hls = new Hls({ enableWorker: true });
        instance = hls;
        hls.loadSource(source);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_event, data) => {
          // Only fatal errors matter: hls.js recovers from most things by
          // itself, and treating a recoverable network blip as failure would
          // drop the viewer out of a film that was about to carry on. A fatal
          // one falls back to the proxy rather than to the error screen —
          // there is still a copy that plays.
          if (data.fatal) setLibraryFailed(true);
        });
        void video.play().catch(() => undefined);
      })
      .catch(() => {
        // The chunk did not load at all. Same outcome: use the proxy.
        if (!cancelled) setLibraryFailed(true);
      });

    return () => {
      cancelled = true;
      instance?.destroy();
    };
  }, [file.hlsUrl, file.key, hlsViaLibrary]);

  // A different film gets a fresh decision: the previous one's library
  // failure says nothing about this one.
  useEffect(() => setLibraryFailed(false), [file.key]);

  const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

  if (failed) return <div className="grid h-full place-items-center px-6 text-center"><div><p className="text-lg font-semibold">This video cannot play in this browser</p><p className="mt-2 max-w-md text-sm text-white/45">The original codec may only be supported on the device that recorded it.</p>{file.capabilities.download && file.downloadUrl && <a href={file.downloadUrl} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#c17745] px-5 text-sm font-semibold"><DownloadSimple size={17} weight="light" />Download original</a>}</div></div>;

  return <div ref={frameRef} className="relative grid h-full place-items-center bg-[#141210]" onMouseMove={showControls} onClick={showControls}>
    {/* The proxy when there is one, the original when there is not. The proxy is
        H.264/AAC with the moov atom at the front and served from the media host,
        so it both plays where the original cannot and starts without fetching
        the end of the file first. */}
    <video ref={videoRef} key={file.key} autoPlay playsInline poster={file.posterUrl ?? undefined} className="max-h-full max-w-full" onPlay={() => { setPlaying(true); showControls(); }} onPause={() => { setPlaying(false); setControls(true); }} onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)} onDurationChange={(event) => setDuration(event.currentTarget.duration || duration)} onError={() => setFailed(true)}>{hlsNative ? <source src={file.hlsUrl!} type="application/vnd.apple.mpegurl" /> : hlsViaLibrary ? null : file.proxyUrl ? <source src={file.proxyUrl} type="video/mp4" /> : <><source src={file.url ?? ''} type={file.contentType ?? 'video/mp4'} />{file.contentType === 'video/quicktime' && <source src={file.url ?? ''} type="video/mp4" />}</>}</video>
    <div className={`absolute inset-x-4 bottom-4 mx-auto max-w-4xl rounded-[1.35rem] bg-[#211d1a]/92 p-1.5 backdrop-blur-xl ${motion} ${controls ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}><div className="rounded-[1rem] border border-white/[0.08] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"><input type="range" min={0} max={Math.max(duration, 0)} step={0.1} value={Math.min(time, duration || 0)} onChange={(event) => { const next = Number(event.target.value); if (videoRef.current) videoRef.current.currentTime = next; setTime(next); }} aria-label="Video position" className="media-range w-full" /><div className="mt-2 flex items-center gap-2"><button onClick={() => videoRef.current?.paused ? videoRef.current.play() : videoRef.current?.pause()} aria-label={playing ? 'Pause' : 'Play'} className="grid size-9 place-items-center rounded-full bg-white text-[#211d1a]">{playing ? <Pause size={16} weight="fill" /> : <Play size={16} weight="fill" />}</button><button onClick={() => setMuted((value) => !value)} aria-label={muted ? 'Unmute' : 'Mute'} className="grid size-9 place-items-center text-white/65">{muted ? <SpeakerSlash size={18} weight="light" /> : <SpeakerHigh size={18} weight="light" />}</button><input type="range" min={0} max={1} step={0.01} value={volume} onChange={(event) => setVolume(Number(event.target.value))} aria-label="Volume" className="media-range hidden w-20 sm:block" /><span className="font-mono text-[10px] tabular-nums text-white/45">{clock(time)} / {clock(duration)}</span><span className="flex-1" /><select value={rate} onChange={(event) => setRate(Number(event.target.value))} aria-label="Playback speed" className="rounded-full bg-white/[0.07] px-2 py-1 text-xs text-white outline-none">{[0.5, 1, 1.25, 1.5, 2].map((value) => <option key={value} value={value} className="bg-[#211d1a]">{value}×</option>)}</select>{'pictureInPictureEnabled' in document && <button onClick={() => { const video = videoRef.current as HTMLVideoElement & { requestPictureInPicture?: () => Promise<unknown> }; video.requestPictureInPicture?.(); }} aria-label="Picture in picture" className="grid size-9 place-items-center text-white/65"><PictureInPicture size={18} weight="light" /></button>}<button onClick={() => frameRef.current?.requestFullscreen()} aria-label="Fullscreen" className="grid size-9 place-items-center text-white/65"><ArrowsOut size={18} weight="light" /></button></div></div></div>
  </div>;
}
