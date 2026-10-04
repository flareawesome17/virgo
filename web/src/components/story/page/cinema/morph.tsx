'use client';

import { m, useTransform, type MotionValue } from 'framer-motion';
import { camera, lerp, seg } from './ease';

/**
 * Morphs (05-cinema.md §1.9): one shape becoming the next as the story moves
 * on. Mika's star becomes a chat bubble, a job card becomes a map pin, the
 * shutter becomes a heart.
 *
 * Every shape is resampled once into the same polar grid (N radii at evenly
 * spaced angles round the origin), so any shape morphs into any other by
 * interpolating radii: no library, no point matching. Shapes fit the unit
 * circle and must be star-shaped about the origin.
 */

export type MorphShape = 'circle' | 'sparkle' | 'hexagon' | 'square' | 'heart' | 'pin' | 'bubble' | 'sun' | 'hourglass' | 'diamond';

const N = 120;
const TAU = Math.PI * 2;

/**
 * Radius along each of N rays from the origin to a closed outline (ordered
 * points): the farthest crossing of each ray with the outline's edges.
 */
function resample(points: [number, number][]): Float32Array {
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = -Math.PI + (i / N) * TAU;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let best = 0;
    for (let k = 0; k < points.length; k++) {
      const [px, py] = points[k];
      const [qx, qy] = points[(k + 1) % points.length];
      const ex = qx - px;
      const ey = qy - py;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      // Ray origin + r·d meets p + s·e: solve for r (along the ray) and s (along the edge).
      const r = (px * ey - py * ex) / den;
      const t = (px * dy - py * dx) / den;
      if (r > 0 && t >= 0 && t <= 1 && r > best) best = r;
    }
    out[i] = best;
  }
  return out;
}

/** Samples a parametric outline densely, then fits it into the unit circle. */
function outline(fn: (t: number) => [number, number], samples = 720): Float32Array {
  const pts: [number, number][] = [];
  for (let i = 0; i < samples; i++) pts.push(fn((i / samples) * TAU));
  const max = Math.max(...pts.map(([x, y]) => Math.hypot(x, y)));
  return resample(pts.map(([x, y]) => [x / max, y / max]));
}

/** A closed polygon, its edges subdivided so straight sides stay straight after resampling. */
function polygon(corners: [number, number][], per = 60): Float32Array {
  const pts: [number, number][] = [];
  corners.forEach((c, i) => {
    const d = corners[(i + 1) % corners.length];
    for (let k = 0; k < per; k++) pts.push([lerp(c[0], d[0], k / per), lerp(c[1], d[1], k / per)]);
  });
  const max = Math.max(...pts.map(([x, y]) => Math.hypot(x, y)));
  return resample(pts.map(([x, y]) => [x / max, y / max]));
}

/** A rounded rectangle centred on (cx, cy). */
function roundRect(w: number, h: number, r: number, cx = 0, cy = 0): [number, number][] {
  const pts: [number, number][] = [];
  const corners = [
    [w / 2 - r, -h / 2 + r, -Math.PI / 2],
    [w / 2 - r, h / 2 - r, 0],
    [-w / 2 + r, h / 2 - r, Math.PI / 2],
    [-w / 2 + r, -h / 2 + r, Math.PI],
  ] as const;
  for (const [x, y, a0] of corners) for (let k = 0; k <= 16; k++) pts.push([cx + x + r * Math.cos(a0 + (k / 16) * (Math.PI / 2)), cy + y + r * Math.sin(a0 + (k / 16) * (Math.PI / 2))]);
  return pts;
}

let cache: Record<MorphShape, Float32Array> | null = null;

