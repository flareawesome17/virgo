'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ChevronDown,
  Download,
  Heart,
  Maximize,
  Maximize2,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { type StoredFile } from '@/api';
import { pauseAlbumAudio, registerFilmPause } from '@/components/media/media-focus';
import { clock, dayLabel } from '@/components/media/media-labels';
import { useVideoPlayback } from '@/components/media/video-playback';
import { downloadHref } from '@/lib/desktop';
import { cn } from '@/lib/utils';

const motion =
  'transition-[transform,opacity,background-color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]';

/** How far the round buttons over the picture step, as on the phone. */
const SKIP = 10;

/**
 * The film player.
 *
 * It used to be defined inside the lightbox, which tied a playing film to the
 * lightbox being open — closing it stopped playback, and there was no way to
 * keep watching while doing anything else. It is a component of its own so
 * VideoSurface can keep it alive above the app.
 *
 * It draws everything that goes with the picture, at either size: the name
 * and the bar over a film that fills the window, and the row under one docked
 * in the corner. They used to be VideoSurface's, which could not say how far
 * through the film was, because only the element in here knows. The `<video>`
 * keeps one place in the tree whichever is drawn, so changing size never
 * stops it.
 *
 * Wears the dark palette in both themes: a film is watched on black.
 *
 * Who drives the HLS ladder, the fallback to the proxy and the codec failure
 * message are as they were.
 */

