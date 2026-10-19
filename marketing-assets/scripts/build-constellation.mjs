/**
 * A2: builds web/src/components/story/data/constellation.ts.
 *
 * The Virgo figure the page forms in Ch3 and completes in the Finale: 14
 * stars, 14 segments, the cast-to-star map, and Syrma held back. Everything
 * comes from the constants below, committed with this script, so a build
 * never touches the network and a re-run is byte-identical.
 *
 * Where the constants come from (all looked up on 2026-10-02):
 * - Positions (ICRS, epoch J2000) and V magnitudes: SIMBAD, by Hipparcos
 *   number, rounded to 1e-5 degree (research-astro-geo.json). Re-checked
 *   against SIMBAD's `basic` and `flux` tables: every value agrees to the
 *   digits kept.
 * - Parallaxes: Hipparcos, the New Reduction (van Leeuwen 2007, A&A 474,
 *   653; VizieR I/311/hip2), read from VizieR and confirmed against SIMBAD's
 *   `mesPLX` rows for bibcode 2007A&A...474..653V. Wikipedia's infobox cites
 *   the same value for nine of the stars; for the other five it now cites
 *   Gaia DR3 or an orbital solution, noted per star (`WIKIPEDIA`).
 * - The figure: IAU / Sky & Telescope (Stellarium's modern_iau and
 *   modern_st sky cultures agree for Virgo). Polyline by HIP number:
 *   60129-58948-57380-57757-60129-61941-63090-63608-63090-61941-64238-65474-
 *   64238-61941-66249-68520-72220-68520-66249-69701-71957.
 * - Names: IAU-approved proper names only (WGSN). μ, ν, ο, θ, τ and 109 Vir
 *   have none, so they keep their designations.
 *
 * Re-verified on 2026-10-03 (VERIFIED below), against the sources themselves:
 * - VizieR I/311/hip2, queried for all 14 HIP numbers (HIP, Plx, e_Plx): every
 *   parallax and error equals the constant here, digit for digit.
 * - SIMBAD (sim-script, ICRS J2000 at epoch 2000, V flux): every position
 *   agrees to the 1e-5° kept, every V magnitude to the digits kept.
 * - Stellarium's skycultures/modern_iau/index.json and modern_st/index.json
 *   on GitHub master: CON Vir is the polyline in FIGURE_POLYLINE, in both.
 * - The 14 English Wikipedia infoboxes, re-read: WIKIPEDIA below is current.
 *
 * Derived here:
 * - distance in light-years (1 pc = 3.261563777 ly) and its 1σ error;
 * - a 3D position in light-years, Earth at the origin, in the deep-sky
 *   frame the sky engine draws Ch3 in: z toward the figure's centre
 *   (RA 199.01351°, Dec −0.10109°), y toward celestial north there, and
 *   x toward the west, so a camera at the origin looking down +z with +y
 *   up sees the sky as it looks from the ground (east on the left);
 * - gnomonic tangent-plane coordinates about the same centre, east on the
 *   left and y down, and the 0..1 chart coordinates research-astro-geo.json
 *   published (checked here to 1e-4).
 *
 * Usage, from marketing-assets/:
 *   node scripts/build-constellation.mjs           write the module
 *   node scripts/build-constellation.mjs --check   fail if the module on disk is stale
 */
/* global Buffer, URL, console, process -- Node script; the package ESLint config is the Remotion (browser) preset. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WEB_DATA, importTs, importTsSource } from './lib/projection.mjs';

const CHECK = process.argv.includes('--check');
const ROOT = new URL('../../', import.meta.url);
const OUT = new URL('constellation.ts', WEB_DATA);
const rel = (url) => fileURLToPath(url).slice(fileURLToPath(ROOT).length).replaceAll('\\', '/');

// ─── Committed constants ─────────────────────────────────────────────────

/** When the constants were looked up, and when they were last checked against their sources. */
const RETRIEVED = '2026-10-02';
const VERIFIED = '2026-10-03';

/**
 * The 14 stars. `plx` and `plxErr` in milliarcseconds (Hipparcos 2007);
 * `ra`/`dec` in degrees (ICRS J2000); `mag` is V.
 */
