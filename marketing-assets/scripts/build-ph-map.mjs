/**
 * A3 + B5: builds the story map's coastline in four detail levels, and the
 * land test the sky seeds use.
 *
 * Source: geoBoundaries gbOpen PHL ADM0 (the NAMRIA and PSA coastline, via
 * OCHA's HDX COD-AB set), pinned to one commit and checked by sha256. It is
 * downloaded once into cache/ (gitignored) and read from there afterwards.
 * Licence CC BY 3.0 IGO: the credit line is written into the generated module
 * and has to appear wherever the map does.
 *
 * Every level is made the same way:
 *   1. Every vertex is projected by web/.../data/projection.ts (tmForward):
 *      the one Transverse Mercator the page, the city table, the star seed and
 *      the stills share.
 *   2. mapshaper (pinned in package.json) drops islands under the level's
 *      area, clips to the level's box and runs Douglas–Peucker at the level's
 *      tolerance. The archipelago's box is the whole frame, which is what
 *      crops the Kalayaan Island Group out (the source's only feature there is
 *      one islet at 114.28°E).
 *   3. Pins. Where simplification cut one of the 71 Nearby cities off its
 *      island, or left it nearer the sea than it really is, the original
 *      coastline is put back around that city, one bay at a time, until the
 *      city sits inside the land by PIN_MARGIN_KM (or half its true distance
 *      to the sea, if that is less).
 *   4. The rings are rounded to the level's quantum and written as one
 *      fill-only <path>. The SVG's viewBox is the level's box in the shared
 *      map units, so each level overlays the others exactly when its <img> is
 *      placed at its bbox.
 *
 * Outputs, byte-identical between runs:
 *   assets/map/{archipelago,visayas,cebu,radar}.svg
 *   ../web/src/components/story/data/ph-map.generated.ts  (zero-import)
 *
 * Every run also tests the land: the 71 cities at every level that holds them
 * and in the runtime land test; Lapu-Lapu and Tagbilaran by name; and every
 * cast and roster position in story.ts (offsetKm from HOME) at the finest
 * level that holds it. A roster bearing that lands in the sea is reported,
 * with the nearest bearing that doesn't, as a warning: story.ts belongs to
 * the story, and is never edited from here.
 *
 * Usage, from marketing-assets/:
 *   node scripts/build-ph-map.mjs           write the SVGs and the module
 *   node scripts/build-ph-map.mjs --check   fail if anything on disk is stale
 */
/* global Buffer, URL, console, process, fetch -- Node script; the package ESLint config is the Remotion (browser) preset. */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants as zlibConstants, gzipSync } from 'node:zlib';
import mapshaper from 'mapshaper';
import {
  BOUNDS,
  FRAME,
  KM_PER_UNIT,
  PROJ4,
  VIEWBOX,
  WEB_DATA,
  checkFrame,
  importTs,
  importTsSource,
  project,
  tmForward,
  unproject,
} from './lib/projection.mjs';

const CHECK = process.argv.includes('--check');
const ROOT = new URL('../../', import.meta.url);
const PACKAGE = new URL('../', import.meta.url);
const CACHE = new URL('cache/', PACKAGE);
const ASSETS = new URL('assets/map/', PACKAGE);
const OUT_MODULE = new URL('ph-map.generated.ts', WEB_DATA);
const rel = (url) => fileURLToPath(url).slice(fileURLToPath(ROOT).length).replaceAll('\\', '/');

// ─── Source ──────────────────────────────────────────────────────────────

const SOURCE = {
  name: 'geoBoundaries gbOpen PHL ADM0',
  /** The commit is pinned in the URL; GitHub redirects it to the LFS object of that commit. */
  url: 'https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/PHL/ADM0/geoBoundaries-PHL-ADM0.geojson',
  commit: '9469f09592ced973a3448cf66b6100b741b64c0d',
  bytes: 17_401_908,
  sha256: '7c3a7a39dacb5fb0c14d150061306fa5839455fbf93231854af3c6d74a1fa24f',
  licence: 'CC BY 3.0 IGO',
  licenceUrl: 'https://creativecommons.org/licenses/by/3.0/igo/',
};
const CACHE_FILE = new URL('geoBoundaries-PHL-ADM0-9469f09.geojson', CACHE);

/** The credit line the licence asks for (attribution, and that the data was changed). */
const ATTRIBUTION =
  'Philippine boundaries: NAMRIA and PSA, via OCHA (HDX) and geoBoundaries (Runfola et al. 2020), CC BY 3.0 IGO. Simplified.';

// ─── Levels (storyboard §1.3) ────────────────────────────────────────────

/** The land's colour in every SVG: the night ink. Its strength on the page is the layer's opacity. */
const FILL = '#F2EDE8';

/**
 * Zoom 1× is 0.5 screen px per km: the whole frame (1,879 km tall) on about
 * 940 px. It is the scale at which the storyboard's ranges and its "about 2 px"
 * rule agree: 1 km at 4× and 0.25 km at 16× are both exactly 2 px.
 */
const ZOOM_1_PX_PER_KM = 0.5;
const MAX_ERROR_PX = 2;

/**
 * Boxes are in map units, rounded outward to 0.1 unit. `geo` boxes are the
 * map rectangle enclosing a lat/lon rectangle; `aroundHomeKm` is a square
 * centred on HOME (Cebu City).
 *
 * Budgets are gzip -9, in KB of 1,024 bytes; the build fails past them.
 */
const LEVELS = [
  {
    id: 'archipelago',
    toleranceKm: 1,
    minAreaKm2: 8,
    quantum: 0.1,
    zoomRange: [1, 4],
    box: 'frame',
    budgetKB: 12,
    note: 'The whole frame; islands under 8 km² dropped.',
  },
  {
    id: 'visayas',
    toleranceKm: 0.25,
    minAreaKm2: 2,
    quantum: 0.1,
    zoomRange: [4, 16],
    geo: { west: 121.6, east: 126.3, south: 8.45, north: 12.85 },
    budgetKB: 12,
    note: 'Panay to Samar and Siargao, Masbate and Romblon to the north coast of Mindanao.',
  },
  {
    id: 'cebu',
    toleranceKm: 0.1,
    minAreaKm2: 0.2,
    quantum: 0.02,
    zoomRange: [16, 60],
    geo: { west: 122.95, east: 124.9, south: 9.2, north: 11.45 },
    budgetKB: 10,
    note: 'All of Cebu with Bantayan, Malapascua, Mactan, Olango and Camotes, all of Bohol, and the facing coasts of Negros and Leyte.',
  },
  {
    id: 'radar',
    toleranceKm: 0.03,
    minAreaKm2: 0.005,
    quantum: 0.01,
    zoomRange: [60, 250],
    aroundHomeKm: 40,
    budgetKB: 10,
    note: 'A square 80 km on a side around Cebu City, for the Nearby rings.',
  },
];

