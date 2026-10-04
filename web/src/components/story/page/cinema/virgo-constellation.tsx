'use client';

import { m, useMotionValue, useTransform, type MotionValue } from 'framer-motion';
import { useEffect, type CSSProperties } from 'react';
import { SEGMENTS, STARS, starRadius, type StarId } from '../../data/constellation';
import { r2, seg } from './ease';

/**
 * Virgo, the real figure (constellation.ts: SIMBAD positions, the IAU / Sky &
 * Telescope stick figure), as a film element: gold hairlines that draw out
 * from one star across the figure, soft star points that twinkle, and Syrma
 * (the star the Finale lights as "you") held back as a socket or ignited
 * last. Used over the hero film and in the closing sting.
 *
 * Cost: HTML, not SVG or canvas, so the lines are compositor-only. Each edge
 * is one 1 px span drawn in by `scaleX` (plus an optional soft bloom span
 * under it, its opacity from `glow`); each star is a span with a radial
 * gradient. 13 or 14 edges and 14 stars: about 45 small elements, no
 * filters, no per-frame React state. The twinkle is a CSS opacity animation
 * that runs only while the story moves and stops under Pause.
 *
 * Without `draw` the figure is simply drawn (the static page, reduced
 * motion, no JavaScript).
 */

/** The figure's own extent in constellation.ts chart coordinates (x spans 0..1). */
const Y0 = Math.min(...STARS.map((s) => s.y));
const Y1 = Math.max(...STARS.map((s) => s.y));

/** Width over height of the figure itself (about 2.12). Callers size the box by width; `aspect-ratio` does the rest. */
export const VIRGO_ASPECT = 1 / (Y1 - Y0);

const BY_ID = new Map(STARS.map((s) => [s.id, s]));

/** Where a star sits in the box, % of its width and height. */
export function virgoPoint(id: StarId): { x: number; y: number } {
  const s = BY_ID.get(id)!;
  return { x: s.x * 100, y: ((s.y - Y0) / (Y1 - Y0)) * 100 };
}

type Edge = { a: StarId; b: StarId; held: boolean; slot: number; x: number; y: number; len: number; deg: number };

/**
 * The draw order: breadth first from `from` over the figure (Syrma's two
 * segments last), each edge oriented away from the start, its slot the
 * depth it leaves from. Porrima, the four-way hub, sends three edges at once.
 */
function plan(from: StarId) {
  const main = SEGMENTS.filter((s) => !s.heldBack);
  const level = new Map<StarId, number>([[from, 0]]);
  const queue: StarId[] = [from];
  while (queue.length) {
    const id = queue.shift()!;
    for (const s of main) {
      const other = s.a === id ? s.b : s.b === id ? s.a : null;
      if (other && !level.has(other)) {
        level.set(other, level.get(id)! + 1);
        queue.push(other);
      }
    }
  }
  const geometry = (a: StarId, b: StarId) => {
    const pa = virgoPoint(a);
    const pb = virgoPoint(b);
    // Percentages of width and height differ by the aspect: measure in width units.
    const dx = pb.x - pa.x;
    const dy = (pb.y - pa.y) / VIRGO_ASPECT;
    return { x: pa.x, y: pa.y, len: Math.hypot(dx, dy), deg: (Math.atan2(dy, dx) * 180) / Math.PI };
  };
  const edges: Edge[] = main.map((s) => {
    const la = level.get(s.a) ?? 0;
    const lb = level.get(s.b) ?? 0;
    const [a, b] = la <= lb ? [s.a, s.b] : [s.b, s.a];
    return { a, b, held: false, slot: Math.min(la, lb), ...geometry(a, b) };
  });
  const slots = Math.max(1, ...edges.map((e) => e.slot + 1));
  // Syrma's segments, as constellation.ts orders them: out of Heze into Syrma, then on to μ Vir.
  const held: Edge[] = SEGMENTS.filter((s) => s.heldBack).map((s, i) => ({ a: s.a, b: s.b, held: true, slot: i, ...geometry(s.a, s.b) }));
  return { edges, held, level, slots };
}

const TWINKLE_CSS = `
@keyframes vc-tw{0%,100%{opacity:1}50%{opacity:var(--tw-lo,.45)}}
html[data-motion='on'] .vc-tw{animation:vc-tw var(--tw-d,3.6s) ease-in-out var(--tw-delay,0s) infinite}
html[data-paused] .vc-tw{animation-play-state:paused}
`;