const STARS = [
  { id: 'alpha', hip: 65474, name: 'Spica', bayer: 'α Vir', ra: 201.29825, dec: -11.16132, mag: 0.97, plx: 13.06, plxErr: 0.7 },
  { id: 'beta', hip: 57757, name: 'Zavijava', bayer: 'β Vir', ra: 177.67383, dec: 1.76472, mag: 3.6, plx: 91.5, plxErr: 0.22 },
  { id: 'gamma', hip: 61941, name: 'Porrima', bayer: 'γ Vir', ra: 190.41512, dec: -1.4494, mag: 2.74, plx: 85.58, plxErr: 0.6 },
  { id: 'delta', hip: 63090, name: 'Minelauva', bayer: 'δ Vir', ra: 193.90087, dec: 3.39747, mag: 3.38, plx: 16.44, plxErr: 0.22 },
  { id: 'epsilon', hip: 63608, name: 'Vindemiatrix', bayer: 'ε Vir', ra: 195.54415, dec: 10.95915, mag: 2.79, plx: 29.76, plxErr: 0.14 },
  { id: 'zeta', hip: 66249, name: 'Heze', bayer: 'ζ Vir', ra: 203.6733, dec: -0.59582, mag: 3.38, plx: 44.03, plxErr: 0.19 },
  { id: 'eta', hip: 60129, name: 'Zaniah', bayer: 'η Vir', ra: 184.97643, dec: -0.6668, mag: 3.9, plx: 12.29, plxErr: 0.45 },
  { id: 'theta', hip: 64238, name: null, bayer: 'θ Vir', ra: 197.48745, dec: -5.539, mag: 4.4, plx: 10.33, plxErr: 1.09 },
  { id: 'iota', hip: 69701, name: 'Syrma', bayer: 'ι Vir', ra: 214.00362, dec: -6.00055, mag: 4.08, plx: 44.97, plxErr: 0.19 },
  { id: 'mu', hip: 71957, name: null, bayer: 'μ Vir', ra: 220.7651, dec: -5.6582, mag: 3.88, plx: 54.73, plxErr: 0.2 },
  { id: 'nu', hip: 57380, name: null, bayer: 'ν Vir', ra: 176.46483, dec: 6.52937, mag: 4.04, plx: 11.1, plxErr: 0.18 },
  { id: 'omicron', hip: 58948, name: null, bayer: 'ο Vir', ra: 181.30222, dec: 8.73302, mag: 4.12, plx: 19.98, plxErr: 0.22 },
  { id: 'tau', hip: 68520, name: null, bayer: 'τ Vir', ra: 210.41164, dec: 1.54453, mag: 4.24, plx: 14.5, plxErr: 0.18 },
  { id: '109', hip: 72220, name: null, bayer: '109 Vir', ra: 221.56218, dec: 1.89288, mag: 3.73, plx: 24.25, plxErr: 0.18 },
];

/**
 * What each star's English Wikipedia infobox said on RETRIEVED: the page,
 * its parallax in mas, and what it cites. Where the page cites van Leeuwen
 * 2007 the value must equal ours; the others are recorded so a reader who
 * checks Wikipedia and sees a different number knows why. The page is
 * written into the generated file's header, which minifiers strip.
 */
