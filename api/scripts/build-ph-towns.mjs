/**
 * Builds src/discover/ph-towns.ts: every city and municipality in the
 * Philippines, its province, and where its centre is.
 *
 * Nearby places an address at its town's centre. Until this table it knew
 * about seventy cities, and every other town stood at its province's capital,
 * so a whole province read as one place at one distance.
 *
 * The source is Wikidata (CC0): items that are a municipality of the
 * Philippines (Q24764), a highly urbanized city (Q29946056), a component city
 * (Q106078286) or an independent component city (Q106079704), with their
 * coordinate (P625) and the province they are in (P131). Dissolved ones
 * (P576) are left out. A coordinate there is the town proper, usually the
 * town hall, which is what "their town's centre" means here.
 *
 * Each town's English aliases come along as other names to recognise it by,
 * never to show: former names (Bailen), the long official name (Don
 * Victoriano Chiongbian), abbreviations (Gen. Mariano Alvarez, GMA) and local
 * spellings (Bokawe).
 *
 * Highly urbanized cities are filed under their region rather than a
 * province, and a few towns name two provinces. PROVINCE_OF settles those by
 * hand: the province an address there would give.
 *
 *   node scripts/build-ph-towns.mjs                 fetch from Wikidata, write
 *   node scripts/build-ph-towns.mjs --from <dir>    use saved answers (towns.json, aliases.json)
 *   node scripts/build-ph-towns.mjs --check         fail if the file would change
 *
 * Checks before writing: every point is inside the country, every province is
 * one discover/places.ts knows, no town is listed twice in one province, and
 * any town far from its province's capital is printed for a look.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const api = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(api, 'src/discover/ph-towns.ts');
const PLACES = join(api, 'src/discover/places.ts');

const QUERY = `
SELECT ?town ?townLabel ?coord ?parent ?parentLabel ?dissolved WHERE {
  VALUES ?type { wd:Q24764 wd:Q29946056 wd:Q106078286 wd:Q106079704 }
  ?town wdt:P31 ?type .
  OPTIONAL { ?town wdt:P625 ?coord }
  OPTIONAL { ?town wdt:P131 ?parent }
  OPTIONAL { ?town wdt:P576 ?dissolved }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
}`;

const ALIAS_QUERY = `
SELECT ?town ?alias WHERE {
  VALUES ?type { wd:Q24764 wd:Q29946056 wd:Q106078286 wd:Q106079704 }
  ?town wdt:P31 ?type .
  ?town skos:altLabel ?alias .
  FILTER(LANG(?alias) = "en" || LANG(?alias) = "mul")
}`;

/**
 * Province by hand, by Wikidata item, for the towns whose P131 is a region
 * or names more than one province.
 *
 * Cotabato City is independent and the Bangsamoro seat; addresses file it
 * under the province around it, that province since the 2022 split, or
 * Cotabato, whose name it shares — the same three discover/places.ts accepts.
 * The eight municipalities of the Bangsamoro Special Geographic Area belong to
 * no province; they sit inside Cotabato, which is what an address there says.
 */
const PROVINCE_OF = {
  Q1467: ['Cebu'], // Cebu City
  Q574903: ['Cebu'], // Lapu-Lapu
  Q1889017: ['Cebu'], // Mandaue
  Q1473: ['Davao del Sur'], // Davao City
  Q1629: ['Zamboanga del Sur'], // Zamboanga City
  Q1645: ['Misamis Oriental'], // Cagayan de Oro
  Q285488: ['Lanao del Norte'], // Iligan
  Q1686: ['Agusan del Norte'], // Butuan
  Q1710: ['Basilan'], // Isabela City
  Q1822: ['Benguet'], // Baguio
  Q5217: ['Negros Occidental'], // Bacolod
  Q40626: ['Leyte'], // Tacloban
  Q55741: ['Pampanga'], // Angeles
  Q56759: ['Zambales'], // Olongapo
  Q104125: ['Quezon'], // Lucena
  Q111739: ['Palawan'], // Puerto Princesa
  Q459787: ['Iloilo'], // Iloilo City
  Q594275: ['South Cotabato'], // General Santos
  Q726993: ['Maguindanao del Norte', 'Cotabato'], // Cotabato City
  Q76001: ['Laguna'], // San Pablo
  Q54458: ['Bataan'], // Hermosa
  Q30042: ['Apayao'], // Flora
  Q31508396: ['Cotabato'], // Kadayangan
  Q31508433: ['Cotabato'], // Kapalawan
  Q31508452: ['Cotabato'], // Ligawasan
  Q31508472: ['Cotabato'], // Malidegao
  Q31508492: ['Cotabato'], // Nabalawag
  Q31508510: ['Cotabato'], // Old Kaabakan
  Q31508528: ['Cotabato'], // Pahamuddin
  Q31508546: ['Cotabato'], // Tugunan
};

/** Beyond this from its province's capital a town is printed for a look. */
const FAR_KM = 120;

const args = process.argv.slice(2);
const fromFile = args.includes('--from') ? args[args.indexOf('--from') + 1] : null;
const checkOnly = args.includes('--check');

/** The provinces discover/places.ts knows, with its point for each. */
const provinces = new Map(
  [...readFileSync(PLACES, 'utf8').matchAll(/^\s+\['([^']+)', ([\d.]+), ([\d.]+)\],$/gm)].map(
    ([, name, lat, lon]) => [name, { lat: Number(lat), lon: Number(lon) }],
  ),
);

async function sparql(query, saved) {
  if (fromFile) return JSON.parse(readFileSync(join(fromFile, saved), 'utf8'));
  const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      Accept: 'application/sparql-results+json',
      'User-Agent': 'VirgoNearbyTownTable/1.0 (build-ph-towns.mjs)',
    },
  });
  if (!response.ok) throw new Error(`Wikidata answered ${response.status}`);
  return response.json();
}

