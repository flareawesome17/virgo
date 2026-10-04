#!/usr/bin/env node
/**
 * Determinism check for the seeded sky (storyboard A4), and the generator of
 * clusters.generated.ts.
 *
 * Prints the star count and an FNV-1a hash of every variant's positions,
 * and fails when:
 *   - a hash differs from the pinned EXPECTED value (the seed, the counts or
 *     the placement changed: update EXPECTED on purpose, and regenerate the
 *     Remotion posters, which must match frame 0 of the canvas);
 *   - two loads of the module disagree;
 *   - the module bundled the way the page ships it (esbuild, ES2017, when
 *     marketing-assets has esbuild installed) hashes differently;
 *   - a Ch8 cluster star is at sea, or within LAND_SAFE_INSET_KM of the coast;
 *   - clusters.generated.ts is not what a fresh run writes.
 *
 *   node --experimental-strip-types web/src/components/story/sky/check-seed.mjs           check
 *   node --experimental-strip-types web/src/components/story/sky/check-seed.mjs --write   rewrite clusters.generated.ts, then check
 *
 * sky-seed.ts imports nothing at run time, so it loads here as it is; the map
 * is passed in, built from cities.generated.ts and projection.ts exactly as
 * seed-map.ts builds it for the page. The sky lab prints the same hash in its
 * overlay, so Node and the browser can be compared by eye.
 */
/* global Buffer, console, process */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import module from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED_FILE = join(HERE, 'sky-seed.ts');
const DATA = join(HERE, '..', 'data');
const OUT = join(HERE, 'clusters.generated.ts');
const ROOT = join(HERE, '..', '..', '..', '..', '..');
const WRITE = process.argv.includes('--write');

/** Pinned output. A change here is a change to every poster and to frame 0. */
const EXPECTED = {
  desktop: { count: 700, hash: '0fbe82a0' },
  mobile: { count: 320, hash: '59e0cedd' },
  lite: { count: 160, hash: '3e321437' },
  field: { count: 240, hash: '419bb1e2' },
  motes: { count: 42, hash: 'da8a1b02' },
};

process.removeAllListeners('warning');
process.on('warning', (w) => {
  if (w.name === 'ExperimentalWarning' || w.code === 'MODULE_TYPELESS_PACKAGE_JSON') return;
  console.warn(`${w.name}: ${w.message}`);
});

const failures = [];
const fail = (message) => failures.push(message);
const url = (file) => pathToFileURL(file).href;

// The map, as seed-map.ts builds it. Both data modules are zero-import.
const cities = await import(url(join(DATA, 'cities.generated.ts')));
const projection = await import(url(join(DATA, 'projection.ts')));
const map = await import(url(join(DATA, 'ph-map.generated.ts')));
if (cities.KM_PER_UNIT !== projection.KM_PER_UNIT) fail(`cities.generated.ts and projection.ts disagree on KM_PER_UNIT`);
const SEED_MAP = { cities: cities.CITIES, kmPerUnit: projection.KM_PER_UNIT, viewBox: projection.VIEWBOX };

const seedA = await import(url(SEED_FILE));
const seedB = await import(`${url(SEED_FILE)}?second-load`);
const sigA = seedA.seedSignature(SEED_MAP);
// A second load with a copy of the map: nothing may depend on object identity.
const sigB = seedB.seedSignature({ ...SEED_MAP, cities: SEED_MAP.cities.map((c) => ({ ...c })) });

console.log('variant   count   hash');
for (const variant of Object.keys(EXPECTED)) {
  const a = sigA[variant];
  console.log(`${variant.padEnd(9)} ${String(a.count).padEnd(7)} ${a.hash}`);
  if (a.hash !== sigB[variant].hash) fail(`${variant}: two loads hash differently (${a.hash} vs ${sigB[variant].hash})`);
  if (a.count !== EXPECTED[variant].count) fail(`${variant}: ${a.count}, expected ${EXPECTED[variant].count}`);
  if (EXPECTED[variant].hash && a.hash !== EXPECTED[variant].hash) {
    fail(`${variant}: hash ${a.hash}, pinned ${EXPECTED[variant].hash}. If the change is deliberate, pin the new value and re-render the posters.`);
  }
}

