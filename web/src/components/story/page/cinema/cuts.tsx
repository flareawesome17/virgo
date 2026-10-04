'use client';

import { m, useScroll, useTransform, type MotionValue } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useMotionGate } from '../motion';
import { camera, clamp01, lerp, r2, seg } from './ease';
import { morphPath, type MorphShape } from './morph';

/**
 * The cuts between chapters (05-cinema.md §1.5, §1.8): fixed overlays driven
 * by where a chapter's top edge is on screen, so the seam where one pinned
 * scene scrolls away and the next arrives is never seen.
 *
 * - `iris`: the camera's aperture closes on the old scene, turning, and opens
 *   on the new one.
 * - `tunnel`: a zoom through rings of aperture hexagons into the next scene.
 * - `leak`: a warm light leak washes over the seam.
 *
 * Through every cut a gold glyph morphs from the old scene's symbol into the
 * new one's (Mika's star → the group chat, the job → a map pin, …): the thread
 * of the story, carried across the seam.
 *
 * `u` runs 0 → 1 as the incoming chapter's top travels from the bottom of the
 * screen to the top; the frame is fully covered around u = 0.5.
 * Compositor-only (transform and opacity on plain divs), and off under
 * reduced motion.
 */

export type CutKind = 'iris' | 'tunnel' | 'leak';
export type Cut = { into: string; kind: CutKind; from: MorphShape; to: MorphShape };

const BLADES = 7;
const RINGS = 7;