/**
 * Reference viewports for the frame checks: a level is shown from the bottom
 * of its zoom range, where its frame is largest. Frames are centred on HOME.
 */
const VIEWPORTS = [
  { name: 'desktop 1440×900', width: 1440, height: 900 },
  { name: 'mobile 375×812', width: 375, height: 812 },
];

/** The runtime land test's outline: coarser than the archipelago so it fits in LAND_BUDGET characters. */
const LAND = { toleranceKm: 1.5, minAreaKm2: 8, quantum: 0.25 };
const LAND_BUDGET = 8 * 1024;

/** How far inside the land a pinned city must end up (or half its true distance to the sea, if less). */
const PIN_MARGIN_KM = 0.1;

/** A roster star nearer the sea than this, at the finest level that holds it, is reported. */
const ROSTER_MIN_INLAND_KM = 0.5;
/** A suggested bearing must put the star at least this far inland, at every level and on the source coast. */
const ROSTER_SUGGEST_INLAND_KM = 1;

/** The two places the storyboard names as proof that the detail is there. */
const NAMED_CHECKS = ['Lapu-Lapu', 'Tagbilaran'];

// ─── Helpers ─────────────────────────────────────────────────────────────

function fail(message) {
  console.error(`build-ph-map: ${message}`);
  process.exit(1);
}

const UNITS_PER_METRE = VIEWBOX.height / FRAME.metres;
const toUnits = ([easting, northing]) => [
  (easting - FRAME.west) * UNITS_PER_METRE,
  (FRAME.north - northing) * UNITS_PER_METRE,
];
const toMetresX = (x) => FRAME.west + x / UNITS_PER_METRE;
const toMetresY = (y) => FRAME.north - y / UNITS_PER_METRE;
const km = (units) => units * KM_PER_UNIT;
const units = (kilometres) => kilometres / KM_PER_UNIT;
const kb = (bytes) => (bytes / 1024).toFixed(1);
const sizes = (text) => ({
  raw: Buffer.byteLength(text),
  gzip9: gzipSync(text, { level: 9 }).length,
  gzip6: gzipSync(text, { level: 6 }).length,
  brotli: brotliCompressSync(text, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 } }).length,
});

/** Distance from (px, py) to the segment a–b. */
function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/** Crossing-number test against one ring ([[x, y], …], not closed). */
function inRing(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Twice the signed area (shoelace). */
function area2(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  return a;
}

/**
 * Rings in map units with per-ring bounds, for inside and distance queries.
 * `skip[i]` marks edge i → i+1 as not coastline (it runs along a crop's box).
 * The source has no holes, and every ring is an island, so "inside any ring"
 * is "on land".
 */
class RingSet {
  constructor(rings, skips = null) {
    this.rings = rings.map((pts, r) => {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const [x, y] of pts) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
      return { pts, minX, minY, maxX, maxY, skip: skips ? skips[r] : null };
    });
  }

  /** Index of the ring holding (x, y), or -1 at sea. */
  ringAt(x, y) {
    for (let r = 0; r < this.rings.length; r++) {
      const ring = this.rings[r];
      if (x < ring.minX || x > ring.maxX || y < ring.minY || y > ring.maxY) continue;
      if (inRing(x, y, ring.pts)) return r;
    }
    return -1;
  }

  contains(x, y) {
    return this.ringAt(x, y) !== -1;
  }

  /** Distance to the nearest coastline edge, in map units (crop edges excluded). */
  coastDistance(x, y) {
    let best = Infinity;
    for (const ring of this.rings) {
      const dx = Math.max(ring.minX - x, 0, x - ring.maxX);
      const dy = Math.max(ring.minY - y, 0, y - ring.maxY);
      if (Math.hypot(dx, dy) >= best) continue;
      const { pts, skip } = ring;
      for (let i = 0; i < pts.length; i++) {
        if (skip && skip[i]) continue;
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const d = segmentDistance(x, y, a[0], a[1], b[0], b[1]);
        if (d < best) best = d;
      }
    }
    return best;
  }

  /** Signed distance to the coast in km: positive on land, negative at sea. */
  landKm(x, y) {
    const d = km(this.coastDistance(x, y));
    return this.contains(x, y) ? d : -d;
  }
}