// Prefixes: lite ⊂ mobile ⊂ desktop, star for star.
const full = seedA.starCloud(SEED_MAP, 700).data;
const mobile = seedA.starCloud(SEED_MAP, 320).data;
if (!mobile.every((v, i) => v === full[i])) fail('the mobile cloud is not a prefix of the desktop cloud');

// The split, the twinkle share and the altitude spread, as the header promises.
const { F, STRIDE } = seedA;
let twinkle = 0;
let gold = 0;
const city = [];
const spread = [];
for (let i = 0; i < 700; i++) {
  const o = i * STRIDE;
  twinkle += full[o + F.twinkle];
  gold += full[o + F.tint];
  (i % 5 < 3 ? city : spread).push(full[o + F.y]);
}
const q = (xs, p) => [...xs].sort((a, b) => a - b)[Math.floor(p * (xs.length - 1))];
const octaves = new Array(9).fill(0);
for (const alt of spread) octaves[Math.min(8, Math.floor(Math.log2(alt / 2)))]++;
console.log(
  `stars     twinkle ${((twinkle / 700) * 100).toFixed(1)}%, gold ${((gold / 700) * 100).toFixed(1)}%; city stars up ${q(city, 0.5).toFixed(1)} units (median), ${q(city, 0.9).toFixed(1)} (p90); spread stars per octave from 2 units: ${octaves.join(' ')}`,
);
if (twinkle !== 56) fail(`expected 56 twinkling stars of 700 (8%), have ${twinkle}`);
if (Math.max(...city) > 40 || Math.min(...city) < 0.4) fail('a city star is outside 0.4–40 units of altitude');
if (Math.min(...octaves) < 20) fail(`an octave of the spread has fewer than 20 stars: ${octaves.join(' ')}`);