const WIKIPEDIA = {
  alpha: { page: 'Spica', plx: '13.06 ± 0.70', cites: 'van Leeuwen 2007' },
  beta: { page: 'Beta Virginis', plx: '91.50 ± 0.22', cites: 'van Leeuwen 2007' },
  gamma: { page: 'Gamma Virginis', plx: '85.58 ± 0.60', cites: 'van Leeuwen 2007' },
  delta: { page: 'Delta Virginis', plx: '16.44 ± 0.22', cites: 'van Leeuwen 2007' },
  epsilon: { page: 'Vindemiatrix', plx: '29.76 ± 0.14', cites: 'van Leeuwen 2007' },
  zeta: { page: 'Zeta Virginis', plx: '44.03 ± 0.19', cites: 'van Leeuwen 2007' },
  eta: { page: 'Eta Virginis', plx: '13.264 ± 0.161', cites: 'Groenewegen 2023, orbital parallax' },
  theta: { page: 'Theta Virginis', plx: '10.33 ± 1.09', cites: 'van Leeuwen 2007' },
  iota: { page: 'Iota Virginis', plx: '45.4014 ± 0.2858', cites: 'Gaia DR3' },
  mu: { page: 'Mu Virginis', plx: '54.73 ± 0.20', cites: 'van Leeuwen 2007' },
  nu: { page: 'Nu Virginis', plx: '9.8446 ± 0.2744', cites: 'Gaia DR3' },
  omicron: { page: 'Omicron Virginis', plx: '19.4936 ± 0.1658', cites: 'Gaia DR3' },
  tau: { page: 'Tau Virginis', plx: '14.50 ± 0.18', cites: 'van Leeuwen 2007' },
  109: { page: '109 Virginis', plx: '24.2814 ± 0.2271', cites: 'Gaia DR3' },
};

/**
 * The figure exactly as Stellarium stores it (modern_iau and modern_st agree):
 * one polyline of HIP numbers that doubles back over shared edges.
 */
const FIGURE_POLYLINE = [
  60129, 58948, 57380, 57757, 60129, 61941, 63090, 63608, 63090, 61941, 64238, 65474, 64238, 61941, 66249, 68520, 72220, 68520,
  66249, 69701, 71957,
];

/** The IAU / Sky & Telescope figure, as 14 segments in drawing order. Syrma's two come last. */
const SEGMENTS = [
  ['eta', 'omicron'],
  ['omicron', 'nu'],
  ['nu', 'beta'],
  ['beta', 'eta'],
  ['eta', 'gamma'],
  ['gamma', 'delta'],
  ['delta', 'epsilon'],
  ['gamma', 'theta'],
  ['theta', 'alpha'],
  ['gamma', 'zeta'],
  ['zeta', 'tau'],
  ['tau', '109'],
  ['zeta', 'iota'],
  ['iota', 'mu'],
];

/** The star the Finale lights as "you"; it and its two segments stay dark until then. */
const HELD_BACK = 'iota';

/** The figure's centre on the sky, where the tangent plane touches (research-astro-geo.json). */
const TANGENT = { ra: 199.01351, dec: -0.10109 };

/**
 * The desktop mini figure's chapter order (storyboard Appendix B): one star
 * per chapter, Syrma last for the Finale. μ, ν and ο are drawn but never a
 * chapter's star.
 */
const CHAPTER_STARS = ['eta', 'beta', 'gamma', 'delta', 'alpha', 'epsilon', 'theta', 'zeta', 'tau', '109', 'iota'];

/** research-astro-geo.json projectedStars: the chart coordinates this build must reproduce. */
const RESEARCH_CHART = {
  alpha: [0.4519, 0.7357],
  beta: [0.9704, 0.4582],
  gamma: [0.682, 0.5288],
  delta: [0.6077, 0.4262],
  epsilon: [0.573, 0.2643],
  zeta: [0.4018, 0.5106],
  eta: [0.801, 0.5124],
  theta: [0.532, 0.6148],
  iota: [0.1776, 0.629],
  mu: [0.0196, 0.6264],
  nu: [1, 0.3487],
  omicron: [0.8846, 0.3038],
  tau: [0.2572, 0.4649],
  109: [0, 0.4549],
};

/** Angular separations research-astro-geo.json quoted, in degrees. */
const RESEARCH_SEPARATIONS = [
  ['alpha', 'gamma', 14.53],
  ['alpha', 'epsilon', 22.85],
  ['nu', '109', 45.19],
];

const LY_PER_PC = 3.261563777;

// ─── Helpers ─────────────────────────────────────────────────────────────

function fail(message) {
  console.error(`build-constellation: ${message}`);
  process.exit(1);
}

