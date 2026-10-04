/**
 * A4: the seeded sky. Every star the page, the posters and the videos draw
 * comes from here, so frame 0 of the canvas and the Remotion still match by
 * construction (storyboard §1.3, §1.13).
 *
 * The world is the story map in 3D. One unit is one map viewBox unit
 * (KM_PER_UNIT ≈ 1.879 km): x runs east (the viewBox x), z runs north (minus
 * the viewBox y) and y is altitude above the map plane, which is y = 0.
 *
 * Star cloud (mulberry32, seed 0x56495247 "VIRG"):
 * - 60% hang around the 71 Nearby cities (Gaussian, σ ≈ 12 km in x and z),
 *   low: 0.4 to 40 units up, most of them under 10. Seen from above they
 *   draw the archipelago's shape before any coastline appears.
 * - 40% are spread uniformly over the frame and well beyond it (SPREAD), at
 *   altitudes spread evenly per octave from 2 to 1,024 units, so a camera
 *   descending from space has stars between it and the ground at every
 *   height: it starts among them and streams through layers on the way down.
 * - Counts are prefixes of one sequence: lite is the first 160, mobile the
 *   first 320, desktop all 700, and the auto-degrade halves by taking a
 *   prefix too. Every group of five keeps the 60/40 split exact at those
 *   sizes, and stars 7 and 19 of every 25 twinkle (8%).
 *
 * Motes: near-field dust for big camera moves, the "push streams near stars
 * past the edges of the frame" of §1.13. A few points per tile, tiled through
 * space at seven scales; the engine shows each scale only around the
 * camera's own distance, so a dolly of any length has something passing it.
 * They mark nothing: the stars above are the places.
 *
 * Determinism: only +, −, ×, ÷ and sqrt touch the numbers (all correctly
 * rounded in IEEE 754), the Gaussian is a sum of four uniforms rather than
 * Box–Muller, and positions snap to 1/1024 unit, so every engine produces
 * the same bits and `hashStars` agrees between Node, the page and Remotion.
 *
 * Ch8's small constellations are seeded here too: 12 cities on phones, 18 on
 * desktop (storyboard Ch8), 3–5 stars each, 3–12 km from the city and
 * hovering above it. Each city has its own stream, so one cluster's land
 * retries never shift another. The land test is ph-map.generated.ts
 * `pointInLand(x, y, LAND_SAFE_INSET_KM)`, which is too big for the page, so
 * `check-seed.mjs --write` runs it once and freezes the result in
 * `clusters.generated.ts`. The page and Remotion import that file.
 *
 * Zero-import, by dependency injection: this file imports nothing at run
 * time, so it loads under plain `node --experimental-strip-types`. Callers
 * pass the map in as a `SeedMap`; `seed-map.ts` builds the real one from
 * cities.generated.ts and projection.ts.
 */
import type { City } from '../data/cities.generated';

/** "VIRG". */
export const SEED = 0x56495247;

/** Stars per variant (storyboard §1.3). */
export const COUNTS = { desktop: 700, mobile: 320, lite: 160 } as const;
export type SkyVariant = keyof typeof COUNTS;

/** What the seed needs from the story map: cities.generated.ts and projection.ts, passed in. */
export type SeedMap = {
  /** The 71 Nearby cities, in viewBox units (cities.generated.ts CITIES). */
  readonly cities: readonly Pick<City, 'name' | 'x' | 'y'>[];
  /** Kilometres per viewBox unit (projection.ts KM_PER_UNIT). */
  readonly kmPerUnit: number;
  /** The map's viewBox (projection.ts VIEWBOX). */
  readonly viewBox: { readonly width: number; readonly height: number };
};

