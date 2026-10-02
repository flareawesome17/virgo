/**
 * A5: builds web/src/components/story/data/cities.generated.ts.
 *
 * The 71 places Nearby and the job board know live in
 * api/src/hiring/locations.ts as a module-private table. This reads that file
 * as text (api/ is never edited or imported), projects every place into the
 * story map's viewBox with ../web/.../data/projection.ts, applies the one
 * display fix (Davao City), and writes a zero-import module the page, the sky
 * seed and the Remotion stills all read.
 *
 * Every run also proves the projection: the pure-JS Transverse Mercator
 * against proj4 at 20 points (under 1 m), the frozen FRAME constants against
 * BOUNDS, the archipelago's extreme points inside BOUNDS with margin, and the
 * generated offsetKm against an exact path from every city.
 *
 * Usage, from marketing-assets/:
 *   node scripts/build-cities.mjs           write the module
 *   node scripts/build-cities.mjs --check   fail if the module on disk is stale
 * Output is byte-identical between runs.
 */
/* global Buffer, URL, console, process -- Node script; the package ESLint config is the Remotion (browser) preset. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  BOUNDS,
  KM_PER_UNIT,
  LAT_0,
  ORIGIN,
  VIEWBOX,
  VIEWBOX_ATTR,
  WEB_DATA,
  checkAgainstProj4,
  checkFrame,
  importTs,
  importTsSource,
  inBounds,
  project,
  unproject,
} from './lib/projection.mjs';

const CHECK = process.argv.includes('--check');
const ROOT = new URL('../../', import.meta.url);
const LOCATIONS = new URL('api/src/hiring/locations.ts', ROOT);
const OUT = new URL('cities.generated.ts', WEB_DATA);
const rel = (url) => fileURLToPath(url).slice(fileURLToPath(ROOT).length).replaceAll('\\', '/');

/** The app's Nearby radius: great circle on a sphere of 6,371 km (api/src/discover/discover.service.ts). */
const APP_EARTH_KM = 6371;
/** How many places the app's table holds. A change here is a change in the story's "71 Philippine cities". */
const EXPECTED_CITIES = 71;
/** Decimal places for viewBox positions: 0.001 unit is about 2 m. */
const DP = 3;

/**
 * Where the drawn point differs from the app's table, and why. The app keeps
 * its own value (Nearby measures from it); only the map moves.
 */
const DISPLAY = {
  'Davao City': {
    lat: 7.0731,
    lon: 125.6128,
    why: "Drawn downtown, on Davao Gulf. The app's point is in the middle of the city's large territory",
  },
};

/** Which place a name means, where a reader could guess wrong. */
const NOTES = {
  Naga: 'Naga City, Camarines Sur, in Bicol; not Naga in Cebu.',
};

/**
 * The archipelago's outermost land, each of which must sit inside BOUNDS with
 * at least MIN_MARGIN_KM to spare. Approximate coastline points.
 */
const EXTREMES = [
  { name: "Y'Ami (Mavulis), Batanes", lat: 21.12, lon: 121.95, edge: 'north' },
  { name: 'Saluag, off Sibutu, Tawi-Tawi', lat: 4.57, lon: 119.46, edge: 'south' },
  { name: 'Balabac, west coast', lat: 7.94, lon: 116.93, edge: 'west' },
  { name: 'Pusan Point, Davao Oriental', lat: 7.29, lon: 126.605, edge: 'east' },
];
const MIN_MARGIN_KM = 10;

/** Cities that join the extremes, the corners and the origin in the 20-point proj4 check. */
const CHECK_CITIES = [
  'Cebu City',
  'Lapu-Lapu',
  'Tagbilaran',
  'Davao City',
  'Vigan',
  'Laoag',
  'Manila',
  'Puerto Princesa',
  'Zamboanga City',
  'General Santos',
  'Mati',
];

/** offsetKm's documented accuracy; the build fails if a measurement exceeds it. */
const OFFSET_LIMITS = { anywhereKm: 0.35, aroundHomeKm: 0.15, within8KmKm: 0.001 };

// ─── Helpers ─────────────────────────────────────────────────────────────

function fail(message) {
  console.error(`build-cities: ${message}`);
  process.exit(1);
}

const round = (v) => Number(v.toFixed(DP));
/** A TS string literal: single quotes, or double when the text has an apostrophe (as Prettier writes it). */
const quote = (s) => {
  const q = s.includes("'") && !s.includes('"') ? '"' : "'";
  return `${q}${s.replaceAll('\\', '\\\\').replaceAll(q, `\\${q}`)}${q}`;
};
/** Sort key that ignores accents and case, independent of the machine's locale. */
const sortKey = (name) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const byName = (a, b) =>
  sortKey(a.name) < sortKey(b.name) ? -1 : sortKey(a.name) > sortKey(b.name) ? 1 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0;

