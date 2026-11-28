/**
 * The JPEG a HEIC becomes keeps what made the photograph look and read the way
 * it did: its colour profile and its EXIF.
 *
 * Written into the JPEG's own segments here rather than through sharp. sharp
 * can attach a profile only by converting the pixels into it, and these
 * pixels are already in the profile — an iPhone's Display P3 — so a
 * conversion would shift every colour. Splicing the bytes in leaves the
 * pixels exactly as libheif decoded them, labelled correctly.
 *
 * The EXIF is the camera's, with one change: its orientation says upright.
 * libheif has already turned the picture the way the HEIC's own transforms
 * say, and a viewer that also obeyed the camera's "rotate 90°" would turn it
 * a second time.
 */

/** Where the TIFF header of an EXIF block may start, at most, in what readers hand over. */
const TIFF_SEARCH_BYTES = 16;

/** EXIF's orientation tag, and the value for "as stored". */
const ORIENTATION_TAG = 0x0112;
const UPRIGHT = 1;

/** The marker every APP1 EXIF segment opens with. */
const EXIF_HEADER = Buffer.from('Exif\0\0', 'latin1');

/** The marker every APP2 colour-profile chunk opens with. */
const ICC_HEADER = Buffer.from('ICC_PROFILE\0', 'latin1');

/** A JPEG segment's length field counts itself, and is 16 bits. */
const MAX_SEGMENT_PAYLOAD = 0xffff - 2;

/** Profile bytes per APP2 chunk: the payload less its header, sequence number and count. */
const ICC_CHUNK_BYTES = MAX_SEGMENT_PAYLOAD - ICC_HEADER.length - 2;

/**
 * The TIFF structure inside an EXIF block, however the reader wrapped it.
 *
 * A HEIF EXIF item starts with a four-byte offset, then usually "Exif\0\0",
 * then the TIFF header; libvips hands over some of that or none of it,
 * depending on the version. Rather than guess which, the TIFF header itself
 * ("II*\0" or "MM\0*") is looked for near the start. Null when there is none:
 * nothing is better than a block a viewer would misread.
 */
export function tiffFromExif(exif: Buffer | null | undefined): Buffer | null {
  if (!exif || exif.length < 8) return null;
  const limit = Math.min(TIFF_SEARCH_BYTES, exif.length - 8);
  for (let at = 0; at <= limit; at++) {
    const little = exif[at] === 0x49 && exif[at + 1] === 0x49 && exif[at + 2] === 0x2a && exif[at + 3] === 0x00;
    const big = exif[at] === 0x4d && exif[at + 1] === 0x4d && exif[at + 2] === 0x00 && exif[at + 3] === 0x2a;
    if (little || big) return Buffer.from(exif.subarray(at));
  }
  return null;
}

/**
 * A copy of a TIFF block with its orientation set to upright.
 *
 * Only the first directory is read, which is where EXIF keeps it. A block
 * whose directory runs off its end is refused (null) rather than patched
 * half-way, since an orientation left as "rotate" would turn the JPEG a
 * second time. A block with no orientation tag needs no change.
 */
export function uprightTiff(tiff: Buffer): Buffer | null {
  if (tiff.length < 8) return null;
  const little = tiff[0] === 0x49;
  const u16 = (at: number) => (little ? tiff.readUInt16LE(at) : tiff.readUInt16BE(at));
  const u32 = (at: number) => (little ? tiff.readUInt32LE(at) : tiff.readUInt32BE(at));

  const ifd = u32(4);
  if (ifd < 8 || ifd + 2 > tiff.length) return null;
  const entries = u16(ifd);
  if (ifd + 2 + entries * 12 > tiff.length) return null;

  const copy = Buffer.from(tiff);
  for (let i = 0; i < entries; i++) {
    const entry = ifd + 2 + i * 12;
    if (u16(entry) !== ORIENTATION_TAG) continue;
    // SHORT, one of it, kept in the entry's own value field.
    if (u16(entry + 2) !== 3 || u32(entry + 4) !== 1) return null;
    if (little) copy.writeUInt16LE(UPRIGHT, entry + 8);
    else copy.writeUInt16BE(UPRIGHT, entry + 8);
  }
  return copy;
}