/** Floats per star in a `StarCloud`. */
export const STRIDE = 8;
/** Field offsets inside one star's STRIDE floats. */
export const F = {
  /** World position: x east, y up, z north, in map units. */
  x: 0,
  y: 1,
  z: 2,
  /** Sprite size class: 0 small, 1 medium, 2 large. */
  size: 3,
  /** 0 warm white, 1 gold. */
  tint: 4,
  /** 1 for the 8% that twinkle. */
  twinkle: 5,
  /** Twinkle phase, radians. */
  phase: 6,
  /** Base brightness, 0.24..1. */
  bright: 7,
} as const;

/** A packed star cloud: `count` stars of STRIDE floats each. */
export type StarCloud = { readonly count: number; readonly data: Float32Array };

/** A map viewBox point on the world's ground plane: [x, 0, z]. */
export function toWorld(x: number, y: number): [number, number, number] {
  return [x, 0, -y];
}

/** The classic 32-bit generator: small, fast, and identical everywhere. */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A unit Gaussian from four uniforms (Irwin–Hall). Tails stop at ±3.46σ, which keeps strays off the frame. */
function gauss(rnd: () => number): number {
  return (rnd() + rnd() + rnd() + rnd() - 2) * 1.7320508075688772;
}

const snap = (v: number) => Math.round(v * 1024) / 1024;
/** Cluster stars need less: 1/64 unit is about 29 m, and keeps clusters.generated.ts short. */
const snapCluster = (v: number) => Math.round(v * 64) / 64;
const TAU = 6.283185307179586;

/** σ of the city clusters, km. */
const SIGMA_KM = 12;
/** City stars hang low, units: cubic, so most sit under 10. */
const ALT_CITY = [0.4, 40] as const;
/**
 * Spread stars: the same count in each of nine octaves from 2 units up, to
 * 1,024 (uniform within an octave). Powers of two keep the arithmetic exact.
 */
const SPREAD_OCTAVES = 9;
/**
 * Where the spread stars fall, around the frame's centre: 2,000 by 1,600
 * units, so a wide desktop view of the whole archipelago, shifted right of
 * the hero copy, is full of sky to its edges.
 */
const SPREAD = { width: 2000, height: 1600 } as const;

const MAX = COUNTS.desktop;
const clouds = new WeakMap<SeedMap, Float32Array>();

function build(map: SeedMap): Float32Array {
  const rnd = mulberry32(SEED);
  const out = new Float32Array(MAX * STRIDE);
  const sigma = SIGMA_KM / map.kmPerUnit;
  const left = map.viewBox.width / 2 - SPREAD.width / 2;
  const top = map.viewBox.height / 2 - SPREAD.height / 2;
  const cities = map.cities;
  for (let i = 0; i < MAX; i++) {
    let x: number;
    let y: number;
    let alt: number;
    const near = i % 5 < 3;
    if (near) {
      const c = cities[Math.floor(rnd() * cities.length)];
      x = c.x + gauss(rnd) * sigma;
      y = c.y + gauss(rnd) * sigma;
      const u = rnd();
      alt = ALT_CITY[0] + (ALT_CITY[1] - ALT_CITY[0]) * u * u * u;
    } else {
      x = left + rnd() * SPREAD.width;
      y = top + rnd() * SPREAD.height;
      // An octave, then a point inside it: 2^(k+1) to 2^(k+2) units.
      const octave = Math.floor(rnd() * SPREAD_OCTAVES);
      let floor = 2;
      for (let k = 0; k < octave; k++) floor *= 2;
      alt = floor * (1 + rnd());
    }
    const s = rnd();
    const size = s < 0.62 ? 0 : s < 0.92 ? 1 : 2;
    const o = i * STRIDE;
    out[o + F.x] = snap(x);
    out[o + F.y] = snap(alt);
    out[o + F.z] = snap(-y);
    out[o + F.size] = size;
    out[o + F.tint] = rnd() < 0.24 ? 1 : 0;
    out[o + F.twinkle] = i % 25 === 7 || i % 25 === 19 ? 1 : 0;
    out[o + F.phase] = snap(rnd() * TAU);
    // The places are the bright ones, so the archipelago reads from the first frame; the spread is quieter sky.
    // Bigger stars run brighter, so the eye reads size and light together.
    out[o + F.bright] = snap(Math.min(1, near ? 0.55 + 0.33 * rnd() + 0.12 * size : 0.24 + 0.4 * rnd() + 0.12 * size));
  }
  return out;
}

