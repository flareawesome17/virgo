/**
 * C1, the hero's atmosphere: everything the loop draws, seeded once from the
 * sky's seed and then moved only by integer harmonics of the loop's phase
 * (loop.ts), so frame 288 is frame 0.
 *
 * It plays behind the desktop Prologue, under the page's canvas (the seeded
 * stars over the archipelago) and the hero copy, so it carries what the
 * canvas does not: a deep field of far stars with a faint band through it,
 * warm haze that churns, and dust drifting up close to the lens. It stays
 * quieter than the canvas's stars, and the haze and dust hold back on the
 * left, where the copy sits.
 *
 * Depth (storyboard §1.13): the stars and the dust are points in a 3D
 * frustum, seen through the page's camera maths (camera.ts `view`). The
 * camera only translates, on a small tilted ellipse once per loop, never
 * turning, so a star at infinity holds still like the canvas's stars while
 * nearer ones slide against it and the dust, nearest of all, swings widest
 * and is blurred out of focus.
 *
 * How it draws: one float framebuffer in linear light. The stage gradient,
 * the haze, Gaussian star splats (area-sampled, so a star moving a fraction
 * of a pixel keeps its energy instead of shimmering) and the soft dust discs
 * all add into it, and it is encoded to sRGB once, at the end. A canvas would
 * quantise every faint layer on its own and step it into bands. No grain:
 * the site's grain layer dithers the video.
 */
import { NIGHT } from "../brand/palette";
import { SEED, mulberry32, view, type Camera, type View } from "../site";
import { TAU, cycle, harmonic, life } from "./loop";
import { makeNoise4D, type Noise4D } from "./noise";

/** "HERO", mixed into the sky's seed: the loop's own stream, so it never shifts the page's stars. */
const HERO_SEED = SEED ^ 0x4845524f;

/** Vertical field of view, degrees, and the distance the depth cues are judged at (world units). */
const FOV = 54;
const RANGE = 100;

/** The camera's ellipse (world units): across, up and along the view. One turn a loop. */
const ORBIT = { x: 0.55, y: 0.32, z: 1.1 } as const;

/** Stars: a third in the band (far), the rest log-spread from NEAR to FAR. */
const STARS = 1150;
const NEAR = 22;
const FAR = 900;
/**
 * The band: a faint arc of the galaxy from the top, right of centre, down to
 * the right edge, so it passes north-east of where the page's canvas lays the
 * archipelago (right of the copy) and frames it rather than crossing it.
 * Frame fractions.
 */
const BAND = { from: [0.5, -0.14], to: [1.12, 0.72] } as const;
/** Core Gaussian σ per size class at the judging distance, px, and the light each carries (linear radiance × px²). */
const SIGMA = [0.62, 0.74, 0.92] as const;
const ENERGY = [0.26, 0.64, 1.7] as const;

/** Dust: soft discs between DUST_NEAR and DUST_FAR, rising a short way through each life. */
const DUST = 84;
const DUST_NEAR = 5;
const DUST_FAR = 36;

/** The haze is computed at a quarter of the frame and drawn up, smoothed. */
const HAZE_SCALE = 4;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A unit Gaussian from four uniforms, as sky-seed.ts makes them. */
const gauss = (rnd: () => number) => (rnd() + rnd() + rnd() + rnd() - 2) * 1.7320508075688772;

// ─── Colour ──────────────────────────────────────────────────────────────

const toLinear = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
const hexLinear = (h: string): [number, number, number] => [
  toLinear(parseInt(h.slice(1, 3), 16)),
  toLinear(parseInt(h.slice(3, 5), 16)),
  toLinear(parseInt(h.slice(5, 7), 16)),
];
const hexRgb = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

