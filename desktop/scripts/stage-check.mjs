#!/usr/bin/env node
/**
 * Stands in for what a release stages, so `cargo check` can run without it.
 *
 * The shell's build script refuses to start unless everything tauri.conf.json
 * names is on disk: the icons `cargo tauri icon` generates, the Node sidecar
 * and the web server that `stage-web.mjs` copies in. None of that is in git,
 * and producing it means building the web app and downloading Node — minutes
 * of work, and 90 MB, for a check that never runs any of it.
 *
 * So this writes placeholders: the web app's own icon in each icon slot, an
 * ICO wrapped around it, an empty sidecar and a one-line server.js. It only
 * fills gaps. Anything already there, a real staged build above all, is left
 * exactly as it was.
 *
 * Usage: node scripts/stage-check.mjs   (from desktop/)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktop = join(dirname(fileURLToPath(import.meta.url)), '..');
const tauri = join(desktop, 'src-tauri');
const icon = readFileSync(join(desktop, '..', 'web', 'public', 'icon.png'));

/** Writes `contents` to `path` unless something is already there. */
function placeholder(path, contents) {
  if (existsSync(path)) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
  console.log(`placeholder ${path.slice(desktop.length + 1)}`);
}

/**
 * An ICO holding the PNG as its one image.
 *
 * Windows has read PNG-compressed icon entries since Vista, and the resource
 * compiler accepts them, so there is no need to draw a bitmap. A width and
 * height of 0 in the directory entry mean 256 or more.
 */
function ico(png) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image
  header.writeUInt8(0, 6); // width
  header.writeUInt8(0, 7); // height
  header.writeUInt16LE(1, 10); // colour planes
  header.writeUInt16LE(32, 12); // bits per pixel
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18); // offset of the image
  return Buffer.concat([header, png]);
}

for (const name of ['32x32.png', '128x128.png', '128x128@2x.png', 'icon.png']) {
  placeholder(join(tauri, 'icons', name), icon);
}
placeholder(join(tauri, 'icons', 'icon.ico'), ico(icon));
placeholder(join(tauri, 'icons', 'icon.icns'), Buffer.alloc(0));

// The sidecar carries the target triple in its name, as Tauri expects before
// it strips it when bundling.
const triple =
  process.env.VIRGO_TARGET_TRIPLE ||
  /host: (\S+)/.exec(execFileSync('rustc', ['-vV'], { encoding: 'utf8' }))?.[1];
if (!triple) throw new Error('Could not tell the target triple from `rustc -vV`.');
const exe = triple.includes('windows') ? '.exe' : '';
placeholder(join(tauri, 'binaries', `node-${triple}${exe}`), Buffer.alloc(0));

placeholder(
  join(tauri, 'resources', 'web', 'server.js'),
  '// Placeholder from scripts/stage-check.mjs; a release stages the real server.\n',
);
