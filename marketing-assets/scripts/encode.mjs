/**
 * Turns render-all.mjs's masters and stills into the files the page ships
 * (storyboard §4: B3, B3b, B3c, C1, C2, C3), checks every one of them, and
 * fails (exit 1) on anything over budget or off-spec. publish.mjs then
 * hashes the web files into web/public/redesign/.
 *
 *   node scripts/encode.mjs                              everything, then the checks
 *   node scripts/encode.mjs --only=stills,hero,og,reel   just those encodes (the checks always run)
 *   node scripts/encode.mjs --only=verify                only the checks, on what is already in out/
 *
 * Reads (render-all.mjs and the reel render write these):
 *   out/master/hero-wide.mov, out/master/og.mov           ProRes 4444 masters, bt709
 *   out/stills/*.png                                      the posters, clusters, lens, og:image frame
 *   out/reel/virgo-reel-master.mp4, out/reel/stills/frame-040.png
 *
 * Writes (out/ is gitignored):
 *   out/web/hero/hero-wide.{webm,mp4,avif,webp,jpg}       C1 loop + poster (frame 0)
 *   out/web/og/virgo-og.{mp4,webm}                        C2 og:video
 *   out/web/sky/{poster-d,poster-m,poster-d-canvas,poster-m-canvas,clusters-d,clusters-m,cebu-lens}.{avif,webp}
 *   out/og/opengraph-image.jpg                            C2 frame 0, the og:image (Phase 4 wires it)
 *   out/reel/virgo-reel.{mp4,webm}, virgo-reel-poster.{jpg,avif}   C3 delivery files (never web/public)
 *   out/web/encode-report.json                            every file, its budget and its measurements
 *
 * The loops (C1, C2) are encoded so the seam holds after compression too.
 * A block codec codes frame 0 (the only keyframe) from scratch, while the
 * last frame is the end of a long chain of predictions, so the two disagree
 * by the coding error even though the masters match (frame 288 = frame 0).
 * Played on loop, that is a faint pulse every 12 s. Three things fix it:
 *   1. The keyframe is pinned (x264 zone q=16, single-threaded so the encode
 *      is deterministic) and encoded once to see what the decoder will show.
 *   2. The last 2 s of the source ease (smoothstep) onto that decoded
 *      keyframe: frame t gets α(t)·(decoded frame 0 − source frame 0) added,
 *      a ±1–2 level pattern, so the predictions arrive where the loop restarts.
 *   3. x264 spends more bits on that tail (ramped zones, no single step), so
 *      the residuals are actually coded.
 * The second encode is checked to have the same keyframe as the first.
 *
 * Encodes use Remotion's bundled ffmpeg (`remotion ffmpeg`, n7.1: libx264,
 * libvpx-vp9); images use sharp. Every encode here is deterministic, so a
 * re-run produces the same bytes and publish.mjs the same hashes.
 */
/* global console, process, Buffer -- Node script; the package ESLint config is the Remotion (browser) preset. */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const PKG = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(PKG, 'out');
const WEB = join(OUT, 'web');
const TMP = join(OUT, 'tmp', 'encode');
const CLI = join(PKG, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
const rel = (p) => relative(PKG, p).replaceAll('\\', '/');

const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const ONLY = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',')) : null;
const wanted = (step) => !ONLY || ONLY.has(step);

/** KB here is 1,000 bytes, the stricter reading of every budget. */
const KB = 1000;
const MB = 1000 * KB;

// ─── ffmpeg ──────────────────────────────────────────────────────────────

function ffmpeg(args) {
  const run = spawnSync(process.execPath, [CLI, 'ffmpeg', '-hide_banner', '-nostdin', '-y', '-v', 'error', ...args], { cwd: PKG, encoding: 'utf8', maxBuffer: 1 << 26 });
  if (run.status !== 0) throw new Error(`encode: ffmpeg ${args.join(' ')}\n${run.stderr}`);
}

function ffprobe(file, args) {
  const run = spawnSync(process.execPath, [CLI, 'ffprobe', '-v', 'error', ...args, '-of', 'json', file], { cwd: PKG, encoding: 'utf8', maxBuffer: 1 << 28 });
  if (run.status !== 0) throw new Error(`encode: ffprobe ${file}: ${run.stderr}`);
  return JSON.parse(run.stdout.slice(run.stdout.indexOf('{')));
}