const RAD = Math.PI / 180;
const fixed = (v, dp) => {
  const s = v.toFixed(dp);
  // No "-0" in the output.
  return /^-0\.?0*$/.test(s) ? s.slice(1) : s;
};
const num = (v, dp) => String(Number(fixed(v, dp)));
const quote = (s) => `'${s.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;

function unit(ra, dec) {
  return [Math.cos(dec * RAD) * Math.cos(ra * RAD), Math.cos(dec * RAD) * Math.sin(ra * RAD), Math.sin(dec * RAD)];
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// ─── 1. Check the constants ──────────────────────────────────────────────

const ids = STARS.map((s) => s.id);
if (STARS.length !== 14) fail(`expected 14 stars, have ${STARS.length}`);
if (new Set(ids).size !== ids.length) fail('duplicate star id');
if (new Set(STARS.map((s) => s.hip)).size !== STARS.length) fail('duplicate HIP number');
for (const s of STARS) {
  if (!(s.plx > 0 && s.plxErr > 0 && s.plxErr < s.plx)) fail(`${s.id}: parallax ${s.plx} ± ${s.plxErr} makes no sense`);
  const wiki = WIKIPEDIA[s.id];
  if (!wiki) fail(`${s.id}: no Wikipedia note`);
  // A page that cites the same catalogue must quote the same number.
  if (wiki.cites === 'van Leeuwen 2007' && wiki.plx !== `${s.plx.toFixed(2)} ± ${s.plxErr.toFixed(2)}`) {
    fail(`${s.id}: Wikipedia quotes van Leeuwen 2007 as ${wiki.plx} mas, the constant is ${s.plx} ± ${s.plxErr}`);
  }
}
if (SEGMENTS.length !== 14) fail(`expected 14 segments, have ${SEGMENTS.length}`);
// The drawing order above is ours; the edges must be exactly the polyline's, no more and no fewer.
const byHip = new Map(STARS.map((s) => [s.hip, s.id]));
const polyEdges = new Set();
for (let i = 1; i < FIGURE_POLYLINE.length; i++) {
  const a = byHip.get(FIGURE_POLYLINE[i - 1]);
  const b = byHip.get(FIGURE_POLYLINE[i]);
  if (!a || !b) fail(`the polyline names HIP ${FIGURE_POLYLINE[a ? i : i - 1]}, which is not one of the 14`);
  polyEdges.add([a, b].sort().join('|'));
}
const ourEdges = new Set(SEGMENTS.map(([a, b]) => [a, b].sort().join('|')));
if (polyEdges.size !== ourEdges.size || [...polyEdges].some((e) => !ourEdges.has(e))) {
  fail(`SEGMENTS (${[...ourEdges].join(', ')}) are not Stellarium's figure (${[...polyEdges].join(', ')})`);
}
const seenEdge = new Set();
for (const [a, b] of SEGMENTS) {
  if (!ids.includes(a) || !ids.includes(b)) fail(`segment ${a}–${b} names an unknown star`);
  const key = [a, b].sort().join('|');
  if (seenEdge.has(key)) fail(`segment ${a}–${b} is listed twice`);
  seenEdge.add(key);
}
// Every star is on the figure, and the figure is one piece.
const adjacency = new Map(ids.map((id) => [id, []]));
for (const [a, b] of SEGMENTS) {
  adjacency.get(a).push(b);
  adjacency.get(b).push(a);
}
for (const id of ids) if (!adjacency.get(id).length) fail(`${id} is on no segment`);
const reached = new Set(['alpha']);
for (const queue = ['alpha']; queue.length; ) {
  for (const next of adjacency.get(queue.shift())) {
    if (reached.has(next)) continue;
    reached.add(next);
    queue.push(next);
  }
}
if (reached.size !== ids.length) fail('the figure is not connected');
const heldSegments = SEGMENTS.filter(([a, b]) => a === HELD_BACK || b === HELD_BACK);
if (heldSegments.map((s) => s.join('–')).join(',') !== 'zeta–iota,iota–mu') {
  fail(`Syrma's segments should be zeta–iota and iota–mu, found ${heldSegments.map((s) => s.join('–')).join(', ')}`);
}
if (adjacency.get('gamma').length !== 4) fail('Porrima should be the four-way hub');
for (const id of CHAPTER_STARS) if (!ids.includes(id)) fail(`chapter star ${id} is unknown`);
if (new Set(CHAPTER_STARS).size !== CHAPTER_STARS.length) fail('a chapter star is listed twice');
if (CHAPTER_STARS.at(-1) !== HELD_BACK) fail('the last chapter star must be the held-back one');

