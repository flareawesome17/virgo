import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { MAP_LEVELS } from '@/components/story/data/ph-map.generated';

/**
 * The map lab's view of marketing-assets/assets: the four map levels and the
 * grain tile, read from where the build scripts write them, so the lab always
 * shows the files on disk. Development only. The page publishes them to
 * web/public/redesign/ with content hashes later (storyboard §4 B4, B5); until
 * then this is the only way to look at them in the app.
 */

/** The dev server runs in web/; marketing-assets/ sits beside it. */
function assetsDir(): string | null {
  for (const candidate of [
    path.resolve(process.cwd(), '..', 'marketing-assets', 'assets'),
    path.resolve(process.cwd(), 'marketing-assets', 'assets'),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** What the lab serves, by URL name. Nothing else is readable through it. */
export const LAB_FILES: Readonly<Record<string, { readonly path: string; readonly type: string }>> = Object.fromEntries([
  ...MAP_LEVELS.map((level) => [level.file, { path: `map/${level.file}`, type: 'image/svg+xml' }] as const),
  ['grain.png', { path: 'grain.png', type: 'image/png' }] as const,
]);

export function readLabFile(name: string): Buffer | null {
  const file = LAB_FILES[name];
  const dir = assetsDir();
  if (!file || !dir) return null;
  const full = path.join(dir, file.path);
  return existsSync(full) ? readFileSync(full) : null;
}

export function gzipBytes(data: Buffer): number {
  return gzipSync(data, { level: 9 }).length;
}

/**
 * A level's rings, in map units, read back from its SVG: one path of
 * `m X Y dx dy … z` in integer quanta, scaled by the path's transform.
 */
export function svgRings(svg: string): number[][][] {
  const scale = Number(/scale\(([\d.]+)\)/.exec(svg)?.[1] ?? '1');
  const d = /\sd="([^"]+)"/.exec(svg)?.[1] ?? '';
  const tokens = d.match(/[mz]|-?\d+/g) ?? [];
  const rings: number[][][] = [];
  let start: [number, number] | null = null;
  let pen: [number, number] = [0, 0];
  let current: [number, number][] = [];
  for (let i = 0; i < tokens.length; ) {
    const token = tokens[i++];
    if (token === 'm') {
      const dx = Number(tokens[i++]);
      const dy = Number(tokens[i++]);
      start = start ? [start[0] + dx, start[1] + dy] : [dx, dy];
      pen = start;
      current = [start];
    } else if (token === 'z') {
      rings.push(current.map(([x, y]) => [x * scale, y * scale]));
      if (start) pen = start;
    } else {
      pen = [pen[0] + Number(token), pen[1] + Number(tokens[i++])];
      current.push(pen);
    }
  }
  return rings;
}

/** Whether (x, y) is inside any of the rings (the map has no holes). */
export function inRings(rings: number[][][], x: number, y: number): boolean {
  for (const ring of rings) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}
