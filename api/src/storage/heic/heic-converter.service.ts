import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp, { type Metadata } from 'sharp';
import { DatabaseService } from '../../database/database.service';
import { DownloadCacheService } from '../download-cache.service';
import { Semaphore } from '../semaphore';
import { StorageConfig } from '../storage.config';
import { StorageService } from '../storage.service';
import { decodeHeic, type DecodedHeic } from './heic-decoder';
import { isHeifType, jpegName, tiffFromExif, uprightTiff, withJpegMetadata } from './jpeg-metadata';

/**
 * HEIC and HEIF photographs, stored as JPEGs instead.
 *
 * An iPhone saves its photos as HEIC, and Android, Windows and most browsers
 * cannot open one: a client's delivery downloaded as files their phone would
 * not show, and a client link drew nothing where the preview should be. So
 * each is decoded once at its full size and written back under the same key
 * as a JPEG that every device opens.
 *
 * The JPEG is made to be looked at closely, because the people looking are
 * photographers and their clients:
 *
 *   - every pixel of the original, at its full resolution — libheif reads the
 *     whole tile grid an iPhone stores a photo as, and the result is refused
 *     unless it is exactly the size the file says it is;
 *   - quality JPEG_QUALITY with full-resolution colour (4:4:4), so fine
 *     edges and saturated colours stay as sharp as they were;
 *   - the camera's colour profile, so a Display P3 photo's colours are the
 *     ones the iPhone showed, and its EXIF, set upright, so the date, camera
 *     and lens come along and nothing turns it a second time.
 *
 * What does not come along is an iPhone photo's HDR gain map: a JPEG has
 * nowhere to keep one, so a bright HDR highlight is shown as the standard
 * image every non-HDR screen already showed.
 *
 * The key stays as it was (it ends in .heic) because eight tables point at
 * it and none would follow a rename. The type, size and name change, and
 * every download names the file from those (deliveryName, storedDisplayName).
 */

/**
 * JPEG quality for a converted photograph.
 *
 * 95 with 4:4:4 colour: past the point where a re-encode can be told from the
 * decoded original side by side at 100%, which is how photographers look.
 * The cost is size — two to three times the HEIC, since HEVC simply
 * compresses better — and it counts against the owner's storage like any
 * file. That trade was chosen: the JPEG is what clients download.
 */
export const JPEG_QUALITY = 95;

/**
 * The largest photograph converted, in pixels.
 *
 * Read from the header before anything is decoded. A decode holds the image
 * whole several times over — libheif's planes, the pixels it returns, and
 * sharp's encode — so this bounds memory on a box that also runs Postgres.
 * An iPhone's 48 MP still (8064 x 6048) is inside it; a file claiming more is
 * left as a HEIC, with the previews it already has.
 */
export const MAX_CONVERT_PIXELS = 64_000_000;

/** Tries per file before it is given up on. */
export const MAX_HEIC_ATTEMPTS = 5;

/** How long a claim is held before another process may take the file. */
export const HEIC_LEASE_MINUTES = 15;

/** How long the replaced HEIC is kept in the bucket, as a way back. */
export const KEEP_REPLACED_DAYS = 7;

/**
 * How many photographs are decoded and encoded at once in this process.
 *
 * Two: each is a couple of seconds of one core, and the box also runs
 * Postgres and the web servers. Only the decode and the encode hold a slot;
 * the upload of the JPEG to the bucket, which is mostly waiting, does not.
 */
const conversions = new Semaphore(2);

/**
 * Of those, how many may be large at once. A 48 MP photo holds about half a
 * gigabyte while it is decoded and encoded; two side by side is more memory
 * than one conversion is worth.
 */
const largeConversions = new Semaphore(1);

/** Past this many pixels a conversion counts as large. */
const LARGE_PIXELS = 24_000_000;

/** What a conversion stored, for the caller to make previews from. */
export interface ConvertedJpeg {
  jpeg: Buffer;
  width: number;
  height: number;
}

/**
 * The JPEG for decoded pixels, with the source's EXIF and colour profile.
 *
 * sharp is handed the pixels as they are and asked for no metadata, so no
 * colour conversion happens on the way; the profile is then written in as
 * bytes (see jpeg-metadata.ts). A photo with transparency, which HEIC allows
 * and JPEG does not, is laid on white.
 */
