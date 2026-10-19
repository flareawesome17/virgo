/**
 * Publishes the story site's finished media into web/public/redesign/ under
 * content-hashed names, and writes the manifest the page reads its URLs from.
 *
 *   node scripts/publish.mjs
 *
 * Inputs: the encodes in out/web/ (scripts/encode.mjs), the map levels and the
 * grain in assets/, and the OG still. Every published name carries the first 8
 * hex digits of the file's sha256, so next.config can cache /redesign/* for a
 * year; a file never changes under its URL. Running it twice changes nothing,
 * and files it published before that are no longer current are removed.
 */
/* global process, console */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = resolve(ROOT, '..', 'web');
const PUBLIC = join(WEB, 'public', 'redesign');
const MANIFEST = join(WEB, 'src', 'components', 'story', 'media.generated.ts');

const TYPES = {
  '.avif': 'image/avif',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

/** [manifest key, source file, published folder, width, height, codecs?] */
const ASSETS = [
  ['posterMobileAvif', 'out/web/sky/poster-m.avif', 'sky', 720, 1560],
  ['posterMobileWebp', 'out/web/sky/poster-m.webp', 'sky', 720, 1560],
  ['posterDesktopAvif', 'out/web/sky/poster-d.avif', 'sky', 1920, 1080],
  ['posterDesktopWebp', 'out/web/sky/poster-d.webp', 'sky', 1920, 1080],
  ['clustersMobileAvif', 'out/web/sky/clusters-m.avif', 'sky', 0, 0],
  ['clustersMobileWebp', 'out/web/sky/clusters-m.webp', 'sky', 0, 0],
  ['clustersDesktopAvif', 'out/web/sky/clusters-d.avif', 'sky', 0, 0],
  ['clustersDesktopWebp', 'out/web/sky/clusters-d.webp', 'sky', 0, 0],
  ['cebuLensAvif', 'out/web/sky/cebu-lens.avif', 'sky', 0, 0],
  ['cebuLensWebp', 'out/web/sky/cebu-lens.webp', 'sky', 0, 0],
  // The hero film (blender/hero_film.py → scripts/encode-film.mjs): the opening, the loop, and its still.
  ['filmIntroWebm', 'out/web/film/film-intro.webm', 'film', 1280, 720, 'vp9'],
  ['filmIntroMp4', 'out/web/film/film-intro.mp4', 'film', 1280, 720, 'avc1.640028'],
  ['filmLoopWebm', 'out/web/film/film-loop.webm', 'film', 1280, 720, 'vp9'],
  ['filmLoopMp4', 'out/web/film/film-loop.mp4', 'film', 1280, 720, 'avc1.640028'],
  ['filmStillAvif', 'out/web/film/film-still.avif', 'film', 1280, 720],
  ['filmStillWebp', 'out/web/film/film-still.webp', 'film', 1280, 720],
  ['filmStillJpg', 'out/web/film/film-still.jpg', 'film', 1280, 720],
  ['ogVideoMp4', 'out/web/og/virgo-og.mp4', 'og', 1200, 630, 'avc1.640028'],
  ['ogVideoWebm', 'out/web/og/virgo-og.webm', 'og', 1200, 630, 'vp9'],
  ['mapArchipelago', 'assets/map/archipelago.svg', 'map', 0, 0],
  ['mapVisayas', 'assets/map/visayas.svg', 'map', 0, 0],
  ['mapCebu', 'assets/map/cebu.svg', 'map', 0, 0],
  ['mapRadar', 'assets/map/radar.svg', 'map', 0, 0],
  ['grain', 'assets/grain.png', '', 160, 160],
];

const hash8 = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 8);

async function dims(file, w, h) {
  if (w && h) return [w, h];
  const ext = extname(file);
  if (ext === '.svg') {
    const vb = /viewBox="([\d.\s-]+)"/.exec(readFileSync(file, 'utf8'));
    if (vb) {
      const [, , vw, vh] = vb[1].trim().split(/\s+/).map(Number);
      return [Math.round(vw), Math.round(vh)];
    }
    return [0, 0];
  }
  const meta = await sharp(file).metadata();
  return [meta.width ?? 0, meta.height ?? 0];
}

async function main() {
  mkdirSync(PUBLIC, { recursive: true });
  const written = new Set();
  const manifest = {};

  for (const [key, src, folder, w, h, codecs] of ASSETS) {
    const from = join(ROOT, src);
    if (!existsSync(from)) throw new Error(`missing input: ${src}`);
    const buf = readFileSync(from);
    const ext = extname(from);
    const name = `${basename(from, ext)}.${hash8(buf)}${ext}`;
    const dir = folder ? join(PUBLIC, folder) : PUBLIC;
    mkdirSync(dir, { recursive: true });
    const to = join(dir, name);
    if (!existsSync(to)) copyFileSync(from, to);
    written.add(to);
    const [width, height] = await dims(from, w, h);
    manifest[key] = {
      url: `/redesign/${relative(PUBLIC, to).split('\\').join('/')}`,
      width,
      height,
      bytes: buf.length,
      type: TYPES[ext],
      ...(codecs ? { codecs } : {}),
    };
  }

  // The OG card: the OG video's frame 0, as a JPEG for the og:image.
  const ogStill = join(ROOT, 'out', 'stills', 'og-frame0.png');
  if (existsSync(ogStill)) {
    const jpg = await sharp(ogStill).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
    mkdirSync(join(ROOT, 'out', 'og'), { recursive: true });
    writeFileSync(join(ROOT, 'out', 'og', 'opengraph-image.jpg'), jpg);
  }

  // Remove anything published earlier that is no longer current.
  const sweep = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) sweep(path);
      else if (!written.has(path)) rmSync(path);
    }
  };
  sweep(PUBLIC);

  const body = `/**
 * GENERATED by marketing-assets/scripts/publish.mjs — do not edit.
 *
 * Every story-site media file, with its content-hashed URL under /redesign/.
 * The page reads URLs from here and never types a path. Zero-import.
 */
export const MEDIA = ${JSON.stringify(manifest, null, 2)} as const;

export type MediaKey = keyof typeof MEDIA;
`;
  writeFileSync(MANIFEST, body);
  console.log(`published ${written.size} files; manifest → ${relative(resolve(ROOT, '..'), MANIFEST)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