/** Douglas–Peucker over `chain` (endpoints kept); returns the interior indices it keeps. */
function douglasPeucker(chain, tolerance) {
  const keep = new Uint8Array(chain.length);
  const stack = [[0, chain.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let max = -1;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const d = segmentDistance(chain[i][0], chain[i][1], chain[a][0], chain[a][1], chain[b][0], chain[b][1]);
      if (d > max) {
        max = d;
        at = i;
      }
    }
    if (max > tolerance) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  const out = [];
  for (let i = 1; i < chain.length - 1; i++) if (keep[i]) out.push(i);
  return out;
}

const mulberry = (a) => () => {
  let t = (a += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// ─── 1. The source, cached and verified ──────────────────────────────────

if (!existsSync(CACHE_FILE)) {
  if (CHECK) fail(`${rel(CACHE_FILE)} is missing; run without --check once to download it`);
  mkdirSync(CACHE, { recursive: true });
  console.log(`download  ${SOURCE.url}`);
  const response = await fetch(SOURCE.url);
  if (!response.ok) fail(`download failed: HTTP ${response.status} ${response.statusText}`);
  const body = Buffer.from(await response.arrayBuffer());
  const hash = createHash('sha256').update(body).digest('hex');
  if (hash !== SOURCE.sha256) fail(`downloaded file has sha256 ${hash}, expected ${SOURCE.sha256}; nothing was saved`);
  writeFileSync(CACHE_FILE, body);
}
const sourceBytes = readFileSync(CACHE_FILE);
const sourceHash = createHash('sha256').update(sourceBytes).digest('hex');
if (sourceHash !== SOURCE.sha256 || sourceBytes.length !== SOURCE.bytes) {
  fail(`${rel(CACHE_FILE)} has sha256 ${sourceHash} (${sourceBytes.length} bytes), expected ${SOURCE.sha256}; delete it and run again`);
}
console.log(`source    ${rel(CACHE_FILE)}: ${SOURCE.bytes} bytes, sha256 ok (${SOURCE.sha256.slice(0, 12)}…)`);

checkFrame();
const story = await importTs(new URL('story.ts', WEB_DATA));
const citiesModule = await importTs(new URL('cities.generated.ts', WEB_DATA));
const { CITIES, HOME, offsetKm } = citiesModule;
if (HOME.name !== story.HOME.city) fail(`cities.generated.ts HOME is ${HOME.name}, story.ts says ${story.HOME.city}`);

// ─── 2. Project ──────────────────────────────────────────────────────────

const geojson = JSON.parse(sourceBytes.toString('utf8'));
if (geojson.features.length !== 1 || geojson.features[0].geometry.type !== 'MultiPolygon') {
  fail('expected one MultiPolygon feature in the source');
}
const sourcePolygons = geojson.features[0].geometry.coordinates;
let holes = 0;
let sourceVertices = 0;
const projected = sourcePolygons.map((polygon) => {
  holes += polygon.length - 1;
  return polygon.map((ring) => {
    sourceVertices += ring.length;
    return ring.map(([lon, lat]) => {
      const g = tmForward(lat, lon);
      return [g.easting, g.northing];
    });
  });
});
// Every ring an island makes "inside any ring" the land test. A hole would break that.
if (holes) fail(`the source has ${holes} holes; the land test assumes none`);
const outside = sourcePolygons.filter((p) =>
  p[0].every(([lon, lat]) => !(lon >= BOUNDS.west && lon <= BOUNDS.east && lat >= BOUNDS.south && lat <= BOUNDS.north)),
);
console.log(
  `project   ${sourcePolygons.length} islands, ${sourceVertices} vertices, no holes; ` +
    `${outside.length} wholly outside BOUNDS (Kalayaan: ${outside.map((p) => `${p[0][0][1].toFixed(2)}°N ${p[0][0][0].toFixed(2)}°E`).join(', ')})`,
);
const projectedInput = {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: projected } }],
};

/** The whole source coastline in map units: ground truth for "how far from the sea is this, really?". */
const truth = new RingSet(projected.map((polygon) => polygon[0].slice(0, -1).map(toUnits)));

// ─── 3. Levels ───────────────────────────────────────────────────────────

const frameBox = { x: 0, y: 0, width: VIEWBOX.width, height: VIEWBOX.height };
const outward = (lo, hi) => {
  const x0 = Math.floor(lo * 10) / 10;
  const x1 = Math.ceil(hi * 10) / 10;
  return [x0, Number((x1 - x0).toFixed(1))];
};
function boxFor(level) {
  if (level.box === 'frame') return frameBox;
  if (level.geo) {
    const { west, east, south, north } = level.geo;
    const pts = [];
    for (let i = 0; i <= 100; i++) {
      const lon = west + ((east - west) * i) / 100;
      const lat = south + ((north - south) * i) / 100;
      pts.push(project(south, lon), project(north, lon), project(lat, west), project(lat, east));
    }
    const [x, width] = outward(Math.min(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.x)));
    const [y, height] = outward(Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.y)));
    return { x, y, width, height };
  }
  const half = units(level.aroundHomeKm);
  const [x, width] = outward(HOME.x - half, HOME.x + half);
  const [y, height] = outward(HOME.y - half, HOME.y + half);
  return { x, y, width, height };
}
const inBox = (box, x, y) => x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;

/** One mapshaper pass over the projected source; returns the outer rings in grid metres (not closed). */
async function mapshaperRings(commands) {
  const out = await mapshaper.applyCommands(
    `-i src.json -proj init="${PROJ4}" ${commands} -o out.json format=geojson geojson-type=FeatureCollection`,
    { 'src.json': projectedInput },
  );
  const fc = JSON.parse(out['out.json']);
  const rings = [];
  for (const feature of fc.features) {
    if (!feature.geometry) continue;
    const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    for (const polygon of polygons) {
      if (polygon.length !== 1) fail('mapshaper returned a polygon with holes');
      rings.push(polygon[0].slice(0, -1));
    }
  }
  return rings;
}

/**
 * How far past its viewBox a crop's land is clipped. Simplification can drop
 * the vertex where a coast meets the clip line, so the clip line is put where
 * nobody sees it: within the viewBox the land is plain coastline, simplified,
 * and it runs to the image's edge with no seam. The whole frame needs none
 * (no land comes near it).
 */
function bleedFor(spec, box) {
  if (box === frameBox) return 0;
  const q = spec.quantum;
  return Math.ceil(Math.max(2 * units(spec.toleranceKm), 3 * q) / q - 1e-9) * q;
}

/**
 * Runs one level: mapshaper twice (with and without simplification, so every
 * kept vertex can be traced to its place on the full coastline), then the
 * pins, then the rounding. Returns the rounded rings (integers, in quanta)
 * and what the pins did.
 */