export async function jpegFromDecoded(
  decoded: DecodedHeic,
  source: { exif?: Buffer; icc?: Buffer },
): Promise<Buffer> {
  let pipeline = sharp(decoded.pixels, {
    raw: { width: decoded.width, height: decoded.height, channels: decoded.channels },
    limitInputPixels: MAX_CONVERT_PIXELS,
  });
  if (decoded.channels === 4) pipeline = pipeline.flatten({ background: '#ffffff' });
  const plain = await pipeline
    .jpeg({ quality: JPEG_QUALITY, chromaSubsampling: '4:4:4', optimiseCoding: true })
    .toBuffer();

  const tiff = tiffFromExif(source.exif);
  return withJpegMetadata(plain, {
    tiff: tiff ? uprightTiff(tiff) : null,
    icc: source.icc ?? null,
  });
}

/**
 * Whether decoded pixels are the whole photograph the header describes.
 *
 * The same size, or the same size turned a quarter: libheif applies the
 * file's rotation, and readers disagree about whether a header's size is
 * before or after it. Anything else — one 512 px tile of a grid, a frame cut
 * short — is not the photograph, and is refused rather than stored in its
 * place.
 */
export function isWholePicture(
  decoded: { width: number; height: number },
  header: { width?: number; height?: number },
): boolean {
  const { width, height } = header;
  if (!width || !height) return false;
  return (
    (decoded.width === width && decoded.height === height) ||
    (decoded.width === height && decoded.height === width)
  );
}

@Injectable()
export class HeicConverter {
  private readonly logger = new Logger(HeicConverter.name);

  /** Off with HEIC_TO_JPEG=off: HEICs are then left as they are, as before. */
  readonly enabled: boolean;

  constructor(
    private readonly storage: StorageService,
    private readonly db: DatabaseService,
    private readonly cache: DownloadCacheService,
    private readonly storageConfig: StorageConfig,
    config: ConfigService,
  ) {
    this.enabled = config.get<string>('HEIC_TO_JPEG', 'on').trim().toLowerCase() !== 'off';
  }

  /**
   * Whether a stored file is one to convert: HEIC or HEIF by its recorded
   * type, in the private bucket. A public one (an avatar, a cover) is
   * re-encoded to WebP on confirm already and never reaches here as HEIC.
   */
  wants(key: string, contentType: string | null | undefined): boolean {
    return this.enabled && isHeifType(contentType) && !this.storageConfig.isPublicKey(key);
  }

  /**
   * Takes one file for conversion, if nothing else holds it.
   *
   * For a confirm, which has just read the file and would rather convert it
   * now than leave it for the sweep. The sweep takes its own files the same
   * way (HeicSweepService), so the two never convert one file at once.
   */
  async claim(key: string): Promise<{ attempts: number } | null> {
    return this.db.queryOne<{ attempts: number }>(
      `update user_files
          set heic_attempts = heic_attempts + 1,
              heic_next_at = now() + ($2 * interval '1 minute')
        where key = $1
          and content_type in ('image/heic', 'image/heif')
          and heic_attempts < $3
          and coalesce(heic_next_at, '-infinity') <= now()
        returning heic_attempts as attempts`,
      [key, HEIC_LEASE_MINUTES, MAX_HEIC_ATTEMPTS],
    );
  }