const UMBER = hexLinear(NIGHT.umber);
const COPPER = hexLinear(NIGHT.copper);
const GOLD = hexLinear(NIGHT.gold);
/** The sprites' two star colours (sprites.ts TINTS), in linear light. */
const STAR_TINT = [
  [toLinear(255), toLinear(243), toLinear(226)],
  [toLinear(244), toLinear(201), toLinear(140)],
] as const;
const DUST_TINT = [
  [toLinear(255), toLinear(232), toLinear(204)],
  [toLinear(244), toLinear(196), toLinear(132)],
] as const;

/** Linear light → sRGB bytes, through a table fine enough near black (about 20 entries per output level). */
const LUT_BITS = 16;
const LUT_MAX = (1 << LUT_BITS) - 1;
let lut: Uint8ClampedArray | null = null;
function encodeTable(): Uint8ClampedArray {
  if (lut) return lut;
  lut = new Uint8ClampedArray(LUT_MAX + 1);
  for (let i = 0; i <= LUT_MAX; i++) {
    const l = i / LUT_MAX;
    const s = l <= 0.0031308 ? 12.92 * l : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
    lut[i] = Math.round(s * 255);
  }
  return lut;
}

/** The standard normal CDF, through erf (Abramowitz and Stegun 7.1.26, error under 1.5e-7). */
function phi(x: number): number {
  const z = Math.abs(x) * Math.SQRT1_2;
  const t = 1 / (1 + 0.3275911 * z);
  const e = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return x >= 0 ? 0.5 + 0.5 * e : 0.5 - 0.5 * e;
}

// ─── The seeded field ────────────────────────────────────────────────────

/** Floats per star: x, y, z, size class, tint, brightness, twinkle k (0: none), twinkle amplitude, twinkle phase. */
const STAR_STRIDE = 9;
/** Floats per mote: x, y, z, drift x, drift y, travel (world), lives per loop, life offset, peak, tint, wobble phase. */
const DUST_STRIDE = 11;

export type HeroField = {
  readonly width: number;
  readonly height: number;
  readonly focal: number;
  readonly stars: Float32Array;
  readonly dust: Float32Array;
  readonly noise: Noise4D;
  /** The stage gradient, linear RGB per pixel. */
  readonly base: Float32Array;
  readonly hazeWidth: number;
  readonly hazeHeight: number;
  /** Per haze pixel: noise x, noise y, band weight, band core (0..1), veil weight, horizon weight, then along and across the band (frame heights). */
  readonly hazeMap: Float32Array;
  /** How much the copy's side holds back, per column, 0..1 (haze, stars and dust each scale it their own way). */
  readonly copy: Float32Array;
};

const HAZE_STRIDE = 8;