/** Streams every decoded frame of `file` to onFrame(index, buffer), as rgb24 or yuv420p (no conversion). */
function decode(file, { w, h, format, frames }, onFrame) {
  const size = format === 'rgb24' ? w * h * 3 : (w * h * 3) / 2;
  // An accurate bt709 limited-range decode; the default swscale path reads ~2 levels dark.
  const vf = format === 'rgb24' ? ['-vf', 'scale=in_color_matrix=bt709:in_range=tv:flags=accurate_rnd+full_chroma_int'] : [];
  const limit = frames ? ['-frames:v', String(frames)] : [];
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [CLI, 'ffmpeg', '-hide_banner', '-nostdin', '-v', 'error', '-i', file, ...limit, ...vf, '-pix_fmt', format, '-c:v', 'rawvideo', '-f', 'image2pipe', '-'], { cwd: PKG });
    // One frame buffer, filled chunk by chunk; onFrame copies what it keeps.
    const frame = Buffer.alloc(size);
    let fill = 0;
    let n = 0;
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.stdout.on('data', (chunk) => {
      for (let o = 0; o < chunk.length; ) {
        const take = Math.min(size - fill, chunk.length - o);
        chunk.copy(frame, fill, o, o + take);
        fill += take;
        o += take;
        if (fill === size) {
          onFrame(n++, frame);
          fill = 0;
        }
      }
    });
    p.on('close', (code) => (code === 0 ? resolve(n) : reject(new Error(`encode: decoding ${file} failed (${code}): ${err}`))));
  });
}

async function firstFrameYuv(file, w, h) {
  let f0 = null;
  await decode(file, { w, h, format: 'yuv420p', frames: 1 }, (i, f) => {
    if (i === 0) f0 = Buffer.from(f);
  });
  return f0;
}

const BT709 = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];
/** ProRes 4444 (10/12-bit 4:4:4) → 8-bit 4:2:0, bt709 limited range in and out, no matrix change. */
const TO_420 = 'scale=in_color_matrix=bt709:out_color_matrix=bt709:in_range=tv:out_range=tv:flags=lanczos+accurate_rnd+full_chroma_int,format=yuv420p';

// ─── The loops: C1 and C2 ────────────────────────────────────────────────

/**
 * Each loop's codecs. Bitrates come from research-remotion.json's targets,
 * raised where faint stars or the seam needed it; the measurements behind
 * each choice are in docs/redesign/03-assets.md.
 */
const LOOPS = [
  {
    id: 'hero',
    master: join(OUT, 'master', 'hero-wide.mov'),
    w: 1280,
    h: 720,
    fps: 24,
    frames: 288,
    tail: 48,
    outputs: [
      { file: join(WEB, 'hero', 'hero-wide.mp4'), codec: 'x264', kbps: 460, budget: 750 * KB },
      { file: join(WEB, 'hero', 'hero-wide.webm'), codec: 'vp9', kbps: 260, budget: 450 * KB },
    ],
  },
  {
    id: 'og',
    master: join(OUT, 'master', 'og.mov'),
    w: 1200,
    h: 630,
    fps: 24,
    frames: 240,
    tail: 48,
    outputs: [
      // iMessage plays og:video; Apple's limit is 10 MB for everything, the storyboard's is 1 MB.
      { file: join(WEB, 'og', 'virgo-og.mp4'), codec: 'x264', kbps: 400, budget: 1 * MB },
      // The card is static outside frames 36–150, so constant quality lands well under the ≈300 KB aim.
      { file: join(WEB, 'og', 'virgo-og.webm'), codec: 'vp9', crf: 12, budget: 300 * KB },
    ],
  },
];

/**
 * x264 zones: frame 0 pinned at q 16, and a bitrate ramp over the tail in
 * five steps (×1.25 … ×3.6), so no frame jumps in quality. A single ×5 zone
 * moved the pulse to its own first frame instead. For a 288-frame loop with a
 * 48-frame tail: 0,0,q=16/240,251,b=1.25/252,263,b=1.6/264,271,b=2.1/272,279,b=2.8/280,287,b=3.6
 */
function x264Zones(n, tail) {
  // [from, to] in fractions of the tail, counted back from the end of the loop.
  const ramp = [
    [1, 0.75, 1.25],
    [0.75, 0.5, 1.6],
    [0.5, 1 / 3, 2.1],
    [1 / 3, 1 / 6, 2.8],
    [1 / 6, 0, 3.6],
  ];
  return ['0,0,q=16', ...ramp.map(([a, b, m]) => `${n - Math.round(a * tail)},${n - 1 - Math.round(b * tail)},b=${m}`)].join('/');
}

function codecArgs(o, loop, pass, log) {
  const n = loop.frames;
  if (o.codec === 'x264') {
    const params = [
      `keyint=${n}`,
      `min-keyint=${n}`,
      'scenecut=0',
      // aq-mode 3 biases bits toward dark flat areas (the haze bands otherwise); ipratio/qcomp keep I and P alike.
      'aq-mode=3',
      'ipratio=1.1',
      'qcomp=0.8',
      // Single-threaded two-pass is bit-exact run to run; threaded rate control is not.
      'threads=1',
      'lookahead-threads=1',
      `zones=${x264Zones(n, loop.tail)}`,
    ].join(':');
    return ['-c:v', 'libx264', '-preset', 'veryslow', '-profile:v', 'high', '-level:v', '4.0', '-b:v', `${o.kbps}k`, '-maxrate', `${Math.round(o.kbps * 1.5)}k`, '-bufsize', `${o.kbps * 3}k`, '-x264-params', params, '-pass', String(pass), '-passlogfile', log, '-movflags', '+faststart'];
  }
  const rate = o.crf !== undefined ? ['-crf', String(o.crf), '-b:v', '0'] : ['-b:v', `${o.kbps}k`, '-maxrate', `${o.kbps * 2}k`];
  return ['-c:v', 'libvpx-vp9', ...rate, '-g', String(n), '-keyint_min', String(n), '-row-mt', '1', '-tile-columns', '1', '-auto-alt-ref', '1', '-lag-in-frames', '25', '-deadline', 'good', '-cpu-used', pass === 1 ? '4' : '0', '-pass', String(pass), '-passlogfile', log];
}

