/**
 * Checks what render-all.mjs wrote, and fails (exit 1) on anything off:
 *
 * 1. Seams. C1: frame 288 of HeroLoopSeam must be frame 0 (mean absolute
 *    difference ≈ 0), and the wrap 287 → 0 must look like an ordinary step
 *    (its difference within 0.67–1.5× that of 286 → 287). C2: frame 240 must
 *    be frame 0, frames 238–240 and 36 and 150 must be the resting card, and
 *    the card must move inside the window (frame 96 differs from frame 0).
 * 2. The engine mirror. still-sky.ts copies engine.ts's private look
 *    constants (budgets, reserve, cloud and field sizes, glow); a drift
 *    would make the stills disagree with the page.
 * 3. The files. Every still at its size, the posters equal to their videos'
 *    frame 0; each master ProRes 4444 (4:4:4, bt709) at its size,
 *    frame count and rate, with no audio stream (ffprobe, Remotion's own).
 *
 * Decoding a master to compare by eye: Remotion's bundled ffmpeg converts
 * YUV to RGB on a fast path that reads about 2 levels dark. The encoded
 * values are right (checked against the bt709 limited-range maths); decode
 * with scale=in_color_matrix=bt709:in_range=tv:flags=accurate_rnd+full_chroma_int
 * to get the PNG frames back within a level.
 *
 *   node scripts/render-check.mjs        (render-all.mjs runs it last)
 */
/* global console, process -- Node script; the package ESLint config is the Remotion (browser) preset. */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const PKG = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(PKG, 'out');
const CLI = join(PKG, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
const ENGINE = join(PKG, '..', 'web', 'src', 'components', 'story', 'sky', 'engine.ts');
const MIRROR = join(PKG, 'src', 'sky', 'still-sky.ts');

const failures = [];
const fail = (msg) => failures.push(msg);
const ok = (msg) => console.log(`  ok  ${msg}`);

// ─── 1. Seams ────────────────────────────────────────────────────────────

async function frame(dir, n) {
  const file = join(OUT, 'check', dir, `frame-${String(n).padStart(3, '0')}.png`);
  if (!existsSync(file)) throw new Error(`render-check: missing ${file} (run render-all.mjs)`);
  return sharp(file).removeAlpha().raw().toBuffer();
}

/** Mean absolute difference per channel, in 8-bit levels, and the largest single difference. */
function diff(a, b) {
  if (a.length !== b.length) return { mean: Infinity, max: 255 };
  let sum = 0;
  let max = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    sum += d;
    if (d > max) max = d;
  }
  return { mean: sum / a.length, max };
}
const fmt = (d) => `mean ${d.mean.toFixed(4)}, max ${d.max}`;

async function heroSeam() {
  console.log('C1 HeroLoop-Wide seam (θ = 2πf/288)');
  const [f0, f286, f287, f288] = await Promise.all([0, 286, 287, 288].map((n) => frame('hero', n)));
  const seam = diff(f0, f288);
  const step = diff(f286, f287);
  const wrap = diff(f287, f0);
  if (seam.mean > 0.01 || seam.max > 2) fail(`hero: frame 288 differs from frame 0 (${fmt(seam)})`);
  else ok(`frame 288 = frame 0 (${fmt(seam)})`);
  const ratio = wrap.mean / step.mean;
  if (!(ratio >= 0.67 && ratio <= 1.5)) fail(`hero: the wrap 287 → 0 (${fmt(wrap)}) is unlike the step 286 → 287 (${fmt(step)}), ratio ${ratio.toFixed(2)}`);
  else ok(`wrap 287 → 0 (${fmt(wrap)}) matches step 286 → 287 (${fmt(step)}), ratio ${ratio.toFixed(3)}`);
  const quarter = diff(f0, await frame('hero', 144));
  if (quarter.mean < 0.2) fail(`hero: frame 144 barely differs from frame 0 (${fmt(quarter)}): is anything moving?`);
  else ok(`it moves: frame 0 vs 144 (${fmt(quarter)})`);
}

async function ogSeam() {
  console.log('C2 OgVideo (rest at 0, motion inside 36–150, 240 = 0)');
  const f = Object.fromEntries(await Promise.all([0, 36, 96, 150, 238, 239, 240].map(async (n) => [n, await frame('og', n)])));
  for (const n of [240, 239, 238, 36, 150]) {
    const d = diff(f[0], f[n]);
    if (d.max > 0) fail(`og: frame ${n} is not the resting card (${fmt(d)})`);
    else ok(`frame ${n} = frame 0`);
  }
  const moving = diff(f[0], f[96]);
  if (moving.mean < 0.01) fail(`og: frame 96 equals frame 0: the pulse is missing`);
  else ok(`the pulse runs: frame 96 vs 0 (${fmt(moving)})`);
}

// ─── 2. The engine mirror ────────────────────────────────────────────────

