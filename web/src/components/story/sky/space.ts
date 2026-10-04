/**
 * Deep space behind both of the sky's scenes (the owner's 2026-10-05 note:
 * "add more to it to feel like a space"): a far, dense star field, a soft
 * Milky Way band, two faint nebulae, a slow twinkle among the far stars, and
 * a rare shooting star. All of it is drawn into the engine's own canvas.
 *
 * Two textures, made here once at runtime from a seed (no files, no fetch):
 * - The glow panorama: the band and the nebulae over a rectangle of the
 *   sky-plane (space-size.ts PANORAMA), at 1.5 to 2 texels a degree. It is
 *   soft by nature, so it is scaled up on screen and costs one drawImage a
 *   frame. Built in slices at idle; about 0.25 M texels on phones, 0.44 M on
 *   desktop.
 * - The far-star tile: 512 CSS px square at the engine's DPR (≤ 2; ≤ 1.5 on
 *   phones), a few hundred tiny faint stars. Drawn at two scales and two
 *   offsets, so it reads as two depths and never visibly repeats.
 *
 * The sky-plane: a is the camera's heading and b its elevation, in degrees,
 * in whichever scene is in play (when both are, their views are blended by
 * opacity, so the sky pans from one to the other). These layers count as
 * infinitely far: they turn with the camera and ignore its travel. They turn
 * at about half its rate, and zoom a little as the geo camera comes down, the
 * panorama least and the nearer tile most, so they read as the farthest
 * things in the picture: the star cloud and the motes in front move more.
 *
 * Mapping: a sky-plane point (a, b) lands at
 *   x = cx + S·(a − a_cam),  y = cy − S·(b − b_cam),
 *   S = focal · k · π/180 · (1 + zoom · cue),
 * with k and zoom per layer and `cue` 0 at 1,000 units up, 1 at 5.
 *
 * Composition (sky-plane degrees; QA can move these): the band crosses the
 * descent and Nearby's radar and stays off Virgo's patch in Ch3; the warm
 * nebula sits beyond the figure's east end in Ch3; the small violet-leaning
 * one sits low and right of the landing over Cebu.
 */
import type { View } from './camera';
import type { Painter, Pass } from './paint';
import { PANORAMA, TILE_CSS, panoramaSize, tileSize } from './space-size';
import { context, release, sizeIndex, surface, type Surface } from './sprites';

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/** Turn rate (k) and altitude zoom per layer: the panorama is the farthest. */
const PAN = { k: 0.5, zoom: 0.14 } as const;
const TILES = [
  { k: 0.62, zoom: 0.24, scale: 1, alpha: 1, shift: [0, 0] },
  { k: 0.55, zoom: 0.18, scale: 0.64, alpha: 0.78, shift: [0.37, 0.61] },
] as const;
const TWINKLE = { k: 0.58, zoom: 0.2 } as const;

/** The Milky Way: a line through P0 at θ, a bright core, a wide halo, a dark rift. */
const BAND = { a: 75, b: -45, angle: 35, core: 6.5, halo: 17, wide: 32, alpha: 0.19 } as const;
const BAND_CORE = [255, 226, 186] as const;
const BAND_HALO = [188, 128, 86] as const;

type Nebula = {
  readonly a: number;
  readonly b: number;
  /** Radii along and across its long axis, degrees, and that axis's angle. */
  readonly ra: number;
  readonly rb: number;
  readonly angle: number;
  readonly alpha: number;
  readonly outer: readonly [number, number, number];
  /** The inner colour: a faint, warm-leaning violet. */
  readonly inner: readonly [number, number, number];
  readonly seed: number;
};

const NEBULAE: readonly Nebula[] = [
  { a: -56, b: 24, ra: 24, rb: 14, angle: 28, alpha: 0.2, outer: [196, 116, 88], inner: [126, 100, 158], seed: 11 },
  { a: 50, b: -80, ra: 15, rb: 10, angle: -35, alpha: 0.17, outer: [182, 108, 96], inner: [112, 96, 166], seed: 29 },
];

/** Far stars per tile and twinkling stars over the panorama, by variant. */
const COUNTS = { desktop: { tile: 520, twinkle: 140 }, mobile: { tile: 440, twinkle: 130 } } as const;
/** Floats per twinkling star: a, b, size (CSS px), alpha, phase, speed, tint. */
const TW = 7;