// story.ts names the cast's stars; they must be on the figure, distinct, and never the held-back one.
const story = await importTs(new URL('story.ts', WEB_DATA));
const cast = Object.values(story.CAST).map((m) => ({ id: m.id, first: m.first, star: m.star }));
for (const m of cast) {
  if (!ids.includes(m.star)) fail(`story.ts gives ${m.first} the star "${m.star}", which is not on the figure`);
  if (m.star === HELD_BACK) fail(`story.ts gives ${m.first} Syrma, which is held back for the Finale`);
}
if (new Set(cast.map((m) => m.star)).size !== cast.length) fail('story.ts gives two people the same star');
const castMap = Object.fromEntries(cast.map((m) => [m.id, m.star]));
if (castMap.mika !== 'alpha' || castMap.ernie !== 'gamma' || castMap.kenn !== 'epsilon' || castMap.bea !== 'zeta') {
  fail(`story.ts cast map changed: ${JSON.stringify(castMap)}; the storyboard has Mika α, Ernie γ, Kenn ε, Bea ζ`);
}

// ─── 2. Derive ───────────────────────────────────────────────────────────

const f = unit(TANGENT.ra, TANGENT.dec);
const e = [-Math.sin(TANGENT.ra * RAD), Math.cos(TANGENT.ra * RAD), 0];
const n = [-Math.sin(TANGENT.dec * RAD) * Math.cos(TANGENT.ra * RAD), -Math.sin(TANGENT.dec * RAD) * Math.sin(TANGENT.ra * RAD), Math.cos(TANGENT.dec * RAD)];

const derived = STARS.map((s) => {
  const p = unit(s.ra, s.dec);
  const pc = 1000 / s.plx;
  const ly = pc * LY_PER_PC;
  const lyErr = ly * (s.plxErr / s.plx);
  // Gnomonic, research-astro-geo.json's formulas: ξ east, η north.
  const cosc = dot(p, f);
  const xi = dot(p, e) / cosc;
  const eta = dot(p, n) / cosc;
  return {
    ...s,
    ly,
    lyErr,
    // East on the left, y down: the chart's own convention.
    gx: -xi,
    gy: -eta,
    // Deep-sky frame: x west, y north, z toward the centre.
    pos: [-dot(p, e) * ly, dot(p, n) * ly, dot(p, f) * ly],
  };
});

const xs = derived.map((s) => s.gx);
const ys = derived.map((s) => s.gy);
const xMin = Math.min(...xs);
const yMin = Math.min(...ys);
const w = Math.max(...xs) - xMin;
const h = Math.max(...ys) - yMin;
const S = Math.max(w, h);
for (const s of derived) {
  s.x = (s.gx - xMin) / S;
  s.y = (s.gy - yMin + (S - h) / 2) / S;
}
const yTop = Math.min(...derived.map((s) => s.y));
const yBottom = Math.max(...derived.map((s) => s.y));

// ─── 3. Prove the derivation ─────────────────────────────────────────────

for (const s of derived) {
  const [rx, ry] = RESEARCH_CHART[s.id];
  if (Math.abs(s.x - rx) > 1.5e-4 || Math.abs(s.y - ry) > 1.5e-4) {
    fail(`${s.id} charts at ${s.x.toFixed(4)}, ${s.y.toFixed(4)}; research-astro-geo.json has ${rx}, ${ry}`);
  }
  // A pinhole at Earth looking down +z sees the chart: x/z = −ξ, −y/z = −η.
  const [px, py, pz] = s.pos;
  if (Math.abs(px / pz - s.gx) > 1e-12 || Math.abs(-py / pz - s.gy) > 1e-12) fail(`${s.id}: the 3D position does not project to the chart`);
  if (Math.abs(Math.hypot(px, py, pz) - s.ly) > 1e-9 * s.ly) fail(`${s.id}: the 3D position is not at its distance`);
}
const byId = Object.fromEntries(derived.map((s) => [s.id, s]));
for (const [a, b, deg] of RESEARCH_SEPARATIONS) {
  const sep = Math.acos(dot(unit(byId[a].ra, byId[a].dec), unit(byId[b].ra, byId[b].dec))) / RAD;
  if (Math.abs(sep - deg) > 0.01) fail(`${a}–${b} is ${sep.toFixed(3)}° apart; research says ${deg}°`);
}
const span = { fieldDeg: [2 * Math.atan(w / 2) / RAD, 2 * Math.atan(h / 2) / RAD], aspect: w / h };
if (Math.abs(span.aspect - 2.122) > 0.002) fail(`figure aspect ${span.aspect.toFixed(4)}, research says 2.122`);

