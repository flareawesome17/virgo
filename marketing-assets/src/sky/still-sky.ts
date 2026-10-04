/**
 * One frame of the page's sky, drawn the way web/src/components/story/sky/
 * engine.ts draws it, for stills: the same painter (paint.ts), sprites,
 * seeded cloud, camera and map-level rule, with none of the engine's
 * scheduling (no rAF, no auto-degrade, no clock). Deterministic: the twinkle
 * reads the `time` it is given, and 0 is the canvas's own first frame.
 *
 * engine.ts keeps its look constants module-private, so they are mirrored
 * here; scripts/render-check.mjs reads engine.ts and fails if they drift.
 */
import {
  COUNTS,
  KM_PER_UNIT,
  SEED_MAP,
  makeSprites,
  motes,
  paintCloud,
  paintClusters,
  paintMotes,
  paintRings,
  paintStars,
  paintThreads,
  pixelsPerUnit,
  planeMatrix,
  smoothstep,
  starCloud,
  view,
  type CloudLook,
  type GeoState,
  type Painter,
  type PlaneBox,
  type SkyVariant,
  type SpriteSet,
  type View,
} from "../site";

/** engine.ts, as of this commit (checked by scripts/render-check.mjs). */
export const ENGINE = {
  BUDGET: { desktop: 1200, mobile: 600, lite: 600 },
  RESERVE: 160,
  CLOUD_BASE: [5, 8.5, 14],
  CLOUD_GLOW: 0.3,
  FIELD_BASE: [3.8, 6, 9.5],
} as const;

const spriteCache = new Map<number, SpriteSet>();
/** The engine's sprites for a device pixel ratio, drawn once per tab. */
export function sprites(dpr: number): SpriteSet {
  let s = spriteCache.get(dpr);
  if (!s) {
    s = makeSprites(dpr);
    spriteCache.set(dpr, s);
  }
  return s;
}

export type StillOptions = {
  /** The CSS viewport the frame is composed for (the engine's w × h). */
  readonly cssWidth: number;
  readonly cssHeight: number;
  /** Device pixels per CSS pixel: the canvas is cssWidth × dpr wide. */
  readonly dpr: number;
  readonly variant: SkyVariant;
  /** Seconds on the twinkle clock; 0 is the engine's first draw. Null: no twinkle (as under Pause). */
  readonly time: number | null;
};

/**
 * Draws a SkyFrame's geo scene into a canvas sized cssWidth × dpr by
 * cssHeight × dpr: engine.ts `draw()` → `drawCloud()` (its uncached path),
 * then threads, rings, clusters and the story's stars, all within the
 * variant's sprite budget. Returns the sprite count.
 */
export function drawGeo(g: CanvasRenderingContext2D, geo: GeoState, o: StillOptions): number {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, g.canvas.width, g.canvas.height);
  g.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);
  const total = ENGINE.BUDGET[o.variant];
  const p: Painter = { g, sprites: sprites(o.dpr), count: 0, budget: total, time: o.time ?? 0 };
  const v = view(geo.camera, o.cssWidth, o.cssHeight);
  if (geo.opacity > 0.002) {
    const look: CloudLook = {
      base: ENGINE.CLOUD_BASE,
      opacity: geo.opacity * (geo.cloud ?? 1),
      dim: geo.dimOuter,
      twinkle: o.time !== null && o.variant !== "lite",
      glow: ENGINE.CLOUD_GLOW,
    };
    const moteStrength = (geo.motes ?? 0) * geo.opacity;
    p.budget = total - ENGINE.RESERVE;
    if (look.opacity > 0.002) paintCloud(p, v, starCloud(SEED_MAP, COUNTS[o.variant]), look, 0);
    p.budget = total - ENGINE.RESERVE / 2;
    paintMotes(p, v, motes(), moteStrength);
    p.budget = total;
    if (geo.threads) paintThreads(p, v, geo.threads, geo.opacity);
    if (geo.rings) paintRings(p, v, geo.rings, geo.opacity);
    if (geo.clusters) paintClusters(p, v, geo.clusters.list, geo.clusters.wave, geo.opacity);
    if (geo.stars) paintStars(p, v, geo.stars, geo.opacity);
  }
  g.globalAlpha = 1;
  g.setTransform(1, 0, 0, 1, 0, 0);
  return p.count;
}