async function buildLevel(spec, box) {
  const bleed = bleedFor(spec, box);
  const cut = { x: box.x - bleed, y: box.y - bleed, width: box.width + 2 * bleed, height: box.height + 2 * bleed };
  const clip = [toMetresX(cut.x), toMetresY(cut.y + cut.height), toMetresX(cut.x + cut.width), toMetresY(cut.y)].join(',');
  const common = `-filter-islands min-area=${spec.minAreaKm2}km2 -clip bbox=${clip}`;
  const base = await mapshaperRings(common);
  const simple = await mapshaperRings(`${common} -simplify dp interval=${spec.toleranceKm * 1000} keep-shapes`);

  // Trace every kept vertex back to its ring and index on the unsimplified coastline.
  // (A coordinate can occur twice where two islands touch, so each key holds a list.)
  const where = new Map();
  base.forEach((ring, r) =>
    ring.forEach(([e, n], i) => {
      const key = `${e},${n}`;
      const hits = where.get(key);
      if (hits) hits.push([r, i]);
      else where.set(key, [[r, i]]);
    }),
  );
  const entries = simple.map((ring, s) => {
    const votes = new Map();
    for (const [e, n] of ring) {
      const hits = where.get(`${e},${n}`);
      if (!hits) fail(`${spec.id}: simplified ring ${s} has a vertex that is not on the source coastline`);
      for (const [r] of hits) votes.set(r, (votes.get(r) ?? 0) + 1);
    }
    const r = [...votes.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
    const kept = ring.map(([e, n]) => {
      const hit = where.get(`${e},${n}`).find(([hr]) => hr === r);
      if (!hit) fail(`${spec.id}: simplified ring ${s} spans two source rings`);
      return hit[1];
    });
    let descents = 0;
    for (let i = 0; i < kept.length; i++) if (kept[(i + 1) % kept.length] < kept[i]) descents++;
    if (descents !== 1) fail(`${spec.id}: simplified ring ${s} does not follow its source ring in order`);
    return { base: r, kept };
  });
  const baseUnits = base.map((ring) => ring.map(toUnits));
  const q = spec.quantum;
  // The clip line, in quanta: edges along it are not coastline. So is anything outside the viewBox.
  const Q = { x0: Math.round(cut.x / q), y0: Math.round(cut.y / q), x1: Math.round((cut.x + cut.width) / q), y1: Math.round((cut.y + cut.height) / q) };
  const V = { x0: Math.round(box.x / q), y0: Math.round(box.y / q), x1: Math.round((box.x + box.width) / q), y1: Math.round((box.y + box.height) / q) };
  const outsideView = (a, b) =>
    (a[0] <= V.x0 && b[0] <= V.x0) || (a[0] >= V.x1 && b[0] >= V.x1) || (a[1] <= V.y0 && b[1] <= V.y0) || (a[1] >= V.y1 && b[1] >= V.y1);

  const quantise = (entry) => {
    const pts = [];
    for (const i of entry.kept) {
      const [x, y] = baseUnits[entry.base][i];
      const X = Math.round(x / q);
      const Y = Math.round(y / q);
      const last = pts[pts.length - 1];
      if (last && last[0] === X && last[1] === Y) continue;
      pts.push([X, Y]);
    }
    while (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
    return pts.length >= 3 && area2(pts) !== 0 ? pts : null;
  };
  const edgeSkips = (pts) =>
    pts.map((a, i) => {
      const b = pts[(i + 1) % pts.length];
      const onClip = (a[0] === b[0] && (a[0] === Q.x0 || a[0] === Q.x1)) || (a[1] === b[1] && (a[1] === Q.y0 || a[1] === Q.y1));
      return onClip || (bleed > 0 && outsideView(a, b)) ? 1 : 0;
    });
  const snapshot = () => {
    const quantised = entries.map(quantise);
    const live = quantised.map((pts, i) => (pts ? i : -1)).filter((i) => i !== -1);
    const set = new RingSet(
      live.map((i) => quantised[i].map(([X, Y]) => [X * q, Y * q])),
      live.map((i) => edgeSkips(quantised[i])),
    );
    return { quantised, live, set };
  };

  // Pins: put the coastline back around any city the simplification moved toward the sea.
  const pins = [];
  let state = snapshot();
  for (const c of CITIES) {
    if (!inBox(box, c.x, c.y)) continue;
    const trueKm = truth.landKm(c.x, c.y);
    if (trueKm <= 0) fail(`${c.name} is in the sea on the source coastline (${trueKm.toFixed(2)} km)`);
    const need = Math.min(PIN_MARGIN_KM, trueKm / 2);
    const ok = () => state.set.landKm(c.x, c.y) >= need;
    if (ok()) continue;
    const before = state.set.landKm(c.x, c.y);
    const r = baseUnits.findIndex((ring) => inRing(c.x, c.y, ring));
    if (r === -1) fail(`${spec.id}: ${c.name} is on an island smaller than ${spec.minAreaKm2} km²; keep that island`);
    const entry = entries.find((e) => e.base === r);
    if (!entry) fail(`${spec.id}: ${c.name}'s island was dropped`);
    const ring = baseUnits[r];
    const n = ring.length;
    const chainOf = (a, b) => {
      const chain = [];
      for (let i = a; ; i = (i + 1) % n) {
        chain.push(i);
        if (i === b) break;
      }
      return chain;
    };
    let added = 0;
    for (let round = 0; round < 64 && !ok(); round++) {
      // The bay the point sits in: the kept edge whose original stretch of coast encloses it,
      // else (inside, but too near the sea) the kept edge nearest to it.
      let pick = -1;
      let nearest = Infinity;
      for (let k = 0; k < entry.kept.length; k++) {
        const a = entry.kept[k];
        const b = entry.kept[(k + 1) % entry.kept.length];
        const chain = chainOf(a, b);
        if (chain.length > 2 && inRing(c.x, c.y, chain.map((i) => ring[i]))) {
          pick = k;
          break;
        }
        const d = segmentDistance(c.x, c.y, ring[a][0], ring[a][1], ring[b][0], ring[b][1]);
        if (d < nearest && chain.length > 2) {
          nearest = d;
          pick = k;
        }
      }
      if (pick === -1) break;
      const a = entry.kept[pick];
      const b = entry.kept[(pick + 1) % entry.kept.length];
      const chain = chainOf(a, b);
      const points = chain.map((i) => ring[i]);
      // Halve the tolerance on that stretch until the city is inside; at worst the stretch comes back whole.
      let restored = null;
      for (let t = units(spec.toleranceKm) / 2; ; t /= 2) {
        const keep = t < 1e-6 ? points.map((_, i) => i).slice(1, -1) : douglasPeucker(points, t);
        if (!keep.length) {
          if (t < 1e-6) break;
          continue;
        }
        restored = keep.map((i) => chain[i]);
        entry.kept.splice(pick + 1, 0, ...restored);
        state = snapshot();
        if (ok() || t < 1e-6) break;
        entry.kept.splice(pick + 1, restored.length);
      }
      added += restored ? restored.length : 0;
    }
    state = snapshot();
    const after = state.set.landKm(c.x, c.y);
    if (after < need) fail(`${spec.id}: could not pin ${c.name} (${after.toFixed(3)} km after restoring ${added} vertices)`);
    pins.push({ name: c.name, beforeKm: before, afterKm: after, trueKm, added });
  }

  const rings = state.live.map((i) => state.quantised[i]);
  return { rings, set: state.set, pins, baseRings: base.length };
}

/** One <path>, all relative: `m X Y dx dy …z m dx dy …z`, integers in quanta, scaled back by the transform. */
function pathData(rings) {
  let d = '';
  let at = null;
  for (const pts of rings) {
    const nums = at ? [pts[0][0] - at[0], pts[0][1] - at[1]] : [pts[0][0], pts[0][1]];
    for (let k = 1; k < pts.length; k++) nums.push(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    d += 'm';
    nums.forEach((v, i) => {
      if (i > 0 && v >= 0) d += ' ';
      d += String(v);
    });
    d += 'z';
    at = pts[0];
  }
  return d;
}

const num = (v) => String(v).replace(/^0\./, '.');
function svgFor(box, quantum, rings) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.x} ${box.y} ${box.width} ${box.height}">` +
    `<path fill="${FILL}" transform="scale(${num(quantum)})" d="${pathData(rings)}"/></svg>\n`
  );
}

