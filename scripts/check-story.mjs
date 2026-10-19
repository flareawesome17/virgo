#!/usr/bin/env node
/**
 * Keeps the story site honest.
 *
 * The virgo.ph story draws the app's own screens with invented people, and
 * three things can quietly go wrong with that. This script checks all three
 * and fails the build on any of them:
 *
 *   1. Strings. Every per-chapter strings file under
 *      `web/src/components/story/data/strings/` exports `SOURCES`: each string
 *      copied from the app, and the app file it comes from. Each one is
 *      looked up in that file. `mode: 'verbatim'` needs the text itself;
 *      `mode: 'fragments'` needs every listed fragment (for strings the app
 *      builds from a template). Matching is exact — a straight ' never
 *      matches a curly ’ — but it sees through JS escapes (’, \'),
 *      HTML entities (&rsquo;) and JSX line wrapping, and says which of those
 *      it was when a near miss fails.
 *   2. Numbers. `story.ts` derives its counts from one roster and three
 *      upload cohorts; these checks pin the arithmetic the page states
 *      (412 photos, 6.3 → 9.2 → 3.2 → 2.8 → 0.3 GB, 11 people within 25 km…).
 *   3. Words. Every exported string in the strings files and `story.ts` is
 *      linted for words the page must not say (live, stream, TikTok…), whole
 *      word and case-insensitive. A banned word inside an app string that is
 *      proven by SOURCES is allowed: the app may say "live position"; the
 *      page's own copy may not.
 *
 * It also enforces the data modules' zero-import rule: only relative imports
 * of other data modules, so the same files load in Next, in Remotion and here.
 *
 *   node --experimental-strip-types scripts/check-story.mjs            run the checks
 *   node --experimental-strip-types scripts/check-story.mjs --verbose  list every pass too
 *   node --experimental-strip-types scripts/check-story.mjs --self-test  prove the checker catches what it should
 *   node --experimental-strip-types scripts/check-story.mjs --strings <dir>  check another strings folder (to try the checker on fixtures)
 *
 * Exits 1 on any failure, with a report that names the file, the entry and
 * what differs.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import module from 'node:module';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const STORY = join(root, 'web', 'src', 'components', 'story');
const DATA = join(STORY, 'data');
const argv = process.argv.slice(2);
const stringsArg = argv.indexOf('--strings');
const STRINGS = stringsArg !== -1 && argv[stringsArg + 1] ? resolve(argv[stringsArg + 1]) : join(DATA, 'strings');
const SKY_SEED = join(STORY, 'sky', 'sky-seed.ts');

const args = new Set(process.argv.slice(2));
const VERBOSE = args.has('--verbose') || args.has('-v');

// Type stripping announces itself, and web/package.json has no "type", so
// Node also says it re-parsed each .ts as ESM. Both are expected here and
// would bury the report; anything else still prints.
process.removeAllListeners('warning');
process.on('warning', (w) => {
  if (w.name === 'ExperimentalWarning' || w.code === 'MODULE_TYPELESS_PACKAGE_JSON') return;
  console.warn(`${w.name}: ${w.message}`);
});

// ─── Loading TypeScript data modules ─────────────────────────────────────

/**
 * Lets a data module import a sibling the way TypeScript and bundlers do,
 * without an extension (`import { CAST } from '../story'`). Node's ESM
 * resolver insists on the full file name, so a failed relative lookup from a
 * .ts file is retried with `.ts` and `/index.ts`.
 */
function installTsResolver() {
  const isRelative = (s) => s.startsWith('./') || s.startsWith('../');
  if (typeof module.registerHooks === 'function') {
    module.registerHooks({
      resolve(specifier, context, nextResolve) {
        try {
          return nextResolve(specifier, context);
        } catch (error) {
          if (!isRelative(specifier) || extname(specifier) || !context.parentURL?.endsWith('.ts')) throw error;
          for (const tail of ['.ts', '/index.ts']) {
            try {
              return nextResolve(specifier + tail, context);
            } catch {
              // try the next
            }
          }
          throw error;
        }
      },
    });
    return;
  }
  // Older Node: the same hook, off-thread.
  const source = `
    const isRelative = (s) => s.startsWith('./') || s.startsWith('../');
    const hasExt = (s) => /\\.[a-z0-9]+$/i.test(s.split('/').pop());
    export async function resolve(specifier, context, next) {
      try { return await next(specifier, context); } catch (error) {
        if (!isRelative(specifier) || hasExt(specifier) || !context.parentURL?.endsWith('.ts')) throw error;
        for (const tail of ['.ts', '/index.ts']) {
          try { return await next(specifier + tail, context); } catch {}
        }
        throw error;
      }
    }`;
  module.register(`data:text/javascript,${encodeURIComponent(source)}`);
}

// ─── 1. Strings ──────────────────────────────────────────────────────────

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  sbquo: '‚', bdquo: '„', prime: '′', Prime: '″',
  mdash: '—', ndash: '–', hellip: '…', middot: '·',
  bull: '•', times: '×', rarr: '→', larr: '←', copy: '©',
};