/** A map detail level, as map-layer.tsx lays it out: a crop of the viewBox at `scale` px per unit. */
export type StillLevel = { readonly id: string; readonly src: string; readonly box: PlaneBox; readonly toleranceKm: number };

export type PlacedLevel = StillLevel & { readonly weight: number; readonly transform: string | null };

export type MapPlacement = {
  /** The whole map group's opacity (the frame's `geo.map`). */
  readonly opacity: number;
  readonly levels: readonly PlacedLevel[];
  /** Where the haze's top edge goes, px from the top: the camera's horizon on the ground plane. */
  readonly hazeTop: number;
};

/** Where a screen point's ray meets the map plane, in viewBox units (engine.ts `ground`). */
function ground(v: View, sx: number, sy: number): [number, number] | null {
  const a = (sx - v.cx) / v.focal;
  const b = (sy - v.cy) / v.focal;
  const dy = v.fy + a * v.ry - b * v.uy;
  if (dy >= -1e-6) return null;
  const t = -v.py / dy;
  if (t <= 0) return null;
  return [v.px + t * (v.fx + a * v.rx - b * v.ux), -(v.pz + t * (v.fz + a * v.rz - b * v.uz))];
}

/**
 * engine.ts `placeMap()`: which levels show, how strongly, and their
 * matrix3d. A level counts only once it covers the whole view; it fades in
 * as the coarser one nears its 2 px limit, judged in CSS pixels as on the
 * page. The transforms are for an element laid out at `box.scale` device
 * pixels per unit, in a stage of cssWidth × dpr device pixels.
 */
export function placeMap(geo: GeoState, levels: readonly StillLevel[], o: StillOptions): MapPlacement {
  const css = view(geo.camera, o.cssWidth, o.cssHeight);
  const device = view(geo.camera, o.cssWidth * o.dpr, o.cssHeight * o.dpr);
  const raw = geo.opacity * (geo.map ?? 0);
  const opacity = raw < 0.002 ? 0 : Math.round(raw * 1000) / 1000;
  const horizon = opacity && css.uy > 1e-4 ? css.cy + (css.focal * css.fy) / css.uy : -1e9;
  const hazeTop = Math.max(-2 * o.cssHeight, Math.min(o.cssHeight, Math.round(horizon * 2) / 2)) * o.dpr;
  const sorted = [...levels].sort((a, b) => b.toleranceKm - a.toleranceKm);
  const pxPerKm = pixelsPerUnit(css) / KM_PER_UNIT;
  const corners = opacity
    ? [ground(css, 0, 0), ground(css, css.width, 0), ground(css, 0, css.height), ground(css, css.width, css.height)]
    : [];
  const usable = sorted.map((m, i) => {
    if (!opacity) return false;
    if (i === 0) return true;
    return corners.every((c) => !!c && c[0] >= m.box.x && c[0] <= m.box.x + m.box.width && c[1] >= m.box.y && c[1] <= m.box.y + m.box.height);
  });
  let previous = -1;
  const placed = sorted.map((m, i) => {
    let weight = 0;
    if (usable[i]) {
      const next = usable.indexOf(true, i + 1);
      const fadeIn = previous < 0 ? 1 : smoothstep(1.3, 1.65, pxPerKm * sorted[previous].toleranceKm);
      const fadeOut = next < 0 ? 0 : smoothstep(1.65, 2, pxPerKm * m.toleranceKm);
      weight = Math.round(fadeIn * (1 - fadeOut) * 1000) / 1000;
      previous = i;
    }
    const transform = weight > 0 ? planeMatrix(device, m.box) : null;
    return { ...m, weight: transform ? weight : 0, transform };
  });
  return { opacity, levels: placed, hazeTop };
}

/** A world point on the stage, in device pixels, or null behind the camera. */
export function toScreen(geo: GeoState, o: StillOptions, world: readonly [number, number, number]): { x: number; y: number } | null {
  const v = view(geo.camera, o.cssWidth * o.dpr, o.cssHeight * o.dpr);
  const dx = world[0] - v.px;
  const dy = world[1] - v.py;
  const dz = world[2] - v.pz;
  const depth = dx * v.fx + dy * v.fy + dz * v.fz;
  if (depth <= 0) return null;
  const k = v.focal / depth;
  return { x: v.cx + (dx * v.rx + dy * v.ry + dz * v.rz) * k, y: v.cy - (dx * v.ux + dy * v.uy + dz * v.uz) * k };
}
