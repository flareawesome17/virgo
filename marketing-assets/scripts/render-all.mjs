/**
 * Renders every Remotion output of the story site (storyboard §4: B3, B3b,
 * B3c, C1, C2, C4) into marketing-assets/out/, which is gitignored. It
 * bundles once, renders against that bundle, then runs render-check.mjs.
 * Re-running overwrites the same files, so it is safe to run again.
 *
 *   node scripts/render-all.mjs                      bundle, stills, masters, check frames, checks
 *   node scripts/render-all.mjs --only=stills,check  just those steps (the bundle is always rebuilt)
 *
 * What it writes (publish.mjs turns these into the page's hashed files):
 *   out/stills/sky-poster-{d,m}.png         B3, frame 0 of the Prologue with the coastline baked in faintly
 *   out/stills/sky-poster-{d,m}-canvas.png  B3, frame 0 exactly as the canvas draws it (no coastline yet)
 *   out/stills/clusters-{d,m}.png           B3b, Ch8's crane at rest with the 18 / 12 clusters
 *   out/stills/cebu-lens.png                B3c, the Prologue's lens on Cebu City (transparent outside the circle)
 *   out/stills/hero-wide-frame0.png         C1's poster: frame 0 of the loop
 *   out/stills/og-frame0.png                C2's frame 0: the og:image
 *   out/master/hero-wide.mov                C1 master, ProRes 4444 (10-bit 4:4:4, no alpha) from PNG frames, bt709, no audio
 *   out/master/og.mov                       C2 master, the same
 *   out/check/{hero,og}/frame-NNN.png       the frames render-check.mjs compares (seams, the motion window)
 *
 * The browser: REMOTION_BROWSER if set; else Remotion's own download if
 * `npx remotion browser ensure` has run; else the Playwright headless shell
 * already on this machine (%LOCALAPPDATA%\ms-playwright), so nothing is
 * downloaded. Encodes use Remotion's bundled ffmpeg.
 */
/* global console, process -- Node script; the package ESLint config is the Remotion (browser) preset. */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(PKG, 'out');
const BUNDLE = join(OUT, 'bundle');
const CLI = join(PKG, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
const SEED_CHECK = join(PKG, '..', 'web', 'src', 'components', 'story', 'sky', 'check-seed.mjs');

const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const ONLY = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',')) : null;
const wanted = (step) => !ONLY || ONLY.has(step);

/** check-seed.mjs's pinned hashes: a poster whose cloud hashes differently fails its render. */
function pinnedSeeds() {
  const text = readFileSync(SEED_CHECK, 'utf8');
  const pin = (variant) => {
    const m = text.match(new RegExp(`${variant}: \\{ count: \\d+, hash: '([0-9a-f]{8})' \\}`));
    if (!m) throw new Error(`render-all: no pinned ${variant} hash in ${SEED_CHECK}`);
    return m[1];
  };
  return { desktop: pin('desktop'), mobile: pin('mobile') };
}

function browser() {
  if (process.env.REMOTION_BROWSER) return process.env.REMOTION_BROWSER;
  if (existsSync(join(PKG, 'node_modules', '.remotion'))) return null;
  const base = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
  if (!existsSync(base)) return null;
  const shells = readdirSync(base)
    .filter((d) => /^chromium_headless_shell-\d+$/.test(d))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const d of shells) {
    const exe = join(base, d, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe');
    if (existsSync(exe)) return exe;
  }
  return null;
}

const BROWSER = browser();

function remotion(args) {
  const all = [...args, '--log=warn'];
  if (BROWSER && args[0] !== 'bundle') all.push(`--browser-executable=${BROWSER}`);
  const run = spawnSync(process.execPath, [CLI, ...all], { cwd: PKG, stdio: 'inherit' });
  if (run.status !== 0) throw new Error(`render-all: \`remotion ${args.join(' ')}\` exited ${run.status}`);
}

const step = (label) => console.log(`\n── ${label}`);

const t0 = Date.now();
const seeds = pinnedSeeds();
console.log(`render-all: browser ${BROWSER ?? "(Remotion's own)"}; seeds desktop ${seeds.desktop}, mobile ${seeds.mobile}`);

step('bundle');
remotion(['bundle', 'src/index.ts', `--out-dir=${BUNDLE}`]);

if (wanted('stills')) {
  step('stills');
  mkdirSync(join(OUT, 'stills'), { recursive: true });
  const stills = [
    { id: 'SkyPosterD', out: 'sky-poster-d.png', props: { expectSeed: seeds.desktop } },
    { id: 'SkyPosterM', out: 'sky-poster-m.png', props: { expectSeed: seeds.mobile } },
    { id: 'SkyPosterD', out: 'sky-poster-d-canvas.png', props: { expectSeed: seeds.desktop, mapOpacity: 0 } },
    { id: 'SkyPosterM', out: 'sky-poster-m-canvas.png', props: { expectSeed: seeds.mobile, mapOpacity: 0 } },
    { id: 'ClustersD', out: 'clusters-d.png' },
    { id: 'ClustersM', out: 'clusters-m.png' },
    { id: 'CebuLens', out: 'cebu-lens.png' },
    { id: 'HeroLoopWide', out: 'hero-wide-frame0.png', frame: 0 },
    { id: 'OgVideo', out: 'og-frame0.png', frame: 0 },
  ];
  for (const s of stills) {
    console.log(`${s.id} → out/stills/${s.out}`);
    const args = ['still', BUNDLE, s.id, join(OUT, 'stills', s.out), '--image-format=png'];
    if (s.frame !== undefined) args.push(`--frame=${s.frame}`);
    if (s.props) args.push(`--props=${JSON.stringify(s.props)}`);
    remotion(args);
  }
}

if (wanted('masters')) {
  step('masters (ProRes 4444, 10-bit 4:4:4, from PNG frames)');
  mkdirSync(join(OUT, 'master'), { recursive: true });
  for (const [id, out] of [
    ['HeroLoopWide', 'hero-wide.mov'],
    ['OgVideo', 'og.mov'],
  ]) {
    console.log(`${id} → out/master/${out}`);
    remotion(['render', BUNDLE, id, join(OUT, 'master', out), '--codec=prores', '--prores-profile=4444', '--pixel-format=yuv444p10le', '--image-format=png', '--color-space=bt709', '--muted']);
  }
}

if (wanted('check')) {
  step('check frames');
  for (const [id, dir, frames] of [
    // Frame 288 of the 289-frame debug composition must be frame 0.
    ['HeroLoopSeam', 'hero', '0,72,144,216,286,287,288'],
    // Frame 240 must be frame 0; the pulse and twinkle live inside 36–150.
    ['OgVideoSeam', 'og', '0,36,60,96,120,150,238,239,240'],
  ]) {
    const target = join(OUT, 'check', dir);
    rmSync(target, { recursive: true, force: true });
    mkdirSync(target, { recursive: true });
    console.log(`${id} frames ${frames} → out/check/${dir}/`);
    remotion(['render', BUNDLE, id, target, '--sequence', `--frames=${frames}`, '--image-format=png', '--image-sequence-pattern=frame-[frame].[ext]']);
  }
}

step('render-check');
const check = spawnSync(process.execPath, [join(PKG, 'scripts', 'render-check.mjs')], { cwd: PKG, stdio: 'inherit' });
console.log(`\nrender-all: done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
process.exit(check.status ?? 1);