function km(a, b) {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const fail = (message) => {
  console.error(`build-ph-towns: ${message}`);
  process.exit(1);
};

const answer = await sparql(QUERY, 'towns.json');
const aliasAnswer = await sparql(ALIAS_QUERY, 'aliases.json');
const id = (uri) => uri?.split('/').pop() ?? null;

/** One entry per item: its name, its point, and every parent it names. */
const items = new Map();
for (const b of answer.results.bindings) {
  const key = id(b.town.value);
  const item = items.get(key) ?? { name: b.townLabel?.value, coord: null, parents: new Set(), dissolved: false };
  if (b.coord) item.coord = b.coord.value;
  if (b.parentLabel) item.parents.add(b.parentLabel.value);
  if (b.dissolved) item.dissolved = true;
  items.set(key, item);
}

/** Lower case, unaccented, letters and digits only: places.ts's locationKey. */
const fold = (text) =>
  text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * Other names for each item, tidied: no "Municipality of" or "City of", no
 * ", Province" after it, nothing with digits or brackets, nothing that is
 * just the name again.
 */
const aliasesOf = new Map();
for (const b of aliasAnswer.results.bindings) {
  const key = id(b.town.value);
  const list = aliasesOf.get(key) ?? [];
  list.push(b.alias.value);
  aliasesOf.set(key, list);
}
function otherNames(key, name, province) {
  const own = new Set([fold(name), fold(name.replace(/\s+city$/i, ''))]);
  const out = new Map();
  for (const raw of aliasesOf.get(key) ?? []) {
    const alias = raw
      .replace(/^(municipality|city|municipio)\s+of\s+/i, '')
      .replace(new RegExp(`,\\s*(${province}|Philippines)$`, 'i'), '')
      .trim();
    const folded = fold(alias);
    if (!folded || /[\d()[\],]/.test(alias) || alias.length > 40 || own.has(folded)) continue;
    if (!out.has(folded)) out.set(folded, alias);
  }
  return [...out.values()].sort();
}

const rows = [];
const far = [];
for (const [key, item] of items) {
  if (item.dissolved) continue;
  if (!item.coord) fail(`${item.name} (${key}) has no coordinate`);
  const [, lon, lat] = /^Point\(([-\d.]+) ([-\d.]+)\)$/.exec(item.coord) ?? fail(`${key}: ${item.coord}`);
  const at = { lat: Math.round(Number(lat) * 1e4) / 1e4, lon: Math.round(Number(lon) * 1e4) / 1e4 };
  // West to 114°: Kalayaan, Palawan, is the Spratly Islands.
  if (at.lat < 4.5 || at.lat > 21.5 || at.lon < 114 || at.lon > 127) fail(`${item.name} (${key}) is outside the country`);

  const named = [...item.parents].filter((p) => provinces.has(p));
  const homes = PROVINCE_OF[key] ?? named;
  if (homes.length !== 1 && !PROVINCE_OF[key]) {
    fail(`${item.name} (${key}) names ${homes.length} provinces (${[...item.parents].join(', ')}); add it to PROVINCE_OF`);
  }
  for (const province of homes) {
    if (!provinces.has(province)) fail(`${item.name}: "${province}" is not a province places.ts knows`);
    // "Tobias Fornier, Antique": the province is said by the table.
    const name = item.name.replace(new RegExp(`, ${province}$`), '').trim();
    rows.push([name, province, at.lat, at.lon, otherNames(key, name, province)]);
    const d = km(at, provinces.get(province));
    if (d > FAR_KM) far.push(`${name}, ${province}: ${Math.round(d)} km from the capital`);
  }
}

rows.sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]) || a[2] - b[2]);
const seen = new Set();
for (const [name, province] of rows) {
  const k = `${name.toLowerCase()}|${province}`;
  if (seen.has(k)) fail(`${name} is listed twice in ${province}`);
  seen.add(k);
}

const towns = new Set(rows.map(([name, , lat, lon]) => `${name}|${lat}|${lon}`)).size;
const quoted = (text) => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const body = rows
  .map(([name, province, lat, lon, aliases]) =>
    aliases.length
      ? `  [${quoted(name)}, ${quoted(province)}, ${lat}, ${lon}, [${aliases.map(quoted).join(', ')}]],`
      : `  [${quoted(name)}, ${quoted(province)}, ${lat}, ${lon}],`,
  )
  .join('\n');
const file = `/**
 * Every city and municipality in the Philippines: its name, its province,
 * where its centre is (the town proper, to four decimal places), and other
 * names it goes by, for recognising it in an address — never for showing.
 *
 * Generated by scripts/build-ph-towns.mjs from Wikidata (CC0). Do not edit by
 * hand: fix the item on Wikidata, or PROVINCE_OF in the script, and run it
 * again. ${towns} towns, ${rows.length} rows (a town filed under two provinces
 * has a row for each).
 */
export const PH_TOWNS: readonly (readonly [
  name: string,
  province: string,
  lat: number,
  lon: number,
  aliases?: readonly string[],
])[] = [
${body}
];
`;

if (checkOnly) {
  const onDisk = readFileSync(OUT, 'utf8').replaceAll('\r\n', '\n');
  if (onDisk !== file) fail('src/discover/ph-towns.ts is out of date');
  console.log('build-ph-towns: up to date');
} else {
  writeFileSync(OUT, file);
  console.log(`build-ph-towns: ${towns} towns, ${rows.length} rows written to src/discover/ph-towns.ts`);
}
if (far.length) console.log(`Far from their province's capital (over ${FAR_KM} km), for a look:\n  ${far.join('\n  ')}`);