function encodeFromFrames(o, loop, frameDir, log) {
  // Raw frames carry no colour tags. Naming them bt709/tv on the decoder side
  // keeps ffmpeg 7.1 from converting them, and the tags reach the stream.
  const input = ['-f', 'image2', '-c:v', 'rawvideo', '-pixel_format', 'yuv420p', '-video_size', `${loop.w}x${loop.h}`, '-framerate', String(loop.fps), '-start_number', '0', ...BT709, '-i', join(frameDir, 'f-%03d.yuv')];
  ffmpeg([...input, '-an', ...codecArgs(o, loop, 1, log), ...BT709, '-f', 'null', process.platform === 'win32' ? 'NUL' : '/dev/null']);
  ffmpeg([...input, '-an', ...codecArgs(o, loop, 2, log), ...BT709, o.file]);
}

const frameName = (i) => `f-${String(i).padStart(3, '0')}.yuv`;

async function encodeLoop(loop) {
  if (!existsSync(loop.master)) throw new Error(`encode: ${rel(loop.master)} is missing (run \`npm run render:all\`)`);
  const dir = join(TMP, loop.id);
  const src = join(dir, 'src');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(src, { recursive: true });
  // The master as 8-bit 4:2:0 frames: both encodes read exactly these bytes.
  ffmpeg(['-i', loop.master, '-an', '-vf', TO_420, '-pix_fmt', 'yuv420p', '-c:v', 'rawvideo', '-f', 'image2', '-start_number', '0', join(src, 'f-%03d.yuv')]);
  const s0 = readFileSync(join(src, frameName(0)));
  const notes = [];
  for (const o of loop.outputs) {
    mkdirSync(dirname(o.file), { recursive: true });
    const t0 = Date.now();
    const log = join(dir, `${o.codec}-pass`);
    // 1. Encode once and read back the keyframe the decoder will show.
    encodeFromFrames(o, loop, src, log);
    let target = await firstFrameYuv(o.file, loop.w, loop.h);
    let stable = false;
    let runs = 1;
    for (; runs <= 3 && !stable; runs++) {
      // 2. Ease the last `tail` frames onto it.
      const eased = join(dir, `eased-${o.codec}`);
      rmSync(eased, { recursive: true, force: true });
      mkdirSync(eased, { recursive: true });
      const start = loop.frames - loop.tail;
      for (let i = 0; i < loop.frames; i++) {
        const s = readFileSync(join(src, frameName(i)));
        if (i < start) {
          writeFileSync(join(eased, frameName(i)), s);
          continue;
        }
        const u = (i - start + 1) / loop.tail;
        const a = u * u * (3 - 2 * u);
        const f = Buffer.alloc(s.length);
        for (let j = 0; j < s.length; j++) {
          const v = Math.round(s[j] + a * (target[j] - s0[j]));
          f[j] = v < 0 ? 0 : v > 255 ? 255 : v;
        }
        writeFileSync(join(eased, frameName(i)), f);
      }
      // 3. Encode again; the keyframe must not have moved.
      encodeFromFrames(o, loop, eased, log);
      const again = await firstFrameYuv(o.file, loop.w, loop.h);
      stable = again.equals(target);
      target = again;
    }
    notes.push({ file: rel(o.file), keyframeStable: stable, encodes: runs, seconds: Math.round((Date.now() - t0) / 1000) });
    console.log(`  ${rel(o.file)}: ${(statSync(o.file).size / KB).toFixed(1)} KB in ${Math.round((Date.now() - t0) / 1000)} s (${runs} encodes, keyframe ${stable ? 'stable' : 'MOVED'})`);
  }
  rmSync(dir, { recursive: true, force: true });
  return notes;
}

// ─── The reel: C3 ────────────────────────────────────────────────────────

const REEL = {
  master: join(OUT, 'reel', 'virgo-reel-master.mp4'),
  w: 1080,
  h: 1920,
  fps: 30,
  frames: 840,
  outputs: [
    { file: join(OUT, 'reel', 'virgo-reel.mp4'), codec: 'x264', kbps: 1900, budget: 8 * MB },
    { file: join(OUT, 'reel', 'virgo-reel.webm'), codec: 'vp9', kbps: 1300, budget: 8 * MB },
  ],
  cover: join(OUT, 'reel', 'stills', 'frame-040.png'),
};