export function VideoPlayer({
  file,
  compact = false,
  surfaced = false,
}: {
  file: StoredFile;
  /**
   * Docked in the corner rather than filling the window.
   *
   * The full control bar does not fit a card this size and would be a row of
   * targets too small to hit, so the card gets one row of its own: the name,
   * how far through, and the five things worth doing from a corner.
   */
  compact?: boolean;
  /**
   * Held above the app by VideoSurface, rather than drawn inside the
   * lightbox. Only that one can be minimised, stopped, or stepped through
   * the album's films: the lightbox has its own bar and its own arrows.
   */
  surfaced?: boolean;
}) {
  const playback = useVideoPlayback();
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
  const enginePlaysHls = useMemo(
    () =>
      typeof document !== 'undefined' &&
      !!document.createElement('video').canPlayType('application/vnd.apple.mpegurl'),
    [],
  );
  /**
   * Both of these require a ladder to exist, which is the part that was
   * missing. A ladder is only built when an album is shared, so most films do
   * not have one — and Safari was being handed `<source src={undefined}>` for
   * every one of them. The element then failed immediately, the proxy and the
   * original below were never reached, and the viewer showed "this video
   * cannot play in this browser" for a film that plays perfectly well.
   */
  const hlsNative = enginePlaysHls && !!file.hlsUrl;
  const hlsViaLibrary = !!file.hlsUrl && !enginePlaysHls && !libraryFailed;

  const showControls = useCallback(() => {
    setControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (playing) hideTimer.current = setTimeout(() => setControls(false), 2500);
  }, [playing]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  }, []);

  const skip = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (video) video.currentTime = Math.max(0, video.currentTime + seconds);
  }, []);

  useEffect(() => {
    const mountedVideo = videoRef.current;
    const handle = (event: KeyboardEvent) => {
      const video = videoRef.current;
      if (!video) return;
      // Typing a K, M or F into a field, or a space, was taken as a command.
      // Modifiers are left alone too, so Ctrl+F still searches the page.
      const target = event.target as HTMLElement | null;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
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

  // So a recording starting can pause this (media-focus): the two talked
  // over each other once a recording could follow you out of its album.
  useEffect(() => registerFilmPause(() => videoRef.current?.pause()), []);

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
  // failure says nothing about this one, and neither does its failing
  // outright, or how far through it was. One film that would not play used
  // to leave every film after it on the "cannot play" screen, which the
  // Previous and Next buttons now make easy to reach.
  //
  // Adjusted during render rather than from an effect. Resetting in an effect
  // renders the new film once carrying the old film's verdict and corrects it
  // afterwards — a frame of the wrong player, which is what
  // react-hooks/set-state-in-effect is pointing at.
  const [lastKey, setLastKey] = useState(file.key);
  if (lastKey !== file.key) {
    setLastKey(file.key);
    setLibraryFailed(false);
    setFailed(false);
    setTime(0);
    setDuration(file.durationMs ? file.durationMs / 1000 : 0);
  }

  const title = file.mediaTitle || file.originalName;
  const elapsed = `${clock(time)} of ${clock(duration)}`;
  const saveHref =
    file.capabilities.download && file.downloadUrl ? downloadHref(file.downloadUrl) : null;
  // The album's other films, for the player held above the app. Both buttons
  // or neither: one that comes and goes moves everything beside it.
  const stepping = surfaced && playback.queue.length > 1;
  // Out of reach as well as out of sight: at no opacity the buttons still
  // took a tap, so tapping the picture to bring them back pressed one.
  // Tabbing onto one brings its bar back by itself.
  const chrome = controls
    ? 'translate-y-0 opacity-100'
    : 'pointer-events-none opacity-0 has-[:focus-visible]:pointer-events-auto has-[:focus-visible]:translate-y-0 has-[:focus-visible]:opacity-100';

  return (
    <div
      ref={frameRef}
      className={cn('dark relative text-foreground', compact ? 'flex flex-col bg-card' : 'h-full bg-background')}
      onMouseMove={showControls}
      onClick={showControls}
      onFocus={showControls}
    >
      <div
        className={cn('relative grid place-items-center', compact ? 'aspect-video bg-background' : 'h-full')}
        // The docked picture is the way back to the player, as on the phone.
        onClick={compact && surfaced ? playback.expand : undefined}
      >
        {failed ? (
          compact ? (
            <p className="px-4 text-center text-xs text-muted-foreground">This video cannot play in this browser</p>
          ) : (
            <div className="px-6 text-center">
              <p className="text-lg font-semibold">This video cannot play in this browser</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">The original codec may only be supported on the device that recorded it.</p>
              {saveHref && (
                <a href={saveHref} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-action px-5 text-sm font-semibold text-action-foreground">
                  <Download size={17} strokeWidth={1.5} />
                  Download original
                </a>
              )}
            </div>
          )
        ) : (
          /* The proxy when there is one, the original when there is not. The
             proxy is H.264/AAC with the moov atom at the front and served
             from the media host, so it both plays where the original cannot
             and starts without fetching the end of the file first. */
          <video
            ref={videoRef}
            key={file.key}
            autoPlay
            playsInline
            poster={file.posterUrl ?? undefined}
            className={compact ? 'absolute inset-0 size-full cursor-pointer object-contain' : 'max-h-full max-w-full'}
            onPlay={() => {
              setPlaying(true);
              showControls();
              // One at a time: a recording kept playing under the film.
              pauseAlbumAudio();
            }}
            onPause={() => { setPlaying(false); setControls(true); }}
            onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
            onDurationChange={(event) => setDuration(event.currentTarget.duration || duration)}
            onError={() => setFailed(true)}
          >
            {hlsNative ? <source src={file.hlsUrl!} type="application/vnd.apple.mpegurl" /> : hlsViaLibrary ? null : file.proxyUrl ? <source src={file.proxyUrl} type="video/mp4" /> : <><source src={file.url ?? ''} type={file.contentType ?? 'video/mp4'} />{file.contentType === 'video/quicktime' && <source src={file.url ?? ''} type="video/mp4" />}</>}
          </video>
        )}

        {compact && (
          <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-foreground/30">
            <span
              className="block h-full bg-primary"
              style={{ width: `${duration > 0 ? Math.min(100, (time / duration) * 100) : 0}%` }}
            />
          </span>
        )}

        {/* In the middle of the picture, where the phone puts them. The
            layer itself takes no clicks, only its buttons, so the picture
            under it still answers the pointer. */}
        {!compact && !failed && (
          <div
            className={cn(
              'pointer-events-none absolute inset-0 flex items-center justify-center gap-6 transition-opacity duration-300 has-[:focus-visible]:opacity-100 sm:gap-9',
              controls ? 'opacity-100' : 'opacity-0',
            )}
          >
            <RoundButton label={`Back ${SKIP} seconds`} shown={controls} onClick={() => skip(-SKIP)}>
              <RotateCcw size={22} />
            </RoundButton>
            <RoundButton label={playing ? 'Pause' : 'Play'} shown={controls} large onClick={togglePlay}>
              {playing ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" />}
            </RoundButton>
            <RoundButton label={`Forward ${SKIP} seconds`} shown={controls} onClick={() => skip(SKIP)}>
              <RotateCw size={22} />
            </RoundButton>
          </div>
        )}
      </div>

      {/* The film's name and its day, with the two ways out on either side:
          put it away, or stop it. They were two bare circles in a corner. */}
      {!compact && surfaced && (
        <header
          className={cn(
            'absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/70 to-transparent px-4 pb-10 pt-3',
            motion,
            chrome,
          )}
        >
          <ChromeButton label="Minimise" onClick={playback.minimise} className="size-10 rounded-full">
            <ChevronDown size={22} />
          </ChromeButton>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold leading-5">{title}</p>
            <p className="flex items-center gap-1.5 text-xs leading-4 text-foreground/70">
              {file.picked && <Heart size={11} aria-hidden className="shrink-0 fill-primary text-primary" />}
              <span className="truncate">
                {file.picked ? 'Picked by your client · ' : ''}
                {dayLabel(file)}
              </span>
            </p>
          </div>
          <ChromeButton label="Stop playing" onClick={playback.close} className="size-10 rounded-full">
            <X size={20} />
          </ChromeButton>
        </header>
      )}

      {!compact && !failed && (
        <div className={cn('absolute inset-x-4 bottom-4 mx-auto max-w-4xl rounded-2xl border border-border bg-card/95 px-3 py-3 backdrop-blur-xl', motion, chrome, !controls && 'translate-y-3')}>
          <input type="range" min={0} max={Math.max(duration, 0)} step={0.1} value={Math.min(time, duration || 0)} onChange={(event) => { const next = Number(event.target.value); if (videoRef.current) videoRef.current.currentTime = next; setTime(next); }} aria-label="Video position" className="media-range w-full" />
          <div className="mt-2 flex items-center gap-1 sm:gap-2">
            {stepping && (
              <ChromeButton label="Previous film" disabled={!playback.hasPrevious} onClick={playback.previous}>
                <SkipBack size={18} strokeWidth={1.5} />
              </ChromeButton>
            )}
            <button type="button" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'} className="grid size-9 shrink-0 place-items-center rounded-full bg-foreground text-background outline-none focus-visible:ring-3 focus-visible:ring-ring/60">
              {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
            </button>
            {stepping && (
              <ChromeButton label="Next film" disabled={!playback.hasNext} onClick={playback.next}>
                <SkipForward size={18} strokeWidth={1.5} />
              </ChromeButton>
            )}
            <ChromeButton label={muted ? 'Unmute' : 'Mute'} onClick={() => setMuted((value) => !value)}>
              {muted ? <VolumeX size={18} strokeWidth={1.5} /> : <Volume2 size={18} strokeWidth={1.5} />}
            </ChromeButton>
            <input type="range" min={0} max={1} step={0.01} value={volume} onChange={(event) => setVolume(Number(event.target.value))} aria-label="Volume" className="media-range hidden w-20 sm:block" />
            <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">{elapsed}</span>
            <span className="flex-1" />
            <select value={rate} onChange={(event) => setRate(Number(event.target.value))} aria-label="Playback speed" className="rounded-full bg-foreground/[0.07] px-2 py-1 text-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/60">
              {[0.5, 1, 1.25, 1.5, 2].map((value) => <option key={value} value={value} className="bg-card">{value}×</option>)}
            </select>
            {'pictureInPictureEnabled' in document && (
              <ChromeButton label="Picture in picture" onClick={() => { const video = videoRef.current as (HTMLVideoElement & { requestPictureInPicture?: () => Promise<unknown> }) | null; void video?.requestPictureInPicture?.(); }}>
                <PictureInPicture2 size={18} strokeWidth={1.5} />
              </ChromeButton>
            )}
            {/* Saving the original.
              *
              * This used to be in the lightbox chrome, which is what a film
              * opened into before VideoSurface existed. Moving playback out
              * of the lightbox left the download behind, and the only copy
              * that survived was on the "this video cannot play" screen —
              * so a film could be saved exactly while it was broken, and
              * not once it worked.
              *
              * Same guard as everywhere else: a collaborator with view-only
              * access is given no `downloadUrl` to offer. Marked as a
              * download, or the desktop app sends it to the browser. */}
            {saveHref && (
              <a href={saveHref} aria-label="Download original" title="Download original" className="grid size-9 shrink-0 place-items-center rounded-[10px] text-foreground/65 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/60">
                <Download size={18} strokeWidth={1.5} />
              </a>
            )}
            <ChromeButton label="Fullscreen" onClick={() => void frameRef.current?.requestFullscreen()}>
              <Maximize2 size={18} strokeWidth={1.5} />
            </ChromeButton>
          </div>
        </div>
      )}

      {compact && surfaced && (
        <div className="flex items-center gap-1 py-2 pl-3.5 pr-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold leading-[18px]">{title}</p>
            <p className="text-xs tabular-nums text-secondary-foreground">{elapsed}</p>
          </div>
          {stepping && (
            <ChromeButton label="Previous film" small disabled={!playback.hasPrevious} onClick={playback.previous}>
              <SkipBack size={15} />
            </ChromeButton>
          )}
          <ChromeButton label={playing ? 'Pause' : 'Play'} small disabled={failed} onClick={togglePlay}>
            {playing && !failed ? <Pause size={15} /> : <Play size={15} />}
          </ChromeButton>
          {stepping && (
            <ChromeButton label="Next film" small disabled={!playback.hasNext} onClick={playback.next}>
              <SkipForward size={15} />
            </ChromeButton>
          )}
          <ChromeButton label="Open the player" small onClick={playback.expand}>
            <Maximize size={15} />
          </ChromeButton>
          <ChromeButton label="Stop playing" small onClick={playback.close}>
            <X size={15} />
          </ChromeButton>
        </div>
      )}
    </div>
  );
}

/** A quiet button on the player's own surfaces: the bar, the name, the row. */
function ChromeButton({
  label,
  onClick,
  disabled = false,
  small = false,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** The docked card's: 32px, as on the board. */
  small?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'grid shrink-0 place-items-center rounded-[10px] text-foreground/80 outline-none transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-30',
        small ? 'size-8' : 'size-9',
        className,
      )}
    >
      {children}
    </button>
  );
}

/** One of the three round buttons over the picture. */
function RoundButton({
  label,
  onClick,
  shown,
  large = false,
  children,
}: {
  label: string;
  onClick: () => void;
  /** Whether it can be pressed: hidden, it lets a click through to the picture. */
  shown: boolean;
  large?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'grid shrink-0 place-items-center rounded-full bg-black/45 text-foreground outline-none backdrop-blur-sm transition-transform hover:bg-black/60 focus-visible:pointer-events-auto focus-visible:ring-3 focus-visible:ring-ring/60 active:scale-95',
        large ? 'size-[68px]' : 'size-12',
        shown && 'pointer-events-auto',
      )}
    >
      {children}
    </button>
  );
}