  /**
   * Replaces a claimed HEIC with its JPEG.
   *
   * `source` is the file's bytes and `header` what sharp read from them;
   * the caller has both already. Throws when the file cannot be converted,
   * for the caller to record with `fail`; nothing has changed then, in the
   * bucket or the row. Returns null when the row was deleted while this
   * worked, after taking back the JPEG it wrote.
   */
  async convert(
    key: string,
    source: Buffer,
    header: Metadata,
    timeoutMs: number,
  ): Promise<ConvertedJpeg | null> {
    const pixels = (header.width ?? 0) * (header.height ?? 0);
    if (!pixels) throw new Error('its header gives no size to check the decode against');
    if (pixels > MAX_CONVERT_PIXELS) {
      throw new Error(`it is ${header.width}x${header.height}, larger than a conversion is allowed`);
    }

    const encode = async () => {
      const decoded = await decodeHeic(source, timeoutMs);
      if (!isWholePicture(decoded, header)) {
        throw new Error(
          `libheif decoded ${decoded.width}x${decoded.height}, not the ${header.width}x${header.height} the file says`,
        );
      }
      const jpeg = await jpegFromDecoded(decoded, { exif: header.exif, icc: header.icc });
      // Read back before anything is replaced: the bytes about to stand in
      // for the photograph must open as a JPEG of the whole of it.
      const check = await sharp(jpeg).metadata();
      if (check.format !== 'jpeg' || check.width !== decoded.width || check.height !== decoded.height) {
        throw new Error(`the JPEG read back as ${check.format} ${check.width}x${check.height}`);
      }
      return { jpeg, width: decoded.width, height: decoded.height };
    };
    const { jpeg, width, height } = await conversions.run(() =>
      pixels > LARGE_PIXELS ? largeConversions.run(encode) : encode(),
    );

    const row = await this.db.queryOne<{ original_name: string | null }>(
      `select original_name from user_files
        where key = $1 and content_type in ('image/heic', 'image/heif')`,
      [key],
    );
    if (!row) return null;

    const replaced = await this.storage.replaceOriginal(key, jpeg, 'image/jpeg', source.length);
    const name = jpegName(row.original_name ?? key.split('/').pop() ?? key);

    const updated = await this.db.transaction(async (client) => {
      const result = await client.query<{ key: string }>(
        `update user_files
            set content_type = 'image/jpeg',
                size_bytes = $2,
                etag = coalesce($3, etag),
                source_name = coalesce(source_name, original_name, $4),
                source_size_bytes = coalesce(source_size_bytes, size_bytes),
                source_content_type = coalesce(source_content_type, content_type),
                original_name = $5,
                converted_at = now(),
                heic_next_at = null,
                heic_error = null
          where key = $1
            and content_type in ('image/heic', 'image/heif')
          returning key`,
        [key, jpeg.length, replaced.etag, key.split('/').pop() ?? key, name],
      );
      if (result.rowCount === 0) return false;
      if (replaced.previousVersionId) {
        await client.query(
          `insert into replaced_versions (key, version_id, purge_at)
           values ($1, $2, now() + ($3 * interval '1 day'))
           on conflict (key, version_id) do nothing`,
          [key, replaced.previousVersionId, KEEP_REPLACED_DAYS],
        );
      }
      return true;
    });

    // A cached copy of the HEIC must not be served under the JPEG's size.
    await this.cache.forget(key);

    if (!updated) {
      // Deleted while this worked: the delete has been through the bucket
      // already, and the JPEG was written after it looked.
      await this.storage.deleteKeys([key], 'converted after its row was deleted');
      if (replaced.previousVersionId) {
        await this.storage.deleteVersion(key, replaced.previousVersionId).catch(() => false);
      }
      return null;
    }

    this.logger.log(
      `Stored ${key} as a JPEG: ${width}x${height}, ${source.length} -> ${jpeg.length} bytes`,
    );
    return { jpeg, width, height };
  }

  /**
   * Records a failed conversion: tried again later, or given up on after
   * MAX_HEIC_ATTEMPTS. Either way the file stays the HEIC it was, with the
   * previews it has. Never throws; a lease that is not released runs out.
   */
  async fail(key: string, attempts: number, detail: string): Promise<void> {
    const exhausted = attempts >= MAX_HEIC_ATTEMPTS;
    try {
      await this.db.query(
        `update user_files
            set heic_next_at = case when $2 then null else now() + ($3 * interval '1 minute') end,
                heic_error = $4
          where key = $1`,
        [key, exhausted, heicRetryDelayMinutes(attempts), detail.slice(0, 500)],
      );
    } catch (error) {
      this.logger.warn(
        `Could not record a failed conversion for ${key}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    this.logger.warn(`HEIC to JPEG ${exhausted ? 'given up' : 'will retry'} for ${key}: ${detail.slice(0, 240)}`);
  }
}

/**
 * Minutes before a failed conversion is tried again: ten, then forty, then
 * about two and a half hours, then ten. Long enough that a B2 outage does
 * not use up every file's tries while it lasts.
 */
export function heicRetryDelayMinutes(attempts: number): number {
  return 10 * 4 ** Math.max(0, attempts - 1);
}