function encodeReel() {
  if (!existsSync(REEL.master)) throw new Error(`encode: ${rel(REEL.master)} is missing (render the reel first; see src/reel/Reel.tsx)`);
  const dir = join(TMP, 'reel');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const o of REEL.outputs) {
    const t0 = Date.now();
    const log = join(dir, `${o.codec}-pass`);
    // A 2 s GOP: the reel is watched start to end and scrubbed, never looped seamlessly.
    const args = (pass) =>
      o.codec === 'x264'
        ? ['-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-level:v', '4.1', '-b:v', `${o.kbps}k`, '-maxrate', `${o.kbps * 2}k`, '-bufsize', `${o.kbps * 4}k`, '-x264-params', 'keyint=60:min-keyint=30:aq-mode=3', '-pass', String(pass), '-passlogfile', log, '-movflags', '+faststart']
        : ['-c:v', 'libvpx-vp9', '-b:v', `${o.kbps}k`, '-maxrate', `${o.kbps * 2}k`, '-g', '60', '-row-mt', '1', '-tile-columns', '2', '-auto-alt-ref', '1', '-lag-in-frames', '25', '-deadline', 'good', '-cpu-used', pass === 1 ? '4' : '2', '-pass', String(pass), '-passlogfile', log];
    // The master is already 8-bit 4:2:0 bt709; nothing is converted.
    ffmpeg(['-i', REEL.master, '-an', ...args(1), ...BT709, '-f', 'null', process.platform === 'win32' ? 'NUL' : '/dev/null']);
    ffmpeg(['-i', REEL.master, '-an', ...args(2), ...BT709, o.file]);
    console.log(`  ${rel(o.file)}: ${(statSync(o.file).size / MB).toFixed(2)} MB in ${Math.round((Date.now() - t0) / 1000)} s`);
  }
  rmSync(dir, { recursive: true, force: true });
}

// ─── Stills and posters (sharp) ──────────────────────────────────────────

/**
 * Settings chosen by measuring faint-star survival (a star = a local maximum
 * ≥ 5 levels over its 13×13 surroundings; "kept" = still ≥ half as bright
 * after the encode): AVIF q80 keeps 98–100 % of them at a third to two
 * thirds of the budget; WebP needs q88 to keep ~90 %.
 */
const AVIF = { quality: 80, effort: 9, chromaSubsampling: '4:2:0' };
const WEBP = { quality: 88, effort: 6, smartSubsample: true };

const STILLS = [
  // B3: the sky poster with the coastline baked in faintly (static and reduced-motion hero) …
  { from: 'out/stills/sky-poster-d.png', to: 'out/web/sky/poster-d', avif: 45 * KB, webp: 45 * KB },
  { from: 'out/stills/sky-poster-m.png', to: 'out/web/sky/poster-m', avif: 25 * KB, webp: 25 * KB },
  // … and exactly the canvas's frame 0 (behind the motion path, so the crossfade to the canvas is invisible).
  { from: 'out/stills/sky-poster-d-canvas.png', to: 'out/web/sky/poster-d-canvas', avif: 45 * KB, webp: 45 * KB },
  { from: 'out/stills/sky-poster-m-canvas.png', to: 'out/web/sky/poster-m-canvas', avif: 25 * KB, webp: 25 * KB },
  // B3b, B3c: no storyboard budget; held to the poster budgets of the same orientation.
  { from: 'out/stills/clusters-d.png', to: 'out/web/sky/clusters-d', avif: 45 * KB, webp: 45 * KB },
  { from: 'out/stills/clusters-m.png', to: 'out/web/sky/clusters-m', avif: 25 * KB, webp: 25 * KB },
  { from: 'out/stills/cebu-lens.png', to: 'out/web/sky/cebu-lens', avif: 45 * KB, webp: 45 * KB, alpha: true },
  // C1's poster: frame 0 of the loop (research-remotion.json: AVIF ≤ 30 KB, WebP ≤ 45 KB, JPEG ≤ 80 KB).
  { from: 'out/stills/hero-wide-frame0.png', to: 'out/web/hero/hero-wide', avif: 30 * KB, webp: 45 * KB, jpg: 80 * KB, jpgOptions: { quality: 90, mozjpeg: true, chromaSubsampling: '4:4:4' } },
];

/** C2's og:image: frame 0 of the OG video, text-sharp (4:4:4). WhatsApp drops previews over ~300 KB. */
const OG_CARD = { from: 'out/stills/og-frame0.png', to: 'out/og/opengraph-image.jpg', budget: 200 * KB, options: { quality: 92, mozjpeg: true, chromaSubsampling: '4:4:4' } };
/** C3's poster: frame 40 (the hook caption, inside the centre 1080×1350 the IG grid keeps). */
const REEL_POSTER = { to: 'out/reel/virgo-reel-poster', jpg: 400 * KB, avif: 120 * KB };

