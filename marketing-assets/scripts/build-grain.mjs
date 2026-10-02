/**
 * B4: builds assets/grain.png, the 160×160 grain tile the page lays over the
 * sky, the time-of-day layers and the hero video to dither their gradients
 * (the video itself carries no grain, storyboard §4 C1).
 *
 * The noise is the textbook dither: triangular (TPDF), the sum of two fair
 * coin flips, at three levels around mid-grey: 128 − SPREAD, 128 and
 * 128 + SPREAD, a quarter, a half and a quarter of the pixels. Mid-grey is
 * neutral under overlay and soft-light, so the layer's opacity alone sets how
 * strong the grain reads.
 *
 * It tiles with no seam by construction: every pixel is independent of every
 * other, so the pixels either side of the tile's edge are no more alike than
 * any other neighbours. The level counts are exact (a seeded shuffle of a
 * fixed multiset), so the tile's mean is exactly 128 and it cannot shift a
 * colour it is laid over. The build measures both and fails if either is off.
 *
 * Three levels at 1.5 bits each is what keeps a 25,600-pixel PNG under
 * BUDGET; a smooth spread of grey would be incompressible (25 KB). It is
 * written as an indexed PNG, 2 bits a pixel, whose three palette entries are
 * those exact greys: every pixel decodes to one of them. (An 8-bit grayscale
 * PNG of the same pixels comes to about 6.5 KB, because deflate's string
 * matching finds chance repeats in noise that cost more than they save.)
 *
 * Usage, from marketing-assets/:
 *   node scripts/build-grain.mjs           write the PNG
 *   node scripts/build-grain.mjs --check   fail if the PNG on disk has different pixels
 * The PNG is byte-identical between runs with the same sharp.
 */
/* global Buffer, URL, console, process -- Node script; the package ESLint config is the Remotion (browser) preset. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const CHECK = process.argv.includes('--check');
const ROOT = new URL('../../', import.meta.url);
const OUT = new URL('../assets/grain.png', import.meta.url);
const rel = (url) => fileURLToPath(url).slice(fileURLToPath(ROOT).length).replaceAll('\\', '/');

const SIZE = 160;
/** "GRAN": mulberry32's seed. */
const SEED = 0x4752414e;
/** How far the light and dark grains sit from mid-grey, in 8-bit levels. */
const SPREAD = 48;
const MID = 128;
/** Bytes on disk (storyboard §4 B4: about 6 KB). */
const BUDGET = 6 * 1024;

function fail(message) {
  console.error(`build-grain: ${message}`);
  process.exit(1);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── 1. The pixels ───────────────────────────────────────────────────────

const count = SIZE * SIZE;
const pixels = Buffer.alloc(count);
// A quarter dark, half mid, a quarter light: the two-coin triangle, exactly.
pixels.fill(MID - SPREAD, 0, count / 4);
pixels.fill(MID, count / 4, (count * 3) / 4);
pixels.fill(MID + SPREAD, (count * 3) / 4);
const random = mulberry32(SEED);
for (let i = count - 1; i > 0; i--) {
  const j = Math.floor(random() * (i + 1));
  const t = pixels[i];
  pixels[i] = pixels[j];
  pixels[j] = t;
}

// ─── 2. Prove it tiles ───────────────────────────────────────────────────

const at = (x, y) => pixels[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)];
let sum = 0;
for (const v of pixels) sum += v;
const mean = sum / count;
if (mean !== MID) fail(`mean is ${mean}, not ${MID}`);

/** Mean absolute difference between neighbours: inside the tile, and across each wrapped edge. */
function neighbourDifference(dx, dy, onSeam) {
  let total = 0;
  let pairs = 0;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const seam = dx ? x === SIZE - 1 : y === SIZE - 1;
      if (seam !== onSeam) continue;
      total += Math.abs(at(x, y) - at(x + dx, y + dy));
      pairs++;
    }
  }
  return total / pairs;
}
const inside = (neighbourDifference(1, 0, false) + neighbourDifference(0, 1, false)) / 2;
const seamX = neighbourDifference(1, 0, true);
const seamY = neighbourDifference(0, 1, true);
// 160 seam pairs against ~25,000 inside: allow 4 standard errors of the seam's own sampling noise.
// For two independent grains, |a − b| is 0, SPREAD or 2·SPREAD with odds 3/8, 1/2, 1/8: its mean
// square is SPREAD², so its standard deviation is √(SPREAD² − mean²).
const pairSd = Math.sqrt(SPREAD * SPREAD - inside * inside);
const allowed = (4 * pairSd) / Math.sqrt(SIZE);
for (const [name, seam] of [['left–right', seamX], ['top–bottom', seamY]]) {
  if (Math.abs(seam - inside) > allowed) {
    fail(`the ${name} seam differs from the inside: ${seam.toFixed(2)} against ${inside.toFixed(2)} (allowed ±${allowed.toFixed(2)})`);
  }
}

