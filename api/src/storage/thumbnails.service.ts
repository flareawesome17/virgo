import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import sharp, { type Metadata } from 'sharp';
import { DatabaseService } from '../database/database.service';
import { blurDataUrl } from './blur';
import { takenAtFromExif, takenAtFromHead } from './capture-time';
import { gifFirstFrame, gifShape } from './gif';
import {
  DISPLAY_WIDTHS,
  MediaLinkService,
  displayKeyFor,
} from './media-link.service';
import { Semaphore } from './semaphore';
import { MAX_COVER_BYTES } from './storage.config';
import { StorageService } from './storage.service';

const run = promisify(execFile);

/**
 * The longest edge of a generated thumbnail, in pixels.
 *
 * The client gallery draws tiles at 160–220 CSS px. 640 covers that at 3x on a
 * phone and still leaves the file around 40 KB, which is the point: the grid
 * used to render from the originals, so opening a 200-photo wedding pulled
 * roughly a gigabyte to draw squares the size of a postage stamp.
 */
const THUMB_EDGE = 640;

/**
 * Above this, do not try.
 *
 * A thumbnail is a nicety and the original always works as a fallback. Pulling
 * a 100 MB TIFF into memory to make one is how a confirm request takes the
 * container down with it.
 *
 * Exported for scripts/backfill-thumbnails.mjs, which has to leave the same
 * files alone and used to do it with its own copy of this number.
 */
export const MAX_SOURCE_BYTES = 40 * 1024 * 1024;

/**
 * How much of an oversized original to read for its capture date.
 *
 * A JPEG's EXIF is in the first segments of the file and a TIFF's is linked
 * from its first directory; a quarter of a megabyte clears both with room to
 * spare, where the whole file is what MAX_SOURCE_BYTES exists to refuse.
 */
const EXIF_HEAD_BYTES = 256 * 1024;

/** WebP everywhere: ~30% smaller than JPEG at the same quality, and universal. */
const THUMB_CONTENT_TYPE = 'image/webp';

/**
 * The longest edge an avatar is stored at.
 *
 * The largest an avatar is ever drawn is 112 CSS px on web and 88 on mobile,
 * so 512 covers every surface past 3x and leaves room for bigger ones later.
 * Uploads were the phone's original file — a 12 MP camera JPEG is 4-6 MB and
 * 4032 px wide, stored and served in full to fill a 96 px circle, and counted
 * against the uploader's storage quota at that size.
 */
const AVATAR_EDGE = 512;

/** Higher than a thumbnail's: this is the only copy, not a stand-in for one. */
const AVATAR_QUALITY = 82;

/**
 * The widest a cover is stored at, and its quality.
 *
 * A cover spans the whole page: 390 pt at 3x on a phone is about 1200 px, and
 * the web profile draws it the width of a laptop screen. 2048 covers both
 * with room, and like an avatar this is the only copy there is.
 */
const COVER_EDGE = 2048;
const COVER_QUALITY = 80;

/**
 * Past this a cover is not decoded at all.
 *
 * Fifty megapixels is more than any phone camera's full frame and a fifth of
 * sharp's own default. MAX_COVER_BYTES bounds the file, not what it unpacks
 * to, and a small PNG can claim a canvas that fills the container's memory.
 */
const COVER_MAX_PIXELS = 50_000_000;

/**
 * How many pixels, every frame counted, an animated thumbnail may decode.
 *
 * A 1080p GIF passes it at about fifty frames. Above it a GIF gets a still of
 * its first frame instead, rather than a decode that holds every frame in
 * memory on the confirm path.
 */
const MAX_ANIMATED_PIXELS = 100_000_000;

/**
 * How many frames an animated thumbnail is made from.
 *
 * The pixel cap alone is not a bound on the work: a hundred thousand frames
 * of two pixels is a fraction of it, and re-encoding them one at a time held
 * a confirm for minutes. Measured on the sharp in this repo, one flat frame
 * per page: 10,000 frames took 1.2 s, 30,000 took 10 s, 60,000 took 53 s and
 * 100,000 took 4.6 minutes — for a 2.5 MB upload. A moving thumbnail is worth
 * a few seconds of motion, not all of it, and 300 frames is ten seconds of a
 * normal GIF. Past it the thumbnail is a still of the first frame, as it is
 * past the pixel cap.
 */
const MAX_ANIMATED_FRAMES = 300;

/**
 * The largest HEIC ffmpeg is asked to decode, in pixels.
 *
 * Read from the file's own header before ffmpeg starts, because the decode
 * holds the image whole three times over: ffmpeg's frame, the PNG it writes,
 * and sharp's copy of that. An iPhone's 48 MP still is well inside this; a
 * file claiming more is refused rather than decoded.
 */