async function encodeStills() {
  for (const s of STILLS) {
    const from = join(PKG, s.from);
    if (!existsSync(from)) throw new Error(`encode: ${s.from} is missing (run \`npm run render:all\`)`);
    mkdirSync(dirname(join(PKG, s.to)), { recursive: true });
    await sharp(from).avif(AVIF).toFile(join(PKG, `${s.to}.avif`));
    await sharp(from).webp(WEBP).toFile(join(PKG, `${s.to}.webp`));
    if (s.jpg) await sharp(from).flatten({ background: '#161311' }).jpeg(s.jpgOptions).toFile(join(PKG, `${s.to}.jpg`));
    console.log(`  ${s.to}.{avif,webp${s.jpg ? ',jpg' : ''}}`);
  }
  mkdirSync(dirname(join(PKG, OG_CARD.to)), { recursive: true });
  await sharp(join(PKG, OG_CARD.from)).flatten({ background: '#161311' }).jpeg(OG_CARD.options).toFile(join(PKG, OG_CARD.to));
  console.log(`  ${OG_CARD.to}`);
}

async function encodeReelPoster() {
  if (!existsSync(REEL.cover)) throw new Error(`encode: ${rel(REEL.cover)} is missing`);
  await sharp(REEL.cover).flatten({ background: '#161311' }).jpeg({ quality: 85, mozjpeg: true }).toFile(join(PKG, `${REEL_POSTER.to}.jpg`));
  await sharp(REEL.cover).avif({ quality: 60, effort: 9 }).toFile(join(PKG, `${REEL_POSTER.to}.avif`));
  console.log(`  ${REEL_POSTER.to}.{jpg,avif}`);
}

// ─── Checks ──────────────────────────────────────────────────────────────

const failures = [];
const warnings = [];
const fail = (msg) => failures.push(msg);
const warn = (msg) => warnings.push(msg);

function mad(a, b) {
  let s = 0;
  let m = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] > b[i] ? a[i] - b[i] : b[i] - a[i];
    s += d;
    if (d > m) m = d;
  }
  return { mean: s / a.length, max: m };
}

function luma(rgb, w, h) {
  const y = new Float32Array(w * h);
  for (let i = 0, j = 0; i < y.length; i++, j += 3) y[i] = 0.2126 * rgb[j] + 0.7152 * rgb[j + 1] + 0.0722 * rgb[j + 2];
  return y;
}

/** Mean of the (2r+1)² box around (x, y), clipped at the edges. */
function boxMean(y, w, h, x, yy, r) {
  let s = 0;
  let n = 0;
  for (let j = Math.max(0, yy - r); j <= Math.min(h - 1, yy + r); j++)
    for (let i = Math.max(0, x - r); i <= Math.min(w - 1, x + r); i++) {
      s += y[j * w + i];
      n++;
    }
  return s / n;
}

/** Faint stars: local maxima at least 5 levels over their 13×13 surroundings. */
function findStars(rgb, w, h) {
  const y = luma(rgb, w, h);
  const out = [];
  for (let yy = 2; yy < h - 2; yy++)
    for (let x = 2; x < w - 2; x++) {
      const v = y[yy * w + x];
      let peak = true;
      for (let dy = -1; dy <= 1 && peak; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if ((dx || dy) && y[(yy + dy) * w + x + dx] > v) {
            peak = false;
            break;
          }
      if (!peak) continue;
      const c = v - boxMean(y, w, h, x, yy, 6);
      if (c >= 5) out.push([x, yy, c]);
    }
  return out;
}

/** Share of stars still at least half their contrast (brightest of the 3×3 around each), and the median ratio. */
function starsKept(stars, rgb, w, h) {
  if (!stars.length) return { stars: 0, kept: 1, median: 1 };
  const y = luma(rgb, w, h);
  const r = stars
    .map(([x, yy, c]) => {
      let peak = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) peak = Math.max(peak, y[(yy + dy) * w + x + dx]);
      return (peak - boxMean(y, w, h, x, yy, 6)) / c;
    })
    .sort((a, b) => a - b);
  return { stars: r.length, kept: r.filter((v) => v >= 0.5).length / r.length, median: r[r.length >> 1] };
}

/** Top-level MP4 boxes in file order, to see that moov comes before mdat (+faststart). */
function mp4Boxes(file) {
  const buf = readFileSync(file);
  const boxes = [];
  for (let o = 0; o + 8 <= buf.length; ) {
    let size = buf.readUInt32BE(o);
    const type = buf.toString('latin1', o + 4, o + 8);
    if (size === 1) size = Number(buf.readBigUInt64BE(o + 8));
    if (size === 0) size = buf.length - o;
    boxes.push(type);
    if (size < 8) break;
    o += size;
  }
  return boxes;
}

