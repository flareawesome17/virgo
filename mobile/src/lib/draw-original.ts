import type { StoredFile } from '@/src/api';

/** An original this small is no heavier to draw than a display copy. */
const SMALL_PIXELS = 4_000_000;
const SMALL_BYTES = 2.5 * 1024 * 1024;

/**
 * Whether a photograph's original may stand in where a thumbnail or a display
 * copy is missing.
 *
 * A tile or a pager page that falls back to the original decodes the camera
 * file: 24 to 45 megapixels, a hundred megabytes and more of bitmap each. A
 * grid of them, or the three pages a viewer keeps, is enough for iOS to end
 * the app on a phone with 4 GB, and the place it happened was the album right
 * after an upload, where every new file is waiting on its thumbnail. A small
 * original (a screenshot, a web export) is safe, and is the only thing some
 * old files have.
 *
 * By its pixels when they are known, by its size when they are not.
 */
export function canDrawOriginal(
  file: Pick<StoredFile, 'width' | 'height' | 'sizeBytes'>,
): boolean {
  const pixels = (file.width ?? 0) * (file.height ?? 0);
  return pixels > 0 ? pixels <= SMALL_PIXELS : file.sizeBytes <= SMALL_BYTES;
}