export function heroField(width: number, height: number): HeroField {
  const rnd = mulberry32(HERO_SEED);
  const aspect = width / height;
  const tanY = Math.tan((FOV * Math.PI) / 360);
  const tanX = tanY * aspect;
  const focal = height / 2 / tanY;

  // Stars: a third along the band, deep; the rest spread through the frustum on a log scale of distance.
  const stars = new Float32Array(STARS * STAR_STRIDE);
  for (let i = 0; i < STARS; i++) {
    const inBand = i % 3 === 0;
    let u: number;
    let v: number;
    let z: number;
    if (inBand) {
      const t = rnd();
      const off = gauss(rnd) * 0.05;
      const dx = BAND.to[0] - BAND.from[0];
      const dy = BAND.to[1] - BAND.from[1];
      const len = Math.hypot(dx * aspect, dy);
      u = BAND.from[0] + dx * t + ((-dy / len) * off) / aspect;
      v = BAND.from[1] + dy * t + ((dx * aspect) / len) * off;
      z = 260 + 640 * Math.pow(rnd(), 0.8);
    } else {
      u = -0.08 + 1.16 * rnd();
      v = -0.08 + 1.16 * rnd();
      z = NEAR * Math.pow(FAR / NEAR, rnd());
    }
    const s = rnd();
    const o = i * STAR_STRIDE;
    stars[o] = (2 * u - 1) * tanX * z;
    stars[o + 1] = (1 - 2 * v) * tanY * z;
    stars[o + 2] = z;
    stars[o + 3] = s < 0.76 ? 0 : s < 0.965 ? 1 : 2;
    stars[o + 4] = rnd() < 0.24 ? 1 : 0;
    stars[o + 5] = inBand ? 0.4 + 0.45 * rnd() : 0.3 + 0.7 * Math.pow(rnd(), 1.4);
    if (rnd() < 0.3) {
      stars[o + 6] = 2 + Math.floor(rnd() * 6);
      stars[o + 7] = 0.16 + 0.18 * rnd();
      stars[o + 8] = rnd() * TAU;
    }
  }

  // Dust: near the lens, each mote rising a short way through each of its lives and fading at both ends.
  const dust = new Float32Array(DUST * DUST_STRIDE);
  for (let i = 0; i < DUST; i++) {
    const z = DUST_NEAR * Math.pow(DUST_FAR / DUST_NEAR, rnd());
    const u = -0.08 + 1.16 * rnd();
    const v = -0.04 + 1.12 * rnd();
    const dx = -0.4 + 0.5 * rnd();
    const dl = Math.hypot(dx, 1);
    // Screen travel per life, px, turned into world units at the mote's depth.
    const travelPx = 46 + 80 * rnd();
    const o = i * DUST_STRIDE;
    dust[o] = (2 * u - 1) * tanX * z;
    dust[o + 1] = (1 - 2 * v) * tanY * z;
    dust[o + 2] = z;
    dust[o + 3] = dx / dl;
    dust[o + 4] = 1 / dl;
    dust[o + 5] = (travelPx * z) / focal;
    dust[o + 6] = rnd() < 0.6 ? 1 : 2;
    dust[o + 7] = rnd();
    dust[o + 8] = 0.006 + 0.012 * rnd();
    dust[o + 9] = rnd() < 0.35 ? 1 : 0;
    dust[o + 10] = rnd() * TAU;
  }

  const noise = makeNoise4D(mulberry32(HERO_SEED ^ 0x6e6f6973));

  // The stage behind everything: palette.ts STAGE_BACKGROUND, radial-gradient(120% 80% at 50% 100%, horizon 0%, ground 45%, deep 100%).
  const base = new Float32Array(width * height * 3);
  const stops = [hexRgb(NIGHT.horizon), hexRgb(NIGHT.ground), hexRgb(NIGHT.deep)];
  const rx = 1.2 * width;
  const ry = 0.8 * height;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = Math.min(1, Math.hypot((x + 0.5 - width / 2) / rx, (y + 0.5 - height) / ry));
      const [a, b, k] = t < 0.45 ? [stops[0], stops[1], t / 0.45] : [stops[1], stops[2], (t - 0.45) / 0.55];
      const o = (y * width + x) * 3;
      // CSS interpolates gradients in sRGB, then paints 8-bit colour.
      base[o] = toLinear(Math.round(a[0] + (b[0] - a[0]) * k));
      base[o + 1] = toLinear(Math.round(a[1] + (b[1] - a[1]) * k));
      base[o + 2] = toLinear(Math.round(a[2] + (b[2] - a[2]) * k));
    }
  }

  // How far right of the copy a column is: 0 over the copy, 1 clear of it.
  const copy = new Float32Array(width);
  for (let x = 0; x < width; x++) copy[x] = smooth(0.26, 0.6, (x + 0.5) / width);

  // The haze's fixed geography: where the band, its dark core lanes, the veil and the horizon glow sit.
  const hw = Math.round(width / HAZE_SCALE);
  const hh = Math.round(height / HAZE_SCALE);
  const hazeMap = new Float32Array(hw * hh * HAZE_STRIDE);
  const bx = BAND.from[0] * aspect;
  const by = BAND.from[1];
  const bdx = (BAND.to[0] - BAND.from[0]) * aspect;
  const bdy = BAND.to[1] - BAND.from[1];
  const blen = Math.hypot(bdx, bdy);
  for (let j = 0; j < hh; j++) {
    for (let i = 0; i < hw; i++) {
      const u = (i + 0.5) / hw;
      const v = (j + 0.5) / hh;
      const X = u * aspect;
      const Y = v;
      const held = 0.18 + 0.82 * smooth(0.28, 0.62, u);
      const t = ((X - bx) * bdx + (Y - by) * bdy) / (blen * blen);
      const perp = ((X - bx) * bdy - (Y - by) * bdx) / blen;
      const along = smooth(-0.15, 0.22, t) * (1 - smooth(0.82, 1.15, t));
      const band = Math.exp(-(perp * perp) / (2 * 0.12 * 0.12)) * along;
      const core = Math.exp(-(perp * perp) / (2 * 0.045 * 0.045));
      const veil = Math.exp(-((X - 0.86 * aspect) ** 2 / (2 * 0.4 * 0.4) + (Y - 0.24) ** 2 / (2 * 0.3 * 0.3)));
      const horizon = Math.exp(-((Y - 1.08) ** 2) / (2 * 0.16 * 0.16)) * (0.4 + 0.6 * u);
      const o = (j * hw + i) * HAZE_STRIDE;
      hazeMap[o] = X * 2.1 + 3.1;
      hazeMap[o + 1] = Y * 2.1 + 7.7;
      hazeMap[o + 2] = band * held;
      hazeMap[o + 3] = core;
      hazeMap[o + 4] = veil * held;
      hazeMap[o + 5] = horizon * (0.5 + 0.5 * held);
      hazeMap[o + 6] = t * blen;
      hazeMap[o + 7] = perp;
    }
  }

  return { width, height, focal, stars, dust, noise, base, hazeWidth: hw, hazeHeight: hh, hazeMap, copy };
}