const levels = [];
for (const spec of LEVELS) {
  const box = boxFor(spec);
  const built = await buildLevel(spec, box);
  const svg = svgFor(box, spec.quantum, built.rings);
  const size = sizes(svg);
  const vertices = built.rings.reduce((n, r) => n + r.length, 0);
  levels.push({ spec, box, ...built, svg, size, vertices, file: `${spec.id}.svg` });
}

// ─── 4. The runtime land test's outline ──────────────────────────────────

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
/** Zigzag, then 5 bits per character with a continuation bit, in the base64url alphabet (as source maps do it). */
function vlq(value) {
  let z = value < 0 ? -value * 2 - 1 : value * 2;
  let out = '';
  while (z >= 32) {
    out += B64[(z & 31) | 32];
    z = Math.floor(z / 32);
  }
  return out + B64[z];
}
const land = await buildLevel({ id: 'land', ...LAND }, frameBox);
const landEncoded = land.rings.map((pts) => {
  let s = vlq(pts[0][0]) + vlq(pts[0][1]);
  for (let k = 1; k < pts.length; k++) s += vlq(pts[k][0] - pts[k - 1][0]) + vlq(pts[k][1] - pts[k - 1][1]);
  return s;
});
const landText = landEncoded.join('.');
if (landText.length > LAND_BUDGET) fail(`the land outline is ${landText.length} characters; the budget is ${LAND_BUDGET}`);
const landVertices = land.rings.reduce((n, r) => n + r.length, 0);

/**
 * How far the land test's outline strays from what is drawn: the farthest any
 * drawn coastline gets inside the outline's land. A point at least this far
 * inside the outline is on land at every level, so star seeding can pass it as
 * `insetKm` and never put a star in a bay that one of the levels shows.
 */
let landSafeUnits = 0;
let landSafeWhere = '';
let landSafeLevel = '';
for (const level of levels) {
  for (const ring of level.set.rings) {
    const { pts, skip } = ring;
    for (let i = 0; i < pts.length; i++) {
      if (skip && skip[i]) continue;
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.1));
      for (let s = 0; s < steps; s++) {
        const x = a[0] + ((b[0] - a[0]) * s) / steps;
        const y = a[1] + ((b[1] - a[1]) * s) / steps;
        if (!inBox(level.box, x, y) || !land.set.contains(x, y)) continue;
        const d = land.set.coastDistance(x, y);
        if (d > landSafeUnits) {
          landSafeUnits = d;
          const ll = unproject(x, y);
          landSafeLevel = level.spec.id;
          landSafeWhere = `${ll.lat.toFixed(2)}°N ${ll.lon.toFixed(2)}°E`;
        }
      }
    }
  }
}
/** Rounded up to 0.1 km, with 0.1 km to spare. */
const LAND_SAFE_INSET_KM = Number((Math.ceil(km(landSafeUnits) * 10 - 1e-9) / 10 + 0.1).toFixed(1));

// ─── 5. The module ───────────────────────────────────────────────────────

const pxPerKm = (zoom) => Number((zoom * ZOOM_1_PX_PER_KM).toFixed(2));
const quote = (s) => `'${s.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
const wrap = (text, width) => {
  const lines = [];
  for (let i = 0; i < text.length; i += width) lines.push(text.slice(i, i + width));
  return lines;
};

const levelLiteral = (l) => `  {
    id: '${l.spec.id}',
    file: '${l.file}',
    bbox: { x: ${l.box.x}, y: ${l.box.y}, width: ${l.box.width}, height: ${l.box.height} },
    toleranceKm: ${l.spec.toleranceKm},
    zoomRange: [${l.spec.zoomRange.join(', ')}],
    pxPerKm: [${l.spec.zoomRange.map(pxPerKm).join(', ')}],
    minAreaKm2: ${l.spec.minAreaKm2},
    bytes: ${l.size.raw},
  },`;

const moduleText = `/**
 * GENERATED by marketing-assets/scripts/build-ph-map.mjs. Do not edit by hand.
 * Regenerate: cd marketing-assets && node scripts/build-ph-map.mjs
 * Check for drift: cd marketing-assets && node scripts/build-ph-map.mjs --check
 *
 * The story map's coastline (storyboard §1.3, A3/B5): four detail levels, each
 * a static SVG in marketing-assets/assets/map/ (published to the page with a
 * content hash), and a small outline for testing points against the land.
 *
 * Source: ${SOURCE.name} at commit ${SOURCE.commit.slice(0, 7)} (sha256-checked),
 * projected by ./projection.ts, simplified with mapshaper. The Kalayaan Island
 * Group lies west of the frame and is cropped out. Licence ${SOURCE.licence}:
 * MAP_ATTRIBUTION has to be shown wherever the map is (the footer).
 *
 * Placing a level: every SVG's viewBox is its \`bbox\` in the shared map units
 * (viewBox '0 0 ${VIEWBOX.width} ${VIEWBOX.height}', ${KM_PER_UNIT} km per unit, x east, y south), so
 * an <img> at left = bbox.x, top = bbox.y, width = bbox.width,
 * height = bbox.height inside the map plane lines up with every other level,
 * the city table and the stars. The land is one fill-only path in MAP_FILL;
 * how strong it reads is the layer's opacity, and a change of level is an
 * opacity crossfade.
 *
 * Choosing a level: \`zoomRange\` is in multiples of ZOOM_1_PX_PER_KM, and
 * \`pxPerKm\` is the same range in screen pixels per kilometre. A level is
 * right while its simplification stays at or under about ${MAX_ERROR_PX} px
 * (pxPerKm × toleranceKm) and the visible frame fits inside its bbox. When the
 * frame is wider than the finer level's box, stay on the coarser level a
 * little longer: its error grows past ${MAX_ERROR_PX} px, which reads fine in motion.
 *
 * Zero-import on purpose (see story.ts): the page, marketing-assets/ and the
 * Node scripts load it as it is.
 */

