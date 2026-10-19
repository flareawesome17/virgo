/**
 * The deep-sky scene (Ch3, the Finale): Virgo's 14 stars at their real
 * distances, the figure's edges growing in, Syrma's socket and ignition,
 * the crew's threads carried up from the map, and the cast's glide from
 * the map into the sky. Also Virgo over Cebu City in the geo scene (Ch8's
 * "a crew like this one"). Loaded on its own, after the first paint, so the
 * sky's first chunk carries none of it (or the constellation data).
 *
 * The forming has to read (the owner never saw it): each edge draws with a
 * spark of light at its growing tip, over a soft bloom (two wide faint
 * strokes under the hairline: no blur, no filter); when the figure
 * completes a pulse of light runs through it; and the cast, who are people,
 * carry diffraction spikes and breathe.
 */
import { CAST_STARS, SEGMENTS, STARS, starRadius, type StarId } from '../data/constellation';
import { easeCamera, project, span, type Projected, type View } from './camera';
import { GOLD, LINE, paintFeatured, phaseOf, stroke, type Ctx, type Painter } from './paint';
import { sizeIndex } from './sprites';
import type { DeepState, GeoFigure } from './types';

const a: Projected = { x: 0, y: 0, depth: 0 };

const CAST = new Set<StarId>(Object.values(CAST_STARS));
const FIGURE = SEGMENTS.filter((s) => !s.heldBack);
const HELD = SEGMENTS.filter((s) => s.heldBack);
/** Screen positions of the 14 stars this frame, by id. */
const screen = new Map<StarId, { x: number; y: number; ok: boolean; size: number }>(
  STARS.map((s) => [s.id, { x: 0, y: 0, ok: false, size: 0 }]),
);
const g0: Projected = { x: 0, y: 0, depth: 0 };
/** Each star's own breathing beat. */
const PHASE = new Map<StarId, number>(STARS.map((s) => [s.id, phaseOf(s.pos[0], s.pos[2])]));

/** Each segment's 0..1 for a `form` of 0..1: in figure order, overlapping. */
function grow(form: number, i: number, count: number): number {
  const len = 0.24;
  const start = (i * (1 - len)) / Math.max(1, count - 1);
  return span(form, start, start + len);
}

/** A path of segments, drawn three times: two wide faint strokes for the bloom, then the hairline. */
function bloomStroke(g: Ctx, alpha: number, width: number, bloom: number) {
  if (bloom > 0.01) {
    stroke(g, alpha * 0.07 * bloom, width * 6, LINE);
    stroke(g, alpha * 0.16 * bloom, width * 2.6, LINE);
  }
  stroke(g, alpha, width, LINE);
}

/** A spark at a growing edge's tip: the pen of light drawing the figure. */
function spark(p: Painter, x: number, y: number, alpha: number) {
  if (alpha < 0.02 || p.count + 2 > p.budget) return;
  p.g.globalAlpha = Math.min(1, alpha * 0.7);
  p.g.drawImage(p.sprites.glow, x - 14, y - 14, 28, 28);
  p.g.globalAlpha = Math.min(1, alpha);
  p.g.drawImage(p.sprites.star[0][1], x - 4, y - 4, 8, 8);
  p.count += 2;
}