/** The camera for a phase: a small tilted ellipse, translation only, once per loop. */
export function heroCamera(theta: number): Camera {
  const x = harmonic(theta, 1, ORBIT.x, Math.PI / 2);
  const y = harmonic(theta, 1, ORBIT.y);
  const z = harmonic(theta, 1, ORBIT.z, 0.9);
  return { position: [x, y, z], target: [x, y, z + RANGE], fov: FOV, up: [0, 1, 0] };
}

// ─── Drawing ─────────────────────────────────────────────────────────────

/** Scratch buffers for one frame size: the framebuffer and the quarter-size haze. */
export type HeroBuffers = { readonly frame: Float32Array; readonly haze: Float32Array };
export const heroBuffers = (field: HeroField): HeroBuffers => ({
  frame: new Float32Array(field.width * field.height * 3),
  haze: new Float32Array(field.hazeWidth * field.hazeHeight * 3),
});

/** Octaves of noise, each walking its own circle through the loop (radius scaled with the octave, so all of it closes). */
function fbm(noise: Noise4D, x: number, y: number, c: number, s: number, octaves: number): number {
  let total = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    total += amp * noise(x * f, y * f, c * f, s * f);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return total / norm;
}

/** The haze for a phase, linear RGB at a quarter of the frame. */
function paintHaze(field: HeroField, theta: number, strength: number, out: Float32Array): void {
  const { noise, hazeMap } = field;
  // The noise walks a circle in its last two dimensions, so the haze churns slowly and comes back.
  const c = 0.34 * Math.cos(theta);
  const s = 0.34 * Math.sin(theta);
  const c2 = 0.22 * Math.cos(theta + 1.3);
  const s2 = 0.22 * Math.sin(theta + 1.3);
  const n = field.hazeWidth * field.hazeHeight;
  for (let p = 0; p < n; p++) {
    const o = p * HAZE_STRIDE;
    const band = hazeMap[o + 2];
    const veil = hazeMap[o + 4];
    const horizon = hazeMap[o + 5];
    const q = p * 3;
    if (band + veil + horizon < 0.003) {
      out[q] = 0;
      out[q + 1] = 0;
      out[q + 2] = 0;
      continue;
    }
    const x = hazeMap[o];
    const y = hazeMap[o + 1];
    const body = 0.5 + 0.5 * fbm(noise, x, y, c, s, 4);
    // Dust lanes down the band's core: where a second field, stretched along the band, crosses zero.
    const lane = 1 - Math.min(1, Math.abs(fbm(noise, hazeMap[o + 6] * 2.4 + 5.1, hazeMap[o + 7] * 12 - 3.3, c2, s2, 3)) * 3);
    const lanes = lane * lane * hazeMap[o + 3];
    // The veil: broad, slow clouds, at a larger scale.
    const cloud = smooth(0.38, 0.78, 0.5 + 0.5 * noise(x * 0.42 - 7.9, y * 0.42 + 2.6, c2 * 0.8, s2 * 0.8));
    const bandD = band * Math.pow(0.3 + 0.7 * body, 1.6) * (1 - 0.7 * lanes);
    const veilD = veil * cloud * (0.55 + 0.45 * body);
    // Hue drifts region by region between umber, copper and gold; the dense band runs warmest.
    const hue = noise(x * 0.36 + 11.3, y * 0.36 - 4.2, c2, s2);
    const warm = Math.min(1, Math.max(0, 0.36 + 0.5 * Math.min(1, bandD * 1.4) + 0.34 * hue));
    const a = warm < 0.5 ? UMBER : COPPER;
    const b = warm < 0.5 ? COPPER : GOLD;
    const k = warm < 0.5 ? warm * 2 : (warm - 0.5) * 2;
    const glow = (bandD * 0.06 + veilD * 0.024) * strength;
    const low = horizon * (0.012 + 0.006 * body) * strength;
    out[q] = (a[0] + (b[0] - a[0]) * k) * glow + UMBER[0] * low;
    out[q + 1] = (a[1] + (b[1] - a[1]) * k) * glow + UMBER[1] * low;
    out[q + 2] = (a[2] + (b[2] - a[2]) * k) * glow + UMBER[2] * low;
  }
}