/** The credit line the source's licence asks for. Show it wherever the map is. */
export const MAP_ATTRIBUTION =
  ${quote(ATTRIBUTION)};

/** Where the coastline comes from, pinned and hashed. */
export const MAP_SOURCE = {
  name: ${quote(SOURCE.name)},
  url: ${quote(SOURCE.url)},
  sha256: ${quote(SOURCE.sha256)},
  licence: ${quote(SOURCE.licence)},
  licenceUrl: ${quote(SOURCE.licenceUrl)},
} as const;

/** Kilometres per map unit on the central meridian (projection.ts KM_PER_UNIT). */
export const KM_PER_UNIT = ${KM_PER_UNIT};

/** The land's colour in every level: the night ink. Set its strength with the layer's opacity. */
export const MAP_FILL = '${FILL}';

/** Zoom 1×, in screen px per km: the whole frame (${Math.round(VIEWBOX.height * KM_PER_UNIT).toLocaleString('en-US')} km tall) on about ${Math.round(VIEWBOX.height * KM_PER_UNIT * ZOOM_1_PX_PER_KM)} px. */
export const ZOOM_1_PX_PER_KM = ${ZOOM_1_PX_PER_KM};

/** The most a level's simplification may show on screen, in px (storyboard §1.3). */
export const MAX_ERROR_PX = ${MAX_ERROR_PX};

export type MapLevelId = ${LEVELS.map((l) => `'${l.id}'`).join(' | ')};

export type MapLevel = {
  readonly id: MapLevelId;
  /** The SVG's name in marketing-assets/assets/map/. */
  readonly file: string;
  /** The SVG's viewBox, in map units: where its <img> goes on the map plane. */
  readonly bbox: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  /** Douglas–Peucker tolerance: the most the drawn coast strays from the source, before rounding. */
  readonly toleranceKm: number;
  /** Zooms the level is for, in multiples of ZOOM_1_PX_PER_KM (storyboard §1.3). */
  readonly zoomRange: readonly [number, number];
  /** The same range in screen px per km. */
  readonly pxPerKm: readonly [number, number];
  /** Islands smaller than this are left out. */
  readonly minAreaKm2: number;
  /** The SVG's size on disk, uncompressed. */
  readonly bytes: number;
};

/** Coarse to fine. Every level shows Lapu-Lapu on Mactan and Tagbilaran on Bohol as land. */
export const MAP_LEVELS = [
${levels.map(levelLiteral).join('\n')}
] as const satisfies readonly MapLevel[];