function engineMirror() {
  console.log('Engine look constants (engine.ts ↔ still-sky.ts ENGINE)');
  const engine = readFileSync(ENGINE, 'utf8');
  const mirror = readFileSync(MIRROR, 'utf8');
  const nums = (s) => (s.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const fromEngine = (name) => {
    const m = engine.match(new RegExp(`const ${name}\\b[^=]*=\\s*([^;]+);`));
    return m ? nums(m[1]) : null;
  };
  const fromMirror = (name) => {
    const m = mirror.match(new RegExp(`\\b${name}: ([^\\n]+?),?\\n`));
    return m ? nums(m[1]) : null;
  };
  for (const name of ['BUDGET', 'RESERVE', 'CLOUD_BASE', 'CLOUD_GLOW', 'FIELD_BASE']) {
    const a = fromEngine(name);
    const b = fromMirror(name);
    if (!a || !b) fail(`mirror: ${name} not found in ${a ? 'still-sky.ts' : 'engine.ts'}`);
    else if (a.join() !== b.join()) fail(`mirror: ${name} is ${a.join(', ')} in engine.ts but ${b.join(', ')} in still-sky.ts`);
    else ok(`${name} ${a.join(', ')}`);
  }
}

// ─── 3. The files ────────────────────────────────────────────────────────

async function stills() {
  console.log('Stills');
  const expect = {
    'sky-poster-d.png': [1920, 1080],
    'sky-poster-m.png': [720, 1560],
    'sky-poster-d-canvas.png': [1920, 1080],
    'sky-poster-m-canvas.png': [720, 1560],
    'clusters-d.png': [1920, 1200],
    'clusters-m.png': [720, 1560],
    'cebu-lens.png': [960, 960],
    'hero-wide-frame0.png': [1280, 720],
    'og-frame0.png': [1200, 630],
  };
  for (const [name, [w, h]] of Object.entries(expect)) {
    const file = join(OUT, 'stills', name);
    if (!existsSync(file)) {
      fail(`stills: ${name} is missing`);
      continue;
    }
    const m = await sharp(file).metadata();
    if (m.width !== w || m.height !== h) fail(`stills: ${name} is ${m.width}×${m.height}, not ${w}×${h}`);
    else ok(`${name} ${w}×${h}`);
  }
  // The posters and the og:image are frame 0 of their videos, pixel for pixel.
  for (const [still, dir] of [
    ['hero-wide-frame0.png', 'hero'],
    ['og-frame0.png', 'og'],
  ]) {
    const file = join(OUT, 'stills', still);
    if (!existsSync(file)) continue;
    const d = diff(await sharp(file).removeAlpha().raw().toBuffer(), await frame(dir, 0));
    if (d.max > 0) fail(`stills: ${still} differs from the video's frame 0 (${fmt(d)})`);
    else ok(`${still} = frame 0 of the video`);
  }
}

function masters() {
  console.log('Masters');
  for (const [name, w, h, frames] of [
    ['hero-wide.mov', 1280, 720, 288],
    ['og.mov', 1200, 630, 240],
  ]) {
    const file = join(OUT, 'master', name);
    if (!existsSync(file)) {
      fail(`masters: ${name} is missing`);
      continue;
    }
    const run = spawnSync(process.execPath, [CLI, 'ffprobe', '-v', 'error', '-count_frames', '-show_entries', 'stream=codec_type,codec_name,profile,width,height,nb_read_frames,r_frame_rate,pix_fmt,color_primaries', '-of', 'json', file], {
      cwd: PKG,
      encoding: 'utf8',
    });
    if (run.status !== 0) {
      fail(`masters: ffprobe failed on ${name}: ${run.stderr}`);
      continue;
    }
    const streams = JSON.parse(run.stdout.slice(run.stdout.indexOf('{'))).streams ?? [];
    const video = streams.filter((s) => s.codec_type === 'video');
    const audio = streams.filter((s) => s.codec_type === 'audio');
    const v = video[0];
    const problems = [];
    if (video.length !== 1) problems.push(`${video.length} video streams`);
    if (audio.length) problems.push('an audio stream');
    if (v) {
      if (v.codec_name !== 'prores') problems.push(`codec ${v.codec_name}`);
      // ProRes 4444 is fed 10-bit 4:4:4; the decoder reports its native 12-bit.
      if (!/^yuv444p1[02]le$/.test(v.pix_fmt)) problems.push(`pixel format ${v.pix_fmt}`);
      if (v.color_primaries !== 'bt709') problems.push(`primaries ${v.color_primaries ?? 'untagged'}`);
      if (v.width !== w || v.height !== h) problems.push(`${v.width}×${v.height}`);
      if (Number(v.nb_read_frames) !== frames) problems.push(`${v.nb_read_frames} frames`);
      if (v.r_frame_rate !== '24/1') problems.push(`${v.r_frame_rate} fps`);
    }
    if (problems.length) fail(`masters: ${name}: ${problems.join(', ')}`);
    else ok(`${name} ProRes (profile ${v.profile}) ${w}×${h}, ${frames} frames at 24 fps, ${v.pix_fmt}, ${v.color_primaries ?? 'untagged'}, no audio`);
  }
}

await heroSeam();
await ogSeam();
engineMirror();
await stills();
masters();

if (failures.length) {
  console.error(`\nrender-check: ${failures.length} problem(s):\n${failures.map((f) => `  ✗ ${f}`).join('\n')}`);
  process.exit(1);
}
console.log('\nrender-check: all good');
