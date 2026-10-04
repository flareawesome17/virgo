/**
 * Encodes the hero film (blender/hero_film.py) for the page:
 *
 *   node scripts/encode-film.mjs
 *
 * Reads the rendered frames in out/film/wide/ (intro_0000…0059.png and
 * loop_0000…0119.png, 1280×720, 24 fps) and writes out/web/film/:
 *   film-intro.{webm,mp4}   the opening, played once
 *   film-loop.{webm,mp4}    the seamless loop that follows it
 *   film-still.{avif,webp,jpg}   the loop's first frame: the reduced-motion and no-JS hero
 * publish.mjs then hashes them into web/public/redesign/film/.
 *
 * VP9 for the browsers that take it, H.264 for Safari. The loop is one GOP
 * (a keyframe every 120 frames, so only frame 0 is one) and the intro ends on
 * the loop's first frame, so the hand-over from one file to the other is the
 * same picture. Uses Remotion's bundled ffmpeg (`remotion ffmpeg`) and sharp.
 */
/* global console, process -- Node script; the package ESLint config is the Remotion (browser) preset. */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const PKG = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(PKG, 'out', 'film', 'wide');
const OUT = join(PKG, 'out', 'web', 'film');
const CLI = join(PKG, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');

function ffmpeg(args) {
  const run = spawnSync(process.execPath, [CLI, 'ffmpeg', '-hide_banner', '-nostdin', '-y', '-v', 'error', ...args], { cwd: PKG, encoding: 'utf8', maxBuffer: 1 << 26 });
  if (run.status !== 0) throw new Error(`encode-film: ffmpeg ${args.join(' ')}\n${run.stderr}`);
}

function encode(part, frames) {
  const input = ['-framerate', '24', '-i', join(SRC, `${part}_%04d.png`)];
  const color = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709'];
  const gop = ['-g', String(frames), '-keyint_min', String(frames)];
  ffmpeg([...input, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '34', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-pix_fmt', 'yuv420p', ...gop, ...color, '-an', join(OUT, `film-${part}.webm`)]);
  ffmpeg([...input, '-c:v', 'libx264', '-preset', 'slow', '-crf', '22', '-tune', 'film', '-profile:v', 'high', '-pix_fmt', 'yuv420p', ...gop, '-sc_threshold', '0', ...color, '-movflags', '+faststart', '-an', join(OUT, `film-${part}.mp4`)]);
}

async function main() {
  if (!existsSync(join(SRC, 'loop_0119.png')) || !existsSync(join(SRC, 'intro_0059.png'))) {
    throw new Error('encode-film: render the film first (blender/hero_film.py, intro 0:60 and loop 0:120 into out/film/wide)');
  }
  mkdirSync(OUT, { recursive: true });
  encode('intro', 60);
  encode('loop', 120);
  const still = sharp(join(SRC, 'loop_0000.png'));
  await still.clone().avif({ quality: 58, effort: 6 }).toFile(join(OUT, 'film-still.avif'));
  await still.clone().webp({ quality: 80 }).toFile(join(OUT, 'film-still.webp'));
  await still.clone().jpeg({ quality: 82, mozjpeg: true }).toFile(join(OUT, 'film-still.jpg'));
  for (const f of ['film-intro.webm', 'film-intro.mp4', 'film-loop.webm', 'film-loop.mp4', 'film-still.avif', 'film-still.webp', 'film-still.jpg']) {
    console.log(`${f.padEnd(18)} ${(statSync(join(OUT, f)).size / 1000).toFixed(0).padStart(6)} KB`);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