/** One level, by id. */
export function mapLevel(id: MapLevelId): MapLevel {
  const level = MAP_LEVELS.find((l) => l.id === id);
  if (!level) throw new Error(\`Unknown map level: \${id}\`);
  return level;
}

// ─── Land test ───────────────────────────────────────────────────────────

/** The land test's outline: Douglas–Peucker at this tolerance, islands of ${LAND.minAreaKm2} km² and up, as the archipelago level. */
export const LAND_TOLERANCE_KM = ${LAND.toleranceKm};

/**
 * Pass this as \`insetKm\` to be sure a point is on land at every level, not
 * only in the outline. The build measures how far any drawn coastline reaches
 * inside the outline's land (${km(landSafeUnits).toFixed(2)} km, the ${landSafeLevel} level's coast near
 * ${landSafeWhere}) and rounds up, with 0.1 km to spare.
 */
export const LAND_SAFE_INSET_KM = ${LAND_SAFE_INSET_KM};

/** Map units per step of LAND below. */
const LAND_QUANTUM = ${LAND.quantum};

/**
 * ${land.rings.length} islands, ${landVertices} vertices. Each island is x, y, then the
 * steps between vertices, in LAND_QUANTUM: zigzag integers, 5 bits per
 * base64url character with a continuation bit. Islands are separated by '.';
 * line breaks mean nothing.
 */
const LAND = \`
${wrap(landText, 96).join('\n')}
\`;

const DIGITS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export type LandRing = {
  /** Vertices as [x0, y0, x1, y1, …], in map units, not closed. */
  readonly points: Float64Array;
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
};

let decoded: readonly LandRing[] | undefined;

/** The land test's outline, decoded on first use. */
export function landRings(): readonly LandRing[] {
  if (decoded) return decoded;
  const value = new Int16Array(128).fill(-1);
  for (let i = 0; i < DIGITS.length; i++) value[DIGITS.charCodeAt(i)] = i;
  const rings: LandRing[] = [];
  for (const text of LAND.replace(/\\s/g, '').split('.')) {
    const xy: number[] = [];
    let acc = 0;
    let scale = 1;
    let x = 0;
    let y = 0;
    let count = 0;
    for (let i = 0; i < text.length; i++) {
      const digit = value[text.charCodeAt(i)];
      acc += (digit & 31) * scale;
      scale *= 32;
      if (digit & 32) continue;
      const step = acc % 2 ? -(acc + 1) / 2 : acc / 2;
      acc = 0;
      scale = 1;
      if (count++ % 2 === 0) {
        x += step;
      } else {
        y += step;
        xy.push(x * LAND_QUANTUM, y * LAND_QUANTUM);
      }
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < xy.length; i += 2) {
      minX = Math.min(minX, xy[i]);
      maxX = Math.max(maxX, xy[i]);
      minY = Math.min(minY, xy[i + 1]);
      maxY = Math.max(maxY, xy[i + 1]);
    }
    rings.push({ points: Float64Array.from(xy), minX, minY, maxX, maxY });
  }
  decoded = rings;
  return rings;
}

function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/**
 * Whether a map point (x east, y south, in map units) is on land, and, with
 * \`insetKm\`, at least that far from the sea. The outline is coarser than
 * the drawn levels (LAND_TOLERANCE_KM); pass LAND_SAFE_INSET_KM to be sure the
 * point is on land at every level. Every one of the 71 Nearby cities passes
 * with no inset.
 */
export function pointInLand(x: number, y: number, insetKm = 0): boolean {
  const pad = insetKm / KM_PER_UNIT;
  let inside = false;
  for (const ring of landRings()) {
    if (x < ring.minX - pad || x > ring.maxX + pad || y < ring.minY - pad || y > ring.maxY + pad) continue;
    const p = ring.points;
    const n = p.length;
    if (!inside && x >= ring.minX && x <= ring.maxX && y >= ring.minY && y <= ring.maxY) {
      let crossing = false;
      for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
        const yi = p[i + 1];
        const yj = p[j + 1];
        if (yi > y !== yj > y && x < ((p[j] - p[i]) * (y - yi)) / (yj - yi) + p[i]) crossing = !crossing;
      }
      inside = crossing;
    }
    if (pad > 0) {
      for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
        if (segmentDistance(x, y, p[j], p[j + 1], p[i], p[i + 1]) < pad) return false;
      }
    }
  }
  return inside;
}
`;

// ─── 6. Prove the module, then test the land ─────────────────────────────

const gen = await importTsSource(moduleText);
const decodedRings = gen.landRings();
if (decodedRings.length !== land.rings.length) fail(`the module decodes ${decodedRings.length} land rings, expected ${land.rings.length}`);
decodedRings.forEach((ring, r) => {
  const want = land.rings[r];
  if (ring.points.length !== want.length * 2) fail(`land ring ${r} decodes to ${ring.points.length / 2} vertices, expected ${want.length}`);
  want.forEach(([X, Y], i) => {
    if (Math.abs(ring.points[i * 2] - X * LAND.quantum) > 1e-9 || Math.abs(ring.points[i * 2 + 1] - Y * LAND.quantum) > 1e-9) {
      fail(`land ring ${r} vertex ${i} decodes wrong`);
    }
  });
});
for (const l of levels) {
  const m = gen.mapLevel(l.spec.id);
  if (m.bbox.x !== l.box.x || m.bbox.width !== l.box.width || m.bytes !== l.size.raw) fail(`module metadata for ${l.spec.id} is wrong`);
}
// pointInLand against the encoder's own outline, at seeded random points.
{
  const rand = mulberry(0x4c414e44);
  for (let i = 0; i < 20_000; i++) {
    const x = rand() * VIEWBOX.width;
    const y = rand() * VIEWBOX.height;
    const inset = i % 4 === 0 ? 1 + rand() * 2 : 0;
    const want = land.set.contains(x, y) && km(land.set.coastDistance(x, y)) >= inset;
    // Skip points within a hair of an edge, where float order can differ.
    if (Math.abs(km(land.set.coastDistance(x, y)) - inset) < 1e-6) continue;
    if (gen.pointInLand(x, y, inset) !== want) fail(`pointInLand disagrees with the encoder at ${x}, ${y}, inset ${inset}`);
  }
}

console.log('levels    level         box (map units)                  km          tol km  islands  verts    raw KB  gzip -9  gzip -6  brotli  budget');
for (const l of levels) {
  const b = l.box;
  console.log(
    `          ${l.spec.id.padEnd(12)}  ${`${b.x} ${b.y} ${b.width} ${b.height}`.padEnd(31)}  ${`${Math.round(km(b.width))}×${Math.round(km(b.height))}`.padEnd(10)}  ${String(l.spec.toleranceKm).padStart(6)}  ${String(l.rings.length).padStart(7)}  ${String(l.vertices).padStart(5)}  ${kb(l.size.raw).padStart(8)}  ${kb(l.size.gzip9).padStart(7)}  ${kb(l.size.gzip6).padStart(7)}  ${kb(l.size.brotli).padStart(6)}  ≤ ${l.spec.budgetKB}`,
  );
  if (l.size.gzip9 > l.spec.budgetKB * 1024) fail(`${l.file} is ${kb(l.size.gzip9)} KB gzipped; the budget is ${l.spec.budgetKB} KB`);
}
console.log(`          land test     whole frame                      outline     ${String(LAND.toleranceKm).padStart(6)}  ${String(land.rings.length).padStart(7)}  ${String(landVertices).padStart(5)}  ${kb(landText.length).padStart(8)} characters (budget ${kb(LAND_BUDGET)} KB)`);
console.log(`          land test     safe inset ${LAND_SAFE_INSET_KM} km (farthest drawn coast inside the outline: ${km(landSafeUnits).toFixed(2)} km, the ${landSafeLevel} level near ${landSafeWhere})`);

// Frames: the largest frame centred on HOME that each box holds, against the frame at the bottom of its zoom range.
console.log('frames    level         fits around Cebu City   at the bottom of its zoom range');
for (const l of levels) {
  const b = l.box;
  const fitW = 2 * km(Math.min(HOME.x - b.x, b.x + b.width - HOME.x));
  const fitH = 2 * km(Math.min(HOME.y - b.y, b.y + b.height - HOME.y));
  const atLow = VIEWPORTS.map((v) => {
    const pk = l.spec.zoomRange[0] * ZOOM_1_PX_PER_KM;
    const w = v.width / pk;
    const h = v.height / pk;
    const fits = l.spec.box === 'frame' || (w <= fitW && h <= fitH);
    return `${v.name} ${Math.round(w)}×${Math.round(h)} km ${fits ? 'fits' : 'DOES NOT FIT'}`;
  });
  console.log(`          ${l.spec.id.padEnd(12)}  ${`${Math.round(fitW)}×${Math.round(fitH)} km`.padEnd(22)}  ${atLow.join('; ')}`);
}

// Pins.
for (const l of [...levels, { spec: { id: 'land test' }, pins: land.pins }]) {
  for (const p of l.pins) {
    console.log(
      `pin       ${l.spec.id.padEnd(12)}  ${p.name.padEnd(16)} ${p.beforeKm >= 0 ? 'on land' : 'in the sea'} at ${p.beforeKm.toFixed(2)} km → ${p.afterKm.toFixed(2)} km inland (source coast: ${p.trueKm.toFixed(2)} km), ${p.added} source vertices restored`,
    );
  }
}

// Cities: on land at every level that holds them, and in the land test.
let cityFailures = 0;
let closest = { km: Infinity, at: '' };
for (const c of CITIES) {
  for (const l of levels) {
    if (!inBox(l.box, c.x, c.y)) continue;
    const d = l.set.landKm(c.x, c.y);
    if (d <= 0) {
      cityFailures++;
      console.log(`city      ${c.name} is in the sea at the ${l.spec.id} level (${d.toFixed(2)} km)`);
    }
    if (d < closest.km) closest = { km: d, at: `${c.name} at the ${l.spec.id} level` };
  }
  if (!gen.pointInLand(c.x, c.y)) {
    cityFailures++;
    console.log(`city      ${c.name} fails pointInLand`);
  }
}
if (cityFailures) fail(`${cityFailures} city checks failed`);
console.log(`cities    all ${CITIES.length} on land at every level that holds them and in pointInLand; closest to the sea: ${closest.at}, ${closest.km.toFixed(2)} km`);
for (const name of NAMED_CHECKS) {
  const c = CITIES.find((x) => x.name === name);
  const parts = levels.filter((l) => inBox(l.box, c.x, c.y)).map((l) => `${l.spec.id} ${l.set.landKm(c.x, c.y).toFixed(2)} km`);
  console.log(`named     ${name.padEnd(12)} inland by: ${parts.join(', ')}; source coast ${truth.landKm(c.x, c.y).toFixed(2)} km; pointInLand ${gen.pointInLand(c.x, c.y)}`);
}

// Cast and roster, from HOME by bearing, at the finest level that holds each one.
const finest = (x, y) => [...levels].reverse().find((l) => inBox(l.box, x, y));
const people = [
  ...Object.values(story.CAST)
    .filter((m) => m.offset.km > 0)
    .map((m) => ({ name: `${m.first} (cast)`, km: m.offset.km, bearing: m.offset.bearing })),
  ...story.ROSTER.map((n) => ({ name: n.name, km: n.km, bearing: n.bearing })),
];
const placeAt = (person, bearing) => offsetKm(HOME.x, HOME.y, person.km, bearing);
const inlandEverywhere = (x, y) =>
  Math.min(truth.landKm(x, y), ...levels.filter((l) => inBox(l.box, x, y)).map((l) => l.set.landKm(x, y)));
const warnings = [];
console.log('roster    who               km  bearing  level         inland km  source km  lat, lon');
for (const person of people) {
  const p = placeAt(person, person.bearing);
  const level = finest(p.x, p.y);
  const d = level.set.landKm(p.x, p.y);
  const t = truth.landKm(p.x, p.y);
  const ll = unproject(p.x, p.y);
  const flag = d <= 0 || t <= 0 ? 'SEA' : d < ROSTER_MIN_INLAND_KM ? 'SHORE' : '';
  console.log(
    `          ${person.name.padEnd(16)} ${String(person.km).padStart(3)}  ${String(person.bearing).padStart(7)}  ${level.spec.id.padEnd(12)}  ${d.toFixed(2).padStart(9)}  ${t.toFixed(2).padStart(9)}  ${ll.lat.toFixed(4)}, ${ll.lon.toFixed(4)} ${flag}`,
  );
  if (!flag) continue;
  // The nearest bearing on each side that puts the star well inland at every level and on the source coast.
  const nearest = [1, -1].map((sign) => {
    for (let delta = 1; delta <= 180; delta++) {
      const bearing = (((person.bearing + sign * delta) % 360) + 360) % 360;
      const q = placeAt(person, bearing);
      const inland = inlandEverywhere(q.x, q.y);
      if (inland >= ROSTER_SUGGEST_INLAND_KM) return { bearing, delta: sign * delta, inland };
    }
    return null;
  });
  const options = nearest.filter(Boolean).sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta) || a.delta - b.delta);
  warnings.push({ person, flag, d, options });
}
for (const w of warnings) {
  const [best, other] = w.options;
  const say = (s) => `${s.bearing}° (${s.delta > 0 ? '+' : ''}${s.delta}°, ${s.inland.toFixed(2)} km inland)`;
  console.log(
    `WARN      ${w.person.name} (${w.person.km} km at ${w.person.bearing}°) is ${w.flag === 'SEA' ? 'in the sea' : `only ${w.d.toFixed(2)} km from the sea`}` +
      (best ? `; nearest bearing on land at every level: ${say(best)}${other ? `; other side: ${say(other)}` : ''}` : '; no bearing is on land'),
  );
}

// ─── 7. Write, or check ──────────────────────────────────────────────────

const outputs = [
  ...levels.map((l) => ({ url: new URL(l.file, ASSETS), text: l.svg })),
  { url: OUT_MODULE, text: moduleText },
];
let stale = 0;
for (const { url, text } of outputs) {
  const onDisk = existsSync(url) ? readFileSync(url, 'utf8').replaceAll('\r\n', '\n') : null;
  if (CHECK) {
    if (onDisk !== text) {
      stale++;
      console.error(`stale     ${rel(url)}`);
    }
    continue;
  }
  mkdirSync(new URL('./', url), { recursive: true });
  writeFileSync(url, text);
  console.log(`wrote     ${rel(url)} (${Buffer.byteLength(text)} bytes${onDisk === text ? ', unchanged' : ''})`);
}
if (CHECK) {
  if (stale) fail(`${stale} output(s) are stale; run: cd marketing-assets && node scripts/build-ph-map.mjs`);
  console.log('check     every output is up to date');
}
