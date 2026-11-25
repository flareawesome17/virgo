'use client';

import { useEffect, useRef } from 'react';
import { AUDIO_DOCK_HEIGHT_VAR } from '@/components/media/audio-dock';
import { VideoPlayer } from '@/components/media/video-player';
import { useVideoPlayback } from '@/components/media/video-playback';

/**
 * How far anything else docked in the bottom-right corner must sit above the
 * corner so the mini player does not cover it — the player's own height plus
 * a gap, or unset when no film is docked.
 *
 * The upload dock lives in the same corner at the same width, one layer
 * lower, and without this a film minimised during an upload sat exactly on
 * top of the upload's progress. A CSS variable rather than shared state, so
 * neither component has to know the other exists: anything docked there adds
 * `var(--mini-player-offset, 0px)` to its bottom offset.
 */
export const MINI_PLAYER_OFFSET_VAR = '--mini-player-offset';

/** Space between the mini player and whatever is stacked above it. */
const STACK_GAP_PX = 12;

/**
 * Where a film is drawn, whatever page you are on.
 *
 * Mounted once in the app layout, because that is the only place a player can
 * live and survive a route change. It used to be inside MediaViewer, which
 * tied a playing film to that lightbox being open.
 *
 * **The player is mounted once, in one position in the tree**, and the wrapper
 * around it changes shape. That is the whole trick, and the same one mobile
 * uses: rendering a full branch and a docked branch as two separate pieces of
 * JSX would unmount one and mount the other on every change, tearing down the
 * `<video>` element in between — so the film would stop at the exact moment
 * somebody asked to keep it going. Same element, same position, different
 * class names.
 *
 * This is only the frame now. The name over an open film and the row under a
 * docked one are the player's own (VideoPlayer): they say how far through it
 * is, which nothing out here knows.
 */
export function VideoSurface() {
  const { current, mode, minimise } = useVideoPlayback();

  // Escape minimises rather than closes, matching the caret: put the film
  // away, do not throw it away. Only while it is full — in the corner, escape
  // belongs to whatever page is underneath.
  useEffect(() => {
    if (!current || mode !== 'full') return;
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        minimise();
      }
    };
    window.addEventListener('keydown', handle, true);
    return () => window.removeEventListener('keydown', handle, true);
  }, [current, mode, minimise]);

  // The page behind must not scroll under a full-screen player, and must be
  // free to scroll again the moment the film is docked.
  useEffect(() => {
    if (!current || mode !== 'full') return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [current, mode]);

  // Published while docked, measured rather than computed: the card is a 16:9
  // frame plus a title bar, and narrows with the window, so no fixed number in
  // another component would stay right. See MINI_PLAYER_OFFSET_VAR.
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = document.documentElement;
    const card = cardRef.current;
    if (!current || mode !== 'mini' || !card) return;
    const publish = () =>
      root.style.setProperty(MINI_PLAYER_OFFSET_VAR, `${card.offsetHeight + STACK_GAP_PX}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(card);
    return () => {
      observer.disconnect();
      root.style.removeProperty(MINI_PLAYER_OFFSET_VAR);
    };
  }, [current, mode]);

  if (!current) return null;

  const full = mode === 'full';

  return (
    <div
      ref={cardRef}
      className={
        full
          ? 'fixed inset-0 z-50 bg-black'
          : 'dark fixed right-4 z-50 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[14px] bg-card shadow-[0_16px_40px_rgba(0,0,0,0.28)] ring-1 ring-border'
      }
      // Above the recordings bar while one is playing, not on top of it: the
      // bar runs the width of the main column, this corner included.
      style={full ? undefined : { bottom: `calc(1rem + var(${AUDIO_DOCK_HEIGHT_VAR}, 0px))` }}
    >
      <VideoPlayer file={current} compact={!full} surfaced />
    </div>
  );
}
