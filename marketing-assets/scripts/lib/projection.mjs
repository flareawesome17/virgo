/**
 * The story map's projection, for the Node scripts in marketing-assets/.
 *
 * There is one implementation: web/src/components/story/data/projection.ts.
 * This module loads that file as it is and re-exports it, so a map layer, the
 * city table and the stills cannot drift from what the page draws. It adds
 * what only scripts need: a loader for the zero-import data modules, and the
 * checks against proj4 and against the frozen FRAME constants.
 *
 * Plain `node` is enough (Node 22.13 or later): the TypeScript is stripped
 * with node:module's stripTypeScriptTypes and imported from a data: URL, so no
 * flag is needed and the result is the same with or without
 * --experimental-strip-types. Node prints one ExperimentalWarning for it.
 */
/* global Buffer, URL -- Node script; the package ESLint config is the Remotion (browser) preset. */
import { readFileSync } from 'node:fs';
import * as nodeModule from 'node:module';
import proj4 from 'proj4';

/** web/src/components/story/data/, where the zero-import data modules live. */
export const WEB_DATA = new URL('../../../web/src/components/story/data/', import.meta.url);

/**
 * Import zero-import TypeScript source (a story data module) under plain Node.
 * The module is evaluated from a data: URL, so it must not import anything
 * itself: the zero-import rule, which every story data module follows.
 */
export async function importTsSource(source) {
  if (typeof nodeModule.stripTypeScriptTypes !== 'function') {
    throw new Error('Node 22.13 or later is needed to load the story data modules (node:module stripTypeScriptTypes).');
  }
  const js = nodeModule.stripTypeScriptTypes(source);
  return import(`data:text/javascript;base64,${Buffer.from(js, 'utf8').toString('base64')}`);
}

/** Import a zero-import TypeScript file under plain Node. */
export function importTs(url) {
  return importTsSource(readFileSync(url, 'utf8'));
}

const P = await importTs(new URL('projection.ts', WEB_DATA));

export const {
  PROJ4,
  LAT_0,
  LON_0,
  K_0,
  BOUNDS,
  FRAME,
  VIEWBOX,
  VIEWBOX_ATTR,
  KM_PER_UNIT,
  ORIGIN,
  tmForward,
  tmInverse,
  project,
  unproject,
  inBounds,
  frameFor,
} = P;

/** proj4's transform for the same definition (its `tmerc` is the exact Poder/Engsager algorithm). */
export const reference = proj4('EPSG:4326', PROJ4);

/** Metres between two lat/lon points, flat-earth; fine for the sub-metre errors measured here. */
function metresApart(a, b) {
  const dLat = (a.lat - b.lat) * 110_574;
  const dLon = (a.lon - b.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLon);
}

/**
 * Check the pure-JS projection against proj4 at the given points, forward
 * (grid metres) and inverse (lat/lon recovered from proj4's grid point).
 * Throws when any error reaches `toleranceM`. Returns one row per point.
 *
 * @param {{ name: string, lat: number, lon: number }[]} points
 */
export function checkAgainstProj4(points, toleranceM = 1) {
  const rows = points.map(({ name, lat, lon }) => {
    const ours = tmForward(lat, lon);
    const [easting, northing] = reference.forward([lon, lat]);
    const forwardM = Math.hypot(ours.easting - easting, ours.northing - northing);
    const back = tmInverse(easting, northing);
    const inverseM = metresApart(back, { lat, lon });
    // The viewBox step is linear; check it maps proj4's metres to the same units.
    const vb = project(lat, lon);
    const vbFromProj4 = {
      x: ((easting - FRAME.west) * VIEWBOX.height) / FRAME.metres,
      y: ((FRAME.north - northing) * VIEWBOX.height) / FRAME.metres,
    };
    const viewBoxM = Math.hypot(vb.x - vbFromProj4.x, vb.y - vbFromProj4.y) * KM_PER_UNIT * 1000;
    return { name, lat, lon, x: vb.x, y: vb.y, forwardM, inverseM, viewBoxM };
  });
  const bad = rows.filter((r) => !(r.forwardM < toleranceM && r.inverseM < toleranceM && r.viewBoxM < toleranceM));
  if (bad.length) {
    throw new Error(
      `projection differs from proj4 by ${toleranceM} m or more at: ${bad.map((r) => r.name).join(', ')}`,
    );
  }
  return rows;
}

/**
 * Check that the frozen FRAME / VIEWBOX / KM_PER_UNIT / VIEWBOX_ATTR literals
 * in projection.ts are what BOUNDS derives, and that the whole BOUNDS
 * rectangle lands inside the viewBox. Throws on any mismatch.
 */
export function checkFrame() {
  const derived = frameFor(BOUNDS, VIEWBOX.height);
  const problems = [];
  if (derived.west !== FRAME.west) problems.push(`FRAME.west is ${FRAME.west}, BOUNDS gives ${derived.west}`);
  if (derived.north !== FRAME.north) problems.push(`FRAME.north is ${FRAME.north}, BOUNDS gives ${derived.north}`);
  if (derived.metres !== FRAME.metres) problems.push(`FRAME.metres is ${FRAME.metres}, BOUNDS gives ${derived.metres}`);
  if (derived.width !== VIEWBOX.width) problems.push(`VIEWBOX.width is ${VIEWBOX.width}, BOUNDS gives ${derived.width}`);
  if (KM_PER_UNIT !== FRAME.metres / 1e6) problems.push(`KM_PER_UNIT is ${KM_PER_UNIT}, FRAME gives ${FRAME.metres / 1e6}`);
  const attr = `${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.width} ${VIEWBOX.height}`;
  if (VIEWBOX_ATTR !== attr) problems.push(`VIEWBOX_ATTR is '${VIEWBOX_ATTR}', VIEWBOX gives '${attr}'`);
  const origin = project(LAT_0, LON_0);
  if (Math.hypot(origin.x - ORIGIN.x, origin.y - ORIGIN.y) > 1e-9) problems.push('ORIGIN is not where (LAT_0, LON_0) projects');
  // Walk the BOUNDS edges: every point must land inside the viewBox.
  for (let i = 0; i <= 1000; i++) {
    const lon = BOUNDS.west + ((BOUNDS.east - BOUNDS.west) * i) / 1000;
    const lat = BOUNDS.south + ((BOUNDS.north - BOUNDS.south) * i) / 1000;
    for (const [la, lo] of [[BOUNDS.south, lon], [BOUNDS.north, lon], [lat, BOUNDS.west], [lat, BOUNDS.east]]) {
      const p = project(la, lo);
      const inside = p.x >= -1e-9 && p.y >= -1e-9 && p.x <= VIEWBOX.width + 1e-9 && p.y <= VIEWBOX.height + 1e-9;
      if (!inside) problems.push(`BOUNDS edge point ${la.toFixed(3)}, ${lo.toFixed(3)} falls outside the viewBox`);
    }
  }
  if (problems.length) throw new Error(`projection.ts frame constants are stale:\n  ${problems.join('\n  ')}`);
  return derived;
}
