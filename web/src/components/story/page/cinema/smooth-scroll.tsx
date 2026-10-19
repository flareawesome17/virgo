'use client';

import Lenis from 'lenis';
import { useEffect } from 'react';
import { lenisOn, useMotionGate } from '../motion';
import { camera } from './ease';
import type { Cut } from './cuts';

/**
 * Smooth scrolling for the film (desktop: a mouse or a trackpad). The wheel's
 * steps become one gliding move (Lenis), so the whole page moves like a
 * camera on a fluid head, not just the scenes. Phones keep their own native
 * touch scrolling; reduced motion keeps the browser's.
 *
 * It also settles on held frames: if the visitor stops partway through a cut
 * (the aperture half closed, the tunnel half way), the page eases on to the
 * nearer whole frame, the scene before or the scene after, instead of
 * resting on a transition.
 */
export function SmoothScroll({ cuts }: { cuts: readonly Cut[] }) {
  const gate = useMotionGate();
  useEffect(() => {
    if (!gate.motion || !lenisOn()) return;
    const lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.9, smoothWheel: true });
    let raf = requestAnimationFrame(function loop(t) {
      lenis.raf(t);
      raf = requestAnimationFrame(loop);
    });

    let idle = 0;
    let release = 0;
    let settling = false;
    const done = () => {
      window.clearTimeout(release);
      settling = false;
    };
    const settle = () => {
      if (settling) return;
      const h = window.innerHeight;
      const y = lenis.scroll;
      for (const c of cuts) {
        const el = document.getElementById(c.into);
        if (!el) continue;
        const top = el.getBoundingClientRect().top + y;
        const u = 1 - (top - y) / h;
        if (u > 0.06 && u < 0.94) {
          settling = true;
          // A wheel during the glide replaces it and onComplete never comes: the timer frees the settle anyway.
          release = window.setTimeout(done, 1400);
          lenis.scrollTo(u >= 0.5 ? top : top - h, { duration: 1.1, easing: camera, onComplete: done });
          return;
        }
      }
    };
    const onScroll = () => {
      window.clearTimeout(idle);
      if (!settling) idle = window.setTimeout(settle, 240);
    };
    lenis.on('scroll', onScroll);
    return () => {
      window.clearTimeout(idle);
      window.clearTimeout(release);
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, [gate.motion, cuts]);
  return null;
}
