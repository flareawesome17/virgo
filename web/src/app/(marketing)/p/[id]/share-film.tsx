'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import type Hls from 'hls.js';

/**
 * A film on the share page: the browser's own player, nothing on top.
 *
 * It does not start on its own and fetches nothing but the poster until it is
 * asked to play — the same promise the app makes to people paying for data by
 * the gigabyte. A film is usually served as its own MP4 copy, which every
 * browser plays from `src`. For the few minutes after posting, before that
 * copy exists, it may be an HLS ladder: Safari plays that natively, and
 * anywhere else hls.js drives it, holding back every segment until play.
 */
export function ShareFilm({
  src,
  poster,
  width,
  height,
  label,
  className,
  style,
}: {
  src: string;
  poster: string;
  width?: number;
  height?: number;
  label: string;
  className?: string;
  /** The film's box at its own shape, from the page; absent when the shape is unknown. */
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const isHls = src.includes('.m3u8');

  useEffect(() => {
    const video = ref.current;
    if (!video || !isHls) return;
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      return;
    }

    let hls: Hls | null = null;
    let cancelled = false;
    const start = () => hls?.startLoad(-1);
    void import('hls.js').then(({ default: HlsPlayer }) => {
      if (cancelled || !HlsPlayer.isSupported()) return;
      // Only the ladder's index until somebody presses play.
      hls = new HlsPlayer({ autoStartLoad: false });
      hls.loadSource(src);
      hls.attachMedia(video);
      video.addEventListener('play', start, { once: true });
    });
    return () => {
      cancelled = true;
      video.removeEventListener('play', start);
      hls?.destroy();
    };
  }, [src, isHls]);

  return (
    <video
      ref={ref}
      // An HLS ladder is attached above; an MP4 plays from here.
      src={isHls ? undefined : src}
      poster={poster}
      width={width}
      height={height}
      controls
      playsInline
      preload="none"
      aria-label={label}
      style={style}
      className={`${className ?? ''} ${style ? '' : 'w-auto'} bg-black`}
    />
  );
}