const nearest = derived.reduce((a, b) => (b.ly < a.ly ? b : a));
const farthest = derived.reduce((a, b) => (b.ly > a.ly ? b : a));
const label = (s) => s.name ?? s.bayer;

console.log('star          HIP      plx (mas)       ly            chart x, y        pos (ly)');
for (const s of derived) {
  console.log(
    `${label(s).padEnd(13)} ${String(s.hip).padEnd(8)} ${`${s.plx.toFixed(2)} ± ${s.plxErr.toFixed(2)}`.padEnd(15)} ${`${s.ly.toFixed(1)} ± ${s.lyErr.toFixed(1)}`.padEnd(13)} ${s.x.toFixed(4)}, ${s.y.toFixed(4)}    ${s.pos.map((v) => v.toFixed(2)).join(', ')}`,
  );
}
console.log(`nearest ${label(nearest)} ${nearest.ly.toFixed(1)} ly, farthest ${label(farthest)} ${farthest.ly.toFixed(1)} ly; field ${span.fieldDeg.map((d) => d.toFixed(1)).join('° × ')}°`);

// ─── 4. Write ────────────────────────────────────────────────────────────

const castLines = cast.map((m) => `  ${m.id}: ${quote(m.star)},`).join('\n');
const starLiteral = (s) =>
  [
    '  {',
    `    id: ${quote(s.id)},`,
    `    hip: ${s.hip},`,
    `    name: ${s.name ? quote(s.name) : 'null'},`,
    `    label: ${quote(label(s))},`,
    `    bayer: ${quote(s.bayer)},`,
    `    ra: ${s.ra},`,
    `    dec: ${s.dec},`,
    `    mag: ${s.mag},`,
    `    plx: ${s.plx},`,
    `    plxErr: ${s.plxErr},`,
    `    ly: ${num(s.ly, 1)},`,
    `    lyErr: ${num(s.lyErr, 1)},`,
    `    pos: [${s.pos.map((v) => num(v, 4)).join(', ')}],`,
    `    gx: ${num(s.gx, 6)},`,
    `    gy: ${num(s.gy, 6)},`,
    `    x: ${num(s.x, 4)},`,
    `    y: ${num(s.y, 4)},`,
    '  },',
  ].join('\n');

const sourceRows = derived
  .map((s) => {
    const wiki = WIKIPEDIA[s.id];
    const same = wiki.cites === 'van Leeuwen 2007';
    const note = same ? `${wiki.page}: the same, citing van Leeuwen 2007` : `${wiki.page}: ${wiki.plx} mas, citing ${wiki.cites}`;
    return ` *   ${label(s).padEnd(13)} HIP ${String(s.hip).padEnd(6)} ${`${s.plx.toFixed(2)} ± ${s.plxErr.toFixed(2)} mas`.padEnd(17)} ${note}`;
  })
  .join('\n');

