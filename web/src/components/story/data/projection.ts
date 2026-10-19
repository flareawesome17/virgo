/**
 * The story map's projection: where a latitude and longitude land in the
 * map's viewBox, and back.
 *
 * Transverse Mercator on WGS84, centred on the archipelago:
 * `+proj=tmerc +lat_0=12 +lon_0=122 +k=1`. It is conformal (shapes and
 * bearings hold locally), and its scale error stays under 0.4% across the
 * frame (k = 1.0037 at the west edge, 1 on 122°E). The Philippine grid uses
 * TM zones too, so the map reads the way local maps do.
 *
 * The maths is Snyder's ellipsoidal series (USGS Professional Paper 1395,
 * pp. 60–64). Over the whole BOUNDS rectangle it agrees with proj4's exact
 * `tmerc` to about 4 mm, and the inverse round-trips to under 1 cm.
 * `marketing-assets/scripts/build-cities.mjs` re-checks that against proj4
 * on every run, along with the FRAME constants below.
 *
 * The viewBox is north-up with y pointing down, like SVG: x grows to the east,
 * y grows to the south. Every map layer, the star seed, the city table and the
 * Remotion stills share this one frame, so a star placed here sits on the same
 * coastline everywhere.
 *
 * Zero-import on purpose (see story.ts): the page, `marketing-assets/` and
 * the Node build scripts all load this file as it is.
 *
 * Cross-engine note: `project()` uses Math.sin/cos/tan, which browsers may
 * round differently in the last bit. Anything that has to be bit-identical
 * between the page and Remotion (the sky seed's hash) should read the rounded
 * literals in `cities.generated.ts` rather than projecting at runtime.
 */

// ─── Projection parameters ───────────────────────────────────────────────

/** The proj4 / mapshaper definition this module implements. */
export const PROJ4 =
  '+proj=tmerc +lat_0=12 +lon_0=122 +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs';

/** Latitude of origin, degrees. */
export const LAT_0 = 12;
/** Central meridian, degrees east. */
export const LON_0 = 122;
/** Scale factor on the central meridian. */
export const K_0 = 1;

// WGS84.
const A = 6_378_137;
const FLATTENING = 1 / 298.257223563;
const E2 = FLATTENING * (2 - FLATTENING);
const E4 = E2 * E2;
const E6 = E4 * E2;
/** Second eccentricity squared, e′². */
const EP2 = E2 / (1 - E2);

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

// Meridian arc, Snyder (3-21).
const M1 = 1 - E2 / 4 - (3 * E4) / 64 - (5 * E6) / 256;
const M2 = (3 * E2) / 8 + (3 * E4) / 32 + (45 * E6) / 1024;
const M3 = (15 * E4) / 256 + (45 * E6) / 1024;
const M4 = (35 * E6) / 3072;

/** Distance along the meridian from the equator to `phi` (radians), metres. */
function meridianArc(phi: number): number {
  return A * (M1 * phi - M2 * Math.sin(2 * phi) + M3 * Math.sin(4 * phi) - M4 * Math.sin(6 * phi));
}

const ARC_0 = meridianArc(LAT_0 * RAD);

// Footpoint latitude, Snyder (3-24) and (3-26).
const E1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
const J1 = (3 * E1) / 2 - (27 * E1 ** 3) / 32;
const J2 = (21 * E1 ** 2) / 16 - (55 * E1 ** 4) / 32;
const J3 = (151 * E1 ** 3) / 96;
const J4 = (1097 * E1 ** 4) / 512;

export type Grid = { easting: number; northing: number };
export type LatLon = { lat: number; lon: number };
export type Point = { x: number; y: number };

/**
 * Latitude/longitude (degrees) to grid metres: easting from 122°E, northing
 * from 12°N. Snyder (8-9) to (8-11).
 */
export function tmForward(lat: number, lon: number): Grid {
  const phi = lat * RAD;
  const sin = Math.sin(phi);
  const cos = Math.cos(phi);
  const tan = Math.tan(phi);
  const n = A / Math.sqrt(1 - E2 * sin * sin);
  const t = tan * tan;
  const c = EP2 * cos * cos;
  const a = (lon - LON_0) * RAD * cos;
  const a2 = a * a;
  const easting =
    K_0 *
    n *
    (a +
      ((1 - t + c) * a * a2) / 6 +
      ((5 - 18 * t + t * t + 72 * c - 58 * EP2) * a * a2 * a2) / 120);
  const northing =
    K_0 *
    (meridianArc(phi) -
      ARC_0 +
      n *
        tan *
        (a2 / 2 +
          ((5 - t + 9 * c + 4 * c * c) * a2 * a2) / 24 +
          ((61 - 58 * t + t * t + 600 * c - 330 * EP2) * a2 * a2 * a2) / 720));
  return { easting, northing };
}