// The bundled build, as the page ships it: seed-map.ts and the data modules, through esbuild.
const esbuildEntry = join(ROOT, 'marketing-assets', 'node_modules', 'esbuild', 'lib', 'main.js');
if (existsSync(esbuildEntry)) {
  const esbuild = module.createRequire(import.meta.url)(esbuildEntry);
  const out = await esbuild.build({
    stdin: {
      contents: "import { seedSignature } from './sky-seed'; import { SEED_MAP } from './seed-map'; export const sig = () => seedSignature(SEED_MAP);",
      resolveDir: HERE,
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'SkySeed',
    target: 'es2017',
    platform: 'browser',
    resolveExtensions: ['.ts'],
  });
  const context = {};
  vm.runInNewContext(`${out.outputFiles[0].text}\nthis.SkySeed = SkySeed;`, context);
  const sig = context.SkySeed.sig();
  for (const variant of Object.keys(EXPECTED)) {
    if (sig[variant].hash !== sigA[variant].hash) fail(`${variant}: the ES2017 bundle hashes ${sig[variant].hash}, Node ${sigA[variant].hash}`);
  }
  console.log(`bundle    ES2017 esbuild build (seed-map.ts + data modules) in a fresh VM context: ${Object.keys(EXPECTED).map((v) => sig[v].hash).join(' / ')}`);
} else {
  console.log('bundle    skipped (marketing-assets has no esbuild installed)');
}

// Ch8 clusters, with the land test the storyboard asks for: pointInLand with
// LAND_SAFE_INSET_KM, so every star is on land at every drawn level, not only
// in the test outline.
const inset = map.LAND_SAFE_INSET_KM;
const isLand = (x, y) => map.pointInLand(x, y, inset);
const fresh = {};
for (const variant of ['mobile', 'desktop']) {
  const list = seedA.clusters(SEED_MAP, variant, isLand);
  const again = seedB.clusters({ ...SEED_MAP }, variant, isLand);
  if (JSON.stringify(list) !== JSON.stringify(again)) fail(`${variant} clusters differ between loads`);
  const stars = list.reduce((t, c) => t + c.stars.length, 0);
  const fallbacks = list.reduce((t, c) => t + c.fallbacks, 0);
  let atSea = 0;
  let nearSea = 0;
  for (const c of list) {
    for (const [x, , z] of c.stars) {
      if (!map.pointInLand(x, -z)) atSea++;
      else if (!isLand(x, -z)) nearSea++;
    }
  }
  if (atSea) fail(`${variant}: ${atSea} cluster stars are at sea`);
  if (nearSea) fail(`${variant}: ${nearSea} cluster stars are within ${inset} km of the coast`);
  console.log(
    `clusters  ${variant.padEnd(8)} ${list.length} cities, ${stars} stars, ${atSea} at sea, ${nearSea} within ${inset} km of the coast, ${fallbacks} pulled in toward their city`,
  );
  fresh[variant] = list;
}
// The mobile twelve are the desktop eighteen's first twelve, star for star (each city has its own stream).
for (const c of fresh.mobile) {
  const d = fresh.desktop.find((k) => k.city === c.city);
  if (!d || JSON.stringify(d.stars) !== JSON.stringify(c.stars)) fail(`${c.city}: the mobile cluster differs from the desktop one`);
}

// ─── clusters.generated.ts ───────────────────────────────────────────────

const n = (v) => String(v);
const quote = (s) => `'${s.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
const vec = (v) => `[${v.map(n).join(', ')}]`;
const wave = (w) => n(+w.toFixed(4));
// Each city once, in desktop order, with its desktop wave; mobile picks twelve and re-times the wave.
const clusterLiteral = (c) =>
  `  { city: ${quote(c.city)}, ground: ${vec(c.ground)}, stars: [${c.stars.map(vec).join(', ')}], lines: [${c.lines.map(vec).join(', ')}], wave: ${wave(c.wave)}, fallbacks: ${c.fallbacks} },`;
const mobilePicks = fresh.mobile.map((c) => `[${fresh.desktop.findIndex((d) => d.city === c.city)}, ${wave(c.wave)}]`).join(', ');
const text = `/**
 * GENERATED by web/src/components/story/sky/check-seed.mjs --write. Do not edit by hand.
 * Regenerate: node --experimental-strip-types web/src/components/story/sky/check-seed.mjs --write
 *
 * Ch8's small constellations (storyboard Ch8, A4), as sky-seed.ts \`clusters()\`
 * places them with ph-map.generated.ts \`pointInLand(x, y, LAND_SAFE_INSET_KM)\`
 * as the land test: every star is on land at every drawn map level. They are
 * frozen here so the page never ships the land outline (about 10 KB gzip);
 * check-seed.mjs fails when a fresh run disagrees with this file.
 *
 * World units (map units, x east, y up, z north). Desktop draws the
 * storyboard's 18 cities; mobile its 12, the same clusters re-timed in the
 * north-to-south wave. Remotion imports this file too, so stills match the page.
 */
import type { Cluster } from './sky-seed';

const DESKTOP: readonly Cluster[] = [
${fresh.desktop.map(clusterLiteral).join('\n')}
];

/** [index into DESKTOP, wave among the twelve]. */
const MOBILE: readonly (readonly [number, number])[] = [${mobilePicks}];

export const CLUSTERS: { readonly mobile: readonly Cluster[]; readonly desktop: readonly Cluster[] } = {
  mobile: MOBILE.map(([i, wave]) => ({ ...DESKTOP[i], wave })),
  desktop: DESKTOP,
};
`;

if (WRITE) {
  writeFileSync(OUT, text);
  console.log(`wrote     ${OUT.slice(ROOT.length + 1).replaceAll('\\', '/')} (${Buffer.byteLength(text)} bytes)`);
}
const onDisk = existsSync(OUT) ? readFileSync(OUT, 'utf8') : null;
if (onDisk !== text) fail('clusters.generated.ts is missing or stale: run check-seed.mjs --write');
else {
  // The file as the page loads it must give back exactly what was placed.
  const gen = await import(`${url(OUT)}?verify`);
  for (const variant of ['mobile', 'desktop']) {
    const a = gen.CLUSTERS[variant].map((c) => ({ ...c, wave: +c.wave.toFixed(4) }));
    const b = fresh[variant].map((c) => ({ ...c, wave: +c.wave.toFixed(4) }));
    if (JSON.stringify(a) !== JSON.stringify(b)) fail(`clusters.generated.ts ${variant} does not round-trip`);
  }
  console.log('generated clusters.generated.ts matches a fresh run');
}

if (failures.length) {
  console.error(`\ncheck-seed: ${failures.length} failure${failures.length === 1 ? '' : 's'}`);
  for (const f of failures) console.error(`  FAIL  ${f}`);
  process.exit(1);
}
console.log('\ncheck-seed: ok');
