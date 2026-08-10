import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { DatabaseService } from '../database/database.service';
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
 */
const MAX_SOURCE_BYTES = 40 * 1024 * 1024;

/** WebP everywhere: ~30% smaller than JPEG at the same quality, and universal. */
const THUMB_CONTENT_TYPE = 'image/webp';

/** `.../abc.jpg` → `.../abc-thumb.webp`, beside the original. */
export function thumbKeyFor(key: string): string {
  return `${key.replace(/\.[^./]+$/, '')}-thumb.webp`;
}

@Injectable()
export class ThumbnailsService {
  private readonly logger = new Logger(ThumbnailsService.name);

  constructor(
    private readonly storage: StorageService,
    private readonly db: DatabaseService,
  ) {}

  /**
   * Makes a thumbnail for one stored image and records it.
   *
   * Never throws. A file that sharp cannot decode — a CMYK TIFF, a truncated
   * upload, something whose extension lies about its contents — must leave the
   * upload succeeded and the gallery falling back to the original. Losing the
   * thumbnail costs bandwidth; losing the upload costs the photograph.
   *
   * Returns the key it wrote, or null if it declined or failed.
   */
  async generate(
    key: string,
    contentType: string | null,
    sizeBytes: number,
  ): Promise<string | null> {
    if (!contentType?.startsWith('image/')) return null;
    // An animated GIF would come back as a still first frame, which is worse
    // than showing the real thing.
    if (contentType === 'image/gif') return null;
    if (sizeBytes > MAX_SOURCE_BYTES) return null;

    try {
      const source = await this.readAll(key);
      const body = await sharp(source, { failOn: 'none' })
        // `inside` keeps the aspect ratio and never enlarges a photo that is
        // already smaller than the box — upscaling would produce a thumbnail
        // heavier than its own original.
        .rotate()
        .resize(THUMB_EDGE, THUMB_EDGE, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 72 })
        .toBuffer();

      // Bigger than the source happens with small or already-optimised images.
      // Recording it would make the gallery slower, which is the opposite of
      // the point.
      if (body.length >= sizeBytes) return null;

      const thumbKey = thumbKeyFor(key);
      await this.storage.putDerived(thumbKey, body, THUMB_CONTENT_TYPE);
      await this.db.query(
        'update user_files set thumb_key = $2 where key = $1',
        [key, thumbKey],
      );
      return thumbKey;
    } catch (err) {
      this.logger.warn(
        `Thumbnail failed for ${key}: ${err instanceof Error ? err.message : String(err)}`,
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