/** Grid metres back to latitude/longitude (degrees). Snyder (8-12) to (8-25). */
export function tmInverse(easting: number, northing: number): LatLon {
  const mu = (ARC_0 + northing / K_0) / (A * M1);
  const phi1 =
    mu + J1 * Math.sin(2 * mu) + J2 * Math.sin(4 * mu) + J3 * Math.sin(6 * mu) + J4 * Math.sin(8 * mu);
  const sin = Math.sin(phi1);
  const cos = Math.cos(phi1);
  const tan = Math.tan(phi1);
  const w = 1 - E2 * sin * sin;
  const c1 = EP2 * cos * cos;
  const t1 = tan * tan;
  const n1 = A / Math.sqrt(w);
  const r1 = (A * (1 - E2)) / (w * Math.sqrt(w));
  const d = easting / (n1 * K_0);
  const d2 = d * d;
  const phi =
    phi1 -
    ((n1 * tan) / r1) *
      (d2 / 2 -
        ((5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * EP2) * d2 * d2) / 24 +
        ((61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * EP2 - 3 * c1 * c1) * d2 * d2 * d2) / 720);
  const lambda =
    (d -
      ((1 + 2 * t1 + c1) * d * d2) / 6 +
      ((5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * EP2 + 24 * t1 * t1) * d * d2 * d2) / 120) /
    cos;
  return { lat: phi * DEG, lon: LON_0 + lambda * DEG };
}

// ─── The frame ───────────────────────────────────────────────────────────

/**
 * The geographic rectangle the map frames: the main archipelago, from Y'Ami
 * in Batanes (about 21.1°N) to Saluag off Sibutu (about 4.6°N), and from the
 * west coast of Balabac (about 116.9°E) to Pusan Point in Davao Oriental
 * (about 126.6°E). Each of those sits 14–22 km inside its edge.
 *
 * The Kalayaan Island Group lies west of 116.8°E and is cropped out, the
 * usual choice for a decorative map of the main islands (an inset, not a
 * wider frame, if it is ever wanted). Scarborough Shoal (15.1°N, 117.8°E) is
 * inside the rectangle; the map build's small-island filter drops it.
 */
export const BOUNDS = { west: 116.8, east: 126.8, south: 4.4, north: 21.3 } as const;

/**
 * Grid metres of the viewBox's top-left corner, and how many metres its
 * 1000-unit height spans. Derived by `frameFor(BOUNDS)` and frozen here as
 * literals; the build script fails if they ever disagree.
 */
export const FRAME = { west: -577_957, north: 1_038_129, metres: 1_878_678 } as const;

/** The map's viewBox: every point inside BOUNDS projects inside it. */
export const VIEWBOX = { x: 0, y: 0, width: 591.6, height: 1000 } as const;

/** `VIEWBOX` as an SVG `viewBox` attribute. */
export const VIEWBOX_ATTR = '0 0 591.6 1000';

/** Kilometres per viewBox unit, on the central meridian (FRAME.metres / 1e6). */
export const KM_PER_UNIT = 1.878678;

const UNITS_PER_METRE = VIEWBOX.height / FRAME.metres;

/** Where the projection origin (12°N on 122°E) sits in the viewBox. 122°E is the vertical line x = ORIGIN.x. */
export const ORIGIN: Point = {
  x: -FRAME.west * UNITS_PER_METRE,
  y: FRAME.north * UNITS_PER_METRE,
};

/** Latitude/longitude (degrees) to viewBox units: x east, y down. */
export function project(lat: number, lon: number): Point {
  const { easting, northing } = tmForward(lat, lon);
  return {
    x: (easting - FRAME.west) * UNITS_PER_METRE,
    y: (FRAME.north - northing) * UNITS_PER_METRE,
  };
}

/** ViewBox units back to latitude/longitude (degrees). */
export function unproject(x: number, y: number): LatLon {
  return tmInverse(FRAME.west + x / UNITS_PER_METRE, FRAME.north - y / UNITS_PER_METRE);
}

/** Whether a point lies inside the geographic BOUNDS rectangle. */
export function inBounds(lat: number, lon: number): boolean {
  return lat >= BOUNDS.south && lat <= BOUNDS.north && lon >= BOUNDS.west && lon <= BOUNDS.east;
}

/**
 * The frame that contains a geographic rectangle, as FRAME and VIEWBOX were
 * derived. A Transverse Mercator rectangle is curved (parallels bow toward
 * the pole away from 122°E), so this walks all four edges, keeps the
 * outermost grid values rounded outward to whole metres, and rounds the width
 * up to 0.1 unit. For the build script's check, and for re-deriving the
 * constants if BOUNDS ever changes.
 */
export function frameFor(
  bounds: { west: number; east: number; south: number; north: number },
  height = 1000,
  step = 0.01,
): { west: number; north: number; metres: number; width: number } {
  let minE = Infinity;
  let maxE = -Infinity;
  let minN = Infinity;
  let maxN = -Infinity;
  const take = (lat: number, lon: number) => {
    const { easting, northing } = tmForward(lat, lon);
    minE = Math.min(minE, easting);
    maxE = Math.max(maxE, easting);
    minN = Math.min(minN, northing);
    maxN = Math.max(maxN, northing);
  };
  const lons = [bounds.east];
  for (let i = 0; bounds.west + i * step < bounds.east; i++) lons.push(bounds.west + i * step);
  // A parallel is lowest where it crosses the central meridian.
  if (LON_0 > bounds.west && LON_0 < bounds.east) lons.push(LON_0);
  const lats = [bounds.north];
  for (let i = 0; bounds.south + i * step < bounds.north; i++) lats.push(bounds.south + i * step);
  for (const lon of lons) {
    take(bounds.south, lon);
    take(bounds.north, lon);
  }
  for (const lat of lats) {
    take(lat, bounds.west);
    take(lat, bounds.east);
  }
  const west = Math.floor(minE);
  const north = Math.ceil(maxN);
  const metres = north - Math.floor(minN);
  const width = Math.ceil(((Math.ceil(maxE) - west) * height * 10) / metres) / 10;
  return { west, north, metres, width };
}