export type SpaceArt = {
  readonly pan: Surface;
  /** Panorama texels per degree. */
  readonly texels: number;
  readonly tile: Surface | null;
  readonly twinklers: Float32Array;
  readonly count: number;
};

/** Where deep space is on screen this frame. */
export type SpaceView = {
  /** The camera's heading and elevation on the sky-plane, degrees. */
  a: number;
  b: number;
  focal: number;
  cx: number;
  cy: number;
  /** 0 high above the map (or in deep space), 1 down near the ground. */
  cue: number;
  alpha: number;
  w: number;
  h: number;
};

// ─── Noise and seeds ─────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(x: number, y: number, s: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise, 0..1. */
function noise(x: number, y: number, s: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const p = hash(xi, yi, s);
  const q = hash(xi + 1, yi, s);
  const r = hash(xi, yi + 1, s);
  const t = hash(xi + 1, yi + 1, s);
  return p + (q - p) * u + (r - p) * v + (p - q - r + t) * u * v;
}

/** Fractal noise, about 0..1. */
function fbm(x: number, y: number, s: number, octaves: number): number {
  let total = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    total += amp * noise(x, y, s + i * 101);
    norm += amp;
    x = x * 2.03 + 17.1;
    y = y * 2.03 - 9.7;
    amp *= 0.5;
  }
  return total / norm;
}

const smooth = (a: number, b: number, t: number) => {
  const x = t <= a ? 0 : t >= b ? 1 : (t - a) / (b - a);
  return x * x * (3 - 2 * x);
};

// ─── Building ────────────────────────────────────────────────────────────

/**
 * Builds deep space a slice at a time, so no frame of the page's first
 * seconds waits on it: `step(ms)` works for about that long and says whether
 * it has finished. The tile and the twinkling stars come first (a few ms),
 * then the panorama row by row.
 */
export class SpaceBuilder {
  private readonly variant: 'desktop' | 'mobile';
  private readonly dpr: number;
  private readonly size: ReturnType<typeof panoramaSize>;
  private pixels: Uint8ClampedArray | null = null;
  private row = 0;
  private tile: Surface | null = null;
  private twinklers: Float32Array | null = null;
  private done: SpaceArt | null = null;
  private failed = false;

  constructor(variant: 'desktop' | 'mobile', dpr: number) {
    this.variant = variant;
    this.dpr = dpr;
    this.size = panoramaSize(variant);
  }

  get art(): SpaceArt | null {
    return this.done;
  }

  /** True when finished (or given up: then `art` stays null and the sky goes on without it). */
  step(budgetMs: number): boolean {
    if (this.done || this.failed) return true;
    const end = performance.now() + budgetMs;
    try {
      if (!this.twinklers) {
        this.twinklers = makeTwinklers(this.variant);
        this.tile = makeTile(this.variant, this.dpr);
        this.pixels = new Uint8ClampedArray(this.size.width * this.size.height * 4);
        if (performance.now() >= end) return false;
      }
      const { width, height } = this.size;
      const px = this.pixels!;
      while (this.row < height) {
        panoramaRow(px, width, this.row, this.size.texels);
        this.row++;
        if ((this.row & 3) === 0 && performance.now() >= end) return false;
      }
      const pan = surface(width, height);
      const g = context(pan);
      if (!g || typeof g.createImageData !== 'function') throw new Error('no 2D context for deep space');
      const image = g.createImageData(width, height);
      image.data.set(px);
      g.putImageData(image, 0, 0);
      this.pixels = null;
      this.done = { pan, texels: this.size.texels, tile: this.tile, twinklers: this.twinklers, count: this.twinklers.length / TW };
      return true;
    } catch {
      this.failed = true;
      this.dispose();
      return true;
    }
  }

  /** Lets go of everything built so far. */
  dispose(): void {
    release(this.tile);
    if (this.done) release(this.done.pan);
    this.tile = null;
    this.pixels = null;
    this.done = null;
  }
}

/** Gives the textures' memory back. */
export function releaseSpace(art: SpaceArt | null): void {
  if (!art) return;
  release(art.pan);
  release(art.tile);
}