export function Cuts({ cuts }: { cuts: readonly Cut[] }) {
  const gate = useMotionGate();
  const { scrollY } = useScroll();
  const tops = useRef<number[]>([]);
  const [size, setSize] = useState({ w: 1440, h: 900 });

  useEffect(() => {
    if (!gate.motion) return;
    const measure = () => {
      tops.current = cuts.map((c) => {
        const el = document.getElementById(c.into);
        return el ? el.getBoundingClientRect().top + window.scrollY : Infinity;
      });
      setSize({ w: window.innerWidth, h: window.innerHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    return () => ro.disconnect();
  }, [gate.motion, cuts]);

  // Which cut is live, and how far through it (u). One value per kind so idle overlays stay at rest.
  const live = useTransform(scrollY, (y) => {
    if (typeof window === 'undefined') return { i: -1, u: 0 };
    const h = window.innerHeight;
    for (let i = 0; i < tops.current.length; i++) {
      const u = 1 - (tops.current[i] - y) / h;
      if (u > 0 && u < 1) return { i, u };
    }
    return { i: -1, u: 0 };
  });
  const uFor = (kind: CutKind) => (v: { i: number; u: number }) => (v.i >= 0 && cuts[v.i]?.kind === kind ? v.u : 0);
  const iris = useTransform(live, uFor('iris'));
  const tunnel = useTransform(live, uFor('tunnel'));
  const leak = useTransform(live, uFor('leak'));

  if (!gate.motion) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[44] overflow-hidden">
      <Iris u={iris} size={size} />
      <Tunnel u={tunnel} />
      <Leak u={leak} />
      <Glyph live={live} cuts={cuts} />
    </div>
  );
}

/** How closed the frame is: 0 open → 1 shut, held shut briefly around the seam. */
const shut = (u: number) => (u <= 0 || u >= 1 ? 0 : u < 0.5 ? camera(seg(u, 0.04, 0.44)) : 1 - camera(seg(u, 0.56, 0.96)));

function Iris({ u, size }: { u: MotionValue<number>; size: { w: number; h: number } }) {
  const reach = Math.hypot(size.w, size.h) * 0.56;
  const visible = useTransform(u, (v) => (v > 0 && v < 1 ? 1 : 0));
  return (
    <m.div style={{ opacity: visible }} className="absolute inset-0">
      {Array.from({ length: BLADES }, (_, i) => (
        <Blade key={i} i={i} u={u} reach={reach} />
      ))}
      {/* The centre point the blades close onto: a warm glint at the instant of the cut. */}
      <IrisGlint u={u} />
    </m.div>
  );
}

function Blade({ i, u, reach }: { i: number; u: MotionValue<number>; reach: number }) {
  const transform = useTransform(u, (v) => {
    const s = shut(v);
    // The aperture turns as it closes and keeps turning as it opens, like a lens ring.
    const twist = lerp(-38, 38, clamp01(v));
    const d = reach * (1 - s) - 2;
    return `rotate(${r2((360 / BLADES) * i + twist)}deg) translate3d(0,${r2(-d)}px,0)`;
  });
  const shade = i % 2 ? '#100D0B' : '#151210';
  return (
    <m.div
      style={{ transform, background: `linear-gradient(180deg, #0B0908 0%, ${shade} 70%, #2A211B 100%)` }}
      className="absolute left-1/2 top-1/2 -ml-[150vmax] -mt-[300vmax] h-[300vmax] w-[300vmax] origin-bottom border-b border-[#D18A5A]/50 shadow-[0_6px_18px_rgba(0,0,0,0.6)]"
    />
  );
}

function IrisGlint({ u }: { u: MotionValue<number> }) {
  const opacity = useTransform(u, (v) => r2(clamp01(1 - Math.abs(v - 0.5) / 0.08) * 0.9));
  const transform = useTransform(u, (v) => `translate3d(-50%,-50%,0) scale(${r2(0.6 + clamp01(1 - Math.abs(v - 0.5) / 0.08) * 0.8)})`);
  return (
    <m.div
      style={{ opacity, transform }}
      className="absolute left-1/2 top-1/2 size-40 rounded-full bg-[radial-gradient(circle,rgba(255,231,194,0.9)_0%,rgba(240,200,142,0.35)_25%,rgba(240,200,142,0)_65%)]"
    />
  );
}

/** A hexagon outline, as a static SVG the rings scale. */
function Hexagon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="-100 -100 200 200" className={className} fill="none">
      <polygon points="0,-96 83.1,-48 83.1,48 0,96 -83.1,48 -83.1,-48" stroke="#F0C88E" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Tunnel({ u }: { u: MotionValue<number> }) {
  const visible = useTransform(u, (v) => (v > 0 && v < 1 ? 1 : 0));
  // The dark portal: grows from the centre to swallow the frame, then gives way to the new scene.
  const portal = useTransform(u, (v) => `translate3d(-50%,-50%,0) rotate(${r2(v * 30)}deg) scale(${r2(v < 0.5 ? lerp(0.02, 3.2, camera(seg(v, 0.08, 0.48))) : 3.2)})`);
  const portalO = useTransform(u, (v) => (v < 0.5 ? 1 : r2(1 - camera(seg(v, 0.52, 0.9)))));
  return (
    <m.div style={{ opacity: visible }} className="absolute inset-0">
      <m.div style={{ transform: portal, opacity: portalO }} className="absolute left-1/2 top-1/2 size-[70vmax] [clip-path:polygon(50%_0,93.3%_25%,93.3%_75%,50%_100%,6.7%_75%,6.7%_25%)] bg-[radial-gradient(closest-side,#0B0908_60%,#161311_100%)]" />
      {Array.from({ length: RINGS }, (_, i) => (
        <Ring key={i} i={i} u={u} />
      ))}
    </m.div>
  );
}

function Ring({ i, u }: { i: number; u: MotionValue<number> }) {
  // Each ring rushes from the vanishing point past the viewer; staggered so the tunnel is always full.
  const t = (v: number) => clamp01(v * 1.25 - i / RINGS / 1.6);
  const transform = useTransform(u, (v) => {
    const k = t(v);
    const s = 0.03 * Math.pow(120, k);
    return `translate3d(-50%,-50%,0) rotate(${r2(i * 9 + v * 40)}deg) scale(${r2(s)})`;
  });
  const opacity = useTransform(u, (v) => {
    const k = t(v);
    return r2(k <= 0 || k >= 1 ? 0 : Math.min(1, k * 5) * (1 - k) * 0.9);
  });
  return (
    <m.div style={{ transform, opacity }} className="absolute left-1/2 top-1/2 size-[40vmin]">
      <Hexagon className="size-full" />
    </m.div>
  );
}

function Leak({ u }: { u: MotionValue<number> }) {
  const opacity = useTransform(u, (v) => r2(shut(v) * 0.97));
  const transform = useTransform(u, (v) => `translate3d(${r2(lerp(-25, 25, v))}%,0,0) scale(1.4)`);
  return (
    <m.div
      style={{ opacity, transform }}
      className="absolute inset-0 bg-[radial-gradient(60%_80%_at_40%_50%,rgba(255,236,206,1)_0%,rgba(240,200,142,0.95)_35%,rgba(209,138,90,0.85)_65%,rgba(122,62,30,0.9)_100%)]"
    />
  );
}

/** The thread: the old scene's symbol morphs into the new one's at the centre of the cut. */
function Glyph({ live, cuts }: { live: MotionValue<{ i: number; u: number }>; cuts: readonly Cut[] }) {
  const d = useTransform(live, ({ i, u }) => {
    const c = cuts[i];
    if (!c) return 'M0 0Z';
    return morphPath(c.from, c.to, camera(seg(u, 0.3, 0.66)));
  });
  const opacity = useTransform(live, ({ i, u }) => (i < 0 ? 0 : r2(clamp01(seg(u, 0.16, 0.32) * (1 - seg(u, 0.7, 0.86))))));
  const transform = useTransform(live, ({ u }) => `translate3d(-50%,-50%,0) rotate(${r2(lerp(-12, 12, u))}deg) scale(${r2(lerp(0.7, 1.15, u))})`);
  const fill = useTransform(live, ({ i }) => (cuts[i]?.kind === 'leak' ? '#7A3E1E' : '#F0C88E'));
  return (
    <m.svg style={{ opacity, transform }} viewBox="-100 -100 200 200" className="absolute left-1/2 top-1/2 size-[16vmin] min-h-16 min-w-16 overflow-visible drop-shadow-[0_0_24px_rgba(240,200,142,0.45)]">
      <m.path d={d} fill={fill} />
    </m.svg>
  );
}
