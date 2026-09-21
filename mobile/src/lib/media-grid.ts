import type { StoredFile } from '@/src/api';
import { dayKey, dayTitle } from '@/src/lib/media-days';

/**
 * Shared shape for the photo and film grids.
 *
 * Both are the same grid with a different overlay, so the chunking, the date
 * headings and the density scale live here rather than being written twice and
 * drifting. The screens keep their own rendering, which is where they actually
 * differ: a film tile carries a duration, a photo tile carries nothing.
 */

/**
 * Densities you can pinch between, in columns.
 *
 * Three is the resting state. Five is the "where is that shot" scan, two is
 * close enough to judge a frame. Past five a thumbnail on a phone stops
 * carrying information, so the scale stops rather than offering a density
 * nobody can read.
 */
export const DENSITIES = [2, 3, 5] as const;

/** Index into DENSITIES. */
export const DEFAULT_DENSITY = 1;

/** Hairline, not a gutter. Frames are separated, not spaced out. */
export const HAIRLINE = 2;

/** Height reserved for the floating header so content can start beneath it. */
export const CHROME_HEIGHT = 96;

export type MediaRow = { items: StoredFile[]; firstIndex: number };
export type MediaSection = {
  /** `2026-03-14`, stable across renders, for keys and "select this day". */
  key: string;
  title: string;
  data: MediaRow[];
};

/**
 * Files grouped by the day they were taken, then chunked into grid rows.
 *
 * The dates are the point: an album is shot over days, and an undifferentiated
 * wall of squares makes you scroll hunting for a boundary that was never drawn.
 * They are the days the photographs were TAKEN — `dayKey` reads the capture
 * time and only falls back to the upload. Grouping by `createdAt`, as this
 * did, put a three-day wedding uploaded in one evening under one heading
 * called "Today".
 *
 * Each row carries the absolute index of its first item, so a tap can open the
 * viewer at the right file without searching the array for it. The grid this
 * replaced called `files.indexOf(item)` inside the row renderer, which is a
 * linear scan per tile on every render.
 */
export function toSections(
  files: StoredFile[],
  columns: number,
): MediaSection[] {
  const sections: MediaSection[] = [];
  let absolute = 0;
  const now = new Date();

  for (const file of files) {
    const key = dayKey(file);
    let section = sections[sections.length - 1];
    if (!section || section.key !== key) {
      section = { key, title: dayTitle(key, now), data: [] };
      sections.push(section);
    }
    const lastRow = section.data[section.data.length - 1];
    if (!lastRow || lastRow.items.length === columns) {
      section.data.push({ items: [file], firstIndex: absolute });
    } else {
      lastRow.items.push(file);
    }
    absolute += 1;
  }
  return sections;
}

/** `83` -> `1:23`, `3701` -> `1:01:41`. Hours only appear when there are any. */
export function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const s = String(total % 60).padStart(2, '0');
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
