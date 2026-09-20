import sharp from 'sharp';

/**
 * A tiny inline preview of an image, for painting before anything loads.
 *
 * The gap this closes is perceptual rather than technical. A grid already
 * reserves the right box — `aspectRatio` comes from the stored dimensions, so
 * nothing reflows — but until a thumbnail arrives that box is flat colour. On
 * a phone on Philippine mobile data, that is a screen of grey rectangles for
 * a beat. Instagram never shows one, because it paints a blurred stand-in on
 * the first frame.
 *
 * A data URI rather than a BlurHash, deliberately. BlurHash is a third of the
 * size but needs a decoder on every surface, and one of ours is the client
 * gallery — a server-rendered page with `script-src 'nonce-…'`, no bundler
 * and no dependencies. A data URI is just an image: it works there, in React,
 * and in expo-image, with nothing added to any of them.
 *
 * It costs **no extra request**. The string travels in the album listing that
 * already enumerates the files, so a two-hundred photograph gallery paints
 * completely before a single thumbnail is fetched.
 */

/** Long edge of the preview. Twenty pixels is unrecognisable and enough. */
const BLUR_EDGE = 20;

/**
 * Above this, drop it.
 *
 * At twenty pixels a WebP is a few hundred bytes, so this only trips on
 * something pathological — and a preview that costs more than the thumbnail
 * it stands in for has stopped being an optimisation. Multiplied across an
 * album, a large one would bloat the listing response it rides in.
 */
const MAX_CHARS = 1400;

/**
 * Builds the preview, or returns null.
 *
 * Never throws. The caller already has the decoded source in hand and is in
 * the middle of something that matters more — a missing preview costs a grey
 * box for a moment, which is exactly what happens today.
 */
export async function blurDataUrl(source: Buffer): Promise<string | null> {
  try {
    const body = await sharp(source, { failOn: 'none' })
      // Honour EXIF orientation. Without this a portrait photograph gets a
      // landscape smear behind it, which is more distracting than no preview.
      .rotate()
      .resize(BLUR_EDGE, BLUR_EDGE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 45, effort: 6 })
      .toBuffer();

    const url = `data:image/webp;base64,${body.toString('base64')}`;
    return url.length <= MAX_CHARS ? url : null;
  } catch {
    return null;
  }
}