const BAND_COS = Math.cos(BAND.angle * RAD);
const BAND_SIN = Math.sin(BAND.angle * RAD);
const NEB = NEBULAE.map((n) => ({ ...n, cos: Math.cos(n.angle * RAD), sin: Math.sin(n.angle * RAD), reach: 2 * Math.max(n.ra, n.rb) }));

/** One row of the panorama: the band, its rift and grain, and the nebulae, over premultiplied-free RGBA. */
function panoramaRow(px: Uint8ClampedArray, width: number, row: number, texels: number) {
  const b = PANORAMA.b1 - (row + 0.5) / texels;
  const edgeB = Math.min(b - PANORAMA.b0, PANORAMA.b1 - b);
  for (let col = 0; col < width; col++) {
    const a = PANORAMA.a0 + (col + 0.5) / texels;
    const ra = a - BAND.a;
    const rb = b - BAND.b;
    // Signed distance across the band, and position along it.
    const d = -ra * BAND_SIN + rb * BAND_COS;
    let bandA = 0;
    let r = 0;
    let gr = 0;
    let bl = 0;
    if (d > -80 && d < 80) {
      const along = ra * BAND_COS + rb * BAND_SIN;
      // The band wanders a little and swells and thins along its length.
      const dw = d - 4 * (noise(along / 46, 2.5, 3) - 0.5);
      const swell = 0.75 + 0.5 * noise(along / 60 + 8.2, 1.5, 5);
      const core = Math.exp(-(dw * dw) / (2 * BAND.core * BAND.core * swell * swell));
      const halo = Math.exp(-(dw * dw) / (2 * BAND.halo * BAND.halo * swell));
      const wide = Math.exp(-(d * d) / (2 * BAND.wide * BAND.wide));
      const clump = 0.35 + 0.65 * noise(along / 30 + 3.1, 0.5, 7);
      const mottle = fbm(a / 6.5, b / 6.5, 13, 3);
      // The dark rift: off the band's spine, wandering, broken into patches.
      const off = dw - 1.4 - 3 * (noise(along / 18, 4.5, 17) - 0.5);
      const rift = Math.exp(-(off * off) / (2 * 1.7 * 1.7)) * smooth(0.42, 0.7, fbm(along / 9, dw / 4 + 9, 19, 2));
      let lum = ((0.85 * core + 0.4 * halo) * clump * (0.4 + 1.15 * mottle) + 0.12 * wide) * (1 - 0.7 * rift);
      // Unresolved stars: a fine grain, only in the bright core.
      if (core > 0.12) {
        const h = hash(col, row, 23);
        if (h > 0.9) lum += core * (h - 0.9) * 5;
      }
      bandA = Math.min(1, lum) * BAND.alpha;
      const warm = Math.min(1, core * 1.25 + 0.25 * mottle);
      r = BAND_HALO[0] + (BAND_CORE[0] - BAND_HALO[0]) * warm;
      gr = BAND_HALO[1] + (BAND_CORE[1] - BAND_HALO[1]) * warm;
      bl = BAND_HALO[2] + (BAND_CORE[2] - BAND_HALO[2]) * warm;
    }
    // Premultiplied sums, so the band and a nebula add like light.
    let pr = r * bandA;
    let pg = gr * bandA;
    let pb = bl * bandA;
    let weight = bandA;
    let alpha = bandA;
    for (const n of NEB) {
      const da = a - n.a;
      const db = b - n.b;
      if (da < -n.reach || da > n.reach || db < -n.reach || db > n.reach) continue;
      const x = (da * n.cos + db * n.sin) / n.ra;
      const y = (-da * n.sin + db * n.cos) / n.rb;
      const q = (x * x + y * y) * (0.7 + 0.6 * fbm(a / 8 + n.seed, b / 8 - n.seed, n.seed, 3));
      if (q > 4) continue;
      const e = Math.exp(-2.1 * q);
      const wisp = 0.35 + 1.05 * fbm(a / 3.6 + n.seed, b / 3.6, n.seed + 5, 3);
      const na = Math.min(1, e * wisp) * n.alpha;
      if (na < 0.002) continue;
      const mix = smooth(0.4, 0.95, e) * 0.6;
      pr += (n.outer[0] + (n.inner[0] - n.outer[0]) * mix) * na;
      pg += (n.outer[1] + (n.inner[1] - n.outer[1]) * mix) * na;
      pb += (n.outer[2] + (n.inner[2] - n.outer[2]) * mix) * na;
      weight += na;
      alpha = 1 - (1 - alpha) * (1 - na);
    }
    if (alpha < 0.002) continue;
    // Fade to nothing at the panorama's edge, so its rectangle never shows.
    const edge = smooth(0, 22, Math.min(edgeB, a - PANORAMA.a0, PANORAMA.a1 - a));
    const o = (row * width + col) * 4;
    px[o] = pr / weight;
    px[o + 1] = pg / weight;
    px[o + 2] = pb / weight;
    px[o + 3] = alpha * edge * 255;
  }
}