/** The app's distance: spherical law of cosines on 6,371 km, as discover.service.ts computes it (before rounding). */
function appKm(a, b) {
  const r = Math.PI / 180;
  const c =
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.cos(b.lon * r - a.lon * r) + Math.sin(a.lat * r) * Math.sin(b.lat * r);
  return APP_EARTH_KM * Math.acos(Math.min(1, Math.max(-1, c)));
}

/** Exact destination: unproject, go `km` along a great circle on the app's sphere, project back. */
function exactOffset(x, y, km, bearingDeg) {
  const r = Math.PI / 180;
  const { lat, lon } = unproject(x, y);
  const p1 = lat * r;
  const b = bearingDeg * r;
  const d = km / APP_EARTH_KM;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = lon * r + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return project(p2 / r, l2 / r);
}

// ─── 1. Read the app's table ─────────────────────────────────────────────

const source = readFileSync(LOCATIONS, 'utf8');
const block = source.match(/const CITIES\b[^=]*=\s*\[([\s\S]*?)\n\];/);
if (!block) fail(`no "const CITIES … = [ … ];" table in ${rel(LOCATIONS)}`);
const ROW = /^\s*\[\s*'((?:[^'\\]|\\.)*)'\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\],?\s*$/;
const table = [];
for (const line of block[1].split('\n')) {
  if (!line.trim() || line.trim().startsWith('//')) continue;
  const m = line.match(ROW);
  if (!m) fail(`unreadable row in ${rel(LOCATIONS)}: ${line.trim()}`);
  table.push({ name: m[1].replace(/\\(.)/g, '$1'), lat: Number(m[2]), lon: Number(m[3]) });
}
if (table.length !== EXPECTED_CITIES) fail(`expected ${EXPECTED_CITIES} places, read ${table.length}`);
const seen = new Set();
for (const c of table) {
  if (seen.has(sortKey(c.name))) fail(`duplicate place: ${c.name}`);
  seen.add(sortKey(c.name));
  if (!inBounds(c.lat, c.lon)) fail(`${c.name} (${c.lat}, ${c.lon}) is outside BOUNDS`);
}
const tableByName = new Map(table.map((c) => [c.name, c]));
for (const name of [...Object.keys(DISPLAY), ...Object.keys(NOTES), ...CHECK_CITIES]) {
  if (!tableByName.has(name)) fail(`"${name}" is no longer in the app's table; update build-cities.mjs`);
}

// story.ts names Mika's home city; it must be one of the 71, at the app's own point.
const story = await importTs(new URL('story.ts', WEB_DATA));
const home = tableByName.get(story.HOME.city);
if (!home) fail(`story.ts HOME.city "${story.HOME.city}" is not in the app's table`);
if (home.lat !== story.HOME.lat || home.lon !== story.HOME.lon) {
  fail(`story.ts HOME (${story.HOME.lat}, ${story.HOME.lon}) differs from the app's ${home.name} (${home.lat}, ${home.lon})`);
}

// ─── 2. Prove the projection ─────────────────────────────────────────────

const frame = checkFrame();
console.log(`frame     viewBox ${VIEWBOX_ATTR}, ${KM_PER_UNIT} km/unit, BOUNDS ${JSON.stringify(BOUNDS)} (derived ${JSON.stringify(frame)})`);

const shown = (c) => (DISPLAY[c.name] ? { name: c.name, lat: DISPLAY[c.name].lat, lon: DISPLAY[c.name].lon } : c);
const testPoints = [
  ...EXTREMES.map(({ name, lat, lon }) => ({ name, lat, lon })),
  { name: 'BOUNDS north-west', lat: BOUNDS.north, lon: BOUNDS.west },
  { name: 'BOUNDS north-east', lat: BOUNDS.north, lon: BOUNDS.east },
  { name: 'BOUNDS south-west', lat: BOUNDS.south, lon: BOUNDS.west },
  { name: 'BOUNDS south-east', lat: BOUNDS.south, lon: BOUNDS.east },
  { name: 'Origin (12°N, 122°E)', lat: LAT_0, lon: 122 },
  ...CHECK_CITIES.map((n) => shown(tableByName.get(n))),
];
if (testPoints.length !== 20) fail(`the proj4 check wants 20 points, has ${testPoints.length}`);
let rows;
try {
  rows = checkAgainstProj4(testPoints, 1);
} catch (error) {
  fail(error.message);
}
console.log('proj4     point                              forward m   inverse m   viewBox m');
for (const r of rows) {
  console.log(
    `          ${r.name.padEnd(34)} ${r.forwardM.toExponential(1).padStart(9)} ${r.inverseM.toExponential(1).padStart(11)} ${r.viewBoxM.toExponential(1).padStart(11)}`,
  );
}
console.log(`          worst: ${Math.max(...rows.map((r) => Math.max(r.forwardM, r.inverseM))).toFixed(4)} m (limit 1 m)`);

