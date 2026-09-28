'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { Play, Volume2, VolumeX } from 'lucide-react';
import type { ShowcasePiece } from '@/api';
import { cn } from '@/lib/utils';

/**
 * Whoever is playing right now, so starting one stops the last.
 *
 * A module-level handle rather than a prop, because the rule is about the page
 * and not about any one list: two films talking over each other is just as bad
 * when they are in different components. The phone does this with a prop from
 * the parent, which works there because one screen owns every film on it.
 */
let stopPrevious: (() => void) | null = null;

/** `83` -> `1:23`, `3701` -> `1:01:41`. Hours only appear when there are any. */
function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const s = String(total % 60).padStart(2, '0');
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/**
 * A film on the feed, played where it sits.
 *
 * **It does not start on its own**, for the same reason the phone's does not:
 * every feed this is modelled on autoplays and every one of them has a global
 * CDN, while these are served by one box to people who often pay for data by
 * the gigabyte. The poster frame is what scrolls past — the frame the media
 * worker chose — and a film plays because somebody asked it to.
 *
 * No `<video>` element exists until then, so a feed of twenty films holds no
 * decoders and fetches no bytes beyond the posters.
 */
export function ShowcaseFilm({ piece, alt }: { piece: ShowcasePiece; alt: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [failed, setFailed] = useState(false);
  const [libraryFailed, setLibraryFailed] = useState(false);

  const source = piece.playbackUrl ?? null;
  const isHls = !!source && source.includes('.m3u8');

  /**
   * Who drives the ladder, decided the same way the album player decides it.
   *
   * Safari and iOS play HLS from a plain `src`; everywhere else it is hls.js
   * over Media Source Extensions, and while the library is driving, the
   * element must carry no `src` of its own or the browser races the two.
   */
  const enginePlaysHls = useMemo(
    () =>
      typeof document !== 'undefined' &&
      !!document.createElement('video').canPlayType('application/vnd.apple.mpegurl'),
    [],
  );
  const hlsViaLibrary = isHls && !enginePlaysHls && !libraryFailed;

  const stop = useCallback(() => {
    videoRef.current?.pause();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source || !hlsViaLibrary) return;

    let cancelled = false;
    let instance: { destroy: () => void } | null = null;

    // Imported on demand, so the feed only pays for the library once somebody
    // actually plays a film that needs it.
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
        // Only a fatal error means the ladder is unusable; hls.js recovers
        // from most things by itself. A fatal one falls back to the proxy,
        // which is another copy that plays — not to an error screen.
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) setLibraryFailed(true);
        });
        void video.play().catch(() => undefined);
      })
      .catch(() => {
        if (!cancelled) setLibraryFailed(true);
      });

    return () => {
      cancelled = true;
      instance?.destroy();
    };
  }, [hlsViaLibrary, source]);

  /**
   * Scrolled out of sight, so it stops.
   *
   * A film carried on playing off screen would keep spending somebody's data
   * and — worse — keep talking, with the control that would silence it no
   * longer anywhere on the page. It is not resumed on the way back: a film
   * that restarts itself because the page moved is the thing this component
   * exists not to do.
   */
  useEffect(() => {
    const frame = frameRef.current;
    if (!started || !frame || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) videoRef.current?.pause();
      },
      { threshold: 0.35 },
    );
    observer.observe(frame);
    return () => observer.disconnect();
  }, [started]);

  // Leaving the page stops whatever this one had playing, so the singleton is
  // never left holding a handle to something that is gone.
  useEffect(
    () => () => {
      if (stopPrevious === stop) stopPrevious = null;
    },
    [stop],
  );

  // A film with neither a ladder nor a proxy has nothing to play. It keeps its
  // poster and loses the badge: what is missing is the control, not the piece.
  const playable = !!source && !failed;

  const toggle = () => {
    if (!playable) return;
    const video = videoRef.current;
    if (!started) {
      if (stopPrevious && stopPrevious !== stop) stopPrevious();
      stopPrevious = stop;
      setStarted(true);
      return;
    }
    if (!video) return;
    if (video.paused) {
      if (stopPrevious && stopPrevious !== stop) stopPrevious();
      stopPrevious = stop;
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  };

  return (
    <div ref={frameRef} className="relative aspect-[4/5] w-full overflow-hidden bg-muted">
      {started && playable ? (
        <video
          ref={videoRef}
          // hls.js attaches the stream itself; giving the element a src as
          // well makes the browser race the library for the same film.
          src={hlsViaLibrary ? undefined : source}
          poster={piece.url}
          autoPlay
          loop
          playsInline
          muted={muted}
          className="size-full object-cover"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onError={() => setFailed(true)}
        />
      ) : (
        <Image src={piece.url} alt={alt} fill sizes="(max-width: 768px) 100vw, 672px" className="object-cover" />
      )}

      {/* The whole frame is the control: the first click starts it, and every
          click after that pauses or resumes. */}
      <button
        type="button"
        onClick={toggle}
        disabled={!playable}
        aria-label={
          !playable
            ? 'This film cannot be played yet'
            : !started
              ? 'Play this film'
              : playing
                ? 'Pause this film'
                : 'Resume this film'
        }
        className="absolute inset-0 grid place-items-center"
      >
        {!playing && (
          <span
            className={cn(
              'grid size-16 place-items-center rounded-full bg-black/55 text-white',
              !playable && 'opacity-40',
            )}
          >
            <Play size={26} fill="currentColor" />
          </span>
        )}
        {!started && piece.durationMs ? (
          <span className="absolute bottom-3 left-3 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-bold text-white">
            {clock(piece.durationMs / 1000)}
          </span>
        ) : null}
      </button>

      {started && playable && (
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          aria-label={muted ? 'Turn the sound on' : 'Turn the sound off'}
          aria-pressed={!muted}
          className="absolute bottom-3 right-3 grid size-9 place-items-center rounded-full bg-black/55 text-white transition-opacity hover:opacity-80"
        >
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
      )}
    </div>
  );
}
