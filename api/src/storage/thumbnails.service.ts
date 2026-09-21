import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { DatabaseService } from '../database/database.service';
import { blurDataUrl } from './blur';
import {
  DISPLAY_WIDTHS,
  MediaLinkService,
  displayKeyFor,
} from './media-link.service';
import { StorageService } from './storage.service';

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
 * Quality for a display copy.
 *
 * Higher than the thumbnail's 72 because this one is looked AT rather than
 * glanced at — it is what fills the viewer when somebody opens a photograph.
 * Still WebP rather than AVIF: AVIF would save perhaps another 30% and costs
 * seconds per image to encode, which on a 200-photo wedding is minutes added
 * to the confirm path.
 */
const DISPLAY_QUALITY = 80;

/** `.../abc.jpg` → `.../abc-thumb.webp`, beside the original. */
export function thumbKeyFor(key: string): string {
  return `${key.replace(/\.[^./]+$/, '')}-thumb.webp`;
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

@Injectable()
export class ThumbnailsService {
  private readonly logger = new Logger(ThumbnailsService.name);

  constructor(
    private readonly storage: StorageService,
    private readonly db: DatabaseService,
    private readonly mediaLink: MediaLinkService,
  ) {}

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
   * Returns the key it wrote, or null if it declined or failed.
   */
  async generate(
    key: string,
    contentType: string | null,
    sizeBytes: number,
    existing: ExistingDerivatives = {},
  ): Promise<string | null> {
    if (!contentType?.startsWith('image/')) return null;
    if (sizeBytes > MAX_SOURCE_BYTES) {
      await this.db.query(
        `update user_files
            set processing_status = 'ready', next_processing_at = null,
                processed_at = now()
          where key = $1`,
        [key],
      );
      return null;
    }

    try {
      const source = await this.readAll(key);
      const metadata = await sharp(source, { failOn: 'none' }).metadata();
      const rotated = (metadata.orientation ?? 1) >= 5;
      const width = rotated ? metadata.height : metadata.width;
      const height = rotated ? metadata.width : metadata.height;
      let thumbKey: string | null = null;

      // An animated GIF thumbnail would silently turn motion into a still.
      if (contentType !== 'image/gif' && !existing.thumbKey) {
        const body = await sharp(source, { failOn: 'none' })
          .rotate()
          .resize(THUMB_EDGE, THUMB_EDGE, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .webp({ quality: 72 })
          .toBuffer();

        if (body.length < sizeBytes) {
          thumbKey = thumbKeyFor(key);
          await this.storage.putDerived(thumbKey, body, THUMB_CONTENT_TYPE);
        }
      }

      // Null leaves the recorded widths as they are.
      let displayWidths: number[] | null = null;
      if (!existing.displayWidths?.length) {
        displayWidths =
          contentType === 'image/gif'
            ? []
            : await this.createDisplayCopies(key, source, width, height, sizeBytes);
      }

      // From the same buffer, while it is still decoded and in hand. An
      // animated GIF gets one too: a still first frame is a better stand-in
      // than a grey box, and nobody sees it for long enough to notice it is
      // not moving.
      const blur = existing.blurDataUrl ? null : await blurDataUrl(source);

      await this.db.query(
        `update user_files
            set thumb_key = coalesce($2, thumb_key),
                width_px = $3,
                height_px = $4,
                display_widths = coalesce($5, display_widths),
                blur_data_url = coalesce($6, blur_data_url),
                processing_status = 'ready',
                next_processing_at = null,
                processed_at = now()
          where key = $1`,
        [key, thumbKey, width ?? null, height ?? null, displayWidths, blur],
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
   * Never throws. A missing display copy costs bandwidth; a thrown one would
   * cost the upload, and the photograph is worth more than the optimisation.
   * Returns the widths actually written, which may be fewer than asked for or
   * none at all.
   */
  private async createDisplayCopies(
    key: string,
    source: Buffer,
    width: number | undefined,
    height: number | undefined,
    sizeBytes: number,
  ): Promise<number[]> {
    if (!this.mediaLink.isConfigured) return [];

    // Without dimensions there is no way to tell which widths would be an
    // enlargement, and guessing produces a 2048 copy of a 900 px scan that is
    // larger than the thing it replaces.
    const longest = Math.max(width ?? 0, height ?? 0);
    if (!longest) return [];

    const written: number[] = [];
    for (const target of DISPLAY_WIDTHS) {
      // Nothing to gain from re-encoding a source that is already smaller.
      if (longest <= target) continue;
      try {
        const body = await sharp(source, { failOn: 'none' })
          .rotate()
          .resize(target, target, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: DISPLAY_QUALITY })
          .toBuffer();

        // The same guard the thumbnail uses: a "smaller" copy that is not
        // smaller is pure cost, and PNG screenshots hit this regularly.
        if (body.length >= sizeBytes) continue;

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
   * Runs on the server so it applies to every client, including the app builds
   * already installed on people's phones that will never resize before upload.
   *
   * Never throws, for the same reason `generate` does not: the upload has
   * already succeeded, and failing here must leave the original in place and
   * usable rather than fail the confirm.
   *
   * Returns the new size and content type, or null if it declined or failed.
   */
  async normaliseAvatar(
    key: string,
    contentType: string | null,
    sizeBytes: number,
  ): Promise<{ size: number; contentType: string } | null> {
    if (!contentType?.startsWith('image/')) return null;
    if (sizeBytes > MAX_SOURCE_BYTES) return null;

    try {
      const source = await this.readAll(key);
      const body = await sharp(source, { failOn: 'none' })
        .rotate()
        .resize(AVATAR_EDGE, AVATAR_EDGE, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: AVATAR_QUALITY })
        .toBuffer();

      // An avatar that is already small, or a PNG of flat colour that WebP
      // cannot beat. Rewriting it would spend a request to make the file
      // bigger.
      if (body.length >= sizeBytes) return null;

      await this.storage.putDerived(key, body, THUMB_CONTENT_TYPE);
      // The quota was recorded from the uploaded size a moment ago. Left
      // alone, the user goes on paying for bytes that are no longer there.
      await this.db.query(
        'update user_files set size_bytes = $2, content_type = $3 where key = $1',
        [key, body.length, THUMB_CONTENT_TYPE],
      );
      return { size: body.length, contentType: THUMB_CONTENT_TYPE };
    } catch (err) {
      this.logger.warn(
        `Avatar resize failed for ${key}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
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
