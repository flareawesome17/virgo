/**
 * The film's timing maths (docs/redesign/05-cinema.md §1). Plain functions of
 * scroll progress, used inside useTransform; nothing here allocates per frame.
 */
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 0 → 1 as p goes from a to b. */
export const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));

/** cubic-bezier(0.16, 1, 0.3, 1): entrances (expo out). */
export const enter = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

/** cubic-bezier(0.65, 0, 0.35, 1): camera moves (cubic in-out). */
export const camera = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** cubic-bezier(0.7, 0, 0.84, 0): exits. */
export const exit = (t: number) => t * t * t;

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** In over [a, b], hold, out over [c, d]: the life of a subtitle or a layer. */
export const window4 = (p: number, a: number, b: number, c: number, d: number) => enter(seg(p, a, b)) * (1 - exit(seg(p, c, d)));

/** Rounds for style strings, so identical frames write identical strings. */
export const r2 = (n: number) => Math.round(n * 100) / 100;