/** The stage, then the haze drawn up from a quarter size (bilinear), into the framebuffer. */
function paintGround(field: HeroField, haze: Float32Array, frame: Float32Array): void {
  const { width: w, height: h, hazeWidth: hw, hazeHeight: hh, base } = field;
  for (let y = 0; y < h; y++) {
    const fy = (y + 0.5) / HAZE_SCALE - 0.5;
    const j0 = Math.max(0, Math.min(hh - 1, Math.floor(fy)));
    const j1 = Math.min(hh - 1, j0 + 1);
    const ty = Math.min(1, Math.max(0, fy - j0));
    for (let x = 0; x < w; x++) {
      const fx = (x + 0.5) / HAZE_SCALE - 0.5;
      const i0 = Math.max(0, Math.min(hw - 1, Math.floor(fx)));
      const i1 = Math.min(hw - 1, i0 + 1);
      const tx = Math.min(1, Math.max(0, fx - i0));
      const a = (j0 * hw + i0) * 3;
      const b = (j0 * hw + i1) * 3;
      const c = (j1 * hw + i0) * 3;
      const d = (j1 * hw + i1) * 3;
      const o = (y * w + x) * 3;
      for (let ch = 0; ch < 3; ch++) {
        const top = haze[a + ch] + (haze[b + ch] - haze[a + ch]) * tx;
        const bottom = haze[c + ch] + (haze[d + ch] - haze[c + ch]) * tx;
        frame[o + ch] = base[o + ch] + top + (bottom - top) * ty;
      }
    }
  }
}

const gx = new Float32Array(256);
const gy = new Float32Array(256);