function probeVideo(file) {
  const info = ffprobe(file, ['-count_frames', '-show_entries', 'stream=codec_type,codec_name,profile,level,width,height,pix_fmt,r_frame_rate,nb_read_frames,color_space,color_primaries,color_transfer,color_range:format=duration,format_name']);
  const keys = ffprobe(file, ['-select_streams', 'v:0', '-show_entries', 'packet=flags']);
  const video = (info.streams ?? []).filter((s) => s.codec_type === 'video');
  const audio = (info.streams ?? []).filter((s) => s.codec_type === 'audio');
  return { v: video[0], videoStreams: video.length, audioStreams: audio.length, keyframes: (keys.packets ?? []).filter((p) => p.flags?.startsWith('K')).length, duration: Number(info.format?.duration) };
}

function checkVideo(label, file, spec) {
  const problems = [];
  const p = probeVideo(file);
  const { v } = p;
  const want = spec.codec === 'x264' ? 'h264' : 'vp9';
  if (p.videoStreams !== 1) problems.push(`${p.videoStreams} video streams`);
  if (p.audioStreams) problems.push('an audio stream');
  if (v) {
    if (v.codec_name !== want) problems.push(`codec ${v.codec_name}`);
    // ffprobe names the H.264 profile by number here: 100 is High.
    if (want === 'h264' && !['High', '100', 100].includes(v.profile)) problems.push(`profile ${v.profile}`);
    if (v.pix_fmt !== 'yuv420p') problems.push(`pixel format ${v.pix_fmt}`);
    if (v.width !== spec.w || v.height !== spec.h) problems.push(`${v.width}×${v.height}`);
    if (v.r_frame_rate !== `${spec.fps}/1`) problems.push(`${v.r_frame_rate} fps`);
    if (Number(v.nb_read_frames) !== spec.frames) problems.push(`${v.nb_read_frames} frames`);
    for (const k of ['color_space', 'color_primaries', 'color_transfer']) if (v[k] !== 'bt709') problems.push(`${k} ${v[k] ?? 'untagged'}`);
    if (v.color_range !== 'tv') problems.push(`range ${v.color_range ?? 'untagged'}`);
  }
  if (spec.loop && p.keyframes !== 1) problems.push(`${p.keyframes} keyframes (one GOP per loop wants 1)`);
  if (want === 'h264') {
    const boxes = mp4Boxes(file);
    if (boxes.indexOf('moov') > boxes.indexOf('mdat')) problems.push(`moov after mdat (${boxes.join(' ')})`);
  }
  const bytes = statSync(file).size;
  if (bytes > spec.budget) problems.push(`${(bytes / KB).toFixed(1)} KB, over the ${(spec.budget / KB).toFixed(0)} KB budget`);
  if (problems.length) fail(`${label}: ${problems.join(', ')}`);
  return {
    codec: v?.codec_name,
    profile: v?.profile,
    level: v?.level,
    width: v?.width,
    height: v?.height,
    frames: Number(v?.nb_read_frames),
    fps: v?.r_frame_rate,
    duration: p.duration,
    keyframes: p.keyframes,
    bytes,
    budget: spec.budget,
  };
}

/**
 * The loop after compression. `wrap` is the mean change from the last frame
 * to frame 0; `steps` are the changes between neighbouring frames inside the
 * loop. The seam must not be the biggest jump in the loop (fail). The
 * research's stricter aim, wrap ≤ 1.25 × the median step, is reported (warn):
 * the median step shrinks as quality rises, so no block codec meets it at
 * these sizes (measured: 4.2× even at 2 Mbps).
 * Also: the error against the master and faint-star survival on 5 frames.
 */
async function checkLoop(label, file, loop) {
  const samples = [0, Math.round(loop.frames * 0.25), Math.round(loop.frames * 0.5), Math.round(loop.frames * 0.75), loop.frames - 1];
  const dims = { w: loop.w, h: loop.h, format: 'rgb24' };
  const enc = new Map();
  const steps = [];
  let prev = null;
  let first = null;
  await decode(file, dims, (i, f) => {
    const copy = Buffer.from(f);
    if (prev) steps.push(mad(prev, copy).mean);
    if (i === 0) first = copy;
    if (samples.includes(i)) enc.set(i, copy);
    prev = copy;
  });
  const master = new Map();
  await decode(loop.master, dims, (i, f) => {
    if (samples.includes(i)) master.set(i, Buffer.from(f));
  });
  const wrap = mad(prev, first);
  const sorted = [...steps].sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1];
  const largest = sorted.at(-1);
  const at = steps.indexOf(largest);
  const per = samples.map((i) => {
    const d = mad(master.get(i), enc.get(i));
    const s = starsKept(findStars(master.get(i), loop.w, loop.h), enc.get(i), loop.w, loop.h);
    return { frame: i, meanError: +d.mean.toFixed(3), maxError: d.max, stars: s.stars, kept: +s.kept.toFixed(3), medianContrast: +s.median.toFixed(2) };
  });
  if (wrap.mean > largest) fail(`${label}: the seam (${wrap.mean.toFixed(3)}) is the biggest jump in the loop (largest step inside: ${largest.toFixed(3)} at ${at}→${at + 1})`);
  const ratio = median > 0 ? wrap.mean / median : Infinity;
  if (ratio > 1.25) warn(`${label}: seam ${wrap.mean.toFixed(3)} is ${Number.isFinite(ratio) ? ratio.toFixed(2) : '∞'}× the median step ${median.toFixed(4)} (aim ≤ 1.25×); largest step inside ${largest.toFixed(3)} at ${at}→${at + 1}`);
  const worstKept = Math.min(...per.map((p) => p.kept));
  if (worstKept < 0.9) fail(`${label}: only ${(worstKept * 100).toFixed(0)} % of faint stars survive in some frame (want ≥ 90 %)`);
  return { seam: { wrap: +wrap.mean.toFixed(4), wrapMax: wrap.max, medianStep: +median.toFixed(4), p95Step: +sorted[Math.floor(sorted.length * 0.95)].toFixed(4), largestStep: +largest.toFixed(4), largestAt: `${at}→${at + 1}`, ratioToMedian: Number.isFinite(ratio) ? +ratio.toFixed(2) : null }, samples: per };
}