/** The far-star tile: tiny faint stars, cream and gold, a rare cool one, wrapping at the edges. */
function makeTile(variant: 'desktop' | 'mobile', dpr: number): Surface | null {
  const size = tileSize(dpr);
  const s = surface(size);
  const g = context(s);
  if (!g || typeof g.createImageData !== 'function') return null;
  const image = g.createImageData(size, size);
  const px = image.data;
  const rnd = mulberry32(0x56495247 ^ 0x5ace);
  const scale = size / TILE_CSS;
  const plot = (x: number, y: number, alpha: number, c: readonly number[]) => {
    const xi = ((Math.floor(x) % size) + size) % size;
    const yi = ((Math.floor(y) % size) + size) % size;
    const o = (yi * size + xi) * 4;
    const a = Math.round(Math.min(1, alpha) * 255);
    if (a <= px[o + 3]) return;
    px[o] = c[0];
    px[o + 1] = c[1];
    px[o + 2] = c[2];
    px[o + 3] = a;
  };
  const COLOURS = [
    [255, 244, 230],
    [255, 236, 210],
    [246, 214, 168],
    [232, 232, 242],
  ] as const;
  for (let i = 0; i < COUNTS[variant].tile; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const k = rnd();
    const c = COLOURS[k < 0.5 ? 0 : k < 0.8 ? 1 : k < 0.95 ? 2 : 3];
    const u = rnd();
    const alpha = 0.14 + 0.42 * u * u;
    plot(x, y, alpha, c);
    if (rnd() < 0.07) {
      // A few brighter ones: a soft plus about one CSS pixel wide.
      const bright = Math.min(0.85, alpha + 0.3);
      plot(x, y, bright, c);
      if (scale > 1.2) {
        plot(x + 1, y, bright * 0.45, c);
        plot(x - 1, y, bright * 0.45, c);
        plot(x, y + 1, bright * 0.45, c);
        plot(x, y - 1, bright * 0.45, c);
      }
    }
  }
  g.putImageData(image, 0, 0);
  return s;
}

/** Twinkling far stars over the panorama's rectangle, a third of them gathered along the band. */
function makeTwinklers(variant: 'desktop' | 'mobile'): Float32Array {
  const rnd = mulberry32(0x56495247 ^ 0x7e1c);
  const n = COUNTS[variant].twinkle;
  const out = new Float32Array(n * TW);
  for (let i = 0; i < n; i++) {
    let a: number;
    let b: number;
    if (i % 3 === 0) {
      const along = (rnd() * 2 - 1) * 240;
      const across = (rnd() + rnd() + rnd() - 1.5) * 12;
      a = BAND.a + along * BAND_COS - across * BAND_SIN;
      b = BAND.b + along * BAND_SIN + across * BAND_COS;
    } else {
      a = PANORAMA.a0 + rnd() * (PANORAMA.a1 - PANORAMA.a0);
      b = PANORAMA.b0 + rnd() * (PANORAMA.b1 - PANORAMA.b0);
    }
    const o = i * TW;
    out[o] = a;
    out[o + 1] = b;
    out[o + 2] = 2.4 + 1.8 * rnd();
    out[o + 3] = 0.32 + 0.45 * rnd();
    out[o + 4] = rnd() * Math.PI * 2;
    out[o + 5] = 0.6 + 1.2 * rnd();
    out[o + 6] = rnd() < 0.3 ? 1 : 0;
  }
  return out;
}

// ─── Where it is ─────────────────────────────────────────────────────────