/** One Gaussian of σ px carrying `energy` (linear radiance × px²), area-sampled into the framebuffer. */
function splat(frame: Float32Array, w: number, h: number, sx: number, sy: number, sigma: number, energy: number, tint: readonly number[]): void {
  const r = Math.min(120, Math.ceil(3.2 * sigma + 1));
  const x0 = Math.max(0, Math.floor(sx) - r);
  const x1 = Math.min(w - 1, Math.floor(sx) + r);
  const y0 = Math.max(0, Math.floor(sy) - r);
  const y1 = Math.min(h - 1, Math.floor(sy) + r);
  if (x0 > x1 || y0 > y1) return;
  for (let x = x0; x <= x1; x++) gx[x - x0] = phi((x + 1 - sx) / sigma) - phi((x - sx) / sigma);
  for (let y = y0; y <= y1; y++) gy[y - y0] = phi((y + 1 - sy) / sigma) - phi((y - sy) / sigma);
  const er = energy * tint[0];
  const eg = energy * tint[1];
  const eb = energy * tint[2];
  for (let y = y0; y <= y1; y++) {
    const wy = gy[y - y0];
    if (wy < 1e-6) continue;
    let o = (y * w + x0) * 3;
    for (let x = x0; x <= x1; x++, o += 3) {
      const k = wy * gx[x - x0];
      frame[o] += er * k;
      frame[o + 1] += eg * k;
      frame[o + 2] += eb * k;
    }
  }
}

/** A soft disc of radius r px (an out-of-focus mote): flat inside, falling off over its outer 45%. */
function disc(frame: Float32Array, w: number, h: number, sx: number, sy: number, r: number, peak: number, tint: readonly number[]): void {
  const x0 = Math.max(0, Math.floor(sx - r - 1));
  const x1 = Math.min(w - 1, Math.ceil(sx + r + 1));
  const y0 = Math.max(0, Math.floor(sy - r - 1));
  const y1 = Math.min(h - 1, Math.ceil(sy + r + 1));
  const inner = 0.55 * r;
  const edge = r - inner;
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - sy;
    let o = (y * w + x0) * 3;
    for (let x = x0; x <= x1; x++, o += 3) {
      const dx = x + 0.5 - sx;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= r + 0.5) continue;
      // Smooth to the rim, with half a pixel of coverage at the edge itself.
      const t = d <= inner ? 1 : 1 - smooth(0, 1, (d - inner) / (edge + 0.5));
      const k = peak * t;
      frame[o] += tint[0] * k;
      frame[o + 1] += tint[1] * k;
      frame[o + 2] += tint[2] * k;
    }
  }
}

/** The far stars, through the loop's camera: each a Gaussian, sized and fogged by depth, twinkling on its own harmonic. */
function paintStars(field: HeroField, v: View, theta: number, strength: number, frame: Float32Array): void {
  const { stars, width: w, height: h, copy } = field;
  for (let i = 0; i < STARS; i++) {
    const o = i * STAR_STRIDE;
    const dx = stars[o] - v.px;
    const dy = stars[o + 1] - v.py;
    const dz = stars[o + 2] - v.pz;
    const depth = dx * v.fx + dy * v.fy + dz * v.fz;
    if (depth < 4) continue;
    const k = v.focal / depth;
    const sx = v.cx + (dx * v.rx + dy * v.ry + dz * v.rz) * k;
    const sy = v.cy - (dx * v.ux + dy * v.uy + dz * v.uz) * k;
    if (sx < -24 || sx > w + 24 || sy < -24 || sy > h + 24) continue;
    const cue = Math.sqrt(RANGE / depth);
    const size = stars[o + 3] as 0 | 1 | 2;
    const scale = cue < 0.6 ? 0.6 : cue > 2 ? 2 : cue;
    const fog = Math.min(1, Math.max(0.24, 0.95 * cue));
    const tk = stars[o + 6];
    const twinkle = tk ? 1 + harmonic(theta, tk, stars[o + 7], stars[o + 8]) : 1;
    const held = 0.5 + 0.5 * copy[Math.max(0, Math.min(w - 1, Math.round(sx)))];
    const energy = ENERGY[size] * stars[o + 5] * fog * twinkle * held * strength * scale;
    if (energy < 0.004) continue;
    const tint = STAR_TINT[stars[o + 4]];
    splat(frame, w, h, sx, sy, SIGMA[size] * scale, energy, tint);
    // The brightest carry a wide, faint halo, so a few read first, as on the page.
    if (size === 2) splat(frame, w, h, sx, sy, 4.6 * scale, energy * 0.9, tint);
  }
}