/** The reel against its master: mean error on 5 frames (a re-encode of an H.264 CRF 16 master). */
async function checkReelQuality(file) {
  const samples = [40, 210, 400, 580, 800];
  const dims = { w: REEL.w, h: REEL.h, format: 'rgb24' };
  const enc = new Map();
  const master = new Map();
  await decode(file, dims, (i, f) => samples.includes(i) && enc.set(i, Buffer.from(f)));
  await decode(REEL.master, dims, (i, f) => samples.includes(i) && master.set(i, Buffer.from(f)));
  return samples.map((i) => {
    const d = mad(master.get(i), enc.get(i));
    return { frame: i, meanError: +d.mean.toFixed(3), maxError: d.max };
  });
}

async function checkImage(file, budget, w, h) {
  const problems = [];
  if (!existsSync(file)) {
    fail(`${rel(file)} is missing`);
    return null;
  }
  const m = await sharp(file).metadata();
  const bytes = statSync(file).size;
  if (w && (m.width !== w || m.height !== h)) problems.push(`${m.width}×${m.height}, not ${w}×${h}`);
  if (bytes > budget) problems.push(`${(bytes / KB).toFixed(1)} KB, over the ${(budget / KB).toFixed(0)} KB budget`);
  if (problems.length) fail(`${rel(file)}: ${problems.join(', ')}`);
  return { format: m.format, width: m.width, height: m.height, alpha: m.hasAlpha, bytes, budget };
}

/** Faint-star survival in a still (the posters are star fields). */
async function stillStars(from, encoded) {
  const a = await sharp(from).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(encoded).removeAlpha().raw().toBuffer();
  const s = starsKept(findStars(a.data, a.info.width, a.info.height), b, a.info.width, a.info.height);
  return { stars: s.stars, kept: +s.kept.toFixed(3) };
}