function heading(v: View): number {
  return Math.atan2(v.fx, v.fz) * DEG;
}
function elevation(v: View): number {
  return Math.asin(v.fy < -1 ? -1 : v.fy > 1 ? 1 : v.fy) * DEG;
}
/** 0 at 1,000 units above the map (or more), 1 at 5 units. */
function altitudeCue(v: View): number {
  const alt = v.py < 5 ? 5 : v.py > 1000 ? 1000 : v.py;
  return Math.log(1000 / alt) / Math.log(200);
}

/**
 * Deep space's view for a frame: the geo and deep views blended by their
 * opacities (so the sky pans from one to the other as they crossfade), its
 * strength the larger of the two times `strength`. Null when nothing shows.
 */
export function spaceView(
  gv: View | null,
  geoOpacity: number,
  dv: View | null,
  deepOpacity: number,
  strength: number,
  out: SpaceView,
): SpaceView | null {
  const wg = gv ? geoOpacity : 0;
  const wd = dv ? deepOpacity : 0;
  const alpha = Math.min(1, Math.max(wg, wd)) * strength;
  if (alpha < 0.004 || wg + wd <= 0) return null;
  const t = wd / (wg + wd);
  const g = gv ?? dv!;
  const d = dv ?? gv!;
  const ga = heading(g);
  let da = heading(d);
  if (da - ga > 180) da -= 360;
  else if (ga - da > 180) da += 360;
  out.a = ga + (da - ga) * t;
  out.b = elevation(g) + (elevation(d) - elevation(g)) * t;
  out.focal = g.focal + (d.focal - g.focal) * t;
  out.cx = g.cx + (d.cx - g.cx) * t;
  out.cy = g.cy + (d.cy - g.cy) * t;
  out.cue = (gv ? altitudeCue(gv) : 0) * (1 - t);
  out.alpha = alpha;
  out.w = g.width;
  out.h = g.height;
  return out;
}

// ─── Drawing ─────────────────────────────────────────────────────────────

/**
 * Deep space for one frame: the panorama and the two tile layers (pass 0 or
 * 1), then the twinkling far stars (pass 0 or 2; at rest when `twinkle` is
 * off). Every drawImage counts against the frame's sprite budget.
 */
export function paintSpace(p: Painter, art: SpaceArt, sv: SpaceView, pass: Pass, twinkle: boolean): void {
  const g = p.g;
  const { w, h } = sv;
  if (pass !== 2) {
    const s = sv.focal * PAN.k * RAD * (1 + PAN.zoom * sv.cue);
    const x0 = sv.cx + s * (PANORAMA.a0 - sv.a);
    const y0 = sv.cy - s * (PANORAMA.b1 - sv.b);
    const pw = s * (PANORAMA.a1 - PANORAMA.a0);
    const ph = s * (PANORAMA.b1 - PANORAMA.b0);
    if (x0 < w && y0 < h && x0 + pw > 0 && y0 + ph > 0 && p.count < p.budget) {
      g.globalAlpha = sv.alpha;
      g.drawImage(art.pan, x0, y0, pw, ph);
      p.count++;
    }
    if (art.tile) {
      for (const layer of TILES) {
        const zoom = 1 + layer.zoom * sv.cue;
        const size = TILE_CSS * layer.scale * zoom;
        const s = sv.focal * layer.k * RAD * zoom;
        // The sky-plane origin on screen, then tiles from just off the left and top edges.
        const ox = sv.cx - s * sv.a + layer.shift[0] * size;
        const oy = sv.cy + s * sv.b + layer.shift[1] * size;
        const x0 = ox - Math.ceil(ox / size) * size;
        const y0 = oy - Math.ceil(oy / size) * size;
        g.globalAlpha = sv.alpha * layer.alpha;
        for (let y = y0; y < h; y += size) {
          for (let x = x0; x < w; x += size) {
            if (p.count >= p.budget) return;
            g.drawImage(art.tile, x, y, size, size);
            p.count++;
          }
        }
      }
    }
  }
  if (pass === 1) return;
  const d = art.twinklers;
  const zoom = 1 + TWINKLE.zoom * sv.cue;
  const s = sv.focal * TWINKLE.k * RAD * zoom;
  const t = p.time;
  for (let i = 0, o = 0; i < art.count; i++, o += TW) {
    const x = sv.cx + s * (d[o] - sv.a);
    const y = sv.cy - s * (d[o + 1] - sv.b);
    const size = d[o + 2] * Math.sqrt(zoom);
    if (x < -size || x > w + size || y < -size || y > h + size) continue;
    // A gentle twinkle: between half and full brightness, never out.
    const wave = twinkle ? 0.5 + 0.5 * Math.sin(d[o + 4] + t * d[o + 5]) : 0.6;
    const alpha = d[o + 3] * sv.alpha * (0.5 + 0.5 * wave);
    if (alpha < 0.015) continue;
    if (p.count >= p.budget) return;
    g.globalAlpha = alpha > 1 ? 1 : alpha;
    g.drawImage(p.sprites.star[d[o + 6]][sizeIndex(size)], x - size / 2, y - size / 2, size, size);
    p.count++;
  }
}

