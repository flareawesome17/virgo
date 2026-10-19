/**
 * The reel's motion vocabulary: the story's easing tokens (storyboard §1.7)
 * plus two tracks for keyframed values. Everything is a pure function of the
 * frame, so any frame renders the same on its own (Remotion renders frames in
 * parallel tabs, out of order).
 */
import { Easing } from "remotion";

export const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Where f sits between a and b, clamped to 0..1. */
export const span = (f: number, a: number, b: number) => clamp01((f - a) / (b - a));

/** §1.7's curves, plus a gentle in-out for long holds. */
export const EASE = {
  /** Entrances: cubic-bezier(0.16, 1, 0.3, 1). */
  enter: Easing.bezier(0.16, 1, 0.3, 1),
  /** The camera: cubic-bezier(0.65, 0, 0.35, 1). */
  camera: Easing.bezier(0.65, 0, 0.35, 1),
  /** UI state changes: cubic-bezier(0.2, 0, 0, 1). */
  ui: Easing.bezier(0.2, 0, 0, 1),
  /** Exits: cubic-bezier(0.7, 0, 0.84, 0). */
  exit: Easing.bezier(0.7, 0, 0.84, 0),
  /** Objects rising into frame: quick, but never a jump on the first frame (easeOutCubic). */
  rise: Easing.bezier(0.33, 1, 0.68, 1),
  /** A soft in-out for slow drifts. */
  inOut: Easing.bezier(0.45, 0, 0.55, 1),
} as const;

/** Eased 0..1 between frames a and b. */
export const tw = (f: number, a: number, b: number, ease: (t: number) => number = EASE.enter) => ease(span(f, a, b));

/** A value that steps between keys, each leg eased (it rests at every key): beats. */
export function beats(f: number, keys: readonly (readonly [number, number])[], ease: (t: number) => number = EASE.camera): number {
  if (f <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [fb, vb] = keys[i];
    if (f <= fb) {
      const [fa, va] = keys[i - 1];
      return lerp(va, vb, ease(span(f, fa, fb)));
    }
  }
  return keys[keys.length - 1][1];
}

/**
 * A value through keys on one continuous curve: monotone cubic Hermite
 * (Fritsch–Carlson), so it never overshoots a key, keeps its speed through
 * the middle keys and eases in and out at the two ends. Camera moves.
 */
export function glide(f: number, keys: readonly (readonly [number, number])[]): number {
  const n = keys.length;
  if (f <= keys[0][0]) return keys[0][1];
  if (f >= keys[n - 1][0]) return keys[n - 1][1];
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((keys[i + 1][1] - keys[i][1]) / (keys[i + 1][0] - keys[i][0]));
  const m: number[] = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  let i = 0;
  while (f > keys[i + 1][0]) i++;
  const [x0, y0] = keys[i];
  const [x1, y1] = keys[i + 1];
  const h = x1 - x0;
  const t = (f - x0) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * m[i + 1];
}

/** A one-shot pulse: 0 → 1 → 0 between a and b, smooth at both ends. */
export const pulse = (f: number, a: number, b: number) => Math.sin(Math.PI * span(f, a, b)) ** 2;

/** A press: down to `depth` and back up, over `length` frames from `at`. */
export const press = (f: number, at: number, length = 8, depth = 0.96) => 1 - (1 - depth) * pulse(f, at, at + length);