for (const e of EXTREMES) {
  const kmPerDegLon = 111.32 * Math.cos((e.lat * Math.PI) / 180);
  const margin = {
    north: (BOUNDS.north - e.lat) * 110.6,
    south: (e.lat - BOUNDS.south) * 110.6,
    west: (e.lon - BOUNDS.west) * kmPerDegLon,
    east: (BOUNDS.east - e.lon) * kmPerDegLon,
  }[e.edge];
  const p = project(e.lat, e.lon);
  console.log(`extreme   ${e.name.padEnd(34)} ${margin.toFixed(1).padStart(5)} km inside the ${e.edge} edge, at ${p.x.toFixed(1)}, ${p.y.toFixed(1)}`);
  if (!(margin >= MIN_MARGIN_KM)) fail(`${e.name} is only ${margin.toFixed(1)} km inside the ${e.edge} edge of BOUNDS`);
}

// ─── 3. Build the module ─────────────────────────────────────────────────

const cities = table
  .map((c) => {
    const d = DISPLAY[c.name];
    const lat = d ? d.lat : c.lat;
    const lon = d ? d.lon : c.lon;
    const p = project(lat, lon);
    const x = round(p.x);
    const y = round(p.y);
    if (!(x >= 0 && y >= 0 && x <= VIEWBOX.width && y <= VIEWBOX.height)) fail(`${c.name} projects outside the viewBox`);
    const note = d
      ? `${d.why}, about ${Math.round(appKm(c, d))} km away, inland.`
      : NOTES[c.name];
    return { name: c.name, lat, lon, x, y, app: d ? { lat: c.lat, lon: c.lon } : undefined, note };
  })
  .sort(byName);

function cityLiteral(c) {
  const props = [`name: ${quote(c.name)}`, `lat: ${c.lat}`, `lon: ${c.lon}`, `x: ${c.x}`, `y: ${c.y}`];
  if (!c.app && !c.note) return `  { ${props.join(', ')} },`;
  const lines = ['  {', ...props.map((p) => `    ${p},`)];
  if (c.app) lines.push(`    app: { lat: ${c.app.lat}, lon: ${c.app.lon} },`);
  if (c.note) lines.push(`    note: ${quote(c.note)},`);
  lines.push('  },');
  return lines.join('\n');
}

const davao = cities.find((c) => c.name === 'Davao City');
const WGS84_E2 = (1 / 298.257223563) * (2 - 1 / 298.257223563);