const text = `/**
 * GENERATED by marketing-assets/scripts/build-constellation.mjs. Do not edit by hand.
 * Regenerate: cd marketing-assets && node scripts/build-constellation.mjs
 * Check for drift: cd marketing-assets && node scripts/build-constellation.mjs --check
 *
 * Virgo as the page draws it (storyboard A2): the IAU / Sky & Telescope
 * figure of 14 stars and 14 segments. The cast become four of its stars in
 * Ch3; Syrma (ι Vir) and its two segments stay dark until the Finale lights
 * it as "you". The constellation is real: positions are SIMBAD (ICRS J2000),
 * distances are Hipparcos parallaxes (van Leeuwen 2007), and the build
 * script carries both as committed constants, so nothing here is fetched.
 *
 * Coordinates, three ways:
 * - \`pos\`: light-years from Earth, in the sky engine's deep-sky frame.
 *   z points at the figure's centre (RA ${TANGENT.ra}°, Dec ${TANGENT.dec}°), y at
 *   celestial north there, x to the west. A camera at the origin looking
 *   down +z with +y up sees the sky as it looks from the ground, east on
 *   the left, and the figure forms; from anywhere else it is a scatter.
 * - \`gx\`, \`gy\`: the gnomonic (tangent-plane) projection about that centre,
 *   east on the left and y down, in tangent units (radians at the centre).
 * - \`x\`, \`y\`: the same, scaled into a 0..1 square with one scale so the
 *   shape is true; x spans 0..1 and y is letterboxed into ${num(yTop, 4)}..${num(yBottom, 4)}.
 *   The figure is ${span.fieldDeg.map((d) => d.toFixed(1)).join('° by ')}° of sky, ${span.aspect.toFixed(3)}:1.
 *
 * Distances run from ${label(nearest)} at about ${Math.round(nearest.ly)} light-years to ${label(farthest)}
 * at about ${Math.round(farthest.ly)}. Among the cast: Porrima ${Math.round(byId.gamma.ly)}, Heze ${Math.round(byId.zeta.ly)},
 * Vindemiatrix ${Math.round(byId.epsilon.ly)} and Spica ${Math.round(byId.alpha.ly)}.
 *
 * Parallaxes, star by star: VizieR I/311/hip2, the same rows as SIMBAD's
 * mesPLX for 2007A&A...474..653V, with what each star's English Wikipedia
 * infobox said on ${RETRIEVED}. Every row, position and segment was checked
 * again against VizieR, SIMBAD and Stellarium on ${VERIFIED}.
${sourceRows}
 *
 * Zero-import on purpose (see story.ts).
 */

export type StarId =
${ids.map((id) => `  | ${quote(id)}`).join('\n')};

export type VirgoStar = {
  readonly id: StarId;
  /** Hipparcos catalogue number. */
  readonly hip: number;
  /** IAU-approved proper name, or null where the star has none. */
  readonly name: string | null;
  /** What a label shows: the proper name, else the designation. */
  readonly label: string;
  /** Bayer or Flamsteed designation. */
  readonly bayer: string;
  /** ICRS J2000 right ascension and declination, degrees (SIMBAD). */
  readonly ra: number;
  readonly dec: number;
  /** V magnitude (SIMBAD). */
  readonly mag: number;
  /** Parallax and its 1σ error, milliarcseconds (Hipparcos, van Leeuwen 2007). */
  readonly plx: number;
  readonly plxErr: number;
  /** Distance from the parallax and its 1σ error, light-years, to 0.1. */
  readonly ly: number;
  readonly lyErr: number;
  /** Light-years from Earth in the deep-sky frame: x west, y north, z toward the figure's centre. */
  readonly pos: readonly [number, number, number];
  /** Gnomonic tangent-plane coordinates: east on the left, y down. */
  readonly gx: number;
  readonly gy: number;
  /** Chart coordinates in the 0..1 square (see the header). */
  readonly x: number;
  readonly y: number;
};

export type Segment = {
  readonly a: StarId;
  readonly b: StarId;
  /** Syrma's two segments: undrawn until the Finale. */
  readonly heldBack?: true;
};

/** Where every number above comes from, and when it was last checked against those sources. */
export const ASTROMETRY = {
  retrieved: ${quote(RETRIEVED)},
  verified: ${quote(VERIFIED)},
  positions: 'SIMBAD (CDS), by Hipparcos number: ICRS, epoch J2000; V magnitudes from SIMBAD fluxes',
  parallaxes:
    'Hipparcos, the New Reduction: van Leeuwen 2007, A&A 474, 653 (VizieR I/311/hip2), confirmed in SIMBAD mesPLX (bibcode 2007A&A...474..653V)',
  figure: 'IAU / Sky & Telescope stick figure (Stellarium modern_iau = modern_st for Virgo)',
  names: 'IAU WGSN proper names; designations where there is none',
} as const;

/** The figure's centre on the sky, where the tangent plane touches. */
export const TANGENT = { ra: ${TANGENT.ra}, dec: ${TANGENT.dec} } as const;

/** Chart extents in the 0..1 square, and the figure's true aspect. */
export const CHART = { yTop: ${num(yTop, 4)}, yBottom: ${num(yBottom, 4)}, aspect: ${num(span.aspect, 4)}, fieldDeg: [${span.fieldDeg.map((d) => num(d, 2)).join(', ')}] } as const;

export const STARS: readonly VirgoStar[] = [
${derived.map(starLiteral).join('\n')}
];

/** The 14 segments of the IAU / Sky & Telescope figure. Porrima is the four-way hub. */
export const SEGMENTS: readonly Segment[] = [
${SEGMENTS.map(([a, b]) => `  { a: ${quote(a)}, b: ${quote(b)}${a === HELD_BACK || b === HELD_BACK ? ', heldBack: true' : ''} },`).join('\n')}
];

/** The star the Finale lights as "you" (Syrma, ι Vir). */
export const HELD_BACK: StarId = ${quote(HELD_BACK)};

/** Who becomes which star in Ch3 (story.ts CAST, checked on every build). */
export const CAST_STARS = {
${castLines}
} as const satisfies Record<string, StarId>;

/** The mini figure's chapter order (storyboard Appendix B): Ch1 → Ch10, then the Finale. */
export const CHAPTER_STARS: readonly StarId[] = [${CHAPTER_STARS.map(quote).join(', ')}];

/** The nearest and farthest stars of the figure. */
export const DISTANCE_RANGE = {
  nearest: ${quote(nearest.id)},
  farthest: ${quote(farthest.id)},
} as const satisfies Record<string, StarId>;

/** One star, by id. */
export function star(id: StarId): VirgoStar {
  const found = STARS.find((s) => s.id === id);
  if (!found) throw new Error(\`Unknown star: \${id}\`);
  return found;
}

/**
 * A drawn radius for a magnitude, on a compressed scale: true flux would
 * draw Spica about five times as wide as the faintest stars. Magnitude 4.5
 * and fainter draws at rMin, magnitude 1 and brighter at rMax.
 */
export function starRadius(mag: number, rMin: number, rMax: number): number {
  const t = Math.min(1, Math.max(0, (4.5 - mag) / 3.5));
  return rMin + (rMax - rMin) * t;
}
`;

