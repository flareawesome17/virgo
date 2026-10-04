'use client';

import { useMotionValue, useMotionValueEvent } from 'framer-motion';
import { useEffect, useRef, type ReactNode } from 'react';
import { part, useChapterProgress, useMotionGate } from '../motion';
import { usePublishSky } from '../sky-stage';
import { prologue } from '../sky/choreography';

/**
 * The Prologue's stage (storyboard Prologue, §1.13 "The descent").
 *
 * Enhances the server-rendered hero in place. While the motion gate is open:
 * - the sky camera dollies from the archipelago down through the stars onto
 *   Mika (choreography `prologue`), published to the one SkyStage;
 * - the AVIF poster crossfades away once the canvas has had time to draw;
 * - the copy lifts and fades on desktop (24 px), and fades as it scrolls away
 *   on phones (12 px) — the H1 starts at full opacity, always;
 * - Mika's chip resolves on her star as the camera lands.
 *
 * Every write is transform or opacity on a `[data-part]`, from one progress
 * value; nothing re-renders on scroll. With the gate closed it renders its
 * children untouched (the static page).
 */

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** Hermite smoothstep between two progress stops. */
const ss = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** The enter curve, cubic-bezier(0.16, 1, 0.3, 1), close enough for scroll: an ease-out expo. */
const enter = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp01(t)));

export function PrologueStage({ children, className = '' }: { children: ReactNode; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const gate = useMotionGate();
  const progress = useChapterProgress(root, 'track');

  // The sky hears a value that is never exactly 0, so the first frame (and a
  // return to the top) is published with the real layout, not the default.
  const sky = useMotionValue(0.0001);
  useMotionValueEvent(progress, 'change', (v) => sky.set(v <= 0 ? 0.0001 : v));
  usePublishSky(sky, (p, l) => (gate.motion ? prologue(p, l) : null));

  useEffect(() => {
    const el = root.current;
    if (!gate.motion || !el) return;
    const copy = part(el, 'hero-copy');
    const scrim = part(el, 'hero-scrim');
    const chip = part(el, 'mika-chip');
    const poster = part(el, 'hero-poster');
    const cue = part(el, 'hero-cue');

    let last = -1;
    const apply = (p: number) => {
      if (Math.abs(p - last) < 0.0005) return;
      last = p;
      const desktop = window.innerWidth >= 1024;
      // Desktop: the copy lifts 24 px and fades over 0.20–0.45. Phones: it scrolls away, fading late, 12 px.
      const out = desktop ? ss(0.2, 0.45, p) : ss(0.3, 0.55, p);
      const lift = (desktop ? 24 : 12) * out;
      if (copy) {
        copy.style.transform = `translate3d(0, ${-lift.toFixed(2)}px, 0)`;
        copy.style.opacity = String(1 - out);
        copy.style.pointerEvents = out > 0.9 ? 'none' : '';
        copy.style.visibility = out >= 0.999 ? 'hidden' : '';
      }
      if (scrim) scrim.style.opacity = String(1 - ss(0.3, 0.6, p));
      if (cue) cue.style.opacity = String(1 - ss(0.02, 0.12, p));
      if (chip) {
        const t = enter(clamp01((p - 0.84) / 0.12));
        chip.style.opacity = String(t);
        chip.style.transform = `translate3d(-50%, ${(1 - t) * 14}px, 0) scale(${0.94 + 0.06 * t})`;
      }
    };
    apply(progress.get());
    const off = progress.on('change', apply);

    // After the first paints, the canvas has drawn: the poster gives way to it over 400 ms.
    let timer = 0;
    if (poster) {
      timer = window.setTimeout(() => {
        poster.style.transition = 'opacity 400ms cubic-bezier(0.2, 0, 0, 1)';
        poster.style.opacity = '0';
      }, 1100);
    }
    const onResize = () => {
      last = -1;
      apply(progress.get());
      // Re-frame the sky for the new layout.
      sky.set(sky.get() === 0.0001 ? 0.00011 : 0.0001);
    };
    // The sky's layout settles after this effect: publish once more on the next frame.
    const raf = requestAnimationFrame(onResize);
    window.addEventListener('resize', onResize);

    return () => {
      off();
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      for (const node of [copy, scrim, chip, poster, cue]) {
        if (!node) continue;
        node.style.transform = '';
        node.style.opacity = '';
        node.style.transition = '';
        node.style.pointerEvents = '';
        node.style.visibility = '';
      }
    };
  }, [gate.motion, progress, sky]);

  return (
    <div ref={root} className={className}>
      {children}
    </div>
  );
}