const MAX_STILL_PIXELS = 100_000_000;

/**
 * How long ffmpeg may take over one HEIC on a request path — a confirm, or a
 * photograph added to a portfolio — where somebody is waiting for the answer.
 *
 * An iPhone still decodes in a second or two. One that has not finished in
 * fifteen seconds is not going to finish while they wait, and holding the
 * request open longer only makes the app give up on it instead. The backfill
 * passes a longer one: it reads one file at a time with nobody waiting.
 */
const STILL_DECODE_TIMEOUT_MS = 15_000;

/**
 * How many expensive decodes may run at once in this process: an ffmpeg
 * still, or a GIF re-encoded frame by frame.
 *
 * Each is seconds of CPU and a whole image held in memory, and uploads arrive
 * in bursts — a wedding is two hundred confirms one after another. Two leaves
 * the rest of the box, Postgres and the web servers included, able to work.
 */
const heavyDecodes = new Semaphore(2);

/**
 * Where a HEIC is unpacked, and how old a folder must be to be somebody's
 * leftovers.
 *
 * `pixelsFor` removes its own folder however it ends, so anything still there
 * belongs either to a decode running right now or to a process that was
 * killed mid-decode. Ten minutes tells them apart with room to spare: the
 * longest a live one can hold its folder is the backfill's two-minute ffmpeg
 * timeout. The temp folder is shared — the backfill runs beside the API, and
 * in development so does everything else — so the age is what makes this safe.
 */
const STILL_DIR_PREFIX = 'virgo-still-';
const STALE_STILL_MS = 10 * 60_000;

/**
 * Quality for a display copy.
 *
 * Higher than the thumbnail's 72 because this one is looked AT rather than
 * glanced at — it is what fills the viewer when somebody opens a photograph,
 * and the people opening them are photographers. 80 was chosen for bandwidth
 * and showed it: smeared skin and banded skies, the first things a
 * photographer looks at in their own work. 86 is where WebP stops costing
 * visible detail, at roughly a third more bytes than 80.
 *
 * Still WebP rather than AVIF: AVIF would save perhaps another 30% and costs
 * seconds per image to encode, which on a 200-photo wedding is minutes added
 * to the confirm path.
 */
const DISPLAY_QUALITY = 86;

/**
 * Which generation of display copies a row's `display_version` says it has.
 *
 * Null is a photograph from before this number existed: copies at 1024 and
 * 2048 only, at quality 80, or none at all. DisplayBackfillService makes them
 * again for those, a few a minute; a change to the sizes or the quality that
 * should reach the existing library is a bump here plus a migration that sets
 * the column back to null.
 */
export const DISPLAY_VERSION = 2;

/**
 * Formats a browser and both apps draw from the original as it is.
 *
 * sharp's names for them. Anything else — an iPhone's HEIC, a TIFF — can be
 * shown only through a copy, so its copies are kept even when they come out
 * larger than the original.
 */
const DRAWABLE_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif']);

/**
 * The long edges a source this size gets display copies at, narrowest first.
 *
 * Each of DISPLAY_WIDTHS it is larger than, and then one at its own long edge
 * — up to the last of them — so that every photograph has a copy as sharp as
 * it is. Without that last one, a 1800 px source had only the 1024 copy and a
 * 900 px one had none, and opening either drew something smaller than the
 * photograph stretched to fit, or fell back to the original.
 *
 * Never larger than the source: nothing is gained by enlarging.
 */
export function displaySizesFor(longest: number): number[] {
  if (!Number.isFinite(longest) || longest < 1) return [];
  const own = Math.min(Math.floor(longest), DISPLAY_WIDTHS[DISPLAY_WIDTHS.length - 1]);
  const below = DISPLAY_WIDTHS.filter((size) => size < own);
  return [...below, own];
}

/** `.../abc.jpg` → `.../abc-thumb.webp`, beside the original. */
export function thumbKeyFor(key: string): string {
  return `${key.replace(/\.[^./]+$/, '')}-thumb.webp`;
}

/** A photograph the backfill is making display copies for, as its row has it. */
export interface DisplayRefresh {
  key: string;
  contentType: string | null;
  thumbKey: string | null;
  displayWidths: readonly number[] | null;
  blurDataUrl: string | null;
}

/**
 * What a stored photograph already has.
 *
 * Nothing, for an upload being confirmed. The backfill passes the row, so a
 * photograph from before display copies or previews existed gets the ones it
 * is missing without its thumbnail being made and uploaded a second time.
 */
