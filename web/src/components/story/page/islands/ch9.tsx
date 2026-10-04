'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useMotionGate } from '../motion';

/**
 * Ch9's tiles (storyboard §2 Ch9): entry-triggered, not scroll-linked. Each
 * story tile plays its little scene once when 60% of it is visible, then
 * rests on its final frame; on desktop, hovering or focusing a tile replays
 * it. The scenes themselves are CSS animations in the chapter (transform and
 * opacity only), held on their first frame until `data-play` lands. Pause
 * motion drops them to the final frame (CSS). Static readers never see a
 * first frame: the gate CSS only applies in motion mode.
 */
export function Ch9Tiles({ children, className = '' }: { children: ReactNode; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const gate = useMotionGate();

  useEffect(() => {
    const el = root.current;
    if (!gate.motion || !el) return;
    el.setAttribute('data-armed', '');
    const tiles = [...el.querySelectorAll<HTMLElement>('[data-tile]')];
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const tile = e.target as HTMLElement;
          tile.setAttribute('data-play', '');
          io.unobserve(tile);
        }
      },
      { threshold: 0.6 },
    );
    tiles.forEach((t) => io.observe(t));

    const fine = window.matchMedia('(min-width: 768px)');
    /** The tile's own scene, not its entrance. */
    const scene = (tile: HTMLElement) =>
      tile.getAnimations({ subtree: true }).filter((a) => !('animationName' in a) || (a as CSSAnimation).animationName !== 'c9-rise');
    const replay = (e: Event) => {
      if (!fine.matches || document.documentElement.hasAttribute('data-paused')) return;
      const tile = e.currentTarget as HTMLElement;
      if (!tile.hasAttribute('data-play')) return;
      const anims = scene(tile);
      if (anims.some((a) => a.playState === 'running')) return;
      for (const a of anims) {
        a.currentTime = 0;
        a.play();
      }
    };
    tiles.forEach((t) => {
      t.addEventListener('pointerenter', replay);
      t.addEventListener('focusin', replay);
    });
    return () => {
      io.disconnect();
      tiles.forEach((t) => {
        t.removeEventListener('pointerenter', replay);
        t.removeEventListener('focusin', replay);
      });
      el.removeAttribute('data-armed');
      tiles.forEach((t) => t.removeAttribute('data-play'));
    };
  }, [gate.motion]);

  return (
    <div ref={root} className={className}>
      {children}
    </div>
  );
}