/** The dust: each mote rises through its life (k lives a loop), fading in and out, out of focus by nearness. */
function paintDust(field: HeroField, v: View, theta: number, strength: number, frame: Float32Array): void {
  const { dust, width: w, height: h, copy } = field;
  for (let i = 0; i < DUST; i++) {
    const o = i * DUST_STRIDE;
    const u = cycle(theta, dust[o + 6], dust[o + 7]);
    const fade = life(u);
    if (fade < 0.004) continue;
    const travel = (u - 0.5) * dust[o + 5];
    const wobble = harmonic(TAU * u, 2, 0.08 * dust[o + 5], dust[o + 10]);
    const x = dust[o] + dust[o + 3] * travel + dust[o + 4] * wobble;
    const y = dust[o + 1] + dust[o + 4] * travel - dust[o + 3] * wobble;
    const dx = x - v.px;
    const dy = y - v.py;
    const dz = dust[o + 2] - v.pz;
    const depth = dx * v.fx + dy * v.fy + dz * v.fz;
    if (depth <= 1) continue;
    const k = v.focal / depth;
    const sx = v.cx + (dx * v.rx + dy * v.ry + dz * v.rz) * k;
    const sy = v.cy - (dx * v.ux + dy * v.uy + dz * v.uz) * k;
    // Out of focus: the nearer, the wider and fainter the disc.
    const r = 1.2 + 64 / depth;
    if (sx < -r || sx > w + r || sy < -r || sy > h + r) continue;
    const held = 0.4 + 0.6 * copy[Math.max(0, Math.min(w - 1, Math.round(sx)))];
    const peak = dust[o + 8] * fade * held * strength * Math.min(1, 7 / r);
    if (peak < 0.0004) continue;
    disc(frame, w, h, sx, sy, r, peak, DUST_TINT[dust[o + 9]]);
  }
}

/**
 * One frame of the loop into an RGBA buffer (width × height × 4): the stage,
 * the haze, the stars and the dust, added in linear light and encoded to
 * sRGB once. Everything is a function of θ alone.
 */
export function drawHero(
  field: HeroField,
  buffers: HeroBuffers,
  theta: number,
  look: { readonly haze: number; readonly dust: number; readonly stars: number },
  out: Uint8ClampedArray,
): void {
  const v = view(heroCamera(theta), field.width, field.height);
  paintHaze(field, theta, look.haze, buffers.haze);
  paintGround(field, buffers.haze, buffers.frame);
  paintStars(field, v, theta, look.stars, buffers.frame);
  paintDust(field, v, theta, look.dust, buffers.frame);
  const table = encodeTable();
  const f = buffers.frame;
  const n = field.width * field.height;
  for (let p = 0, i = 0, q = 0; p < n; p++, i += 3, q += 4) {
    const r = f[i];
    const g = f[i + 1];
    const b = f[i + 2];
    out[q] = table[r >= 1 ? LUT_MAX : (r * LUT_MAX + 0.5) | 0];
    out[q + 1] = table[g >= 1 ? LUT_MAX : (g * LUT_MAX + 0.5) | 0];
    out[q + 2] = table[b >= 1 ? LUT_MAX : (b * LUT_MAX + 0.5) | 0];
    out[q + 3] = 255;
  }
}