export interface ExistingDerivatives {
  thumbKey?: string | null;
  displayWidths?: readonly number[] | null;
  blurDataUrl?: string | null;
}

/** Overrides for the one caller that needs other limits than confirm's. */
export interface GenerateOptions {
  /**
   * The largest source to decode. MAX_SOURCE_BYTES when omitted.
   *
   * Raised only by the portfolio backfill, which reads one file at a time in a
   * container of its own rather than on the confirm path of a serving API.
   */
  maxSourceBytes?: number;
  /**
   * How long ffmpeg may take over a HEIC. STILL_DECODE_TIMEOUT_MS when
   * omitted, which is what a request gets.
   *
   * Raised only by the same backfill, for the same reason: there, a slow
   * decode costs a few more seconds of a job nobody is waiting on, where here
   * it costs somebody their upload.
   */
  stillDecodeTimeoutMs?: number;
}

/**
 * Whether a GIF's thumbnail keeps its motion.
 *
 * Both caps bound the decode, not the picture: every frame is held in memory
 * and written again into the animated WebP, on a request path. Exported for
 * the spec, which pins the numbers where a GIF of that shape cannot be built
 * cheaply.
 */
export function animatesThumbnail(meta: {
  pages?: number;
  width?: number;
  height?: number;
}): boolean {
  const pages = meta.pages ?? 1;
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  // A size sharp did not report cannot be measured against the pixel cap, so
  // it takes the cheap branch rather than the unbounded one.
  return (
    pages > 1 &&
    pages <= MAX_ANIMATED_FRAMES &&
    width > 0 &&
    height > 0 &&
    pages * width * height <= MAX_ANIMATED_PIXELS
  );
}

/**
 * The bytes of a GIF worth handing to sharp.
 *
 * All of it when the thumbnail will move; its first frame alone when it will
 * not, because opening a GIF costs sharp a scan of every frame in it and that
 * scan is quadratic in their number (see gif.ts). `mayMove` is false for an
 * avatar, which is one still frame whatever it was made from.
 *
 * A file the walker cannot read goes to sharp whole, exactly as before.
 */
function gifToDecode(source: Buffer, mayMove: boolean): Buffer {
  const shape = gifShape(source);
  if (!shape) return source;
  const moves =
    mayMove &&
    animatesThumbnail({ pages: shape.frames, width: shape.width, height: shape.height });
  return moves ? source : gifFirstFrame(source, shape);
}

/**
 * Clears out the unpacked stills a killed process left behind.
 *
 * Each folder holds a whole HEIC and the PNG it became, so a container that
 * is killed mid-decode — out of memory, or a deploy — leaves a few hundred
 * megabytes nothing will ever collect. Only folders older than any live
 * decode could be are touched; see STALE_STILL_MS.
 *
 * Never throws: one that cannot be removed now is tried again at the next
 * start, and nothing about serving depends on it.
 */
export async function removeStaleStills(
  root: string,
  olderThan: number,
  logger: Logger,
): Promise<number> {
  let names: string[];
  try {
    names = (await readdir(root)).filter((name) => name.startsWith(STILL_DIR_PREFIX));
  } catch (err) {
    logger.warn(`Could not read ${root} for stale stills: ${String(err)}`);
    return 0;
  }

  let removed = 0;
  for (const name of names) {
    const folder = join(root, name);
    try {
      const info = await stat(folder);
      if (!info.isDirectory() || info.mtimeMs >= olderThan) continue;
      await rm(folder, { recursive: true, force: true });
      removed += 1;
    } catch (err) {
      logger.warn(`Could not remove the stale still ${folder}: ${String(err)}`);
    }
  }
  if (removed > 0) {
    logger.log(`Removed ${removed} unpacked still(s) a stopped decode left in ${root}`);
  }
  return removed;
}

/** A normalised profile photo, as it is now stored. */
export interface NormalisedPhoto {
  size: number;
  contentType: string;
  width: number;
  height: number;
}

@Injectable()
export class ThumbnailsService implements OnModuleInit {
  private readonly logger = new Logger(ThumbnailsService.name);

  /** Thumbnails being made right now, by key. See `generateOnce`. */
  private readonly inFlight = new Map<string, Promise<string | null>>();

  constructor(
    private readonly storage: StorageService,
    private readonly db: DatabaseService,
    private readonly mediaLink: MediaLinkService,
  ) {}

  /** Collects what a process killed mid-decode left in the temp folder. */
  async onModuleInit(): Promise<void> {
    await removeStaleStills(tmpdir(), Date.now() - STALE_STILL_MS, this.logger);
  }

