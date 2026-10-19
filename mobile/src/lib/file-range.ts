/**
 * Byte ranges of a file on the phone, and copying one out a chunk at a time.
 *
 * The device half of a multipart upload (src/api/endpoints/storage.ts) needs
 * both, and both are arithmetic that is easy to get wrong by one, so they live
 * here, apart from expo-file-system, where `node --experimental-strip-types
 * --test` can load them (file-range.test.mjs). Keep this file import-free.
 */

/**
 * A byte range of a file on this device, standing in for the Blob the shared
 * uploader (src/api/multipart-upload.ts) slices.
 *
 * Not `File.slice` from expo-file-system: in 19.x that is
 * `new Blob([this.bytesSync().slice(start, end)])`, which reads the *whole*
 * file into the JS heap to cut 16 MB out of it. On a 4 GB film that is the app
 * killed for memory on the first part, on any phone. A range costs nothing
 * until its bytes are copied out, a chunk at a time.
 *
 * `uploadInParts` reads `size` and calls `slice(start, end)` and nothing else,
 * then hands each slice to `putPart` untouched, which is what makes passing
 * one where a Blob is typed safe. The putPart that receives it checks.
 */
export class FileRange {
  readonly uri: string;
  readonly start: number;
  readonly end: number;

  constructor(uri: string, start: number, end: number) {
    this.uri = uri;
    this.start = start;
    this.end = Math.max(start, end);
  }

  get size(): number {
    return this.end - this.start;
  }

  /** Offsets relative to this range, negative from its end, clamped, as Blob.slice. */
  slice(start = 0, end = this.size): FileRange {
    const clamp = (n: number) => Math.min(Math.max(n < 0 ? this.size + n : n, 0), this.size);
    return new FileRange(this.uri, this.start + clamp(start), this.start + clamp(end));
  }
}

/** The part of expo-file-system's FileHandle that reading uses. */
export interface ReadHandle {
  offset: number | null;
  readBytes(length: number): Uint8Array;
}

/** The part of expo-file-system's FileHandle that writing uses. */
export interface WriteHandle {
  writeBytes(bytes: Uint8Array): void;
}

/** The copy was stopped by its caller. */
export class CopyCancelled extends Error {
  constructor() {
    super('Copy was cancelled.');
    this.name = 'CopyCancelled';
  }
}

/** The source ended before the range did: the file changed after it was measured. */
export class SourceShrank extends Error {
  constructor() {
    super('The file is shorter than it was.');
    this.name = 'SourceShrank';
  }
}

export interface CopyOptions {
  /** Bytes per read. Each read is synchronous on the JS thread. */
  chunkBytes: number;
  /** Checked before every read. */
  isCancelled?: () => boolean;
  /** Awaited between reads, to let a frame draw. */
  pause?: () => Promise<void>;
}

/**
 * Copies `[start, end)` of `source` to `sink`, `chunkBytes` at a time.
 *
 * Seeks before every read rather than trusting the handle's position, and
 * believes the handle's offset over the length of what it returned: Android's
 * FileHandle allocates the buffer it was asked for and returns all of it even
 * when the channel filled less, so the tail of a short read is zeros that are
 * not in the file. Resolves with the bytes written.
 */
export async function copyRange(
  source: ReadHandle,
  sink: WriteHandle,
  start: number,
  end: number,
  options: CopyOptions,
): Promise<number> {
  const chunk = Math.max(1, Math.floor(options.chunkBytes));
  let position = start;

  while (position < end) {
    if (options.isCancelled?.()) throw new CopyCancelled();

    const want = Math.min(chunk, end - position);
    source.offset = position;
    const bytes = source.readBytes(want);
    const reported = source.offset;
    const advanced = typeof reported === 'number' ? reported - position : bytes.length;
    const got = Math.min(bytes.length, advanced, want);
    if (!(got > 0)) throw new SourceShrank();

    sink.writeBytes(got === bytes.length ? bytes : bytes.slice(0, got));
    position += got;

    if (position < end) await options.pause?.();
  }

  return position - start;
}