// ─── Shooting stars ──────────────────────────────────────────────────────

/** A shooting star, held on the sky-plane so it moves with the sky if the page scrolls under it. */
export type Meteor = { t0: number; dur: number; a: number; b: number; da: number; db: number; tail: number; bright: number };

/** The rare shooting star's seed: the same sequence every visit. */
export const meteorRandom = () => mulberry32(0x56495247 ^ 0x3e7e0);

/** A shooting star starting now, somewhere in the upper part of the frame, falling at a slant. */
export function spawnMeteor(sv: SpaceView, rnd: () => number, now: number): Meteor {
  const s = sv.focal * TWINKLE.k * RAD * (1 + TWINKLE.zoom * sv.cue);
  const sx = sv.w * (0.14 + 0.72 * rnd());
  const sy = sv.h * (0.08 + 0.4 * rnd());
  const slant = (16 + 24 * rnd()) * RAD;
  // Away from the nearer side, so it crosses the frame rather than leaving it.
  const dir = sx < sv.w / 2 ? 1 : -1;
  const length = Math.min(420, Math.max(170, 0.26 * Math.hypot(sv.w, sv.h))) * (0.8 + 0.4 * rnd());
  return {
    t0: now,
    dur: 650 + 450 * rnd(),
    a: sv.a + (sx - sv.cx) / s,
    b: sv.b - (sy - sv.cy) / s,
    da: (dir * length * Math.cos(slant)) / s,
    db: -(length * Math.sin(slant)) / s,
    tail: 0.38 + 0.14 * rnd(),
    bright: 0.75 + 0.25 * rnd(),
  };
}

/** Draws a shooting star; false once it has gone. */
export function paintMeteor(p: Painter, m: Meteor, sv: SpaceView, now: number): boolean {
  const u = (now - m.t0) / m.dur;
  if (u >= 1 || u < 0) return false;
  const g = p.g;
  const s = sv.focal * TWINKLE.k * RAD * (1 + TWINKLE.zoom * sv.cue);
  const head = 1 - (1 - u) * (1 - u);
  const from = Math.max(0, head - m.tail);
  const env = Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.12)), 0.8) * m.bright * sv.alpha;
  if (env < 0.01) return true;
  const hx = sv.cx + s * (m.a + m.da * head - sv.a);
  const hy = sv.cy - s * (m.b + m.db * head - sv.b);
  const tx = sv.cx + s * (m.a + m.da * from - sv.a);
  const ty = sv.cy - s * (m.b + m.db * from - sv.b);
  if (typeof g.createLinearGradient === 'function') {
    const grad = g.createLinearGradient(tx, ty, hx, hy);
    grad.addColorStop(0, 'rgba(255,232,200,0)');
    grad.addColorStop(0.7, `rgba(255,236,208,${(0.32 * env).toFixed(3)})`);
    grad.addColorStop(1, `rgba(255,246,232,${env.toFixed(3)})`);
    g.globalAlpha = 1;
    g.strokeStyle = grad;
    g.lineWidth = sv.w < 768 ? 1.2 : 1.5;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(tx, ty);
    g.lineTo(hx, hy);
    g.stroke();
  }
  if (p.count + 2 <= p.budget) {
    g.globalAlpha = Math.min(1, 0.4 * env);
    g.drawImage(p.sprites.glow, hx - 9, hy - 9, 18, 18);
    g.globalAlpha = Math.min(1, env);
    g.drawImage(p.sprites.star[0][0], hx - 2.5, hy - 2.5, 5, 5);
    p.count += 2;
  }
  return true;
}