const text = `/**
 * GENERATED by marketing-assets/scripts/build-cities.mjs. Do not edit by hand.
 * Regenerate: cd marketing-assets && node scripts/build-cities.mjs
 * Check for drift: cd marketing-assets && node scripts/build-cities.mjs --check
 *
 * The ${EXPECTED_CITIES} places Nearby can search from and the job board sorts by, read
 * from the app's table in ${rel(LOCATIONS)} (as text: the table is not
 * exported), placed on the story map by ./projection.ts: Transverse Mercator,
 * lat_0 ${LAT_0}, lon_0 122, WGS84, in the viewBox '${VIEWBOX_ATTR}'. x runs east and
 * y runs down (north up), ${KM_PER_UNIT} km per unit. Positions are rounded
 * to 0.001 unit (about 2 m). The app's points are city centres, not venues,
 * and the map is no more precise than they are.
 *
 * One display fix: Davao City is drawn downtown (${davao.lat}°N, ${davao.lon}°E). The
 * app's point (${davao.app.lat}, ${davao.app.lon}) is about ${Math.round(appKm(davao.app, davao))} km away, inland, in the
 * middle of the city's large territory. The app is unchanged; only the drawing moves.
 *
 * Zero-import on purpose (see story.ts): the page, marketing-assets/ and the
 * Node scripts load it as it is. The projection constants offsetKm needs are
 * copied in by the generator, which checks them on every run.
 */

/** Kilometres per viewBox unit on the central meridian (projection.ts KM_PER_UNIT). */
export const KM_PER_UNIT = ${KM_PER_UNIT};

export type City = {
  /** As the app spells it. */
  readonly name: string;
  /** The point drawn, in degrees: the app's own point unless \`app\` is set. */
  readonly lat: number;
  readonly lon: number;
  /** The point drawn, in viewBox units: x east, y down. */
  readonly x: number;
  readonly y: number;
  /** The app's coordinate, only where the drawn point differs from it. */
  readonly app?: { readonly lat: number; readonly lon: number };
  /** Why the point moved, or which place the name means. */
  readonly note?: string;
};

/** Sorted by name, ignoring accents and case. */
export const CITIES = [
${cities.map(cityLiteral).join('\n')}
] as const satisfies readonly City[];

export type CityName = (typeof CITIES)[number]['name'];

/** One of the ${EXPECTED_CITIES}, by the app's spelling. */
export function city(name: CityName): City {
  const found = CITIES.find((c) => c.name === name);
  if (!found) throw new Error(\`Unknown city: \${name}\`);
  return found;
}

/** Mika's home city, where the camera lands (story.ts HOME). */
export const HOME: City = city(${quote(home.name)});

// ─── Offsets ─────────────────────────────────────────────────────────────

/** Where the projection origin (12°N on 122°E) sits in the viewBox (projection.ts ORIGIN). */
const ORIGIN_X = ${Number(ORIGIN.x.toFixed(6))};
const ORIGIN_Y = ${Number(ORIGIN.y.toFixed(6))};
const LAT_0 = ${LAT_0};
/** Kilometres of meridian per degree near ${LAT_0}°N; only used to estimate a latitude from y. */
const KM_PER_DEGREE = 110.6;
/** Nearby measures distance on a sphere of this radius (api/src/discover/discover.service.ts). */
const APP_EARTH_KM = ${APP_EARTH_KM};
const WGS84_A_KM = 6378.137;
const WGS84_E2 = ${WGS84_E2};
const RAD = Math.PI / 180;

/**
 * The viewBox point \`km\` kilometres from (x, y) on a compass bearing
 * (degrees; 0 is north, 90 is east). Kilometres are the app's: a great circle
 * on its 6,371 km sphere, so a star placed 8 km out is one Nearby would call
 * 8 km away.
 *
 * A flat offset, corrected at the start point for the three things a plain
 * flat offset gets wrong on this map: grid convergence (grid north is up to
 * 1.9° off true north in the frame's corners, about 0.3° at Cebu City), the
 * projection's scale factor (up to 0.4%), and the app's sphere against the
 * WGS84 ellipsoid the map is drawn on (about 0.5% north–south).
 *
 * Accuracy, out to 200 km: within ${OFFSET_LIMITS.anywhereKm} km of the exact point anywhere
 * in the frame, within ${OFFSET_LIMITS.aroundHomeKm} km around Cebu City, and within 1 m out to
 * 8 km. What remains is the slight curve a great circle makes on the grid.
 * A plain flat offset would be off by up to 2 km around Cebu City and 7 km in
 * the northern corners. build-cities.mjs measures this from every city, the
 * frame's corners and its extreme points on each run, and fails past those
 * limits.
 */
export function offsetKm(x: number, y: number, km: number, bearingDeg: number): { x: number; y: number } {
  const eastKm = (x - ORIGIN_X) * KM_PER_UNIT;
  const lat = (LAT_0 + ((ORIGIN_Y - y) * KM_PER_UNIT) / KM_PER_DEGREE) * RAD;
  const w = Math.sqrt(1 - WGS84_E2 * Math.sin(lat) ** 2);
  // Ellipsoid kilometres per app kilometre, northward and eastward.
  const north = (WGS84_A_KM * (1 - WGS84_E2)) / (w * w * w) / APP_EARTH_KM;
  const east = WGS84_A_KM / w / APP_EARTH_KM;
  // Point scale and grid convergence (spherical forms, ample at this size).
  const k = Math.cosh(eastKm / WGS84_A_KM);
  const gamma = Math.atan(Math.tanh(eastKm / WGS84_A_KM) * Math.tan(lat));
  const b = bearingDeg * RAD;
  const groundEast = km * Math.sin(b) * east;
  const groundNorth = km * Math.cos(b) * north;
  // East of 122°E, true north points gamma anticlockwise of grid north (up).
  const gridEast = groundEast * Math.cos(gamma) - groundNorth * Math.sin(gamma);
  const gridNorth = groundEast * Math.sin(gamma) + groundNorth * Math.cos(gamma);
  return { x: x + (k * gridEast) / KM_PER_UNIT, y: y - (k * gridNorth) / KM_PER_UNIT };
}
`;

// ─── 4. Prove the module before writing it ───────────────────────────────