function shapes(): Record<MorphShape, Float32Array> {
  if (cache) return cache;
  const hex = Array.from({ length: 6 }, (_, i) => [Math.cos((i / 6) * TAU - Math.PI / 2), Math.sin((i / 6) * TAU - Math.PI / 2)] as [number, number]);
  // The chat bubble: a rounded rectangle with a tail on its bottom edge, at the lower left.
  const bubble = roundRect(1.9, 1.3, 0.38, 0, -0.12);
  bubble.splice(34, 0, [-0.15, 0.53], [-0.62, 0.98], [-0.45, 0.53]);
  // The pin: a circle drawn over the top, its sides running down to a point.
  const pin: [number, number][] = [];
  for (let k = 0; k <= 48; k++) {
    const t = Math.PI / 2 + 0.68 + (k / 48) * (TAU - 1.36);
    pin.push([0.8 * Math.cos(t), -0.3 + 0.8 * Math.sin(t)]);
  }
  pin.push([0, 1.05]);
  cache = {
    circle: outline((t) => [Math.cos(t), Math.sin(t)]),
    // A four-point sparkle: the star in the H1's full stop.
    sparkle: outline((t) => {
      const c = Math.cos(t);
      const s = Math.sin(t);
      return [Math.sign(c) * Math.abs(c) ** 3, Math.sign(s) * Math.abs(s) ** 3];
    }),
    hexagon: polygon(hex),
    square: resample(roundRect(1.6, 1.6, 0.3)),
    heart: outline((t) => {
      const x = 16 * Math.sin(t) ** 3;
      const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      return [x, y - 2.5];
    }),
    pin: polygon(pin, 6),
    bubble: resample(bubble),
    sun: outline((t) => {
      const r = 0.72 + 0.28 * Math.max(0, Math.cos(8 * t)) ** 4;
      return [Math.cos(t) * r, Math.sin(t) * r];
    }),
    hourglass: polygon([
      [-0.8, -1],
      [0.8, -1],
      [0.12, 0],
      [0.8, 1],
      [-0.8, 1],
      [-0.12, 0],
    ]),
    diamond: polygon([
      [0, -1],
      [0.75, 0],
      [0, 1],
      [-0.75, 0],
    ]),
  };
  return cache;
}

/** The SVG path for a blend of two shapes, in a -100…100 box. */
export function morphPath(a: MorphShape, b: MorphShape, t: number, scale = 92): string {
  const all = shapes();
  const ra = all[a];
  const rb = all[b];
  let d = '';
  for (let i = 0; i < N; i++) {
    const ang = -Math.PI + (i / N) * TAU;
    const r = lerp(ra[i], rb[i], t) * scale;
    d += `${i ? 'L' : 'M'}${(Math.cos(ang) * r).toFixed(1)} ${(Math.sin(ang) * r).toFixed(1)}`;
  }
  return `${d}Z`;
}

export type MorphKey = { at: number; shape: MorphShape };

/** Which two keys bracket p, and how far between them (eased). */
export function morphAt(keys: readonly MorphKey[], p: number): [MorphShape, MorphShape, number] {
  if (p <= keys[0].at) return [keys[0].shape, keys[0].shape, 0];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (p <= b.at) return [a.shape, b.shape, camera(seg(p, a.at, b.at))];
  }
  const last = keys[keys.length - 1].shape;
  return [last, last, 0];
}

/**
 * A shape that morphs through `keys` as progress moves: it holds each shape
 * at its `at` and melts into the next between them. Size it with className;
 * colour it with `fill` / `stroke`.
 */
export function Morph({
  progress,
  keys,
  className = '',
  fill = '#F0C88E',
  stroke,
  strokeWidth = 2,
}: {
  progress: MotionValue<number>;
  keys: readonly MorphKey[];
  className?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}) {
  const d = useTransform(progress, (p) => {
    const [a, b, t] = morphAt(keys, p);
    return morphPath(a, b, t);
  });
  return (
    <svg aria-hidden viewBox="-100 -100 200 200" className={className} overflow="visible">
      <m.path d={d} fill={fill} stroke={stroke} strokeWidth={stroke ? strokeWidth : undefined} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}
