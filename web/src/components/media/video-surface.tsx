'use client';

import { useEffect } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { VideoPlayer } from '@/components/media/video-player';
import { useVideoPlayback } from '@/components/media/video-playback';

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
 */
export function VideoSurface() {
  const { current, mode, close, minimise, expand } = useVideoPlayback();

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

  if (!current) return null;

  const full = mode === 'full';

  return (
    <div
      className={
        full
          ? 'fixed inset-0 z-50 bg-black'
          : 'fixed bottom-4 right-4 z-50 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-white/10 bg-[#141210] shadow-[0_24px_70px_-28px_rgba(0,0,0,0.8)]'
      }
    >
      <div className={full ? 'h-full' : 'aspect-video'}>
        <VideoPlayer file={current} compact={!full} />
      </div>

      <div
        className={
          full
            ? 'absolute left-4 top-4 flex items-center gap-2'
            : 'flex items-center gap-2 border-t border-white/10 px-2.5 py-2'
        }
      >
        <button
          onClick={full ? minimise : expand}
          aria-label={full ? 'Minimise' : 'Expand'}
          className="grid size-9 shrink-0 place-items-center rounded-full bg-black/45 text-white/80 hover:text-white"
        >
          <ChevronDown
            size={18}
            className={full ? '' : 'rotate-180'}
          />
        </button>

        {!full && (
          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-white">
            {current.mediaTitle || current.originalName}
          </span>
        )}

        <button
          onClick={close}
          aria-label="Stop playing"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-black/45 text-white/55 hover:text-white"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