export function paintDeep(p: Painter, v: View, deep: DeepState, geo: View | null): void {
  const g = p.g;
  const opacity = deep.opacity;
  const glow = deep.glow ?? 0;
  const pulse = deep.pulse ?? 0;
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

  // The figure's lines, under the stars: brighter as it glows, and brighter still in the pulse.
  const lineAlpha = Math.min(1, (0.62 + 0.24 * glow + 0.14 * pulse) * opacity);
  const width = 1.25 + 0.35 * glow;
  const bloom = Math.min(1, glow + pulse);
  g.beginPath();
  const tips: { x: number; y: number; t: number }[] = [];
  FIGURE.forEach((seg, i) => {
    const t = grow(deep.form, i, FIGURE.length);
    if (t <= 0) return;
    const sa = screen.get(seg.a)!;
    const sb = screen.get(seg.b)!;
    if (!sa.ok || !sb.ok) return;
    const x = sa.x + (sb.x - sa.x) * t;
    const y = sa.y + (sb.y - sa.y) * t;
    g.moveTo(sa.x, sa.y);
    g.lineTo(x, y);
    if (t < 1) tips.push({ x, y, t });
  });
  bloomStroke(g, lineAlpha, width, bloom);
  const heldT = span(deep.syrma, 0.35, 1);
  if (heldT > 0) {
    g.beginPath();
    for (const seg of HELD) {
      const sa = screen.get(seg.a)!;
      const sb = screen.get(seg.b)!;
      if (!sa.ok || !sb.ok) continue;
      // Both grow out of Syrma's neighbours toward and away from it, in figure order.
      const x = sa.x + (sb.x - sa.x) * heldT;
      const y = sa.y + (sb.y - sa.y) * heldT;
      g.moveTo(sa.x, sa.y);
      g.lineTo(x, y);
      if (heldT < 1) tips.push({ x, y, t: heldT });
    }
    bloomStroke(g, lineAlpha, width, bloom);
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
  const featured = (deep.featured ?? 0) * opacity;
  for (const s of STARS) {
    const at = screen.get(s.id)!;
    // Up to four sprites each (a glow, then the star): never past the budget; spikes check their own.
    if (!at.ok || p.count + 4 > p.budget) continue;
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
    // Every star of the formed figure takes a little light in the glow, and more in the pulse.
    const light = isCast ? cast * 0.85 : (0.32 * glow + 0.55 * pulse) * (deep.form >= 1 ? 1 : 0);
    if (light > 0.01) {
      const hs = size * (isCast ? 3.6 : 3) * (1 + 0.35 * pulse);
      g.globalAlpha = Math.min(1, light * alpha);
      g.drawImage(p.sprites.glow, at.x - hs / 2, at.y - hs / 2, hs, hs);
      p.count++;
    }
    g.globalAlpha = Math.min(1, alpha);
    g.drawImage(p.sprites.star[isCast && cast > 0.5 ? 1 : 0][sizeIndex(size)], at.x - size / 2, at.y - size / 2, size, size);
    p.count++;
    if (isCast && featured > 0.01) paintFeatured(p, at.x, at.y, size, alpha, featured * (0.7 + 0.3 * cast), PHASE.get(s.id)!);
  }
  for (const tip of tips) spark(p, tip.x, tip.y, Math.sin(Math.PI * tip.t) * opacity);
}

/** A deep-scene star's screen position this frame (after any morph), for labels. */
export function deepScreen(id: StarId): { x: number; y: number; ok: boolean } | undefined {
  return screen.get(id);
}

// ─── Virgo over Cebu City (geo scene) ────────────────────────────────────

const figureScreen = new Map<StarId, { x: number; y: number; ok: boolean; depth: number }>(STARS.map((s) => [s.id, { x: 0, y: 0, ok: false, depth: 0 }]));

/**
 * Mika's crew as Virgo, hovering over her city in the geo scene like the
 * other crews' figures over theirs (Ch8): the figure as Ch3 left it (Syrma
 * and its two segments stay dark until the Finale), a glow at its heart, a
 * thread of light down to the city, and the cast's four stars as people.
 */
export function paintFigure(p: Painter, v: View, fig: GeoFigure, opacity: number): void {
  const alpha = fig.opacity * opacity;
  if (alpha < 0.01) return;
  const g = p.g;
  const [cx, cy, cz] = fig.center;
  const [rx, ry, rz] = fig.right;
  const [ux, uy, uz] = fig.up;
  let shown = 0;
  for (const s of STARS) {
    const at = figureScreen.get(s.id)!;
    const k = fig.scale;
    project(v, cx + k * (s.gx * rx - s.gy * ux), cy + k * (s.gx * ry - s.gy * uy), cz + k * (s.gx * rz - s.gy * uz), a);
    at.ok = a.depth > v.range * 0.02;
    at.x = a.x;
    at.y = a.y;
    at.depth = a.depth;
    if (at.ok) shown++;
  }
  if (!shown) return;
  // The thread down to the city, from the figure's heart.
  project(v, cx, cy, cz, a);
  const heart = a.depth > v.range * 0.02 ? { x: a.x, y: a.y, depth: a.depth } : null;
  if (fig.ground && heart) {
    project(v, fig.ground[0], fig.ground[1], fig.ground[2], g0);
    if (g0.depth > 0) {
      g.beginPath();
      g.moveTo(g0.x, g0.y);
      g.lineTo(heart.x, heart.y);
      stroke(g, 0.26 * alpha, 1, LINE);
    }
  }
  g.beginPath();
  for (const seg of FIGURE) {
    const sa = figureScreen.get(seg.a)!;
    const sb = figureScreen.get(seg.b)!;
    if (!sa.ok || !sb.ok) continue;
    g.moveTo(sa.x, sa.y);
    g.lineTo(sb.x, sb.y);
  }
  bloomStroke(g, 0.7 * alpha, 1.2, 0.6);
  if (heart && p.count < p.budget) {
    const gs = Math.min(220, Math.max(40, (v.focal / heart.depth) * fig.scale * 0.5));
    g.globalAlpha = Math.min(1, 0.3 * alpha);
    g.drawImage(p.sprites.glow, heart.x - gs / 2, heart.y - gs / 2, gs, gs);
    p.count++;
  }
  for (const s of STARS) {
    const at = figureScreen.get(s.id)!;
    if (s.id === 'iota' || !at.ok || p.count + 4 > p.budget) continue;
    const cue = Math.min(1.8, Math.max(0.7, Math.sqrt(v.range / at.depth)));
    const size = starRadius(s.mag, 1.5, 3.6) * 3.2 * cue;
    if (at.x < -size || at.x > v.width + size || at.y < -size || at.y > v.height + size) continue;
    const isCast = CAST.has(s.id);
    g.globalAlpha = Math.min(1, alpha);
    g.drawImage(p.sprites.star[isCast ? 1 : 0][sizeIndex(size)], at.x - size / 2, at.y - size / 2, size, size);
    p.count++;
    if (isCast) paintFeatured(p, at.x, at.y, size, alpha, 0.85, PHASE.get(s.id)!);
  }
}