/** One JPEG marker segment: FF, the marker, the 16-bit length, the payload. */
function segment(marker: number, payload: Buffer): Buffer {
  const head = Buffer.alloc(4);
  head[0] = 0xff;
  head[1] = marker;
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
}

/**
 * A JPEG with an EXIF block and a colour profile written into it.
 *
 * Replaces whatever APP0, APP1 and APP2 segments the encoder put at the head
 * (sharp writes a bare JFIF APP0 when asked for no metadata); every other
 * segment, and the image data, is left byte for byte. EXIF too large for one
 * APP1 segment is left out rather than cut short; a profile is split across
 * as many APP2 chunks as it needs, which is how every reader expects one.
 *
 * Throws on anything that is not a JPEG: this is the last step before an
 * original is replaced, and a wrong guess here would be the photograph.
 */
export function withJpegMetadata(
  jpeg: Buffer,
  meta: { tiff?: Buffer | null; icc?: Buffer | null },
): Buffer {
  if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) {
    throw new Error('Not a JPEG: no start-of-image marker');
  }

  // Walk past the application segments at the head, keeping all but the
  // three this writes.
  let at = 2;
  const kept: Buffer[] = [];
  while (at + 4 <= jpeg.length && jpeg[at] === 0xff) {
    const marker = jpeg[at + 1];
    const isApp = marker >= 0xe0 && marker <= 0xef;
    const isComment = marker === 0xfe;
    if (!isApp && !isComment) break;
    const length = jpeg.readUInt16BE(at + 2);
    if (length < 2 || at + 2 + length > jpeg.length) {
      throw new Error('Not a JPEG: a header segment runs past the end');
    }
    if (marker !== 0xe0 && marker !== 0xe1 && marker !== 0xe2) {
      kept.push(jpeg.subarray(at, at + 2 + length));
    }
    at += 2 + length;
  }

  const added: Buffer[] = [];
  const tiff = meta.tiff ?? null;
  if (tiff && EXIF_HEADER.length + tiff.length <= MAX_SEGMENT_PAYLOAD) {
    added.push(segment(0xe1, Buffer.concat([EXIF_HEADER, tiff])));
  }

  const icc = meta.icc ?? null;
  if (icc && icc.length > 0) {
    const count = Math.ceil(icc.length / ICC_CHUNK_BYTES);
    if (count <= 255) {
      for (let i = 0; i < count; i++) {
        const chunk = icc.subarray(i * ICC_CHUNK_BYTES, (i + 1) * ICC_CHUNK_BYTES);
        added.push(segment(0xe2, Buffer.concat([ICC_HEADER, Buffer.from([i + 1, count]), chunk])));
      }
    }
  }

  return Buffer.concat([jpeg.subarray(0, 2), ...added, ...kept, jpeg.subarray(at)]);
}

/** HEIF's file extensions, as a camera or a Mac names them. */
const HEIF_EXTENSION = /\.(heic|heif|hif)$/i;

/**
 * What a photograph is called once it is a JPEG: IMG_1234.HEIC becomes
 * IMG_1234.jpg. A name without a HEIF extension keeps its stem and gains
 * ".jpg", so the download is never a JPEG called something.heic.
 */
export function jpegName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return 'photo.jpg';
  if (HEIF_EXTENSION.test(trimmed)) return trimmed.replace(HEIF_EXTENSION, '.jpg');
  if (/\.jpe?g$/i.test(trimmed)) return trimmed;
  return `${trimmed}.jpg`;
}

/** Whether a stored file is one this replaces: HEIC or HEIF by its recorded type. */
export function isHeifType(contentType: string | null | undefined): boolean {
  return contentType === 'image/heic' || contentType === 'image/heif';
}