const gen = await importTsSource(text);
if (gen.CITIES.length !== EXPECTED_CITIES) fail(`generated ${gen.CITIES.length} cities`);
if (gen.KM_PER_UNIT !== KM_PER_UNIT) fail('generated KM_PER_UNIT differs from projection.ts');
for (const c of gen.CITIES) {
  const p = project(c.lat, c.lon);
  if (Math.abs(p.x - c.x) > 0.0005 || Math.abs(p.y - c.y) > 0.0005) fail(`${c.name} literal is not where it projects`);
}
if (gen.HOME.name !== story.HOME.city || gen.HOME.lat !== story.HOME.lat || gen.HOME.lon !== story.HOME.lon) {
  fail('generated HOME does not match story.ts HOME');
}

const plainFlat = (x, y, km, b) => ({
  x: x + (km * Math.sin((b * Math.PI) / 180)) / KM_PER_UNIT,
  y: y - (km * Math.cos((b * Math.PI) / 180)) / KM_PER_UNIT,
});
const origins = [
  ...gen.CITIES.map((c) => ({ name: c.name, x: c.x, y: c.y })),
  ...[...EXTREMES, ...testPoints.filter((t) => t.name.startsWith('BOUNDS'))].map((t) => ({ name: t.name, ...project(t.lat, t.lon) })),
];
const worst = { anywhere: 0, home: 0, within8: 0, plainAnywhere: 0, plainHome: 0, at: '' };
for (const o of origins) {
  const isHome = o.name === home.name;
  for (const km of [1, 2, 5, 8, 12, 25, 50, 100, 150, 200]) {
    for (let b = 0; b < 360; b += 5) {
      const exact = exactOffset(o.x, o.y, km, b);
      const ours = gen.offsetKm(o.x, o.y, km, b);
      const flat = plainFlat(o.x, o.y, km, b);
      const err = Math.hypot(ours.x - exact.x, ours.y - exact.y) * KM_PER_UNIT;
      const flatErr = Math.hypot(flat.x - exact.x, flat.y - exact.y) * KM_PER_UNIT;
      if (err > worst.anywhere) Object.assign(worst, { anywhere: err, at: `${o.name}, ${km} km at ${b}°` });
      worst.plainAnywhere = Math.max(worst.plainAnywhere, flatErr);
      if (isHome) {
        worst.home = Math.max(worst.home, err);
        worst.plainHome = Math.max(worst.plainHome, flatErr);
      }
      if (km <= 8) worst.within8 = Math.max(worst.within8, err);
    }
  }
}
console.log(
  `offsetKm  worst ${worst.anywhere.toFixed(3)} km anywhere (${worst.at}), ${worst.home.toFixed(3)} km from ${home.name}, ` +
    `${(worst.within8 * 1000).toFixed(2)} m within 8 km; a plain flat offset: ${worst.plainAnywhere.toFixed(2)} km anywhere, ${worst.plainHome.toFixed(2)} km from ${home.name}`,
);
if (worst.anywhere > OFFSET_LIMITS.anywhereKm) fail(`offsetKm is off by ${worst.anywhere.toFixed(3)} km; the docs promise ${OFFSET_LIMITS.anywhereKm}`);
if (worst.home > OFFSET_LIMITS.aroundHomeKm) fail(`offsetKm is off by ${worst.home.toFixed(3)} km around ${home.name}`);
if (worst.within8 > OFFSET_LIMITS.within8KmKm) fail(`offsetKm is off by ${(worst.within8 * 1000).toFixed(1)} m within 8 km`);

// ─── 5. Write, or check ──────────────────────────────────────────────────

const onDisk = existsSync(OUT) ? readFileSync(OUT, 'utf8').replaceAll('\r\n', '\n') : null;
if (CHECK) {
  if (onDisk !== text) fail(`${rel(OUT)} is stale; run: cd marketing-assets && node scripts/build-cities.mjs`);
  console.log(`check     ${rel(OUT)} is up to date`);
} else {
  writeFileSync(OUT, text);
  console.log(`wrote     ${rel(OUT)} (${cities.length} places, ${Buffer.byteLength(text)} bytes${onDisk === text ? ', unchanged' : ''})`);
}

console.log('sample    city                 x         y      km from home');
for (const name of ['Cebu City', 'Lapu-Lapu', 'Tagbilaran', 'Davao City', 'Vigan']) {
  const c = gen.city(name);
  console.log(`          ${name.padEnd(18)} ${String(c.x).padStart(8)} ${String(c.y).padStart(9)} ${String(Math.round(appKm(home, c))).padStart(8)}`);
}