// ─── 5. Prove the module before writing it ───────────────────────────────

const gen = await importTsSource(text);
if (gen.STARS.length !== 14 || gen.SEGMENTS.length !== 14) fail('generated module has the wrong counts');
if (gen.SEGMENTS.filter((s) => s.heldBack).length !== 2) fail('generated module should hold back exactly two segments');
for (const s of gen.STARS) {
  const d = byId[s.id];
  if (Math.abs(s.ly - d.ly) > 0.051 || Math.abs(s.x - d.x) > 5e-5 || Math.abs(s.y - d.y) > 5e-5) fail(`${s.id} literal drifted`);
  const [px, py, pz] = s.pos;
  // Rounded to 1e-4 ly, the projection still lands within 1e-5 tangent units.
  if (Math.abs(px / pz - s.gx) > 1e-5 || Math.abs(-py / pz - s.gy) > 1e-5) fail(`${s.id}: rounded position no longer projects to the chart`);
}
if (gen.star('alpha').name !== 'Spica' || gen.starRadius(1, 1, 3) !== 3 || gen.starRadius(4.5, 1, 3) !== 1) fail('helpers misbehave');

if (CHECK) {
  const onDisk = existsSync(OUT) ? readFileSync(OUT, 'utf8') : null;
  if (onDisk !== text) fail(`${rel(OUT)} is stale; run node scripts/build-constellation.mjs`);
  console.log(`check     ${rel(OUT)} is up to date`);
} else {
  writeFileSync(OUT, text);
  console.log(`wrote     ${rel(OUT)} (${Buffer.byteLength(text)} bytes)`);
}