/** Undoes JS string escapes: ’, \u{1F600}, \x27, \', \", \`, \\. */
export function decodeJs(s) {
  return s.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|['"`\\])/g, (_, e) => {
    if (e[0] === 'u') return String.fromCodePoint(parseInt(e.replace(/[u{}]/g, ''), 16));
    if (e[0] === 'x') return String.fromCharCode(parseInt(e.slice(1), 16));
    return e;
  });
}

/** Undoes HTML/JSX entities: &rsquo;, &#8217;, &#x2019;. */
export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z]+);/g, (whole, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e] ?? whole;
  });
}

/** JSX joins wrapped lines with one space; so does this. Never touches U+00A0. */
const collapse = (s) => s.replace(/[ \t\r\n]+/g, ' ');

/** One character for one character, so positions survive normalising. */
const normQuotes = (s) => s.replace(/[‘’‚‛′`]/g, "'").replace(/[“”„‟″]/g, '"');
const normPunct = (s) => normQuotes(s).replace(/[‐-―−]/g, '-').replace(/ /g, ' ');

/** The ways a source file can hold a string: as typed, unescaped, de-entitied, and wrapped. */
export function sourceViews(text) {
  const raw = text.replace(/\r\n?/g, '\n');
  const exact = [raw, decodeJs(raw), decodeEntities(raw), decodeEntities(decodeJs(raw))];
  return { exact, collapsed: exact.map(collapse) };
}

const show = (s, n = 60) => {
  const one = s.replace(/\n/g, '⏎');
  return `«${one.length > n ? `${one.slice(0, n)}…` : one}»`;
};
const codepoint = (c) => `${c} (U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')})`;

/**
 * Looks for `needle` in a source file's views. Returns `{ ok: true, how }`,
 * or `{ ok: false, why }` with the nearest miss explained.
 */
export function findInSource(needle, views) {
  if (views.exact.some((v) => v.includes(needle))) {
    return { ok: true, how: views.exact[0].includes(needle) ? 'exact' : 'decoded' };
  }
  const flat = collapse(needle);
  if (views.collapsed.some((v) => v.includes(flat))) return { ok: true, how: 'wrapped' };

  // Near misses, most specific first.
  for (const [label, norm] of [
    ['quotes', normQuotes],
    ['punctuation', normPunct],
  ]) {
    const n = norm(flat);
    for (const v of views.collapsed) {
      const at = norm(v).indexOf(n);
      if (at === -1) continue;
      const found = v.slice(at, at + n.length);
      for (let i = 0; i < flat.length; i++) {
        if (flat[i] !== found[i]) {
          return {
            ok: false,
            why: `the ${label} differ: the string has ${codepoint(flat[i])} where the source has ${codepoint(found[i])}, at ${show(found.slice(Math.max(0, i - 12), i + 12), 40)}`,
          };
        }
      }
    }
  }
  const lower = flat.toLowerCase();
  if (views.collapsed.some((v) => v.toLowerCase().includes(lower))) {
    return { ok: false, why: 'the capitalisation differs' };
  }
  // How far does it get?
  let lo = 0;
  let hi = flat.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (views.collapsed.some((v) => v.includes(flat.slice(0, mid)))) lo = mid;
    else hi = mid - 1;
  }
  if (lo >= 8) {
    return { ok: false, why: `the first ${lo} characters match, then it diverges at ${show(flat.slice(lo), 30)}` };
  }
  return { ok: false, why: 'not found at all' };
}

/**
 * Checks one SOURCES entry against its file's text. Returns what is missing:
 * the reason alone for a verbatim entry (its text is already named), the
 * fragment and the reason for a fragments entry.
 */
export function checkEntry(entry, fileText) {
  const views = sourceViews(fileText);
  const fragments = entry.mode === 'fragments';
  const needles = fragments ? entry.fragments : [entry.text];
  const misses = [];
  for (const n of needles) {
    const r = findInSource(n, views);
    if (!r.ok) misses.push(fragments ? `fragment ${show(n)}: ${r.why}` : r.why);
  }
  return misses;
}

/** What is wrong with an entry's shape, if anything. */
export function entryShapeError(e) {
  if (!e || typeof e !== 'object') return 'is not an object';
  if (typeof e.file !== 'string' || !e.file) return 'has no `file`';
  if (e.mode === 'verbatim') {
    if (typeof e.text !== 'string' || !e.text) return "mode 'verbatim' needs a non-empty `text`";
    return null;
  }
  if (e.mode === 'fragments') {
    if (!Array.isArray(e.fragments) || e.fragments.length === 0) return "mode 'fragments' needs a non-empty `fragments` array";
    if (e.fragments.some((f) => typeof f !== 'string' || !f)) return 'has an empty or non-string fragment';
    if (e.text !== undefined && typeof e.text !== 'string') return '`text` must be a string';
    return null;
  }
  return `has mode ${JSON.stringify(e.mode)}; use 'verbatim' or 'fragments'`;
}

// ─── 2. Numbers ──────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const round1 = (n) => Math.round(n * 10) / 10;

/**
 * The arithmetic the page states, checked against `story.ts`. Takes the
 * module's exports so the self-test can hand it a broken copy.
 */
export function checkNumbers(s) {
  const out = [];
  const check = (name, ok, detail = '') => out.push({ name, ok: Boolean(ok), detail });
  const { ALBUM, COHORTS, UPLOADS, METER, STORAGE, ROSTER, ROLES, RADII, CAST, HIRED, JOB, SEARCH_ROLES } = s;

  // The album.
  const cohortFiles = COHORTS.map((c) => c.files);
  check('cohort files sum to ALBUM.total', sum(cohortFiles) === ALBUM.total, `${cohortFiles.join(' + ')} = ${sum(cohortFiles)}, ALBUM.total = ${ALBUM.total}`);
  const up = Object.fromEntries(UPLOADS.map((u) => [u.who, u.files]));
  check('Mika + Ernie upload ALBUM.photos', up.mika + up.ernie === ALBUM.photos, `${up.mika} + ${up.ernie} = ${up.mika + up.ernie}, ALBUM.photos = ${ALBUM.photos}`);
  check("Kenn's upload is Saturday's film", up.kenn === ALBUM.filmsSaturday, `kenn ${up.kenn}, filmsSaturday ${ALBUM.filmsSaturday}`);
  const sections = ALBUM.sections.map((x) => x.photos);
  check('sections sum to ALBUM.photos', sum(sections) === ALBUM.photos, `${sections.join(' + ')} = ${sum(sections)}, ALBUM.photos = ${ALBUM.photos}`);
  check("Saturday's heading counts photos + the film", ALBUM.saturdayItems === ALBUM.photos + ALBUM.filmsSaturday && ALBUM.saturdayItems === COHORTS[0].files, `saturdayItems ${ALBUM.saturdayItems}, photos + film ${ALBUM.photos + ALBUM.filmsSaturday}, cohort ${COHORTS[0].files}`);
  check('ALBUM.total = photos + films + recordings', ALBUM.total === ALBUM.photos + ALBUM.films + ALBUM.recordings, `${ALBUM.photos} + ${ALBUM.films} + ${ALBUM.recordings} vs ${ALBUM.total}`);
  check('every later film and recording sits in a cohort', COHORTS[1].files + COHORTS[2].files + ALBUM.filmsSaturday === ALBUM.films + ALBUM.recordings, `${COHORTS[1].files} + ${COHORTS[2].files} + ${ALBUM.filmsSaturday} vs ${ALBUM.films} + ${ALBUM.recordings}`);

  // The meter.
  const chain = [METER.saturday, METER.beforeCleanUp, METER.afterDay91, METER.afterDay92, METER.afterDay112];
  check('METER reads 6.3 → 9.2 → 3.2 → 2.8 → 0.3 GB', same(chain, [6.3, 9.2, 3.2, 2.8, 0.3]), `got ${chain.join(' → ')}`);
  const [sat, sun, films] = COHORTS.map((c) => c.gb);
  const derived = [
    round1(STORAGE.baselineGb + sat),
    round1(STORAGE.baselineGb + sat + sun + films),
    round1(STORAGE.baselineGb + sun + films),
    round1(STORAGE.baselineGb + films),
    round1(STORAGE.baselineGb),
  ];
  check('METER follows from the cohorts', same(chain, derived), `cohorts give ${derived.join(' → ')}`);
  check('METER never exceeds the plan', Math.max(...chain) <= STORAGE.planGb, `peak ${Math.max(...chain)} of ${STORAGE.planGb} GB`);
  if ('METER_LEFT_SATURDAY' in s) {
    check('the ring says what is left on Saturday', s.METER_LEFT_SATURDAY === round1(STORAGE.planGb - METER.saturday), `${s.METER_LEFT_SATURDAY} vs ${round1(STORAGE.planGb - METER.saturday)}`);
  }

  // The sweeps: nightly at 3 AM, files more than 90 days old, per upload.
  const days = s.RETENTION_DAYS ?? 90;
  const wedding = Date.parse(`${s.WEDDING_DAY}T00:00:00${s.TZ ?? '+08:00'}`);
  for (const c of COHORTS) {
    const at = Date.parse(c.sweep.at);
    const from = Date.parse(c.uploaded.from);
    const to = Date.parse(c.uploaded.to);
    const local = c.sweep.at.slice(11, 16);
    const dayN = Math.round((Date.parse(`${c.sweep.at.slice(0, 10)}T00:00:00${s.TZ ?? '+08:00'}`) - wedding) / DAY_MS);
    check(`${c.id}: swept on Day ${c.sweep.day}`, dayN === c.sweep.day, `the sweep date is Day ${dayN} from ${s.WEDDING_DAY}`);
    check(`${c.id}: sweep runs at 3:00 AM`, local === '03:00', `at ${local}`);
    check(`${c.id}: every file is over ${days} days old at its sweep`, at - to > days * DAY_MS, `newest upload is ${((at - to) / DAY_MS).toFixed(2)} days old`);
    check(`${c.id}: the night before takes none of it`, at - DAY_MS - from <= days * DAY_MS, `oldest upload is ${((at - DAY_MS - from) / DAY_MS).toFixed(2)} days old the night before`);
  }
  check('three separate sweeps', new Set(COHORTS.map((c) => c.sweep.day)).size === COHORTS.length, COHORTS.map((c) => c.sweep.day).join(', '));

  // The roster.
  const names = ROSTER.map((n) => n.name);
  check('roster names are unique', new Set(names).size === names.length, names.join(', '));
  const fractional = ROSTER.filter((n) => !Number.isInteger(n.km));
  check('distances are whole kilometres', fractional.length === 0, fractional.map((n) => `${n.name} ${n.km}`).join(', '));
  const castKm = Object.values(CAST).filter((c) => !Number.isInteger(c.offset.km));
  check('cast distances are whole kilometres', castKm.length === 0, castKm.map((c) => c.first).join(', '));
  const badRoles = ROSTER.flatMap((n) => n.roles.filter((r) => !ROLES.includes(r)).map((r) => `${n.name}: ${r}`));
  check('roster roles are app roles', badRoles.length === 0, badRoles.join(', '));
  check('the search roles are app roles', SEARCH_ROLES.every((r) => ROLES.includes(r)), SEARCH_ROLES.join(', '));
  const far = ROSTER.filter((n) => n.km > Math.max(...RADII));
  check('everyone is within the widest radius', far.length === 0, far.map((n) => n.name).join(', '));
  check('Nearby never lists the viewer', !names.includes(CAST.mika.first) && !names.includes(CAST.mika.name));
  for (const c of Object.values(CAST)) {
    if (c.id === 'mika') continue;
    const n = ROSTER.find((x) => x.name === c.first);
    check(`${c.first} is in the roster as cast`, n && n.km === c.offset.km && n.bearing === c.offset.bearing && same([...n.roles], [...c.roles]), n ? `roster ${n.km} km @${n.bearing}° [${n.roles}], cast ${c.offset.km} km @${c.offset.bearing}° [${c.roles}]` : 'missing');
  }

  // The radii beats (Ch2).
  const rowNames = (r) => s.rows(r).map((n) => n.name);
  check('5 km lists Ernie, Kenn and Rhea', same(rowNames(5), ['Ernie', 'Kenn', 'Rhea']), `got ${rowNames(5).join(', ')}`);
  check('Bea appears at 25 km, not at 5', rowNames(25).includes('Bea') && !rowNames(5).includes('Bea'));
  check('25 km lists 10 rows', s.rows(25).length === 10, `got ${s.rows(25).length}`);
  check('11 people within 25 km', s.within(25).length === 11, `got ${s.within(25).length}`);
  const appendixA = { Photographer: 3, Videographer: 5, 'Photo Editor': 1, 'Video Editor': 2, 'SDE Editor Photo': 0, 'SDE Editor Video': 2, Coordinator: 0, Host: 1, HMUA: 3 };
  check('25 km chips match Appendix A', same(s.roleCounts(25), appendixA), JSON.stringify(s.roleCounts(25)));
  const erased = ROSTER.filter((n) => n.erased);
  check('one person is erased, a coordinator within 5 km', erased.length === 1 && erased[0].km <= 5 && same([...erased[0].roles], ['Coordinator']), erased.map((n) => `${n.name} ${n.km} km [${n.roles}]`).join(', '));
  check('the Coordinator chip goes 1 → 0', s.roleCounts(5, false).Coordinator === 1 && s.roleCounts(5).Coordinator === 0 && s.roleCounts(25, false).Coordinator === 1 && s.roleCounts(25).Coordinator === 0);
  let last = -1;
  for (const r of RADII) {
    const count = s.within(r).length;
    const chips = s.roleCounts(r);
    const maxChip = Math.max(...Object.values(chips));
    const maxSearched = Math.max(...SEARCH_ROLES.map((x) => chips[x]));
    const rowCount = s.rows(r).length;
    check(`${r} km: people ≥ every chip`, count >= maxChip, `${count} people, biggest chip ${maxChip}`);
    check(`${r} km: rows ≥ every searched chip, ≤ people`, rowCount >= maxSearched && rowCount <= count, `${rowCount} rows, biggest searched chip ${maxSearched}, ${count} people`);
    check(`${r} km: chips add up to at least the people`, sum(Object.values(chips)) >= count);
    const sentence = s.demoSentence(r);
    check(`${r} km: the demo sentence says ${count}`, sentence === `Within ${r} km: ${count} ${count === 1 ? 'person' : 'people'} in this illustration.`, sentence);
    check(`${r} km: counts never shrink as the radius grows`, count >= last, `${count} after ${last}`);
    last = count;
  }

  // The job and the hires.
  for (const [id, h] of Object.entries(HIRED)) {
    const role = JOB.roles.find((r) => r.role === h.role);
    check(`${id} is hired for a posted role at a rate inside its budget`, role && h.rate >= role.min && h.rate <= role.max, role ? `${h.rate} in ${role.min}–${role.max}` : `${h.role} is not posted`);
    check(`${id} does the work they are hired for`, CAST[id]?.roles.includes(h.role), `${CAST[id]?.roles}`);
    check(`${id} is within the 25 km search`, rowNames(25).includes(CAST[id]?.first));
  }
  check('every budget is under the role cap', JOB.roles.every((r) => r.min <= r.max && r.max <= JOB.roleCap));
  check('the job posts the searched roles', same(JOB.roles.map((r) => r.role), [...SEARCH_ROLES]));

  // The clocks.
  if (s.SLATE) {
    const bad = s.SLATE.filter((t) => !/^(?:(?:MON|TUE|WED|THU|FRI|SAT|SUN) (?:1[0-2]|[1-9]):[0-5]\d (?:AM|PM)|DAY \d+)$/.test(t));
    check('the slate is 12-hour', bad.length === 0, bad.join(', '));
  }
  if (s.NOW) check('Ch7 looks on from the last sweep', s.NOW.ch7 === COHORTS[COHORTS.length - 1].sweep.at);

  return out;
}

// ─── 3. Words ────────────────────────────────────────────────────────────

/** [shown as, pattern]. Whole word, case-insensitive. */
const BANNED = [
  ['live', 'live'],
  ['real-time', 'real[-\\s]?time'],
  ['stream', 'stream'],
  ['countdown', 'count-?down'],
  ['expires', 'expires'],
  ['public feed', 'public\\s+feed'],
  ['TikTok', 'tik-?tok'],
  ['App Store', 'app\\s*store'],
  ['Google Play', 'google\\s+play'],
  ['payments', 'payments'],
  ['payouts', 'payouts'],
  ['PayMongo', 'pay\\s*mongo'],
  ['update themselves', 'update\\s+themselves'],
  ['resumable', 'resumable'],
].map(([word, p]) => [word, new RegExp(`(?<![\\p{L}\\p{N}_])(?:${p})(?![\\p{L}\\p{N}_])`, 'giu')]);

/** Every banned word in a string, with where it sits. */
export function bannedHits(str) {
  const hits = [];
  for (const [word, re] of BANNED) {
    re.lastIndex = 0;
    for (let m = re.exec(str); m; m = re.exec(str)) hits.push({ word, index: m.index, length: m[0].length });
  }
  return hits;
}

/**
 * The pieces of app text a banned word may sit inside: each SOURCES text,
 * and each fragment with its `${…}` holes and code quotes taken out.
 */
export function allowPieces(entries) {
  const pieces = new Set();
  for (const e of entries) {
    if (typeof e.text === 'string' && e.text) pieces.add(e.text);
    for (const f of e.fragments ?? []) {
      for (const part of f.split(/\$\{[^}]*\}/)) {
        const p = part.replace(/^[`'"]+|[`'"]+$/g, '');
        if (p.trim()) pieces.add(p);
      }
    }
  }
  return [...pieces].filter((p) => bannedHits(p).length > 0);
}

/** Banned words in `str` that no allowed app string covers. */
export function lintString(str, allow) {
  return bannedHits(str).filter((h) =>
    !allow.some((a) => {
      for (let at = str.indexOf(a); at !== -1; at = str.indexOf(a, at + 1)) {
        if (at <= h.index && at + a.length >= h.index + h.length) return true;
      }
      return false;
    }),
  );
}

/** Every string reachable from a value, with its path. Keys are names, not copy, so only values count. */
export function collectStrings(value, path, out = [], seen = new Set()) {
  if (typeof value === 'string') out.push({ path, value });
  else if (Array.isArray(value)) {
    if (seen.has(value)) return out;
    seen.add(value);
    value.forEach((v, i) => collectStrings(v, `${path}[${i}]`, out, seen));
  } else if (value && typeof value === 'object') {
    if (seen.has(value)) return out;
    seen.add(value);
    for (const [k, v] of Object.entries(value)) collectStrings(v, /^[A-Za-z_$][\w$]*$/.test(k) ? `${path}.${k}` : `${path}[${JSON.stringify(k)}]`, out, seen);
  }
  return out;
}

// ─── 4. Imports ──────────────────────────────────────────────────────────

/** Bare and aliased specifiers in a data module: everything but relative paths to other data modules. */
export function importViolations(text, fileAbs) {
  const out = [];
  const re = /(?:^|[\s;])(?:import|export)\s+(?:type\s+)?(?:[\w*${}\s,]+?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const spec = m[1] ?? m[2];
    if (!spec.startsWith('./') && !spec.startsWith('../')) {
      out.push(`imports ${JSON.stringify(spec)}: data modules import only other data modules, by relative path`);
      continue;
    }
    const target = resolve(dirname(fileAbs), spec);
    const inData = target === DATA || target.startsWith(DATA + sep);
    const isSeed = target.replace(/\.ts$/, '') === SKY_SEED.replace(/\.ts$/, '');
    if (!inData && !isSeed) out.push(`imports ${JSON.stringify(spec)}, which is outside story/data`);
  }
  for (const word of ['enum', 'namespace']) {
    if (new RegExp(`^\\s*(?:export\\s+)?(?:declare\\s+)?(?:const\\s+)?${word}\\s+\\w`, 'm').test(text)) {
      out.push(`declares a TypeScript ${word}, which --experimental-strip-types cannot run`);
    }
  }
  return out;
}

function walkTs(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walkTs(p);
    return /\.ts$/.test(name) && !/\.d\.ts$/.test(name) ? [p] : [];
  });
}

// ─── The run ─────────────────────────────────────────────────────────────

const rel = (p) => relative(root, p).split(sep).join('/');
const fileCache = new Map();
function readSource(file) {
  if (!fileCache.has(file)) {
    const abs = join(root, file);
    fileCache.set(file, existsSync(abs) ? readFileSync(abs, 'utf8') : null);
  }
  return fileCache.get(file);
}

async function run() {
  installTsResolver();
  const failures = [];
  const lines = [];
  const pass = (msg) => VERBOSE && lines.push(`  PASS  ${msg}`);
  const fail = (msg) => {
    failures.push(msg);
    lines.push(`  FAIL  ${msg}`);
  };

  // Imports first: a module that breaks the rule may not even load.
  lines.push('Imports (data modules)');
  const dataFiles = [...walkTs(DATA), ...(existsSync(SKY_SEED) ? [SKY_SEED] : [])];
  for (const f of dataFiles) {
    const v = importViolations(readFileSync(f, 'utf8'), f);
    if (v.length) v.forEach((m) => fail(`${rel(f)} ${m}`));
    else pass(rel(f));
  }
  lines.push(`  ${dataFiles.length} files`);

  // Load everything.
  const story = await import(pathToFileURL(join(DATA, 'story.ts')).href);
  const stringFiles = existsSync(STRINGS) ? readdirSync(STRINGS).filter((n) => /\.ts$/.test(n) && !/\.d\.ts$/.test(n)).sort() : [];
  const modules = [];
  for (const name of stringFiles) {
    const abs = join(STRINGS, name);
    try {
      modules.push({ name: `strings/${name}`, abs, mod: await import(pathToFileURL(abs).href) });
    } catch (error) {
      modules.push({ name: `strings/${name}`, abs, error });
    }
  }

  // 1. Strings.
  lines.push('', 'Strings (SOURCES against the app)');
  const allEntries = [];
  let checked = 0;
  for (const m of modules) {
    if (m.error) {
      fail(`${m.name} does not load under plain Node: ${String(m.error.message ?? m.error).split('\n')[0]}`);
      continue;
    }
    const sources = m.mod.SOURCES;
    if (!Array.isArray(sources)) {
      fail(`${m.name} has no SOURCES array export`);
      continue;
    }
    let bad = 0;
    sources.forEach((e, i) => {
      const where = `${m.name} SOURCES[${i}]${e && typeof e.text === 'string' ? ` ${show(e.text, 40)}` : ''}`;
      const shape = entryShapeError(e);
      if (shape) {
        bad++;
        fail(`${where} ${shape}`);
        return;
      }
      const text = readSource(e.file);
      if (text === null) {
        bad++;
        fail(`${where}: ${e.file} does not exist`);
        return;
      }
      checked++;
      const misses = checkEntry(e, text);
      if (misses.length) {
        bad++;
        misses.forEach((miss) => fail(`${where} in ${e.file}: ${miss}`));
      } else {
        // Only a proven app string may carry a banned word.
        allEntries.push(e);
      }
    });
    if (!bad) pass(`${m.name}: ${sources.length} sources`);
  }
  lines.push(`  ${checked} sources in ${modules.length} file${modules.length === 1 ? '' : 's'}`);

  // 2. Numbers.
  lines.push('', 'Numbers (story.ts)');
  let numbers;
  try {
    numbers = checkNumbers(story);
  } catch (error) {
    // A renamed export in story.ts should read as a failure, not a stack trace.
    const detail = String(error?.message ?? error).split('\n')[0];
    numbers = [{ name: 'the number checks could not run', ok: false, detail }];
  }
  for (const n of numbers) {
    if (n.ok) pass(n.name);
    else fail(`${n.name}${n.detail ? ` — ${n.detail}` : ''}`);
  }
  lines.push(`  ${numbers.length} checks`);

  // 3. Words.
  lines.push('', 'Words (banned in page copy)');
  const allow = allowPieces(allEntries);
  const linted = [];
  for (const [name, value] of Object.entries(story)) collectStrings(value, `story.ts › ${name}`, linted);
  for (const r of story.RADII ?? []) linted.push({ path: `story.ts › demoSentence(${r})`, value: story.demoSentence(r) });
  for (const m of modules) {
    if (m.error) continue;
    for (const [name, value] of Object.entries(m.mod)) {
      if (name === 'SOURCES') continue;
      collectStrings(value, `${m.name} › ${name}`, linted);
    }
  }
  for (const { path, value } of linted) {
    for (const h of lintString(value, allow)) {
      fail(`${path}: "${h.word}" in ${show(value.slice(Math.max(0, h.index - 30), h.index + h.length + 30), 80)}`);
    }
  }
  lines.push(`  ${linted.length} strings; ${allow.length} proven app string${allow.length === 1 ? '' : 's'} may contain a banned word`);

  console.log(`check-story\n\n${lines.join('\n')}\n`);
  if (failures.length) {
    console.log(`${failures.length} failure${failures.length === 1 ? '' : 's'}.`);
    process.exit(1);
  }
  console.log('All story checks pass.');
}

// ─── Self-test ───────────────────────────────────────────────────────────

/**
 * Proves the checker catches what it claims to: each case feeds it a small
 * fixture with a known answer. A checker that passes everything would pass
 * the real run too, so this is what makes a green run mean something.
 */
async function selfTest() {
  installTsResolver();
  const results = [];
  const expect = (name, ok, detail = '') => results.push({ name, ok: Boolean(ok), detail });

  // Strings.
  const src = [
    "const a = 'Others see only how far away you are, never where you are.';",
    "const b = 'What\\'s new in Virgo';",
    "const c = 'Delivered files cleaned up';",
    'const d = `${n} files removed from “${album.name}” as scheduled.`;',
    "const e = 'It\\u2019s yours';",
    '<p>Interfaces are drawn from',
    '  the app &mdash; illustrative.</p>',
    '<span>You&rsquo;re in</span>',
  ].join('\r\n');
  const ok = (entry) => checkEntry(entry, src).length === 0;
  const why = (entry) => checkEntry(entry, src).join('; ');
  expect('verbatim: exact text passes', ok({ text: 'Delivered files cleaned up', file: 'x', mode: 'verbatim' }));
  expect('verbatim: missing text fails', !ok({ text: 'Delivered files removed', file: 'x', mode: 'verbatim' }));
  expect('verbatim: a JS-escaped apostrophe matches a straight one', ok({ text: "What's new in Virgo", file: 'x', mode: 'verbatim' }));
  expect('verbatim: \\u2019 in the source matches ’', ok({ text: 'It’s yours', file: 'x', mode: 'verbatim' }));
  expect('verbatim: ’ never matches a straight apostrophe', !ok({ text: 'What’s new in Virgo', file: 'x', mode: 'verbatim' }));
  expect('verbatim: the miss says the quotes differ', /quotes differ/.test(why({ text: 'What’s new in Virgo', file: 'x', mode: 'verbatim' })), why({ text: 'What’s new in Virgo', file: 'x', mode: 'verbatim' }));
  expect('verbatim: a straight apostrophe never matches \\u2019', !ok({ text: "It's yours", file: 'x', mode: 'verbatim' }));
  expect('verbatim: &rsquo; matches ’', ok({ text: 'You’re in', file: 'x', mode: 'verbatim' }));
  expect("verbatim: &rsquo; never matches '", !ok({ text: "You're in", file: 'x', mode: 'verbatim' }));
  expect('verbatim: JSX wrapped over lines matches, with &mdash;', ok({ text: 'Interfaces are drawn from the app — illustrative.', file: 'x', mode: 'verbatim' }));
  expect('verbatim: a hyphen never matches an em dash', /punctuation differ/.test(why({ text: 'Interfaces are drawn from the app - illustrative.', file: 'x', mode: 'verbatim' })));
  expect('verbatim: capitalisation is exact', /capitalisation/.test(why({ text: 'delivered files cleaned up', file: 'x', mode: 'verbatim' })));
  expect('fragments: every fragment present passes', ok({ text: '3 files removed from “Album” as scheduled.', file: 'x', mode: 'fragments', fragments: [' files removed from “', '” as scheduled.'] }));
  expect('fragments: one missing fragment fails', !ok({ file: 'x', mode: 'fragments', fragments: [' files removed from “', '” as planned.'] }));
  expect('fragments: straight quotes never match curly ones', !ok({ file: 'x', mode: 'fragments', fragments: [' files removed from "'] }));
  expect('shape: verbatim without text is rejected', entryShapeError({ file: 'x', mode: 'verbatim' }));
  expect('shape: an unknown mode is rejected', entryShapeError({ text: 'a', file: 'x', mode: 'exact' }));
  expect('shape: a good entry passes', entryShapeError({ text: 'a', file: 'x', mode: 'verbatim' }) === null);

  // Words.
  const words = (s) => bannedHits(s).map((h) => h.word);
  expect('words: "Delivered" is not "live"', words('Delivered, alive, olive, lives').length === 0, words('Delivered, alive, olive, lives').join());
  expect('words: "Go LIVE" is caught', same(words('Go LIVE tonight'), ['live']));
  expect('words: real-time, real time and realtime are caught', words('real-time, real time, realtime').filter((w) => w === 'real-time').length === 3);
  expect('words: "streaming" is not "stream", "stream" is', same(words('streaming a stream'), ['stream']));
  expect('words: phrases span whitespace', same(words('the public\nfeed').concat(words('on the App Store')), ['public feed', 'App Store']));
  expect('words: TikTok’s is caught', same(words('TikTok’s'), ['TikTok']));
  expect('words: PayMongo, payouts, payments, resumable, expires, countdown', words('PayMongo payouts payments resumable expires countdown').length === 6);
  expect('words: "files update themselves" is caught', same(words('files update themselves'), ['update themselves']));
  const allow = allowPieces([
    { text: 'Would rather not share a live position?', file: 'x', mode: 'verbatim' },
    { file: 'x', mode: 'fragments', fragments: ['`${n} people stream it`', 'nothing banned here'] },
  ]);
  expect('allow: only pieces with a banned word are kept', allow.length === 2, JSON.stringify(allow));
  expect('allow: a proven app string may say "live"', lintString('Would rather not share a live position?', allow).length === 0);
  expect('allow: page copy around it is still linted', lintString('Go live. Would rather not share a live position?', allow).length === 1);
  expect('allow: a fragment piece covers its own word only', lintString('3 people stream it', allow).length === 0 && lintString('a live stream', allow).length === 2);
  const collected = collectStrings({ a: 'x', b: ['y', { c: 'z' }], f: () => 'w', n: 3 }, 'T');
  expect('collect: walks objects and arrays, skips functions', same(collected.map((c) => c.path), ['T.a', 'T.b[0]', 'T.b[1].c']));

  // Imports.
  const fake = join(DATA, 'strings', 'fake.ts');
  expect('imports: a relative data import is fine', importViolations("import { CAST } from '../story';\nimport type { X } from './other';", fake).length === 0);
  expect('imports: an @/ alias is caught', importViolations("import { cn } from '@/lib/utils';", fake).length === 1);
  expect('imports: a package is caught, type-only too', importViolations("import type { FC } from 'react';", fake).length === 1);
  expect('imports: reaching out of story/data is caught', importViolations("import { Plate } from '../../mocks/plate';", fake).length === 1);
  expect('imports: an enum is caught', importViolations('export enum Tone { Night }', fake).length === 1);

  // Numbers: the real module passes, and broken copies fail on the right check.
  const story = await import(pathToFileURL(join(DATA, 'story.ts')).href);
  const real = checkNumbers(story);
  expect('numbers: story.ts passes every check', real.every((c) => c.ok), real.filter((c) => !c.ok).map((c) => c.name).join('; '));
  const broken = (patch, pattern) => {
    const failed = checkNumbers({ ...story, ...patch }).filter((c) => !c.ok).map((c) => c.name);
    return failed.some((n) => pattern.test(n)) ? '' : `nothing matching ${pattern} failed (failed: ${failed.join('; ') || 'none'})`;
  };
  const cases = [
    ['sections that do not add up', { ALBUM: { ...story.ALBUM, sections: [{ name: 'Prep', photos: 95 }, ...story.ALBUM.sections.slice(1)] } }, /sections sum/],
    ['a meter reading off by 0.1', { METER: { ...story.METER, afterDay92: 2.9 } }, /METER reads/],
    ['an upload count off by one', { UPLOADS: [{ who: 'mika', files: 249, role: 'Owner' }, ...story.UPLOADS.slice(1)] }, /Mika \+ Ernie/],
    ['a cohort file count off by one', { COHORTS: [{ ...story.COHORTS[0], files: 414 }, ...story.COHORTS.slice(1)] }, /cohort files sum/],
    ['a sweep a day early', { COHORTS: [{ ...story.COHORTS[0], sweep: { day: 90, at: '2027-03-12T03:00:00+08:00' } }, ...story.COHORTS.slice(1)] }, /over 90 days old/],
    ['a fractional distance', { ROSTER: story.ROSTER.map((n) => (n.name === 'Joy' ? { ...n, km: 9.4 } : n)) }, /whole kilometres/],
    ['a cast member moved in the roster only', { ROSTER: story.ROSTER.map((n) => (n.name === 'Bea' ? { ...n, km: 9 } : n)) }, /Bea is in the roster/],
    ['a hire above its budget', { HIRED: { ...story.HIRED, bea: { role: 'HMUA', rate: 13_000 } } }, /bea is hired/],
  ];
  for (const [label, patch, pattern] of cases) {
    const miss = broken(patch, pattern);
    expect(`numbers: catches ${label}`, !miss, miss);
  }

  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    if (!r.ok || VERBOSE) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${!r.ok && r.detail ? ` — ${r.detail}` : ''}`);
  }
  console.log(`\ncheck-story self-test: ${results.length - failed.length}/${results.length} cases behave.`);
  if (failed.length) process.exit(1);
}

await (args.has('--self-test') ? selfTest() : run());