/**
 * The first `count` stars (a prefix, so lite ⊂ mobile ⊂ desktop). Built once
 * per map and shared; treat the data as read-only.
 */
export function starCloud(map: SeedMap, count: number = COUNTS.desktop): StarCloud {
  let cloud = clouds.get(map);
  if (!cloud) {
    cloud = build(map);
    clouds.set(map, cloud);
  }
  const n = Math.max(0, Math.min(MAX, Math.floor(count)));
  return { count: n, data: cloud.subarray(0, n * STRIDE) };
}

/** FNV-1a over the cloud's bytes: the cross-engine determinism check. */
export function hashStars(c: StarCloud): string {
  return hashBytes(new Uint8Array(c.data.buffer, c.data.byteOffset, c.count * STRIDE * 4));
}

function hashBytes(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// ─── Motes: near-field dust ──────────────────────────────────────────────

/**
 * Layer k tiles space with cubes `p0 × ratio^k` units on a side, `perTile`
 * points in each. The engine draws a layer only while its tile is about a
 * third of the camera's distance to what it looks at.
 */
export const MOTES = { layers: 7, perTile: 6, p0: 2.5, ratio: 3 } as const;
/** Floats per mote seed: position in the tile (0..1 each way) and brightness. */
export const MOTE_STRIDE = 4;

let moteSeeds: Float32Array | null = null;

/** Every layer's points in its unit tile, layer by layer: [u, v, w, bright] each. */
export function motes(): Float32Array {
  if (!moteSeeds) {
    const rnd = mulberry32(SEED ^ 0x6d07e5);
    const n = MOTES.layers * MOTES.perTile;
    const out = new Float32Array(n * MOTE_STRIDE);
    for (let i = 0; i < n; i++) {
      const o = i * MOTE_STRIDE;
      out[o] = snap(rnd());
      out[o + 1] = snap(rnd());
      out[o + 2] = snap(rnd());
      out[o + 3] = snap(0.45 + 0.55 * rnd());
    }
    moteSeeds = out;
  }
  return moteSeeds;
}

// ─── Ch8: small constellations above cities ──────────────────────────────

/** Storyboard Ch8: 12 cities on phones, north to south as listed there. */
export const CLUSTER_CITIES_MOBILE = [
  'Vigan',
  'Baguio',
  'Quezon City',
  'Naga',
  'Legazpi',
  'Iloilo City',
  'Bacolod',
  'Dumaguete',
  'Tagbilaran',
  'Tacloban',
  'Cagayan de Oro',
  'Davao City',
] as const;

/** Desktop adds six, for 18. */
export const CLUSTER_CITIES_DESKTOP = [
  ...CLUSTER_CITIES_MOBILE,
  'Puerto Princesa',
  'Zamboanga City',
  'General Santos',
  'Batangas City',
  'Laoag',
  'Butuan',
] as const;

export type Cluster = {
  /** As the app spells it. */
  readonly city: string;
  /** The city's ground point, world units (y = 0). */
  readonly ground: readonly [number, number, number];
  /** The stars, world units. */
  readonly stars: readonly (readonly [number, number, number])[];
  /** The figure's thin lines, as index pairs into `stars`. */
  readonly lines: readonly (readonly [number, number])[];
  /** North-to-south order, 0..1: when the Ch8 wave reaches it. */
  readonly wave: number;
  /** Stars that fell back to a short offset after 12 land misses (0 when the land test always passed). */
  readonly fallbacks: number;
};

/** Cluster stars sit 3–12 km from their city (storyboard A3 notes). */
const CLUSTER_KM = [3, 12] as const;
/** And hover 26–34 units (about 50–65 km) above it, so the thread down to the ground reads at archipelago scale. */
const CLUSTER_ALT = [26, 34] as const;
/** No two stars of one cluster closer than this, km. */
const CLUSTER_GAP_KM = 2.5;

/**
 * The Ch8 clusters for a variant. `isLand(x, y)` takes map viewBox units
 * (x east, y down) and must be ph-map.generated.ts `pointInLand` with
 * LAND_SAFE_INSET_KM for the storyboard's guarantee; without it nothing is
 * tested. The page reads the frozen result from clusters.generated.ts.
 */
export function clusters(map: SeedMap, variant: 'desktop' | 'mobile', isLand?: (x: number, y: number) => boolean): Cluster[] {
  const names: readonly string[] = variant === 'desktop' ? CLUSTER_CITIES_DESKTOP : CLUSTER_CITIES_MOBILE;
  const km = (value: number) => value / map.kmPerUnit;
  const gap = km(CLUSTER_GAP_KM);
  const rows = names.map((name) => {
    const index = map.cities.findIndex((c) => c.name === name);
    if (index < 0) throw new Error(`sky-seed: ${name} is not one of the Nearby cities`);
    return { name, index, c: map.cities[index] };
  });
  const byNorth = [...rows].sort((a, b) => a.c.y - b.c.y);
  return rows.map(({ name, index, c }) => {
    // One stream per city: SEED mixed with the city's index.
    const rnd = mulberry32(SEED ^ Math.imul(index + 1, 0x9e3779b1));
    const n = 3 + Math.floor(rnd() * 3);
    const base = CLUSTER_ALT[0] + (CLUSTER_ALT[1] - CLUSTER_ALT[0]) * rnd();
    const flat: [number, number][] = [];
    const stars: [number, number, number][] = [];
    let fallbacks = 0;
    for (let s = 0; s < n; s++) {
      let placed: [number, number] | null = null;
      for (let attempt = 0; attempt < 48 && !placed; attempt++) {
        // A direction without trig: a point in the unit disc, normalised.
        let dx = 0;
        let dy = 0;
        let r2 = 0;
        do {
          dx = rnd() * 2 - 1;
          dy = rnd() * 2 - 1;
          r2 = dx * dx + dy * dy;
        } while (r2 > 1 || r2 < 0.01);
        const len = Math.sqrt(r2);
        // After 12 misses, pull in toward the city (its centre is on land).
        const shrink = attempt < 12 ? 1 : Math.max(0.15, 1 - (attempt - 11) * 0.025);
        const d = km(CLUSTER_KM[0] + (CLUSTER_KM[1] - CLUSTER_KM[0]) * rnd()) * shrink;
        const px = c.x + (dx / len) * d;
        const py = c.y + (dy / len) * d;
        if (flat.some(([fx, fy]) => (fx - px) * (fx - px) + (fy - py) * (fy - py) < gap * gap * shrink)) continue;
        if (isLand && !isLand(px, py)) continue;
        if (attempt >= 12) fallbacks++;
        placed = [px, py];
      }
      if (!placed) {
        // Nothing passed: sit on the city itself, which build-cities proves is on land.
        fallbacks++;
        placed = [c.x, c.y];
      }
      flat.push(placed);
      stars.push([snapCluster(placed[0]), snapCluster(base + (rnd() * 2 - 1) * 2), snapCluster(-placed[1])]);
    }
    // Lines: around the centroid in angle order, an open path, plus a branch on bigger figures.
    const cx = flat.reduce((t, p) => t + p[0], 0) / n;
    const cy = flat.reduce((t, p) => t + p[1], 0) / n;
    const order = flat
      .map((p, i) => ({ i, q: pseudoAngle(p[0] - cx, p[1] - cy) }))
      .sort((a, b) => a.q - b.q)
      .map((o) => o.i);
    const lines: [number, number][] = [];
    for (let k = 1; k < n; k++) lines.push([order[k - 1], order[k]]);
    if (n >= 4 && rnd() < 0.5) lines.push([order[n - 1], order[1]]);
    return {
      city: name,
      ground: [c.x, 0, -c.y] as const,
      stars,
      lines,
      wave: byNorth.length > 1 ? byNorth.findIndex((r) => r.name === name) / (byNorth.length - 1) : 0,
      fallbacks,
    };
  });
}

/** A monotonic stand-in for atan2 (0..4), so ordering needs no trig. */
function pseudoAngle(dx: number, dy: number): number {
  const p = dx / (Math.abs(dx) + Math.abs(dy) || 1);
  return dy < 0 ? 3 + p : 1 - p;
}

// ─── Ch3: the field behind Virgo ─────────────────────────────────────────

let field: Float32Array | null = null;

/**
 * Background stars for the deep-sky scene, in its frame (light-years, Earth
 * at the origin, z toward Virgo; see constellation.ts), in the same packed
 * layout as `starCloud`. Most are far behind the figure (420 to 3,020 ly) so
 * orbiting it shows parallax against them; a fifth sit between 60 and 400 ly
 * but outside the figure's own patch of sky, so nothing crosses it when the
 * camera reaches Earth's view.
 */
export function deepField(count = 240): StarCloud {
  if (!field) {
    const rnd = mulberry32(SEED ^ 0x0dee95c1);
    const out = new Float32Array(240 * STRIDE);
    for (let i = 0; i < 240; i++) {
      const near = i % 5 === 4;
      let x = 0;
      let y = 0;
      let z = 0;
      let r = 0;
      for (;;) {
        x = rnd() * 2 - 1;
        y = rnd() * 2 - 1;
        z = rnd() * 2 - 1;
        r = Math.sqrt(x * x + y * y + z * z);
        // Inside the ball, within about 75° of +z, and (for near ones) off the figure's 45° × 22° patch.
        if (r < 0.2 || r > 1 || z < 0.26 * r) continue;
        if (near && Math.abs(x / z) < 0.5 && Math.abs(y / z) < 0.26) continue;
        break;
      }
      const u = rnd();
      const d = near ? 60 + 340 * u : 420 + 2600 * u * u * u;
      const s = rnd();
      const o = i * STRIDE;
      out[o + F.x] = snap((x / r) * d);
      out[o + F.y] = snap((y / r) * d);
      out[o + F.z] = snap((z / r) * d);
      out[o + F.size] = s < 0.7 ? 0 : s < 0.95 ? 1 : 2;
      out[o + F.tint] = rnd() < 0.2 ? 1 : 0;
      out[o + F.twinkle] = i % 25 === 7 || i % 25 === 19 ? 1 : 0;
      out[o + F.phase] = snap(rnd() * TAU);
      out[o + F.bright] = snap(0.25 + 0.45 * rnd());
    }
    field = out;
  }
  const n = Math.max(0, Math.min(240, Math.floor(count)));
  return { count: n, data: field.subarray(0, n * STRIDE) };
}

/** Counts and hashes for every variant: what the determinism check prints and pins. */
export function seedSignature(map: SeedMap): Record<SkyVariant | 'field' | 'motes', { count: number; hash: string }> {
  const m = motes();
  return {
    desktop: { count: COUNTS.desktop, hash: hashStars(starCloud(map, COUNTS.desktop)) },
    mobile: { count: COUNTS.mobile, hash: hashStars(starCloud(map, COUNTS.mobile)) },
    lite: { count: COUNTS.lite, hash: hashStars(starCloud(map, COUNTS.lite)) },
    field: { count: 240, hash: hashStars(deepField(240)) },
    motes: { count: m.length / MOTE_STRIDE, hash: hashBytes(new Uint8Array(m.buffer, m.byteOffset, m.byteLength)) },
  };
}
