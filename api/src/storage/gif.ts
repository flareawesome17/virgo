/**
 * What a GIF is, read from its block structure rather than decoded.
 *
 * sharp has to scan every frame of a GIF before it can answer anything at all
 * about it, and that scan is quadratic in the frame count. Measured on the
 * sharp in this repo (0.35.3, libvips 8.18.3), one flat frame per page:
 *
 *     30,000 frames    0.1 s      100,000 frames   1.5 s
 *    200,000 frames    6.3 s      400,000 frames  24.7 s
 *
 * `ThumbnailsService.generate` opens the same file three times — the
 * metadata, the thumbnail and the preview — so a 10 MB GIF of one-pixel
 * frames is over a minute of CPU on a request somebody is waiting on, and a
 * 40 MB one, which the size ceiling allows, is far worse. None of that work
 * is worth anything: what comes out is a thumbnail of a flicker.
 *
 * A GIF can be walked without decompressing a single pixel, because every
 * block carries its own length. That is linear, costs a few milliseconds on
 * the files above, and answers both questions a thumbnail has: how many
 * frames there are, and where the first one ends.
 */

/** The last byte of a GIF, and the whole of the one-frame copy's ending. */
const TRAILER = Buffer.from([0x3b]);

/** Block introducers, from the GIF89a specification. */
const EXTENSION = 0x21;
const IMAGE = 0x2c;
const END = 0x3b;

export interface GifShape {
  /** How many frames the file holds. */
  frames: number;
  /** The canvas they are drawn on. No frame is larger than this. */
  width: number;
  height: number;
  /** Offset just past the first frame, where a one-frame copy is cut. */
  firstFrameEnd: number;
}

/**
 * A GIF's shape, or null when it is not one this walker is sure of.
 *
 * Null is the "carry on as before" answer: the caller hands the whole file to
 * sharp, which is what happened before this existed. Nothing here rejects a
 * file — a GIF that is malformed, truncated or simply unfamiliar is sharp's
 * to judge, not this walker's.
 */
export function gifShape(source: Buffer): GifShape | null {
  const header = source.subarray(0, 6).toString('latin1');
  if (header !== 'GIF87a' && header !== 'GIF89a') return null;
  if (source.length < 13) return null;

  const width = source.readUInt16LE(6);
  const height = source.readUInt16LE(8);
  if (!width || !height) return null;

  // The logical screen descriptor, then the global colour table when the top
  // bit of its packed field says there is one.
  let at = 13 + colourTableBytes(source[10]);
  let frames = 0;
  let firstFrameEnd = 0;

  while (at < source.length) {
    const block = source[at];
    if (block === END) break;

    if (block === EXTENSION) {
      // An introducer, a label, then sub-blocks: a comment, a graphic control
      // for the frame that follows, an application loop count.
      at = endOfSubBlocks(source, at + 2);
    } else if (block === IMAGE) {
      if (at + 10 > source.length) return null;
      // Nine bytes of geometry, an optional local colour table, one byte of
      // LZW code size, then the compressed pixels as sub-blocks.
      at = endOfSubBlocks(source, at + 10 + colourTableBytes(source[at + 9]) + 1);
      if (at < 0) return null;
      frames += 1;
      if (frames === 1) firstFrameEnd = at;
      continue;
    } else {
      return null;
    }
    if (at < 0) return null;
  }

  return frames > 0 ? { frames, width, height, firstFrameEnd } : null;
}

/**
 * The same GIF with everything after its first frame dropped.
 *
 * A real single-frame GIF, header and colour table included, so sharp reads
 * it as it would any other — and in the time one frame takes.
 */
export function gifFirstFrame(source: Buffer, shape: GifShape): Buffer {
  return Buffer.concat([source.subarray(0, shape.firstFrameEnd), TRAILER]);
}

/** Bytes of colour table a packed field describes, or 0 for none. */
function colourTableBytes(packed: number): number {
  return packed & 0x80 ? 3 * 2 ** ((packed & 0x07) + 1) : 0;
}

/**
 * The offset past a chain of length-prefixed sub-blocks, or -1 if the chain
 * runs off the end of the file.
 */
function endOfSubBlocks(source: Buffer, from: number): number {
  let at = from;
  while (at < source.length) {
    const size = source[at];
    if (size === 0) return at + 1;
    at += size + 1;
  }
  return -1;
}
