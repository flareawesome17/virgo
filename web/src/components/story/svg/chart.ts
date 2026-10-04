/**
 * Geometry the static Virgo SVGs share: the figure's chart coordinates
 * (constellation.ts `x`, `y`, east on the left) scaled into a viewBox, and
 * the segments as path data. Pure, so the server renders it once.
 */
import { SEGMENTS, STARS, type StarId, type VirgoStar } from '../data/constellation';

/** Chart units per viewBox unit: the 0..1 square becomes 0..100. */
export const U = 100;
/** The figure's own box in the 0..1 square (x spans 0..1; y is letterboxed). */
const Y0 = Math.min(...STARS.map((s) => s.y));
const Y1 = Math.max(...STARS.map((s) => s.y));

/** A viewBox around the figure with `pad` chart units on every side, and its aspect. */
export function chartBox(pad = 6): { attr: string; x: number; y: number; width: number; height: number } {
  const x = -pad;
  const y = Y0 * U - pad;
  const width = U + 2 * pad;
  const height = (Y1 - Y0) * U + 2 * pad;
  return { attr: `${x} ${y.toFixed(2)} ${width} ${height.toFixed(2)}`, x, y, width, height };
}

export const BY_ID = new Map<StarId, VirgoStar>(STARS.map((s) => [s.id, s]));

const pt = (id: StarId) => {
  const s = BY_ID.get(id)!;
  return `${(s.x * U).toFixed(2)} ${(s.y * U).toFixed(2)}`;
};

/** One path for the figure: its 12 segments, plus Syrma's two when `withHeld`. */
export function figurePath(withHeld: boolean): string {
  return SEGMENTS.filter((s) => withHeld || !s.heldBack)
    .map((s) => `M${pt(s.a)}L${pt(s.b)}`)
    .join('');
}

/** A star's position as a percentage of a `chartBox`, for HTML labels laid over the SVG. */
export function percentIn(box: { x: number; y: number; width: number; height: number }, s: VirgoStar) {
  return { left: `${(((s.x * U - box.x) / box.width) * 100).toFixed(2)}%`, top: `${(((s.y * U - box.y) / box.height) * 100).toFixed(2)}%` };
}