/** Low frequencies: the means of 16 blocks of 40×40 must sit close to mid-grey, or the tile's repeat would show. */
let worstBlock = 0;
for (let by = 0; by < 4; by++) {
  for (let bx = 0; bx < 4; bx++) {
    let s = 0;
    for (let y = by * 40; y < by * 40 + 40; y++) for (let x = bx * 40; x < bx * 40 + 40; x++) s += at(x, y);
    worstBlock = Math.max(worstBlock, Math.abs(s / 1600 - MID));
  }
}
// One block's mean has a standard error of SPREAD/√2/40 ≈ 0.85 levels; 4 of those is the limit.
const blockLimit = (4 * SPREAD) / Math.SQRT2 / 40;
if (worstBlock > blockLimit) fail(`a 40×40 block's mean is ${worstBlock.toFixed(2)} levels off mid-grey (limit ${blockLimit.toFixed(2)})`);

// ─── 3. Encode ───────────────────────────────────────────────────────────

// effort 10 matters: at low effort the quantiser nudges 128 to 129.
const png = await sharp(pixels, { raw: { width: SIZE, height: SIZE, channels: 1 } })
  .toColourspace('b-w')
  .png({ compressionLevel: 9, palette: true, colours: 3, dither: 0, effort: 10 })
  .toBuffer();

/** The PNG's chunks, read directly: sharp's metadata reports a palette image as RGB. */
function chunks(buffer) {
  const out = new Map();
  for (let at = 8; at < buffer.length; ) {
    const length = buffer.readUInt32BE(at);
    out.set(buffer.toString('ascii', at + 4, at + 8), buffer.subarray(at + 8, at + 8 + length));
    at += 12 + length;
  }
  return out;
}
const parts = chunks(png);
const ihdr = parts.get('IHDR');
const plte = parts.get('PLTE');
const greys = plte ? [...plte].filter((_, i) => i % 3 === 0) : [];
const header = { width: ihdr.readUInt32BE(0), height: ihdr.readUInt32BE(4), depth: ihdr[8], colourType: ihdr[9] };
if (header.width !== SIZE || header.height !== SIZE || header.colourType !== 3 || header.depth !== 2) {
  fail(`encoded PNG is ${header.width}×${header.height}, colour type ${header.colourType}, depth ${header.depth}; expected ${SIZE}×${SIZE} indexed at 2 bits`);
}
const isGrey = plte.length === 9 && greys.every((g, i) => plte[i * 3 + 1] === g && plte[i * 3 + 2] === g);
if (!isGrey || greys.join() !== [MID - SPREAD, MID, MID + SPREAD].join()) {
  fail(`the palette is ${[...plte].join(',')}; expected the three greys ${MID - SPREAD}, ${MID}, ${MID + SPREAD}`);
}
if (parts.has('tRNS')) fail('the PNG has transparency; the grain is opaque');
if (png.length > BUDGET) fail(`grain.png is ${png.length} bytes; the budget is ${BUDGET}`);

/** Decoded pixels, as one grey channel. */
const greyPixels = async (buffer) => sharp(buffer).toColourspace('b-w').extractChannel(0).raw().toBuffer();
if (!(await greyPixels(png)).equals(pixels)) fail('the PNG does not decode to the pixels it was made from');

console.log(
  `grain     ${SIZE}×${SIZE}, three greys ${greys.join('/')} at 1/4, 1/2, 1/4 (indexed, 2 bits), mean ${mean}, seed 0x${SEED.toString(16)}`,
);
console.log(
  `tiling    neighbour difference inside ${inside.toFixed(2)}, across the left–right seam ${seamX.toFixed(2)}, top–bottom ${seamY.toFixed(2)} (allowed ±${allowed.toFixed(2)}); worst 40×40 block ${worstBlock.toFixed(2)} levels off mid-grey`,
);

// ─── 4. Write, or check ──────────────────────────────────────────────────

if (CHECK) {
  if (!existsSync(OUT)) fail(`${rel(OUT)} is missing; run: cd marketing-assets && node scripts/build-grain.mjs`);
  const onDisk = readFileSync(OUT);
  const diskPixels = await greyPixels(onDisk);
  if (!diskPixels.equals(pixels)) fail(`${rel(OUT)} is stale; run: cd marketing-assets && node scripts/build-grain.mjs`);
  console.log(`check     ${rel(OUT)} has the right pixels${onDisk.equals(png) ? ' and bytes' : ' (bytes differ: another sharp encodes it differently)'}`);
} else {
  const before = existsSync(OUT) ? readFileSync(OUT) : null;
  mkdirSync(new URL('./', OUT), { recursive: true });
  writeFileSync(OUT, png);
  console.log(`wrote     ${rel(OUT)} (${png.length} bytes, budget ${BUDGET}${before && before.equals(png) ? ', unchanged' : ''})`);
}
