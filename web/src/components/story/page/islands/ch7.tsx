'use client';

import { useMotionValueEvent } from 'framer-motion';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { RULER, dayLabel } from '../../data/strings/ch7';
import { useChapterProgress, useMotionGate } from '../motion';

/**
 * Ch7 · Forget — the island (storyboard §2 Ch7, §1.13).
 *
 * The day ruler holds still while its playhead moves; a mono counter scrubs
 * Day 0 → Day 112. At each 3 AM sweep the ruler flips its own `data-state`,
 * the meter drains, and that sweep's notice arrives. At Day 91 the visible
 * tiles dissolve into a few rising particles (DOM, transform/opacity only).
 * Writes through refs; no React state per frame.
 */

export type MeterStep = { used: string; left: string; files: number; fraction: number; percent: string };

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
const out = (t: number) => 1 - Math.pow(1 - t, 4);
const inOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const r = (n: number) => Math.round(n * 100) / 100;

/** The scrub: Day 0 → 91 → 92 → 112, with holds on each sweep. */
function dayAt(p: number) {
  if (p < 0.12) return 0;
  if (p < 0.34) return inOut(seg(p, 0.12, 0.34)) * 91;
  if (p < 0.5) return 91;
  if (p < 0.55) return 91 + seg(p, 0.5, 0.55);
  if (p < 0.62) return 92;
  if (p < 0.74) return 92 + inOut(seg(p, 0.62, 0.74)) * 20;
  return 112;
}

/** Sweep instants, as progress. */
const SWEEPS = [0.34, 0.55, 0.74] as const;