async function verify(encodeNotes) {
  const report = { generatedBy: 'marketing-assets/scripts/encode.mjs', kb: KB, loops: {}, reel: {}, stills: {} };
  console.log('\n── checks');
  for (const loop of LOOPS) {
    for (const o of loop.outputs) {
      if (!existsSync(o.file)) {
        fail(`${rel(o.file)} is missing`);
        continue;
      }
      const label = rel(o.file);
      const meta = checkVideo(label, o.file, { codec: o.codec, w: loop.w, h: loop.h, fps: loop.fps, frames: loop.frames, budget: o.budget, loop: true });
      const q = await checkLoop(label, o.file, loop);
      const notes = encodeNotes?.find((n) => n.file === label);
      report.loops[label] = { ...meta, settings: o.codec === 'x264' ? { kbps: o.kbps, zones: x264Zones(loop.frames, loop.tail) } : o.crf !== undefined ? { crf: o.crf } : { kbps: o.kbps }, ...q, ...(notes ? { keyframeStable: notes.keyframeStable, encodes: notes.encodes } : {}) };
      if (notes && !notes.keyframeStable) fail(`${label}: the keyframe moved between encodes, so the eased tail aims at the wrong picture`);
      console.log(`  ${label}: ${(meta.bytes / KB).toFixed(1)} / ${(o.budget / KB).toFixed(0)} KB, ${meta.codec} ${meta.profile ?? ''}, ${meta.frames} frames, ${meta.keyframes} keyframe; seam ${q.seam.wrap} (median step ${q.seam.medianStep}, largest ${q.seam.largestStep} at ${q.seam.largestAt}); stars kept ${q.samples.map((s) => `${Math.round(s.kept * 100)}%`).join(' ')}`);
    }
  }
  for (const o of REEL.outputs) {
    if (!existsSync(o.file)) {
      warn(`${rel(o.file)} is missing (run with --only=reel)`);
      continue;
    }
    const label = rel(o.file);
    const meta = checkVideo(label, o.file, { codec: o.codec, w: REEL.w, h: REEL.h, fps: REEL.fps, frames: REEL.frames, budget: o.budget });
    report.reel[label] = { ...meta, settings: { kbps: o.kbps }, samples: await checkReelQuality(o.file) };
    console.log(`  ${label}: ${(meta.bytes / MB).toFixed(2)} / ${(o.budget / MB).toFixed(0)} MB, ${meta.codec} ${meta.profile ?? ''}, ${meta.frames} frames, mean error ${report.reel[label].samples.map((s) => s.meanError).join(' ')}`);
  }
  for (const [ext, budget] of [
    ['jpg', REEL_POSTER.jpg],
    ['avif', REEL_POSTER.avif],
  ]) {
    const file = join(PKG, `${REEL_POSTER.to}.${ext}`);
    if (!existsSync(file)) {
      warn(`${rel(file)} is missing (run with --only=reel)`);
      continue;
    }
    report.reel[rel(file)] = await checkImage(file, budget, REEL.w, REEL.h);
  }
  for (const s of STILLS) {
    const src = await sharp(join(PKG, s.from)).metadata();
    for (const ext of ['avif', 'webp', 'jpg']) {
      if (!s[ext]) continue;
      const file = join(PKG, `${s.to}.${ext}`);
      const meta = await checkImage(file, s[ext], src.width, src.height);
      if (!meta) continue;
      if (s.alpha && ext !== 'jpg' && !meta.alpha) fail(`${rel(file)}: lost its alpha channel`);
      const stars = await stillStars(join(PKG, s.from), file);
      // JPEG is the last fallback (no AVIF or WebP); the others carry the stars.
      if (ext !== 'jpg' && stars.kept < 0.85) fail(`${rel(file)}: only ${(stars.kept * 100).toFixed(0)} % of faint stars survive (want ≥ 85 %)`);
      report.stills[rel(file)] = { ...meta, ...stars };
      console.log(`  ${rel(file)}: ${(meta.bytes / KB).toFixed(1)} / ${(s[ext] / KB).toFixed(0)} KB, ${meta.width}×${meta.height}${meta.alpha ? ' alpha' : ''}, stars kept ${Math.round(stars.kept * 100)}%`);
    }
  }
  const card = join(PKG, OG_CARD.to);
  const cardMeta = await checkImage(card, OG_CARD.budget, 1200, 630);
  if (cardMeta) {
    report.stills[rel(card)] = cardMeta;
    console.log(`  ${rel(card)}: ${(cardMeta.bytes / KB).toFixed(1)} / ${(OG_CARD.budget / KB).toFixed(0)} KB, ${cardMeta.width}×${cardMeta.height}`);
  }
  report.warnings = warnings;
  report.failures = failures;
  mkdirSync(WEB, { recursive: true });
  writeFileSync(join(WEB, 'encode-report.json'), `${JSON.stringify(report, null, 2)}\n`);
}

// ─── Run ─────────────────────────────────────────────────────────────────

const t0 = Date.now();
let notes = null;
const reportFile = join(WEB, 'encode-report.json');
if (wanted('stills')) {
  console.log('── stills (sharp)');
  await encodeStills();
}
if (wanted('hero') || wanted('og')) {
  notes = [];
  for (const loop of LOOPS) {
    if (!wanted(loop.id)) continue;
    console.log(`── ${loop.id} loop (seam-matched)`);
    notes.push(...(await encodeLoop(loop)));
  }
  // Keep the other loop's notes from the last full run.
  if (existsSync(reportFile)) {
    const old = JSON.parse(readFileSync(reportFile, 'utf8'));
    for (const [file, r] of Object.entries(old.loops ?? {})) if (!notes.some((n) => n.file === file) && r.keyframeStable !== undefined) notes.push({ file, keyframeStable: r.keyframeStable, encodes: r.encodes });
  }
} else if (existsSync(reportFile)) {
  const old = JSON.parse(readFileSync(reportFile, 'utf8'));
  notes = Object.entries(old.loops ?? {}).filter(([, r]) => r.keyframeStable !== undefined).map(([file, r]) => ({ file, keyframeStable: r.keyframeStable, encodes: r.encodes }));
}
if (wanted('reel')) {
  console.log('── reel');
  encodeReel();
  await encodeReelPoster();
}
await verify(notes);
rmSync(join(OUT, 'tmp'), { recursive: true, force: true });

for (const w of warnings) console.log(`  warn ${w}`);
console.log(`\nencode: ${((Date.now() - t0) / 1000).toFixed(0)} s, report in ${rel(reportFile)}`);
if (failures.length) {
  console.error(`\nencode: ${failures.length} problem(s):\n${failures.map((f) => `  ✗ ${f}`).join('\n')}`);
  process.exit(1);
}
console.log('encode: all good');
