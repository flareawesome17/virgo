'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowsOut,
  DownloadSimple,
  Pause,
  PictureInPicture,
  Play,
  SpeakerHigh,
  SpeakerSlash,
} from '@phosphor-icons/react';
import { type StoredFile } from '@/api';

const motion =
  'transition-[transform,opacity,background-color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]';

/**
 * The film player.
 *
 * Lifted out of media-viewer.tsx unchanged. It used to be defined inside that
 * lightbox, which tied a playing film to the lightbox being open — closing it
 * stopped playback, and there was no way to keep watching while doing anything
 * else. It is a component of its own now so VideoSurface can keep it alive
 * above the app.
 *
 * Everything below is as it was: who drives the HLS ladder, the fallback to
 * the proxy, the codec failure message.
 */

export function VideoPlayer({
  file,
  compact = false,
}: {
  file: StoredFile;
  /**
   * Docked in the corner rather than filling the window.
   *
   * The full control bar does not fit a card this size and would be a row of
   * targets too small to hit, so it is left out — VideoSurface supplies the
   * two controls that matter there, and everything else is one tap away in
   * the full player.
   */
  compact?: boolean;
}) {
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
  //
  // Adjusted during render rather than from an effect. Resetting in an effect
  // renders the new film once carrying the old film's verdict and corrects it
  // afterwards — a frame of the wrong player, which is what
  // react-hooks/set-state-in-effect is pointing at. The error predates this
  // move; it was never noticed because CI type-checks web without linting it.
  const [lastKey, setLastKey] = useState(file.key);
  if (lastKey !== file.key) {
    setLastKey(file.key);
    setLibraryFailed(false);
  }

  const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

  if (failed) return <div className="grid h-full place-items-center px-6 text-center"><div><p className="text-lg font-semibold">This video cannot play in this browser</p><p className="mt-2 max-w-md text-sm text-white/45">The original codec may only be supported on the device that recorded it.</p>{file.capabilities.download && file.downloadUrl && <a href={file.downloadUrl} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#c17745] px-5 text-sm font-semibold"><DownloadSimple size={17} weight="light" />Download original</a>}</div></div>;

  return <div ref={frameRef} className="relative grid h-full place-items-center bg-[#141210]" onMouseMove={showControls} onClick={showControls}>
    {/* The proxy when there is one, the original when there is not. The proxy is
        H.264/AAC with the moov atom at the front and served from the media host,
        so it both plays where the original cannot and starts without fetching
        the end of the file first. */}
    <video ref={videoRef} key={file.key} autoPlay playsInline poster={file.posterUrl ?? undefined} className="max-h-full max-w-full" onPlay={() => { setPlaying(true); showControls(); }} onPause={() => { setPlaying(false); setControls(true); }} onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)} onDurationChange={(event) => setDuration(event.currentTarget.duration || duration)} onError={() => setFailed(true)}>{hlsNative ? <source src={file.hlsUrl!} type="application/vnd.apple.mpegurl" /> : hlsViaLibrary ? null : file.proxyUrl ? <source src={file.proxyUrl} type="video/mp4" /> : <><source src={file.url ?? ''} type={file.contentType ?? 'video/mp4'} />{file.contentType === 'video/quicktime' && <source src={file.url ?? ''} type="video/mp4" />}</>}</video>
    {!compact && <div className={`absolute inset-x-4 bottom-4 mx-auto max-w-4xl rounded-[1.35rem] bg-[#211d1a]/92 p-1.5 backdrop-blur-xl ${motion} ${controls ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}><div className="rounded-[1rem] border border-white/[0.08] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"><input type="range" min={0} max={Math.max(duration, 0)} step={0.1} value={Math.min(time, duration || 0)} onChange={(event) => { const next = Number(event.target.value); if (videoRef.current) videoRef.current.currentTime = next; setTime(next); }} aria-label="Video position" className="media-range w-full" /><div className="mt-2 flex items-center gap-2"><button onClick={() => videoRef.current?.paused ? videoRef.current.play() : videoRef.current?.pause()} aria-label={playing ? 'Pause' : 'Play'} className="grid size-9 place-items-center rounded-full bg-white text-[#211d1a]">{playing ? <Pause size={16} weight="fill" /> : <Play size={16} weight="fill" />}</button><button onClick={() => setMuted((value) => !value)} aria-label={muted ? 'Unmute' : 'Mute'} className="grid size-9 place-items-center text-white/65">{muted ? <SpeakerSlash size={18} weight="light" /> : <SpeakerHigh size={18} weight="light" />}</button><input type="range" min={0} max={1} step={0.01} value={volume} onChange={(event) => setVolume(Number(event.target.value))} aria-label="Volume" className="media-range hidden w-20 sm:block" /><span className="font-mono text-[10px] tabular-nums text-white/45">{clock(time)} / {clock(duration)}</span><span className="flex-1" /><select value={rate} onChange={(event) => setRate(Number(event.target.value))} aria-label="Playback speed" className="rounded-full bg-white/[0.07] px-2 py-1 text-xs text-white outline-none">{[0.5, 1, 1.25, 1.5, 2].map((value) => <option key={value} value={value} className="bg-[#211d1a]">{value}×</option>)}</select>{'pictureInPictureEnabled' in document && <button onClick={() => { const video = videoRef.current as HTMLVideoElement & { requestPictureInPicture?: () => Promise<unknown> }; video.requestPictureInPicture?.(); }} aria-label="Picture in picture" className="grid size-9 place-items-center text-white/65"><PictureInPicture size={18} weight="light" /></button>}<button onClick={() => frameRef.current?.requestFullscreen()} aria-label="Fullscreen" className="grid size-9 place-items-center text-white/65"><ArrowsOut size={18} weight="light" /></button></div></div></div>}
  </div>;
}