export function Ch7Stage({
  children,
  className = '',
  meter,
}: {
  children: ReactNode;
  className?: string;
  /** Mika's meter before the first sweep and after each one. */
  meter: readonly [MeterStep, MeterStep, MeterStep, MeterStep];
}) {
  const { motion } = useMotionGate();
  const ref = useRef<HTMLDivElement>(null);
  const progress = useChapterProgress(ref, 'track');
  const apply = useRef<((p: number) => void) | null>(null);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || !motion) return;
    const one = (sel: string) => root.querySelector<HTMLElement>(sel);
    const many = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel));
    const ruler = one('[data-part="c7-ruler"] [data-part="day-ruler"]');
    const dayText = one('[data-part="c7-ruler"] [data-part="ruler-day"]');
    const timeText = one('[data-part="c7-ruler"] [data-part="ruler-time"]');
    const playhead = one('[data-part="c7-ruler"] [data-part="ruler-playhead"]');
    const flash = one('[data-part="c7-flash"]');
    const rulerWrap = one('[data-part="c7-ruler"]');
    const tiles = many('[data-part="c7-tile"]');
    const motes = many('[data-part="c7-mote"]');
    const notices = many('[data-part="c7-notice"]');
    const end = one('[data-part="c7-end"]');
    const tilesWrap = one('[data-part="c7-tiles"]');
    const used = many('[data-part="c7-meter"] [data-part="meter-used"]');
    const left = many('[data-part="c7-meter"] [data-part="meter-left"]');
    const files = many('[data-part="c7-meter"] [data-part="meter-files"]');
    const fill = many('[data-part="c7-meter"] [data-part="meter-fill"]');
    const label = many('[data-part="c7-meter"] [data-part="ring-label"]');
    const arcA = many('[data-part="c7-meter"] [data-part="ring-arc-a"]');
    const arcB = many('[data-part="c7-meter"] [data-part="ring-arc-b"]');
    const capEnd = many('[data-part="c7-meter"] [data-part="ring-cap-end"]');
    const motePaths = motes.map((m) => ({
      el: m,
      tile: Number(m.dataset.tile),
      dx: Number(m.dataset.dx),
      rise: Number(m.dataset.rise),
      z: Number(m.dataset.z),
    }));

    let lastDay = -1;
    let lastStep = -1;
    let lastState = '';

    const set = (el: HTMLElement | null, transform: string | null, opacity?: number) => {
      if (!el) return;
      if (transform !== null) el.style.transform = transform;
      if (opacity !== undefined) el.style.opacity = String(r(opacity));
    };

    apply.current = (p: number) => {
      // The flashback: the New album field, then it recedes into the past.
      const back = inOut(seg(p, 0.08, 0.14));
      set(flash, `translate3d(0, ${r(-back * 16)}px, ${r(-back * 120)}px) rotateX(${r(back * 8)}deg)`, 1 - back);

      // The counter and the playhead.
      const day = dayAt(p);
      const whole = Math.floor(day + 1e-6);
      if (whole !== lastDay && dayText) {
        dayText.textContent = dayLabel(whole);
        lastDay = whole;
      }
      const atSweep = whole === 91 || whole === 92 || whole === 112;
      if (timeText) timeText.textContent = atSweep && day === whole ? RULER.sweepTime : '';
      set(playhead, `translateX(${r((day / 112) * 100)}%)`);
      const state = p >= SWEEPS[2] ? 'day112' : p >= SWEEPS[1] ? 'day92' : p >= SWEEPS[0] ? 'day91' : 'start';
      if (state !== lastState && ruler) {
        ruler.setAttribute('data-state', state);
        lastState = state;
      }

      // Day 91: the visible tiles dissolve; their motes rise past the camera.
      tiles.forEach((t, i) => {
        const d = out(seg(p, 0.34 + i * 0.006, 0.4 + i * 0.006));
        set(t, `translate3d(0, ${r(-d * 10)}px, ${r(d * 40)}px) scale(${r(1 - d * 0.18)})`, 1 - d);
      });
      motePaths.forEach(({ el, tile, dx, rise, z }) => {
        const t = seg(p, 0.35 + tile * 0.006, 0.5 + tile * 0.006);
        const e = out(t);
        set(el, `translate3d(${r(dx * e)}px, ${r(-rise * e)}px, ${r(z * e)}px) scale(${r(1 + e * 0.6)})`, Math.sin(t * Math.PI));
      });
      set(tilesWrap, null, 1 - seg(p, 0.46, 0.5));

      // The notices, one per sweep, sent after the files are gone.
      notices.forEach((n, i) => {
        const a = SWEEPS[i] + 0.02;
        const inn = out(seg(p, a, a + 0.05));
        const gone = inOut(seg(p, 0.8, 0.86));
        set(n, `translate3d(0, ${r((1 - inn) * 18)}px, ${r(-gone * 80)}px)`, inn * (1 - gone));
      });

      // The meter drains a step after each sweep.
      const step = p >= SWEEPS[2] + 0.01 ? 3 : p >= SWEEPS[1] + 0.01 ? 2 : p >= SWEEPS[0] + 0.02 ? 1 : 0;
      if (step !== lastStep) {
        const m = meter[step];
        used.forEach((el) => (el.textContent = m.used));
        left.forEach((el) => (el.textContent = m.left));
        files.forEach((el) => (el.textContent = String(m.files)));
        label.forEach((el) => (el.textContent = m.percent));
        lastStep = step;
      }
      const f0 = meter[0].fraction;
      const f1 = meter[1].fraction;
      const f2 = meter[2].fraction;
      const f3 = meter[3].fraction;
      const fraction =
        f0 +
        (f1 - f0) * out(seg(p, SWEEPS[0] + 0.01, SWEEPS[0] + 0.08)) +
        (f2 - f1) * out(seg(p, SWEEPS[1] + 0.005, SWEEPS[1] + 0.04)) +
        (f3 - f2) * out(seg(p, SWEEPS[2] + 0.005, SWEEPS[2] + 0.05));
      fill.forEach((el) => (el.style.transform = `scaleX(${r(fraction * 100) / 100})`));
      const angle = fraction * 360;
      arcA.forEach((el) => (el.style.transform = `rotate(${r(Math.min(angle, 180))}deg)`));
      arcB.forEach((el) => (el.style.transform = `rotate(${r(Math.max(0, angle - 180))}deg)`));
      capEnd.forEach((el) => (el.style.transform = `rotate(${r(angle)}deg)`));

      // The end: the album stays, emptied; the link has nothing left to show.
      const fin = out(seg(p, 0.8, 0.9));
      set(rulerWrap, `translateZ(${r(-fin * 60)}px)`, 1 - fin * 0.75);
      set(end, `translate3d(0, ${r((1 - fin) * 24)}px, ${r((1 - fin) * -80)}px)`, fin);
    };

    apply.current(progress.get());
    return () => {
      apply.current = null;
      // The gate closed: hand the figure back as the server drew it.
      [flash, rulerWrap, end, tilesWrap, playhead, ...tiles, ...motes, ...notices].forEach((el) => {
        if (el) {
          el.style.transform = '';
          el.style.opacity = '';
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motion]);

  useMotionValueEvent(progress, 'change', (p) => apply.current?.(p));

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
