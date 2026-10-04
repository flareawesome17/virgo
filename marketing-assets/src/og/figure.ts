/**
 * The OG card's Virgo: all 14 stars and 14 segments (Syrma lit, the figure
 * complete, as the Finale ends), seen from Earth with the page's own camera
 * (scenes.ts `earthRig`), sprites and field. On top, inside frames 36–150
 * only, one pulse of light leaves Spica and runs every edge of the figure,
 * splitting at Porrima, flaring each star as it arrives, and a soft twinkle;
 * outside that window every frame is the same still card.
 */
import {
  LINE,
  SEGMENTS,
  STARS,
  deepField,
  earthRig,
  paintCloud,
  project,
  rig,
  sizeIndex,
  starRadius,
  view,
  type CloudLook,
  type Painter,
  type Projected,
  type StarId,
  type View,
} from "../site";
import { ENGINE, sprites } from "../sky/still-sky";

/** Where the figure sits on the card: the right side, clear of the copy. Fractions of the card: left, top, right, bottom. */
export const FIGURE_RECT = [0.555, 0.1, 0.985, 0.9] as const;

/** The motion window (storyboard §4.1, C2): everything starts and settles inside it. */
export const WINDOW = { start: 36, end: 150 } as const;

/** The pulse's front leaves Spica at PULSE.from and reaches the far ends by PULSE.to. */
const PULSE = { from: 40, to: 136 } as const;

export type FigureLayout = {
  readonly view: View;
  readonly at: ReadonlyMap<StarId, { readonly x: number; readonly y: number; readonly size: number; readonly mag: number }>;
  /** Shortest distance along the figure's edges from Spica to each star, px. */
  readonly reach: ReadonlyMap<StarId, number>;
  /** The farthest any star is from Spica along the edges, px. */
  readonly farthest: number;
};

export function figureLayout(width: number, height: number): FigureLayout {
  const v = view(rig(earthRig(width, height, { rect: FIGURE_RECT, margin: 0.06 })), width, height);
  const pt: Projected = { x: 0, y: 0, depth: 0 };
  const at = new Map<StarId, { x: number; y: number; size: number; mag: number }>();
  for (const s of STARS) {
    project(v, s.pos[0], s.pos[1], s.pos[2], pt);
    // The deep painter's size for a star seen from Earth (paint-deep.ts), a little larger so it reads at thumbnail size.
    at.set(s.id, { x: pt.x, y: pt.y, size: starRadius(s.mag, 1.7, 4.4) * 6 * 1.18, mag: s.mag });
  }
  // Dijkstra from Spica over the figure's segments, in screen pixels.
  const reach = new Map<StarId, number>(STARS.map((s) => [s.id, Infinity]));
  reach.set("alpha", 0);
  const done = new Set<StarId>();
  while (done.size < STARS.length) {
    let next: StarId | null = null;
    for (const [id, d] of reach) if (!done.has(id) && (next === null || d < reach.get(next)!)) next = id;
    if (next === null || !Number.isFinite(reach.get(next)!)) break;
    done.add(next);
    for (const seg of SEGMENTS) {
      const other = seg.a === next ? seg.b : seg.b === next ? seg.a : null;
      if (!other || done.has(other)) continue;
      const a = at.get(next)!;
      const b = at.get(other)!;
      const d = reach.get(next)! + Math.hypot(b.x - a.x, b.y - a.y);
      if (d < reach.get(other)!) reach.set(other, d);
    }
  }
  const farthest = Math.max(...reach.values());
  return { view: v, at, reach, farthest };
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** A gentle ease in and out for the front: cubic-bezier(0.45, 0, 0.55, 1), near enough. */
const easeFront = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2) * 0.35 + t * 0.65;

/** The pulse's state at a frame: where its front is (px along the edges from Spica) and how strong it is. Null outside the window. */
export function pulseAt(frame: number, layout: FigureLayout): { front: number; strength: number; sigma: number } | null {
  if (frame <= WINDOW.start || frame >= WINDOW.end) return null;
  const sigma = 26;
  const t = Math.min(1, Math.max(0, (frame - PULSE.from) / (PULSE.to - PULSE.from)));
  const front = -2 * sigma + (layout.farthest + 4 * sigma) * easeFront(t);
  const strength = smooth(WINDOW.start, WINDOW.start + 8, frame) * (1 - smooth(WINDOW.end - 12, WINDOW.end, frame));
  return { front, strength, sigma };
}

/** The soft twinkle's envelope: 0 at both ends of the window, so frames outside it are untouched. */
export function twinkleEnvelope(frame: number): number {
  if (frame <= WINDOW.start || frame >= WINDOW.end) return 0;
  return smooth(WINDOW.start, WINDOW.start + 24, frame) * (1 - smooth(WINDOW.end - 24, WINDOW.end, frame));
}

/** Twinkle cycles per 240 frames for each star (whole numbers) and phases, fixed per star. */
const TWINKLE = new Map<StarId, { k: number; phase: number }>(STARS.map((s, i) => [s.id, { k: 3 + ((i * 5) % 7), phase: (i * 2.399963) % 6.283185 }]));

