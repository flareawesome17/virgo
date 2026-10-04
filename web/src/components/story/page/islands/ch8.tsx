'use client';

import { useMotionValueEvent } from 'framer-motion';
import { useEffect, useRef, type ReactNode } from 'react';
import { useChapterProgress, useMotionGate } from '../motion';
import { usePublishSky } from '../sky-stage';
import { crane } from '../sky/choreography';

/**
 * Ch8's stage (storyboard §2 Ch8): the crane up. Publishes the sky's crane
 * from Cebu City out to the archipelago (coastline at 14%, clusters lighting
 * north to south), drifts the role words with scroll (they stop when the
 * reader stops), lifts Bea's profile tag at the end, and raises the horizon
 * that the page lands on. Transform and opacity only, on existing parts.
 *
 * Progress is the `cover` range of the whole track; the crane is re-timed to
 * run from half-way in until the pin releases, measured from the track's
 * own height so it lands the same on every screen.
 */

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const span = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
const out = (t: number) => 1 - (1 - t) ** 3;
const r2 = (n: number) => Math.round(n * 100) / 100;

type Saved = { el: HTMLElement; transform: string; opacity: string };

export function Ch8Stage({ children, className = '' }: { children: ReactNode; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const gate = useMotionGate();
  const progress = useChapterProgress(root, 'cover');
  /** Where, in cover progress, the crane starts and where the pin lets go. */
  const timing = useRef({ from: 0.2, to: 0.6 });
  const parts = useRef<{
    rows: HTMLElement[];
    marquee: HTMLElement | null;
    horizon: HTMLElement | null;
    tag: HTMLElement | null;
  } | null>(null);

  const crane01 = (p: number) => span(p, timing.current.from, timing.current.to);

  usePublishSky(progress, (p, layout) => crane(crane01(p), layout, false));

  const apply = (p: number) => {
    const s = parts.current;
    if (!s) return;
    const r = crane01(p);
    // Role words: one transform per row, straight from scroll. Row a runs left, row b right, half a row at most.
    s.rows.forEach((row) => {
      const right = row.dataset.row === 'b';
      const x = right ? -50 + 25 * p : -25 * p;
      row.style.transform = `translate3d(${r2(x)}%, 0, 0)`;
    });
    // Decoration, not copy: it settles back as the copy arrives over it.
    if (s.marquee) s.marquee.style.opacity = String(r2(0.5 * out(span(r, 0.38, 0.6)) * (1 - 0.55 * span(r, 0.75, 1))));
    // The horizon rises at the end and the page lands on ground.
    if (s.horizon) {
      const h = out(span(r, 0.78, 1));
      s.horizon.style.transform = `translate3d(0, ${r2((1 - h) * 100)}%, 0)`;
      s.horizon.style.opacity = String(r2(h));
    }
    if (s.tag) {
      const t = out(span(r, 0.8, 0.95));
      s.tag.style.opacity = String(r2(t));
      s.tag.style.transform = `translate3d(0, ${r2((1 - t) * 14)}px, 0)`;
    }
  };

  useMotionValueEvent(progress, 'change', apply);

  useEffect(() => {
    const el = root.current;
    if (!gate.motion || !el) return;
    const measure = () => {
      const H = el.offsetHeight;
      const V = window.innerHeight;
      const total = H + V;
      // Pin starts when the track's top meets the viewport top, and lets go when its bottom meets the bottom.
      const a = V / total;
      const b = Math.max(a + 0.05, H / total);
      timing.current = { from: a * 0.45, to: b };
    };
    measure();
    const s = {
      rows: [...el.querySelectorAll<HTMLElement>('[data-part="marquee-row"]')],
      marquee: el.querySelector<HTMLElement>('[data-part="ch8-marquee"]'),
      horizon: el.querySelector<HTMLElement>('[data-part="ch8-horizon"]'),
      tag: el.querySelector<HTMLElement>('[data-part="ch8-tag"]'),
    };
    const touched = [...s.rows, s.marquee, s.horizon, s.tag].filter(Boolean) as HTMLElement[];
    const saved: Saved[] = touched.map((n) => ({
      el: n,
      transform: n.style.transform,
      opacity: n.style.opacity,
    }));
    parts.current = s;
    apply(progress.get());
    const onResize = () => {
      measure();
      apply(progress.get());
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      parts.current = null;
      for (const { el: n, transform, opacity } of saved) {
        n.style.transform = transform;
        n.style.opacity = opacity;
      }
    };
    // `apply` reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate.motion, progress]);

  return (
    <div ref={root} className={className}>
      {children}
    </div>
  );
}