  /**
   * Whether a confirm is making a thumbnail in this process right now.
   *
   * The backfill waits while one is: somebody is watching that upload, and
   * nobody is waiting on the backfill.
   */
  get busy(): boolean {
    return this.inFlight.size > 0;
  }

  /**
   * `generate` for a confirm, which a client may send more than once.
   *
   * A confirm starts the thumbnail in the background, and a client that
   * retries its confirm would otherwise have the same original read out of
   * B2, decoded and re-encoded a second time — which is how a retry loop
   * turns into a queue of decodes. A file already processed with its
   * thumbnail is left alone, and a second request for one being made right
   * now joins that run instead of repeating it.
   *
   * Only the confirm path. The backfill and the portfolio say for themselves
   * what a file already has.
   */
  generateOnce(
    key: string,
    contentType: string | null,
    sizeBytes: number,
  ): Promise<string | null> {
    const running = this.inFlight.get(key);
    if (running) return running;

    const made = this.generateUnlessDone(key, contentType, sizeBytes).finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, made);
    return made;
  }

  private async generateUnlessDone(
    key: string,
    contentType: string | null,
    sizeBytes: number,
  ): Promise<string | null> {
    // A read that fails is not an answer, so it falls through to generating,
    // which is what this did before there was a check at all.
    const row = await this.db
      .queryOne<{ thumb_key: string | null; processing_status: string | null }>(
        'select thumb_key, processing_status from user_files where key = $1',
        [key],
      )
      .catch(() => null);
    if (row?.thumb_key && row.processing_status === 'ready') return row.thumb_key;

    return this.generate(key, contentType, sizeBytes);
  }

  /**
   * Makes a thumbnail for one stored image and records it.
   *
   * Never throws. A file that sharp cannot decode — a CMYK TIFF, a truncated
   * upload, something whose extension lies about its contents — must leave the
   * upload succeeded and the gallery falling back to the original. Losing the
   * thumbnail costs bandwidth; losing the upload costs the photograph.
   *
   * Anything in `existing` is kept rather than made again. Display copies
   * count only when there is at least one: an empty list is also what a
   * photograph confirmed before the media host was configured was left with,
   * and with the source already in memory, trying again costs a resize rather
   * than a read.
   *
   * The thumbnail is written whatever its size. It used to be skipped when it
   * came out no smaller than the original, which is right for bandwidth and
   * wrong for what a thumbnail is now also for: it is the EXIF-free copy a
   * public profile shows, and a photograph without one is left off it.
   *
   * Returns the key it wrote, or null if it declined or failed.
   */
  async generate(
    key: string,
    contentType: string | null,
    sizeBytes: number,
    existing: ExistingDerivatives = {},
    options: GenerateOptions = {},
  ): Promise<string | null> {
    if (!contentType?.startsWith('image/')) return null;
    if (sizeBytes > (options.maxSourceBytes ?? MAX_SOURCE_BYTES)) {
      // Too big to decode, but not too big to date: the grid still needs to
      // know which day it belongs under.
      const takenAt = await this.storage
        .readHead(key, EXIF_HEAD_BYTES)
        .then((head) => takenAtFromHead(head))
        .catch(() => null);
      await this.db.query(
        `update user_files
            set processing_status = 'ready', next_processing_at = null,
                taken_at = coalesce($2::timestamp, taken_at),
                processed_at = now()
          where key = $1`,
        [key, takenAt],
      );
      return null;
    }

    try {
      const { source, metadata, pixels, decoded, width, height } = await this.decode(
        key,
        contentType,
        options.stillDecodeTimeoutMs,
      );
      // From the original, since a decoded still carries no EXIF. sharp
      // reports it for most formats; a TIFF keeps it in its own directories
      // instead, which the header reader covers.
      const takenAt = takenAtFromExif(metadata.exif) ?? takenAtFromHead(source);
      let thumbKey: string | null = null;

      if (!existing.thumbKey) {
        const body = await this.thumbnail(pixels, contentType, decoded);
        thumbKey = thumbKeyFor(key);
        await this.storage.putDerived(thumbKey, body, THUMB_CONTENT_TYPE);
      }

      // Null leaves the recorded widths as they are, and so does the version
      // beside them. A GIF gets none: a display copy is a still, and the
      // viewer would open it in place of the animation.
      let displayWidths: number[] | null = null;
      if (!existing.displayWidths?.length) {
        displayWidths =
          contentType === 'image/gif'
            ? []
            : await this.createDisplayCopies(key, pixels, width, height, sizeBytes, {
                keepLarger: !DRAWABLE_FORMATS.has(metadata.format ?? ''),
              });
      }

      // From the same buffer, while it is still decoded and in hand. An
      // animated GIF gets one too: a still first frame is a better stand-in
      // than a grey box, and nobody sees it for long enough to notice it is
      // not moving.
      const blur = existing.blurDataUrl ? null : await blurDataUrl(pixels);

      await this.db.query(
        `update user_files
            set thumb_key = coalesce($2, thumb_key),
                width_px = $3,
                height_px = $4,
                display_widths = coalesce($5, display_widths),
                blur_data_url = coalesce($6, blur_data_url),
                taken_at = coalesce($7::timestamp, taken_at),
                display_version = coalesce($8::smallint, display_version),
                processing_status = 'ready',
                next_processing_at = null,
                processed_at = now()
          where key = $1`,
        [
          key,
          thumbKey,
          width ?? null,
          height ?? null,
          displayWidths,
          blur,
          takenAt,
          displayWidths ? DISPLAY_VERSION : null,
        ],
      );
      return thumbKey;
    } catch (err) {
      await this.db.query(
        `update user_files
            set processing_status = 'failed', next_processing_at = null,
                processed_at = now()
          where key = $1`,
        [key],
      );
      this.logger.warn(
        `Thumbnail failed for ${key}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  /**
   * Makes a stored photograph's display copies again, at today's sizes and
   * quality, and records them. For DisplayBackfillService.
   *
   * Unlike `generate`, copies the row already has are replaced rather than
   * kept — they are what is being upgraded — while a thumbnail or a preview
   * it already has is kept, because neither changed. A width the old set had
   * and the new one does not is removed from the volume once the row stops
   * naming it.
   *
   * Throws when the original cannot be read or decoded, for the caller to
   * count against the file; it does not touch `processing_status`, which says
   * what happened on upload and is not this method's to change.
   *
   * Returns the sizes it recorded, or null when the row was deleted while this
   * was working — in which case whatever it wrote is removed again, since the
   * delete that took the row has already been through the volume.
   */
  async refreshDisplayCopies(
    file: DisplayRefresh,
    sizeBytes: number,
    options: Pick<GenerateOptions, 'stillDecodeTimeoutMs'> = {},
  ): Promise<number[] | null> {
    if (!this.mediaLink.isConfigured) {
      throw new Error('The media host is not configured, so there is nowhere to write copies');
    }
    const { key, contentType } = file;
    if (!contentType?.startsWith('image/')) {
      throw new Error(`${key} is ${contentType ?? 'of no type'}, not a photograph`);
    }

    const { metadata, pixels, decoded, width, height } = await this.decode(
      key,
      contentType,
      options.stillDecodeTimeoutMs,
    );

    let thumbKey: string | null = null;
    if (!file.thumbKey) {
      const body = await this.thumbnail(pixels, contentType, decoded);
      thumbKey = thumbKeyFor(key);
      await this.storage.putDerived(thumbKey, body, THUMB_CONTENT_TYPE);
    }

    const widths =
      contentType === 'image/gif'
        ? []
        : ((await this.createDisplayCopies(key, pixels, width, height, sizeBytes, {
            keepLarger: !DRAWABLE_FORMATS.has(metadata.format ?? ''),
          })) ?? []);
    const blur = file.blurDataUrl ? null : await blurDataUrl(pixels);

    // The size is written with the copies because the clients choose a copy
    // by it: a row probed by ffprobe before this service existed can hold a
    // camera's sideways dimensions, and these copies are upright.
    const row = await this.db.queryOne<{ key: string }>(
      `update user_files
          set display_widths = $2,
              display_version = $3,
              thumb_key = coalesce(thumb_key, $4),
              blur_data_url = coalesce(blur_data_url, $5),
              width_px = coalesce($6, width_px),
              height_px = coalesce($7, height_px)
        where key = $1
        returning key`,
      [key, widths, DISPLAY_VERSION, thumbKey, blur, width ?? null, height ?? null],
    );

    if (!row) {
      // Deleted mid-way. The delete has been through the volume already, and
      // these were written after it looked.
      await this.mediaLink.removeFor([key]);
      if (thumbKey) {
        // Said rather than deleted: there is no way to remove a bucket object
        // here without an owner to check, and it is one 40 KB file.
        this.logger.warn(`${key} was deleted while its thumbnail was made; ${thumbKey} may be left in the bucket`);
      }
      return null;
    }

    const stale = (file.displayWidths ?? []).filter((width) => !widths.includes(width));
    if (stale.length) await this.mediaLink.removeDisplayCopies(key, stale);
    return widths;
  }

  /**
   * Reads an original and decodes it as far as every derivative needs.
   *
   * `pixels` is what everything is made from: the original, or for an
   * iPhone's HEIC a still ffmpeg decoded, since sharp here cannot. A GIF
   * whose thumbnail cannot move is cut to its first frame before sharp is
   * asked anything about it, because opening one costs a scan of every frame
   * in it. `width` and `height` are upright, EXIF orientation applied.
   */
  private async decode(
    key: string,
    contentType: string,
    stillDecodeTimeoutMs?: number,
  ): Promise<{
    source: Buffer;
    metadata: Metadata;
    pixels: Buffer;
    decoded: Metadata;
    width: number | undefined;
    height: number | undefined;
  }> {
    const source = await this.readAll(key);
    const decodable = contentType === 'image/gif' ? gifToDecode(source, true) : source;
    const metadata = await sharp(decodable, { failOn: 'none' }).metadata();
    const pixels = await this.pixelsFor(key, decodable, metadata, stillDecodeTimeoutMs);
    const decoded =
      pixels === decodable ? metadata : await sharp(pixels, { failOn: 'none' }).metadata();
    const rotated = (decoded.orientation ?? 1) >= 5;
    return {
      source,
      metadata,
      pixels,
      decoded,
      width: rotated ? decoded.height : decoded.width,
      height: rotated ? decoded.width : decoded.height,
    };
  }

  /**
   * The 640 px WebP for one decoded image.
   *
   * A GIF keeps its motion as an animated WebP of every frame, unless there
   * are more of them than MAX_ANIMATED_FRAMES or they cost more than
   * MAX_ANIMATED_PIXELS to decode, when it gets a still of the first instead.
   * Either way it is a re-encode, so none of the source's metadata comes with
   * it. Frame by frame is the expensive one, so it waits its turn.
   */
  private thumbnail(
    pixels: Buffer,
    contentType: string,
    meta: Metadata,
  ): Promise<Buffer> {
    const inside = { fit: 'inside', withoutEnlargement: true } as const;
    if (contentType === 'image/gif') {
      const animated = animatesThumbnail(meta);
      const encode = () =>
        sharp(pixels, { animated, failOn: 'none' })
          .resize(THUMB_EDGE, THUMB_EDGE, inside)
          .webp({ quality: 72 })
          .toBuffer();
      return animated ? heavyDecodes.run(encode) : encode();
    }
    return sharp(pixels, { failOn: 'none' })
      .rotate()
      .resize(THUMB_EDGE, THUMB_EDGE, inside)
      .webp({ quality: 72 })
      .toBuffer();
  }

  /**
   * Pixels sharp can read, for a source it may not be able to.
   *
   * The prebuilt sharp in the image reads HEIF only when it is AVIF, and an
   * iPhone photo is HEIF with HEVC inside, picked at full quality and
   * uploaded as it is. For those, ffmpeg (already in the image, and already
   * decoding HEVC for film posters) makes a PNG first.
   *
   * The PNG has to come out exactly the size sharp read from the file's own
   * header. Anything else is one 512 px tile of a gridded HEIC, or a frame
   * that was not turned the way the header says, and it is refused rather
   * than guessed at: a thumbnail of one corner of a photograph is worse than
   * none.
   *
   * What it costs is bounded three ways: the header's own pixel count is
   * checked before ffmpeg is started at all, the decode is given a timeout
   * that belongs to the caller — a request's, or the backfill's longer one —
   * and only two of these run at once across the process.
   *
   * Every other source comes back untouched.
   */
  private async pixelsFor(
    key: string,
    source: Buffer,
    meta: Metadata,
    timeoutMs: number = STILL_DECODE_TIMEOUT_MS,
  ): Promise<Buffer> {
    if (meta.format !== 'heif' || meta.compression !== 'hevc') return source;

    // From the header, before a decoder is handed anything. A file claiming
    // more pixels than any camera makes is refused rather than unpacked, and
    // one claiming none cannot be checked against what comes back.
    const pixels = (meta.width ?? 0) * (meta.height ?? 0);
    if (!pixels || pixels > MAX_STILL_PIXELS) {
      throw new Error(
        `${key} says it is ${meta.width}x${meta.height}: too large to decode a still from`,
      );
    }

    return heavyDecodes.run(async () => {
      const dir = await mkdtemp(join(tmpdir(), STILL_DIR_PREFIX));
      try {
        const input = join(dir, 'in.heic');
        const output = join(dir, 'out.png');
        await writeFile(input, source);
        await run('ffmpeg', ['-v', 'error', '-i', input, '-frames:v', '1', '-y', output], {
          timeout: timeoutMs,
          // Killed outright rather than asked to stop, so the timeout is a
          // bound even on a frame it is in the middle of.
          killSignal: 'SIGKILL',
        });
        const png = await readFile(output);
        const still = await sharp(png, { failOn: 'none' }).metadata();
        if (still.width !== meta.width || still.height !== meta.height) {
          throw new Error(
            `ffmpeg decoded ${key} at ${still.width}x${still.height}, not ${meta.width}x${meta.height}`,
          );
        }
        return png;
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  }

  /**
   * Intermediate copies for viewing, on the media volume.
   *
   * Opening a photograph has always served the ORIGINAL — a 6 MB camera JPEG,
   * or a 40 MB TIFF, to fill a viewport about 1400 px wide, pulled from a
   * bucket in California. These are what the viewer gets instead.
   *
   * Generated here rather than on demand because the expensive part is
   * already paid: `generate` has just read the whole original out of B2 and
   * `source` is that buffer. A resize from memory is noise next to the fetch
   * that produced it, and an on-demand resizer would have to make that same
   * trans-Pacific fetch again, per size, while somebody waited.
   *
   * The sizes are `displaySizesFor` the source's long edge: the fixed ones it
   * is larger than, and one at its own long edge up to the largest, each named
   * by its long edge.
   *
   * Never throws. A missing display copy costs bandwidth; a thrown one would
   * cost the upload, and the photograph is worth more than the optimisation.
   * Returns the sizes actually written, which may be fewer than asked for or
   * none at all — or null when the media host is not configured and nothing
   * was tried, so the row can say it is still owed its copies.
   */
  private async createDisplayCopies(
    key: string,
    source: Buffer,
    width: number | undefined,
    height: number | undefined,
    sizeBytes: number,
    { keepLarger }: { keepLarger: boolean },
  ): Promise<number[] | null> {
    if (!this.mediaLink.isConfigured) return null;

    // Without dimensions there is no way to tell which sizes would be an
    // enlargement, and guessing produces a 2048 copy of a 900 px scan that is
    // larger than the thing it replaces.
    const longest = Math.max(width ?? 0, height ?? 0);
    if (!longest) return [];

    const written: number[] = [];
    for (const target of displaySizesFor(longest)) {
      try {
        const body = await sharp(source, { failOn: 'none' })
          .rotate()
          .resize(target, target, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: DISPLAY_QUALITY })
          .toBuffer();

        // The same guard the thumbnail once had: a "smaller" copy that is not
        // smaller is pure cost, and PNG screenshots hit this regularly. Not
        // for a HEIC or a TIFF, though, which nothing can draw as it is — for
        // those a copy is the only way the photograph is seen at all.
        if (!keepLarger && body.length >= sizeBytes) continue;

        await this.mediaLink.write(displayKeyFor(key, target), body);
        written.push(target);
      } catch (err) {
        this.logger.warn(
          `Display copy ${target} failed for ${key}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return written;
  }

  /**
   * Shrinks a just-uploaded avatar in place.
   *
   * Rewrites the same key rather than writing a resized copy beside it. The
   * `publicUrl` was handed to the client when the upload was presigned and is
   * about to be stored in `users.avatar_url`, so the bytes behind that URL are
   * what has to change. The original is not kept — an avatar has no use for a
   * 4032 px master, and keeping one is what the quota was being spent on.
   *
   * Always rewrites, even when the WebP comes out larger. It used to skip an
   * avatar that was already small, and that skip is what left a camera's
   * EXIF, GPS included, on a picture shown on every public profile. The
   * re-encode is what removes it.
   *
   * Runs on the server so it applies to every client, including the app builds
   * already installed on people's phones that will never resize before upload.
   *
   * Idempotent: a row already stored as a WebP with its dimensions recorded
   * was normalised by an earlier confirm, and is returned as it is rather than
   * encoded again under a key a cache may already hold.
   *
   * Never throws. Returns what is now stored, or null if it declined or
   * failed, and the caller then deletes an avatar it could not make safe.
   */
  async normaliseAvatar(
    key: string,
    contentType: string | null,
    sizeBytes: number,
  ): Promise<{ size: number; contentType: string } | null> {
    if (!contentType?.startsWith('image/')) return null;
    if (sizeBytes > MAX_SOURCE_BYTES) return null;

    try {
      const stored = await this.normalised(key);
      if (stored) return { size: stored.size, contentType: stored.contentType };

      const source = await this.readAll(key);
      // An avatar is one still frame at 512 px whatever it was made from, so
      // a GIF is cut to its first rather than scanned whole (see gif.ts).
      const decodable =
        contentType === 'image/gif' ? gifToDecode(source, false) : source;
      const metadata = await sharp(decodable, { failOn: 'none' }).metadata();
      const pixels = await this.pixelsFor(key, decodable, metadata);
      const { data, info } = await sharp(pixels, { failOn: 'none' })
        .rotate()
        .resize(AVATAR_EDGE, AVATAR_EDGE, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: AVATAR_QUALITY })
        .toBuffer({ resolveWithObject: true });

      await this.storage.putDerived(key, data, THUMB_CONTENT_TYPE);
      // The quota was recorded from the uploaded size a moment ago. Left
      // alone, the user goes on paying for bytes that are no longer there.
      // The dimensions are what make the next confirm of this key a no-op.
      await this.db.query(
        `update user_files
            set size_bytes = $2, content_type = $3, width_px = $4, height_px = $5
          where key = $1`,
        [key, data.length, THUMB_CONTENT_TYPE, info.width, info.height],
      );
      return { size: data.length, contentType: THUMB_CONTENT_TYPE };
    } catch (err) {
      this.logger.warn(
        `Avatar resize failed for ${key}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  /**
   * Re-encodes a just-uploaded cover in place, as a WebP at most 2048 px wide.
   *
   * The avatar's rule without its old exception: the rewrite always happens,
   * larger or not, because it is what removes the camera's EXIF and GPS from
   * an image that is about to sit at a permanent public URL. The phone has
   * already cropped it to the cover's shape, so this only resizes.
   *
   * Idempotent in the same way as normaliseAvatar, and never throws. Null
   * means the caller must delete the upload: an original that could not be
   * re-encoded must not stay public.
   */
  async normaliseCover(
    key: string,
    contentType: string | null,
    sizeBytes: number,
  ): Promise<NormalisedPhoto | null> {
    if (!contentType?.startsWith('image/') || contentType === 'image/gif') return null;
    if (sizeBytes > MAX_COVER_BYTES) return null;

    try {
      const stored = await this.normalised(key);
      if (stored) return stored;

      const source = await this.readAll(key);
      const { data, info } = await sharp(source, {
        failOn: 'none',
        limitInputPixels: COVER_MAX_PIXELS,
      })
        .rotate()
        .resize(COVER_EDGE, COVER_EDGE, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: COVER_QUALITY })
        .toBuffer({ resolveWithObject: true });

      // Always written back, even when larger: the re-encode is what drops
      // EXIF/GPS. The type and the dimensions go in one statement, so setCover
      // can never see the one without the other.
      await this.storage.putDerived(key, data, THUMB_CONTENT_TYPE);
      await this.db.query(
        `update user_files
            set size_bytes = $2, content_type = $3, width_px = $4, height_px = $5
          where key = $1`,
        [key, data.length, THUMB_CONTENT_TYPE, info.width, info.height],
      );
      return {
        size: data.length,
        contentType: THUMB_CONTENT_TYPE,
        width: info.width,
        height: info.height,
      };
    } catch (err) {
      this.logger.warn(
        `Cover normalise failed for ${key}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  /**
   * What an earlier confirm already made of this profile photo, if anything.
   *
   * WebP with its dimensions recorded is the mark of a finished rewrite. The
   * type alone is not: a client may declare image/webp for anything, and the
   * dimensions stay null until a normalise writes them.
   */
  private async normalised(key: string): Promise<NormalisedPhoto | null> {
    const row = await this.db.queryOne<{
      content_type: string | null;
      width_px: number | null;
      height_px: number | null;
      size_bytes: string | number;
    }>(
      'select content_type, width_px, height_px, size_bytes from user_files where key = $1',
      [key],
    );
    if (!row || row.content_type !== THUMB_CONTENT_TYPE || row.width_px === null) {
      return null;
    }
    return {
      size: Number(row.size_bytes),
      contentType: THUMB_CONTENT_TYPE,
      width: row.width_px,
      height: row.height_px ?? 0,
    };
  }

  /**
   * `rotate()` above is not decoration.
   *
   * A phone writes the sensor orientation to EXIF rather than rotating pixels.
   * Resizing without applying it produces a sideways thumbnail next to an
   * upright original, which reads as a bug in the gallery rather than in the
   * photograph.
   */
  private async readAll(key: string): Promise<Buffer> {
    const stream = await this.storage.readStream(key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
    }
    return Buffer.concat(chunks);
  }
}
