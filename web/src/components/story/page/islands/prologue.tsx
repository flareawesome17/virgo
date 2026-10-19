'use client';

import { useMotionValue, useMotionValueEvent, type MotionValue } from 'framer-motion';
import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { part, useChapterProgress, useMotionGate } from '../motion';
import { usePublishSky } from '../sky-stage';
import { prologue } from '../sky/choreography';
import { prologueClock } from '../sky/prologue-clock';
import { camera, seg } from '../cinema/ease';

/**
 * The opening (05-cinema.md §3, Prologue): a title card, then the descent.
 *
 * While the motion gate is open the section is a track and its frame is
 * pinned. The first scroll pushes the camera through the gear around the
 * title (scenes/prologue-film.tsx), the title falls back into the dark, and
 * the sky dollies from the archipelago down onto Mika's star (choreography
 * `prologue`). The H1 starts at full opacity, always: it is the LCP element.
 *
 * Every write is transform or opacity, from one progress value. With the gate
 * closed it renders its children untouched (the static page).
 */

const ProgressContext = createContext<MotionValue<number> | null>(null);

/** The opening's progress (0 → 1 over the track), for the film layers inside it. */
export function usePrologueProgress() {
  return useContext(ProgressContext);
}

export function PrologueStage({ children, className = '' }: { children: ReactNode; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const gate = useMotionGate();
  const progress = useChapterProgress(root, 'track');

  // The sky hears a value that is never exactly 0, so the first frame (and a
  // return to the top) is published with the real layout, not the default.
  const sky = useMotionValue(0.0001);
  useMotionValueEvent(progress, 'change', (v) => {
    sky.set(v <= 0 ? 0.0001 : v);
    prologueClock.set(v);
  });
  useEffect(() => prologueClock.set(progress.get()), [progress]);
  usePublishSky(sky, (p, l) => (gate.motion ? prologue(p, l) : null));

  useEffect(() => {
    const el = root.current;
    if (!gate.motion || !el) return;
    const copy = part(el, 'hero-copy');
    const scrim = part(el, 'hero-scrim');
    const poster = part(el, 'hero-poster');

    let last = -1;
    const apply = (p: number) => {
      if (Math.abs(p - last) < 0.0005) return;
      last = p;
      // The title falls back into the dark as the camera pushes past it.
      const out = camera(seg(p, 0.03, 0.2));
      if (copy) {
        copy.style.transform = `translate3d(0, ${(-28 * out).toFixed(2)}px, 0) scale(${(1 - 0.1 * out).toFixed(4)})`;
        copy.style.opacity = String(1 - out);
        copy.style.pointerEvents = out > 0.6 ? 'none' : '';
        copy.style.visibility = out >= 0.999 ? 'hidden' : '';
      }
      if (scrim) scrim.style.opacity = String(1 - seg(p, 0.08, 0.26));
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
      for (const node of [copy, scrim, poster]) {
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
    <ProgressContext.Provider value={progress}>
      <div ref={root} className={className}>
        {children}
      </div>
    </ProgressContext.Provider>
  );
}
