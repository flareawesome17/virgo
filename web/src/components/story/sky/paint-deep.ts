/**
 * The deep-sky scene (Ch3, the Finale): Virgo's 14 stars at their real
 * distances, the figure's edges growing in, Syrma's socket and ignition,
 * the crew's threads carried up from the map, and the cast's glide from
 * the map into the sky. Loaded on its own, after the first paint, so the
 * sky's first chunk carries none of it (or the constellation data).
 */
import { CAST_STARS, SEGMENTS, STARS, starRadius, type StarId } from '../data/constellation';
import { easeCamera, project, span, type Projected, type View } from './camera';
import { GOLD, LINE, stroke, type Painter } from './paint';
import { sizeIndex } from './sprites';
import type { DeepState } from './types';

const a: Projected = { x: 0, y: 0, depth: 0 };

const CAST = new Set<StarId>(Object.values(CAST_STARS));
const FIGURE = SEGMENTS.filter((s) => !s.heldBack);
const HELD = SEGMENTS.filter((s) => s.heldBack);
/** Screen positions of the 14 stars this frame, by id. */
const screen = new Map<StarId, { x: number; y: number; ok: boolean; size: number }>(
  STARS.map((s) => [s.id, { x: 0, y: 0, ok: false, size: 0 }]),
);
const g0: Projected = { x: 0, y: 0, depth: 0 };

/** Each segment's 0..1 for a `form` of 0..1: in figure order, overlapping. */
function grow(form: number, i: number, count: number): number {
  const len = 0.24;
  const start = (i * (1 - len)) / Math.max(1, count - 1);
  return span(form, start, start + len);
}

export function paintDeep(p: Painter, v: View, deep: DeepState, geo: View | null): void {
  const g = p.g;
  const opacity = deep.opacity;
  // Where each star is: on the figure, or partway from the map.
  const mt = deep.morph ? easeCamera(Math.min(1, Math.max(0, deep.morph.t))) : 1;
  for (const s of STARS) {
    const at = screen.get(s.id)!;
    project(v, s.pos[0], s.pos[1], s.pos[2], a);
    at.ok = a.depth > 0.5;
    at.x = a.x;
    at.y = a.y;
    const from = deep.morph?.from[s.id];
    if (from && geo && mt < 1) {
      project(geo, from[0], from[1], from[2], g0);
      if (g0.depth > 0 && at.ok) {
        at.x = g0.x + (a.x - g0.x) * mt;
        at.y = g0.y + (a.y - g0.y) * mt;
      } else if (g0.depth > 0) {
        at.x = g0.x;
        at.y = g0.y;
        at.ok = true;
      }
    }
    // Apparent size: the chart's, scaled softly by how much nearer or farther the camera is than Earth.
    const dist = Math.hypot(s.pos[0] - v.px, s.pos[1] - v.py, s.pos[2] - v.pz);
    const near = Math.min(1.8, Math.max(0.72, Math.pow(s.ly / Math.max(1, dist), 0.35)));
    at.size = starRadius(s.mag, 1.7, 4.4) * 6 * near;
  }

  // The figure's lines, under the stars.
  const lineAlpha = 0.62 * opacity;
  g.beginPath();
  FIGURE.forEach((seg, i) => {
    const t = grow(deep.form, i, FIGURE.length);
    if (t <= 0) return;
    const sa = screen.get(seg.a)!;
    const sb = screen.get(seg.b)!;
    if (!sa.ok || !sb.ok) return;
    g.moveTo(sa.x, sa.y);
    g.lineTo(sa.x + (sb.x - sa.x) * t, sa.y + (sb.y - sa.y) * t);
  });
  stroke(g, lineAlpha, 1.25, LINE);
  const heldT = span(deep.syrma, 0.35, 1);
  if (heldT > 0) {
    g.beginPath();
    for (const seg of HELD) {
      const sa = screen.get(seg.a)!;
      const sb = screen.get(seg.b)!;
      if (!sa.ok || !sb.ok) continue;
      // Both grow out of Syrma's neighbours toward and away from it, in figure order.
      g.moveTo(sa.x, sa.y);
      g.lineTo(sa.x + (sb.x - sa.x) * heldT, sa.y + (sb.y - sa.y) * heldT);
    }
    stroke(g, lineAlpha, 1.25, LINE);
  }

  // The crew's threads, carried up from the map: each of the hired three to Mika's star.
  const crew = (deep.crew ?? 0) * opacity;
  if (crew > 0.01) {
    const lead = screen.get(CAST_STARS.mika)!;
    g.beginPath();
    for (const id of [CAST_STARS.ernie, CAST_STARS.kenn, CAST_STARS.bea]) {
      const s = screen.get(id)!;
      if (!s.ok || !lead.ok) continue;
      g.moveTo(s.x, s.y);
      g.lineTo(lead.x, lead.y);
    }
    stroke(g, 0.7 * crew, 1.4, LINE);
  }

  // The stars.
  const cast = deep.cast ?? 0;
  for (const s of STARS) {
    const at = screen.get(s.id)!;
    // Up to three sprites each (an ignition or cast glow, then the star): never past the budget.
    if (!at.ok || p.count + 3 > p.budget) continue;
    const isHeld = s.id === 'iota';
    let alpha = deep.stars * opacity;
    let size = at.size;
    if (isHeld) {
      // An unlit socket until the Finale: a hollow ring where the star will be.
      const socket = (1 - deep.syrma) * alpha;
      if (socket > 0.01) {
        g.beginPath();
        g.arc(at.x, at.y, 4.5, 0, Math.PI * 2);
        stroke(g, 0.5 * socket, 1, GOLD);
      }
      alpha *= deep.syrma;
      size *= 0.4 + 0.6 * deep.syrma;
      const ignite = Math.sin(Math.PI * Math.min(1, deep.syrma)) * opacity;
      if (ignite > 0.01) {
        const hs = at.size * 5;
        g.globalAlpha = ignite * 0.9;
        g.drawImage(p.sprites.glow, at.x - hs / 2, at.y - hs / 2, hs, hs);
        p.count++;
      }
    }
    if (alpha < 0.01) continue;
    const isCast = CAST.has(s.id);
    if (isCast && cast > 0.01) {
      const hs = size * 3.6;
      g.globalAlpha = Math.min(1, cast * alpha * 0.85);
      g.drawImage(p.sprites.glow, at.x - hs / 2, at.y - hs / 2, hs, hs);
      p.count++;
    }
    g.globalAlpha = Math.min(1, alpha);
    g.drawImage(p.sprites.star[isCast && cast > 0.5 ? 1 : 0][sizeIndex(size)], at.x - size / 2, at.y - size / 2, size, size);
    p.count++;
  }
}

/** A deep-scene star's screen position this frame (after any morph), for labels. */
export function deepScreen(id: StarId): { x: number; y: number; ok: boolean } | undefined {
  return screen.get(id);
}

