'use client';

import { m, useTransform, type MotionValue } from 'framer-motion';
import { useMemo } from 'react';
import { steady } from '../motion';
import { camera, enter, lerp, r2, seg, window4 } from './ease';

/**
 * The "5D" layer (docs/redesign/05-cinema.md §1.4): particles that stream
 * past on camera pushes, light sweeps and flares. Compositor-only. (There is
 * no screen shake: it read as the page juddering, and made people dizzy.)
 */

/** mulberry32: the same particles every load. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Mote = { x: number; y: number; size: number; depth: number; warm: boolean };

/**
 * Foreground dust and bokeh. As `push` goes 0 → 1 they stream out from the
 * centre toward the viewer (wind), nearer motes faster and larger.
 */
export function Particles({
  progress,
  push = [0, 1],
  count = 28,
  seed = 7,
  className = '',
}: {
  progress: MotionValue<number>;
  /** The progress window over which the camera pushes forward. */
  push?: readonly [number, number];
  count?: number;
  seed?: number;
  className?: string;
}) {
  const motes = useMemo<Mote[]>(() => {
    const rnd = seeded(seed);
    return Array.from({ length: count }, () => ({
      x: rnd() * 2 - 1,
      y: rnd() * 2 - 1,
      size: 2 + rnd() * 10,
      depth: 0.3 + rnd() * 0.7,
      warm: rnd() > 0.4,
    }));
  }, [count, seed]);
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 z-20 overflow-hidden ${className}`}>
      {motes.map((mote, i) => (
        <MoteDot key={i} progress={progress} push={push} mote={mote} />
      ))}
    </div>
  );
}

function MoteDot({ progress, push, mote }: { progress: MotionValue<number>; push: readonly [number, number]; mote: Mote }) {
  const transform = useTransform(progress, (p) => {
    const t = camera(seg(p, push[0], push[1]));
    const spread = 1 + t * (1.6 + mote.depth * 2.4);
    const x = mote.x * 46 * spread;
    const y = mote.y * 40 * spread;
    const s = 1 + t * mote.depth * 2.2;
    return `translate3d(${r2(x)}vw,${r2(y)}vh,0) scale(${r2(s)})`;
  });
  const opacity = useTransform(progress, (p) => {
    const t = seg(p, push[0], push[1]);
    return r2((0.25 + mote.depth * 0.55) * window4(t, 0, 0.15, 0.75, 1));
  });
  const d = mote.size;
  return (
    <m.span
      style={{ transform, opacity, width: d, height: d, marginLeft: -d / 2, marginTop: -d / 2 }}
      className={`absolute left-1/2 top-1/2 rounded-full ${mote.warm ? 'bg-[radial-gradient(circle,rgba(240,200,142,0.95),rgba(240,200,142,0)_70%)]' : 'bg-[radial-gradient(circle,rgba(242,237,232,0.9),rgba(242,237,232,0)_70%)]'}`}
    />
  );
}

/** A diagonal band of light crossing the frame over [from, to]. */
export function LightSweep({ progress, from, to, warm = true }: { progress: MotionValue<number>; from: number; to: number; warm?: boolean }) {
  const transform = useTransform(progress, (p) => `translate3d(${r2(lerp(-120, 120, camera(seg(p, from, to))))}%,0,0) rotate(18deg)`);
  const opacity = useTransform(progress, (p) => r2(window4(p, from, from + (to - from) * 0.2, to - (to - from) * 0.2, to) * 0.55));
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      <m.div
        style={{ transform, opacity }}
        className={`absolute -inset-y-1/2 left-0 w-[45%] ${warm ? 'bg-[linear-gradient(90deg,rgba(240,200,142,0),rgba(240,200,142,0.35),rgba(255,231,194,0.6),rgba(240,200,142,0.35),rgba(240,200,142,0))]' : 'bg-[linear-gradient(90deg,rgba(242,237,232,0),rgba(242,237,232,0.25),rgba(242,237,232,0))]'}`}
      />
    </div>
  );
}

/** A lens flare at (x%, y%) that blooms over [from, to]. */
export function Flare({ progress, from, to, x = 50, y = 40, size = 520 }: { progress: MotionValue<number>; from: number; to: number; x?: number; y?: number; size?: number }) {
  const opacity = useTransform(progress, (p) => r2(window4(p, from, from + (to - from) * 0.3, to - (to - from) * 0.4, to) * 0.7));
  const transform = useTransform(progress, (p) => `translate3d(-50%,-50%,0) scale(${r2(lerp(0.6, 1.15, seg(p, from, to)))})`);
  return (
    <m.div
      aria-hidden
      style={{ opacity, transform, left: `${x}%`, top: `${y}%`, width: size, height: size }}
      className="pointer-events-none absolute z-20 rounded-full bg-[radial-gradient(circle,rgba(255,231,194,0.55)_0%,rgba(240,200,142,0.18)_30%,rgba(240,200,142,0)_65%)]"
    />
  );
}

/** A camera transform for a whole shot: dolly (scale) and drift, from keyframes over progress. */
export function useCamera(progress: MotionValue<number>, keys: readonly { at: number; scale: number; x?: number; y?: number; rx?: number; ry?: number }[]) {
  return useTransform(progress, (p) => {
    let i = 0;
    while (i < keys.length - 2 && p > keys[i + 1].at) i++;
    const a = keys[i];
    const b = keys[Math.min(i + 1, keys.length - 1)];
    const t = camera(seg(p, a.at, b.at));
    const s = lerp(a.scale, b.scale, t);
    const x = lerp(a.x ?? 0, b.x ?? 0, t);
    const y = lerp(a.y ?? 0, b.y ?? 0, t);
    const rx = lerp(a.rx ?? 0, b.rx ?? 0, t);
    const ry = lerp(a.ry ?? 0, b.ry ?? 0, t);
    // Phones: the same dolly, flat (motion.tsx steady()).
    if (steady()) return `translate3d(${r2(x)}vw,${r2(y)}vh,0) scale(${r2(s)})`;
    return `perspective(1200px) translate3d(${r2(x)}vw,${r2(y)}vh,0) rotateX(${r2(rx)}deg) rotateY(${r2(ry)}deg) scale(${r2(s)})`;
  });
}

/**
 * A layer's 3D turn: perspective, then rotateX and rotateY. None on phones
 * (motion.tsx steady()), where a turning layer shimmers.
 */
export function turn(rx: number, ry: number, perspective = 1200): string {
  return steady() ? 'none' : `perspective(${perspective}px) rotateX(${r2(rx)}deg) rotateY(${r2(ry)}deg)`;
}

/**
 * A layer placed in depth: lifted by `y` (a CSS length), at depth `z` px
 * (negative is away), turned `rx`/`ry`, scaled `s`, through `perspective`.
 * On phones (steady) it is flat: the depth becomes the scale it would show
 * (capped, so a card passing the camera never grows a layer far past the
 * screen) and the turn is dropped, so it still flies in from far, without
 * the shimmer.
 */
export function place3d(perspective: number, y: string, z: number, rx: number, ry: number, s = 1): string {
  if (steady()) {
    const k = Math.min(3, perspective / Math.max(1, perspective - z));
    return `translate3d(0,${y},0) scale(${r2(s * k)})`;
  }
  return `perspective(${perspective}px) translate3d(0,${y},${r2(z)}px) rotateX(${r2(rx)}deg) rotateY(${r2(ry)}deg) scale(${r2(s)})`;
}

/**
 * Ease in, hold, ease out (05-cinema.md §1.8): the life of one item on screen.
 * In over [a, b] rising `y` px and growing from `scale`; out over [c, d]
 * drifting on up. Returns style-ready motion values.
 */
export function useReveal(progress: MotionValue<number>, a: number, b: number, c: number, d: number, { y = 24, scale = 0.96 } = {}) {
  const opacity = useTransform(progress, (p) => r2(window4(p, a, b, c, d)));
  const transform = useTransform(progress, (p) => {
    const i = enter(seg(p, a, b));
    const o = seg(p, c, d);
    return `translate3d(0,${r2((1 - i) * y - o * o * o * y)}px,0) scale(${r2(scale + (1 - scale) * i)})`;
  });
  return { opacity, transform };
}
