/**
 * Shrinking images in the browser, before they are uploaded.
 *
 * This is not what makes avatars small — the API resizes them on confirm, so
 * that every client is covered including app builds already installed on
 * people's phones. This is what stops a 5 MB camera photo crossing a mobile
 * connection first, only to be thrown away on arrival.
 *
 * Web-only by design. `src/lib` is outside the trees that
 * `scripts/check-client-sync.mjs` keeps byte-identical, because the mobile
 * equivalent has to go through expo-image-manipulator — there is no canvas.
 */

import { COVER_ASPECT, coverCropRect } from '@/api';

/** Matches the server's `AVATAR_EDGE`. */
export const AVATAR_MAX_EDGE = 512;

/** Matches the server's `AVATAR_QUALITY`, on canvas's 0-1 scale. */
const QUALITY = 0.82;

/**
 * Returns `file` scaled so its longest edge is at most `maxEdge`.
 *
 * Returns the original untouched whenever it cannot do better: a format the
 * canvas will not decode, a browser with no 2D context, an image already
 * inside the box, or a re-encode that came out larger than what it started
 * with. It never throws — failing to shrink an upload is not a reason to fail
 * the upload.
 */
export async function resizeImage(file: File, maxEdge: number): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  // An animated GIF would come back as a still first frame, which is a worse
  // result than leaving it alone.
  if (file.type === 'image/gif') return file;
  if (typeof createImageBitmap !== 'function') return file;

  let bitmap: ImageBitmap | null = null;
  try {
    // `from-image` applies the EXIF orientation a phone writes instead of
    // rotating pixels. Without it a portrait photo lands sideways — and the
    // canvas output carries no EXIF for anything downstream to correct it by.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });

    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    if (scale === 1) return file;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);

    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], `${stripExtension(file.name)}.webp`, {
      type: 'image/webp',
    });
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}

function stripExtension(name: string): string {
  return name.replace(/\.[^./]+$/, '') || 'image';
}

/** = COVER_EDGE in api thumbnails.service.ts, which keeps a cover no wider. */
export const COVER_MAX_WIDTH = 2048;

/**
 * The cover as it will be stored: cropped to the cover's 2:1 where the person
 * put it, at most COVER_MAX_WIDTH wide, re-encoded as JPEG.
 *
 * The server only resizes a cover; the crop is the client's, as it is on the
 * phone (coverCropRect is the same maths). Throws on any failure, and the
 * caller then uploads nothing: falling back to the original would send the
 * camera file, EXIF and GPS included, to a public address.
 */
export async function renderCover(file: File, focusY = 0.5): Promise<File> {
  if (typeof createImageBitmap !== 'function') throw new Error('This browser cannot prepare a cover.');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const rect = coverCropRect(bitmap.width, bitmap.height, focusY);
    const width = Math.min(COVER_MAX_WIDTH, rect.width);
    const height = Math.round(width / COVER_ASPECT);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot prepare a cover.');
    ctx.drawImage(bitmap, rect.originX, rect.originY, rect.width, rect.height, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85),
    );
    if (!blob) throw new Error('This browser cannot prepare a cover.');
    return new File([blob], `${stripExtension(file.name)}-cover.jpg`, { type: 'image/jpeg' });
  } finally {
    bitmap.close();
  }
}