/** The far field behind the figure, as the page's engine draws it in the deep scene. */
export function paintField(g: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, layout: FigureLayout, opacity: number): void {
  const p: Painter = { g, sprites: sprites(1), count: 0, budget: 1e9, time: 0 };
  const look: CloudLook = { base: ENGINE.FIELD_BASE, opacity, twinkle: false, floor: 0.7, glow: ENGINE.CLOUD_GLOW };
  paintCloud(p, layout.view, deepField(240), look, 0);
  g.globalAlpha = 1;
}

/** The figure at rest: its lines under its stars, Spica gold. */
export function paintFigure(g: CanvasRenderingContext2D, layout: FigureLayout, frame: number, loopFrames: number): void {
  const s = sprites(1);
  g.lineCap = "round";
  g.lineJoin = "round";
  g.beginPath();
  for (const seg of SEGMENTS) {
    const a = layout.at.get(seg.a)!;
    const b = layout.at.get(seg.b)!;
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
  }
  g.globalAlpha = 0.5;
  g.lineWidth = 1.9;
  g.strokeStyle = LINE;
  g.stroke();

  const env = twinkleEnvelope(frame);
  const theta = (2 * Math.PI * frame) / loopFrames;
  for (const star of STARS) {
    const at = layout.at.get(star.id)!;
    const tw = TWINKLE.get(star.id)!;
    const twinkle = env ? 1 + 0.22 * env * Math.sin(tw.k * theta + tw.phase) : 1;
    const isSpica = star.id === "alpha";
    const size = at.size * (env ? 1 + 0.06 * (twinkle - 1) / 0.22 : 1);
    if (isSpica) {
      const hs = size * 3.4;
      g.globalAlpha = 0.62 * twinkle;
      g.drawImage(s.glow, at.x - hs / 2, at.y - hs / 2, hs, hs);
    }
    g.globalAlpha = Math.min(1, 0.92 * twinkle);
    g.drawImage(s.star[isSpica ? 1 : 0][sizeIndex(size)], at.x - size / 2, at.y - size / 2, size, size);
  }
  g.globalAlpha = 1;
}

/** The pulse: the edges brighten under its front, a bright head runs ahead, and each star flares as it arrives. */
export function paintPulse(g: CanvasRenderingContext2D, layout: FigureLayout, frame: number): void {
  const pulse = pulseAt(frame, layout);
  if (!pulse || pulse.strength <= 0) return;
  const s = sprites(1);
  const { front, sigma, strength } = pulse;
  g.save();
  g.globalCompositeOperation = "lighter";
  g.lineCap = "round";
  for (const seg of SEGMENTS) {
    const a = layout.at.get(seg.a)!;
    const b = layout.at.get(seg.b)!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const ra = layout.reach.get(seg.a)!;
    const rb = layout.reach.get(seg.b)!;
    // The edge's light as one gradient stroke along it: no beads where pieces would overlap.
    const steps = Math.max(8, Math.ceil(length / 4));
    const light = g.createLinearGradient(a.x, a.y, b.x, b.y);
    let lit = false;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // When the front reaches this point: from whichever end it gets to first.
      const arrive = Math.min(ra + t * length, rb + (1 - t) * length);
      const k = (front - arrive) / sigma;
      // A bright crest just behind the front, and a short afterglow.
      const glow = k > -1.2 ? Math.exp(-k * k * 0.9) + (k > 0 ? 0.25 * Math.exp(-k * 0.35) : 0) : 0;
      const alpha = Math.min(1, 0.85 * glow * strength);
      if (alpha >= 0.01) lit = true;
      light.addColorStop(t, `rgba(240,200,142,${alpha.toFixed(4)})`);
    }
    if (lit) {
      g.globalAlpha = 1;
      g.lineWidth = 2.6;
      g.strokeStyle = light;
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
    }
    // The heads: where the front is on this edge, coming from either end.
    for (const [from, r, dir] of [
      [a, ra, 1],
      [b, rb, -1],
    ] as const) {
      const along = front - r;
      if (along < 0 || along > length) continue;
      // Only the front that reaches this point first draws a head here.
      const first = r + along <= (dir === 1 ? rb : ra) + (length - along);
      if (!first) continue;
      const t = along / length;
      const x = dir === 1 ? from.x + (b.x - a.x) * t : from.x + (a.x - b.x) * t;
      const y = dir === 1 ? from.y + (b.y - a.y) * t : from.y + (a.y - b.y) * t;
      const hs = 30;
      g.globalAlpha = Math.min(1, 0.7 * strength);
      g.drawImage(s.glow, x - hs / 2, y - hs / 2, hs, hs);
      g.globalAlpha = Math.min(1, 0.95 * strength);
      g.drawImage(s.star[1][1], x - 5, y - 5, 10, 10);
    }
  }
  // Each star flares as the front arrives.
  for (const star of STARS) {
    const at = layout.at.get(star.id)!;
    const k = (front - layout.reach.get(star.id)!) / (sigma * 0.9);
    const flare = Math.exp(-k * k) * strength;
    if (flare < 0.01) continue;
    const hs = at.size * (2.4 + 1.8 * flare);
    g.globalAlpha = Math.min(1, 0.75 * flare);
    g.drawImage(s.glow, at.x - hs / 2, at.y - hs / 2, hs, hs);
    const cs = at.size * (1 + 0.35 * flare);
    g.globalAlpha = Math.min(1, 0.6 * flare);
    g.drawImage(s.star[1][sizeIndex(cs)], at.x - cs / 2, at.y - cs / 2, cs, cs);
  }
  g.restore();
}