/** A steady pseudo-random 0..1 per star, so the twinkle never beats in step. */
const jitter = (id: StarId, k: number) => {
  const s = Math.sin((BY_ID.get(id)!.hip + k * 31.7) * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

export type VirgoConstellationProps = {
  /** 0..1: how far the lines have drawn, out from `from`. Absent: drawn. */
  draw?: MotionValue<number>;
  /** 0..1: the star points' opacity. Absent: 1. */
  stars?: MotionValue<number>;
  /** Each star waits for the first line to reach it (the Finale), or shows with `stars` alone and the lines join them later (the hero). Default true. */
  starsFollowLines?: boolean;
  /** 0..1: a soft bloom under the lines, and brighter stars. Absent: none. */
  glow?: MotionValue<number>;
  /** The star the lines draw out from (default Spica, Mika's). */
  from?: StarId;
  /**
   * Syrma (ι Vir) and its two segments: 'socket' (a hollow ring: not yet
   * lit, the story's default), 'hidden', or 'ignite' (drawn by `ignite`,
   * 0..1: into Syrma, the star lights, then on to μ Vir; lit when absent).
   */
  syrma?: 'socket' | 'hidden' | 'ignite';
  ignite?: MotionValue<number>;
  /** The lines' opacity. Default 0.6. */
  lineAlpha?: number;
  /** Star size multiplier. Default 1. */
  starScale?: number;
  twinkle?: boolean;
  className?: string;
  style?: CSSProperties;
};

export function VirgoConstellation({
  draw,
  stars,
  starsFollowLines = true,
  glow,
  from = 'alpha',
  syrma = 'socket',
  ignite,
  lineAlpha = 0.6,
  starScale = 1,
  twinkle = true,
  className = '',
  style,
}: VirgoConstellationProps) {
  const { edges, held, level, slots } = plan(from);
  const lit = syrma === 'ignite';
  return (
    <div aria-hidden className={`pointer-events-none relative ${className}`} style={{ aspectRatio: `${VIRGO_ASPECT.toFixed(4)} / 1`, ...style }}>
      {twinkle && <style>{TWINKLE_CSS}</style>}
      <div className="absolute inset-0" style={{ opacity: lineAlpha }}>
        {edges.map((e) => (
          <EdgeLine key={`${e.a}-${e.b}`} edge={e} draw={draw} window={[e.slot / slots, Math.min(1, (e.slot + 1.35) / slots)]} glow={glow} />
        ))}
        {lit &&
          held.map((e) => (
            <EdgeLine key={`${e.a}-${e.b}`} edge={e} draw={ignite} window={e.slot === 0 ? [0, 0.5] : [0.45, 1]} glow={glow} />
          ))}
      </div>
      {STARS.map((s) => {
        if (s.id === 'iota' && syrma === 'hidden') return null;
        if (s.id === 'iota' && syrma === 'socket') return <Socket key={s.id} stars={stars} />;
        const k = s.id === 'iota' ? -1 : (level.get(s.id) ?? 0);
        // A star lights as the first line reaches it (a line from depth k − 1 ends at (k + 0.35) / slots); the start
        // star at once; Syrma as it ignites. Clamped inside the draw, so the farthest stars still finish lit.
        const reveal: [number, number] | null =
          s.id === 'iota' ? [0.42, 0.56] : k <= 0 || !starsFollowLines ? null : [Math.min(0.94, (k + 0.05) / slots), Math.min(1, (k + 0.4) / slots)];
        return (
          <StarPoint
            key={s.id}
            id={s.id}
            size={starRadius(s.mag, 1.3, 3.3) * 2 * starScale}
            reveal={reveal}
            by={s.id === 'iota' ? ignite : draw}
            stars={stars}
            glow={glow}
            twinkle={twinkle}
            origin={s.id === from}
          />
        );
      })}
    </div>
  );
}

function EdgeLine({ edge, draw, window: [w0, w1], glow }: { edge: Edge; draw?: MotionValue<number>; window: readonly [number, number]; glow?: MotionValue<number> }) {
  const fallback = useMotionValue(1);
  const t = draw ?? fallback;
  const transform = useTransform(t, (v) => `rotate(${r2(edge.deg)}deg) scaleX(${r2(draw ? seg(v, w0, w1) : 1)})`);
  // Each span's centre line runs through the star (origin at its left middle), whatever its height.
  const place = (h: number): CSSProperties => ({ left: `${r2(edge.x)}%`, top: `calc(${r2(edge.y)}% - ${h / 2}px)`, width: `${r2(edge.len)}%`, height: h });
  return (
    <>
      {glow && (
        <m.span
          style={{ ...place(5), transform, opacity: glow }}
          className="absolute origin-[0_50%] bg-[linear-gradient(180deg,rgba(240,200,142,0)_0%,rgba(240,200,142,0.32)_50%,rgba(240,200,142,0)_100%)]"
        />
      )}
      <m.span style={{ ...place(1), transform }} className="absolute origin-[0_50%] bg-[linear-gradient(90deg,rgba(240,200,142,0.95),rgba(240,200,142,0.75))]" />
    </>
  );
}

function StarPoint({
  id,
  size,
  reveal,
  by,
  stars,
  glow,
  twinkle,
  origin,
}: {
  id: StarId;
  size: number;
  reveal: [number, number] | null;
  by?: MotionValue<number>;
  stars?: MotionValue<number>;
  glow?: MotionValue<number>;
  twinkle: boolean;
  origin: boolean;
}) {
  const one = useMotionValue(1);
  const opacity = useTransform([by ?? one, stars ?? one], ([v, s]: number[]) => r2((reveal && by ? seg(v, reveal[0], reveal[1]) : 1) * s));
  const at = virgoPoint(id);
  const d = r2(size);
  const twinkleStyle = twinkle
    ? ({ '--tw-d': `${(2.8 + 3 * jitter(id, 1)).toFixed(2)}s`, '--tw-delay': `${(-6 * jitter(id, 2)).toFixed(2)}s`, '--tw-lo': (0.4 + 0.25 * jitter(id, 3)).toFixed(2) } as CSSProperties)
    : undefined;
  return (
    <m.span style={{ left: `${r2(at.x)}%`, top: `${r2(at.y)}%`, width: d, height: d, opacity }} className="absolute -translate-x-1/2 -translate-y-1/2">
      {/* A soft halo, brighter on the start star and in the glow. */}
      <span className={`absolute rounded-full bg-[radial-gradient(closest-side,rgba(240,200,142,0.34),rgba(240,200,142,0))] ${origin ? '-inset-[260%]' : '-inset-[170%]'}`} />
      {glow && <m.span style={{ opacity: glow }} className="absolute -inset-[320%] rounded-full bg-[radial-gradient(closest-side,rgba(255,231,194,0.42),rgba(240,200,142,0))]" />}
      <span
        style={twinkleStyle}
        className={`absolute inset-0 rounded-full bg-[radial-gradient(closest-side,#FFFBF2_0%,#FFE9C9_45%,rgba(240,200,142,0)_100%)] ${twinkle ? 'vc-tw autoplay' : ''}`}
      />
    </m.span>
  );
}

/** Syrma before the Finale: a hollow ring where the star will be. It comes up with the other stars. */
function Socket({ stars }: { stars?: MotionValue<number> }) {
  const at = virgoPoint('iota');
  return (
    <m.span
      style={{ left: `${r2(at.x)}%`, top: `${r2(at.y)}%`, opacity: stars }}
      className="absolute size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[rgba(240,200,142,0.5)]"
    />
  );
}

/**
 * A clock for time-driven draw-ins (seconds since the story started moving,
 * as a MotionValue): it runs on requestAnimationFrame until `until`, then
 * stops. Under Pause (from the start or part way) it jumps to `until` and
 * stops, so a paused visitor sees the finished figure, still, not nothing.
 */
export function useFilmClock(active: boolean, until: number): MotionValue<number> {
  const clock = useMotionValue(0);
  useEffect(() => {
    if (!active) return;
    const paused = () => document.documentElement.hasAttribute('data-paused');
    let raf = 0;
    let last = 0;
    let t = clock.get();
    const tick = (now: number) => {
      if (paused()) {
        clock.set(until);
        return;
      }
      if (last) t = Math.min(until, t + Math.min(0.1, (now - last) / 1000));
      last = now;
      clock.set(t);
      if (t < until) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, until, clock]);
  return clock;
}
