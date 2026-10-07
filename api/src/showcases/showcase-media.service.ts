import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { promisify } from 'node:util';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import sharp from 'sharp';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';
import { MAX_SOURCE_BYTES } from '../storage/thumbnails.service';
import { MAX_SHOWCASE_ITEMS } from './dto/showcase.dto';

const run = promisify(execFile);

/**
 * The still every surface can draw, and the web copies above it, by long edge.
 *
 * 2560 rather than the albums' 2048: a showcase is the work somebody chose to
 * be judged by, drawn edge to edge on an iPad's 2064–2732 px and in a desktop
 * lightbox. Quality 86 because the soft look of q80 at 2048 is exactly what
 * people noticed. Copies are never larger than the source.
 */
const THUMB_EDGE = 640;
const COPY_EDGES = [1280, 2560] as const;
const THUMB_QUALITY = 78;
const COPY_QUALITY = 86;

/** A film's copy: 1080p on its long edge, H.264 a phone or browser plays. */
const FILM_EDGE = 1920;
const FILM_TIMEOUT_MS = 30 * 60_000;

/** Pieces per tick. A film is one piece on its own: minutes of CPU. */
const BATCH = 4;
const MAX_ATTEMPTS = 4;
/** Held while a piece is being copied, so another tick does not take it too. */
const LEASE_MINUTES = 45;
/** Long enough for ffmpeg to read the whole original over HTTP. */
const SOURCE_URL_TTL_SECONDS = 60 * 60;

/** The web copies' long edges for a photograph whose long edge is `longEdge`. */
export function copyEdges(longEdge: number): number[] {
  const edges: number[] = COPY_EDGES.filter((edge) => edge < longEdge);
  // The photograph at its own size too, up to the largest copy: a 1800 px
  // export otherwise had nothing between 1280 and nothing.
  const own = Math.min(longEdge, COPY_EDGES[COPY_EDGES.length - 1]);
  if (!edges.includes(own) && own > THUMB_EDGE) edges.push(own);
  return edges;
}

/** A film's copy size: capped on the long edge, both sides even for x264. */
export function filmScale(width: number, height: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  const factor = longest > FILM_EDGE ? FILM_EDGE / longest : 1;
  const even = (value: number) => Math.max(2, Math.round((value * factor) / 2) * 2);
  return { width: even(width), height: even(height) };
}

/** Where one piece's copies live. Public bucket, by the 090 key shape. */
export function pieceBase(userId: string, showcaseId: string, itemId: string): string {
  return `users/${userId}/showcases/${showcaseId}/${itemId}`;
}

/** Where every copy of one showcase lives. */
export function showcasePrefix(userId: string, showcaseId: string): string {
  return `users/${userId}/showcases/${showcaseId}/`;
}

interface Pending {
  id: string;
  showcase_id: string;
  user_id: string;
  file_key: string;
  copy_attempts: number;
  content_type: string | null;
  size_bytes: string | number;
  width_px: number | null;
  height_px: number | null;
  duration_ms: string | number | null;
  thumb_key: string | null;
  poster_key: string | null;
}

interface Copied {
  kind: 'image' | 'video';
  thumbKey: string;
  posterKey: string | null;
  videoKey: string | null;
  widths: number[];
  width: number | null;
  height: number | null;
  durationMs: number | null;
  /** Every object written, so a piece deleted mid-copy can be tidied away. */
  written: string[];
}

/**
 * Makes each showcase piece its own copies, so the post outlives the album
 * file it was made from.
 *
 * A piece used to be a pointer into an album, and an album file deleted by
 * hand or by its retention date took the piece with it. Now the worker
 * re-encodes the original once into the public bucket: web copies of a
 * photograph up to 2560 px, a 1080p film and its poster. Until it has, the
 * piece is still served from the album file, as before.
 *
 * Runs every minute, a few pieces at a time — new posts are also copied
 * straight away (copyShowcase) — and works through existing showcases the same
 * way after a deploy.
 */
@Injectable()
export class ShowcaseMediaService {
  private readonly logger = new Logger(ShowcaseMediaService.name);
  private running = false;

  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async copyPending(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const claimed = await this.claim(null);
      for (const piece of claimed) await this.copyOne(piece);
    } catch (err) {
      this.logger.warn(`Showcase copying stopped: ${errorText(err)}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * Copies one showcase's pieces now, after it is posted or edited, rather
   * than whenever the queue reaches them. Not awaited by the request; never
   * throws.
   */
  async copyShowcase(showcaseId: string): Promise<void> {
    try {
      const claimed = await this.claim(showcaseId);
      for (const piece of claimed) await this.copyOne(piece);
    } catch (err) {
      this.logger.warn(`Showcase copying stopped: ${errorText(err)}`);
    }
  }

  /** Deletes every copy of one showcase. After the post is gone; never throws. */
  async eraseShowcase(userId: string, showcaseId: string): Promise<void> {
    try {
      const { failed } = await this.storage.deletePrefix(showcasePrefix(userId, showcaseId));
      if (failed > 0) this.logger.warn(`${failed} showcase copy object(s) could not be deleted`);
    } catch (err) {
      this.logger.warn(`Showcase copies were not deleted: ${errorText(err)}`);
    }
  }

  /** Deletes the copies of pieces taken out of a showcase. Never throws. */
  async erasePieces(keys: (string | null)[]): Promise<void> {
    const present = keys.filter((key): key is string => !!key);
    if (present.length > 0) await this.storage.deleteKeys(present, 'showcase pieces');
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private claim(showcaseId: string | null): Promise<Pending[]> {
    return this.db.transaction(async (client) => {
      const selected = await client.query<Pending>(
        `select i.id, i.showcase_id, i.user_id, i.file_key, i.copy_attempts,
                f.content_type, f.size_bytes, f.width_px, f.height_px, f.duration_ms,
                f.thumb_key, f.poster_key
           from showcase_items i
           join user_files f on f.key = i.file_key and f.user_id = i.user_id
          where i.copied_at is null
            and i.copy_attempts < $2
            and coalesce(i.next_copy_at, i.created_at) <= now()
            and ($3::uuid is null or i.showcase_id = $3::uuid)
          order by coalesce(i.next_copy_at, i.created_at), i.position
          for update of i skip locked
          limit $1`,
        // One post is copied whole: as many pieces as a showcase may hold.
        [showcaseId ? MAX_SHOWCASE_ITEMS : BATCH, MAX_ATTEMPTS, showcaseId],
      );
      // A film is minutes of encoding: at most one per run, and it goes last
      // so the photographs ahead of it are not kept waiting.
      const photos = selected.rows.filter((row) => !isFilm(row));
      const film = selected.rows.find(isFilm);
      const take = film ? [...photos, film] : photos;
      if (take.length === 0) return [];
      await client.query(
        `update showcase_items
            set copy_attempts = copy_attempts + 1,
                next_copy_at = now() + ($2 * interval '1 minute')
          where id = any($1::uuid[])`,
        [take.map((row) => row.id), LEASE_MINUTES],
      );
      return take.map((row) => ({ ...row, copy_attempts: row.copy_attempts + 1 }));
    });
  }

  private async copyOne(piece: Pending): Promise<void> {
    const base = pieceBase(piece.user_id, piece.showcase_id, piece.id);
    let copied: Copied | null = null;
    try {
      copied = isFilm(piece) ? await this.copyFilm(piece, base) : await this.copyPhoto(piece, base);
      const saved = await this.db.query(
        `update showcase_items
            set kind = $2, thumb_key = $3, poster_key = $4, video_key = $5,
                display_widths = $6, width_px = $7, height_px = $8, duration_ms = $9,
                copied_at = now(), next_copy_at = null, copy_error = null
          where id = $1 and copied_at is null
          returning id`,
        [
          piece.id,
          copied.kind,
          copied.thumbKey,
          copied.posterKey,
          copied.videoKey,
          copied.widths,
          copied.width,
          copied.height,
          copied.durationMs,
        ],
      );
      // Taken out of the post, or the post deleted, while it was copying.
      if (saved.length === 0) await this.storage.deleteKeys(copied.written, 'showcase piece gone');
    } catch (err) {
      if (copied) await this.storage.deleteKeys(copied.written, 'showcase copy failed');
      const exhausted = piece.copy_attempts >= MAX_ATTEMPTS;
      const delayMinutes = Math.min(60, 5 * 2 ** (piece.copy_attempts - 1));
      await this.db
        .query(
          `update showcase_items
              set next_copy_at = now() + ($2 * interval '1 minute'), copy_error = $3
            where id = $1`,
          [piece.id, delayMinutes, errorText(err).slice(0, 240)],
        )
        .catch(() => undefined);
      this.logger.warn(
        `Showcase piece ${piece.id} ${exhausted ? 'could not be copied' : 'will be retried'}: ${errorText(err).slice(0, 160)}`,
      );
    }
  }

  /**
   * A photograph: a 640 px still and web copies up to 2560 px, re-encoded from
   * the original so the camera's EXIF and GPS do not come along.
   *
   * An original too large to decode here, or in a format sharp cannot read,
   * keeps what the album already made for it — the 640 px thumbnail — so the
   * post still shows rather than being lost with the album file.
   */
  private async copyPhoto(piece: Pending, base: string): Promise<Copied> {
    const written: string[] = [];
    const thumbKey = `${base}-thumb.webp`;
    const size = Number(piece.size_bytes);

    let source: Buffer | null = null;
    if (size <= MAX_SOURCE_BYTES) {
      source = await readAll(await this.storage.readStream(piece.file_key));
    }
    const meta = source ? await sharp(source, { failOn: 'none' }).metadata().catch(() => null) : null;

    if (!source || !meta?.width || !meta.height) {
      if (!piece.thumb_key) throw new Error('No source this server can read, and no thumbnail');
      const thumb = await readAll(await this.storage.readStream(piece.thumb_key));
      await this.storage.putDerived(thumbKey, thumb, 'image/webp');
      written.push(thumbKey);
      return {
        kind: 'image',
        thumbKey,
        posterKey: null,
        videoKey: null,
        widths: [],
        width: piece.width_px,
        height: piece.height_px,
        durationMs: null,
        written,
      };
    }

    // EXIF orientations 5–8 turn the picture a quarter: its upright long edge
    // is the same number, but width and height swap.
    const turned = (meta.orientation ?? 1) >= 5;
    const longEdge = Math.max(meta.width, meta.height);

    const thumb = await sharp(source, { failOn: 'none' })
      .rotate()
      .resize(THUMB_EDGE, THUMB_EDGE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: THUMB_QUALITY })
      .toBuffer();
    await this.storage.putDerived(thumbKey, thumb, 'image/webp');
    written.push(thumbKey);

    const widths: number[] = [];
    for (const edge of copyEdges(longEdge)) {
      const { data, info } = await sharp(source, { failOn: 'none' })
        .rotate()
        .resize(edge, edge, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: COPY_QUALITY, effort: 5 })
        .toBuffer({ resolveWithObject: true });
      // Named by the copy's real width, which is what a client sizing a
      // picture needs to know.
      if (widths.includes(info.width)) continue;
      const key = `${base}-${info.width}.webp`;
      await this.storage.putDerived(key, data, 'image/webp');
      written.push(key);
      widths.push(info.width);
    }

    return {
      kind: 'image',
      thumbKey,
      posterKey: null,
      videoKey: null,
      widths: widths.sort((a, b) => a - b),
      width: turned ? meta.height : meta.width,
      height: turned ? meta.width : meta.height,
      durationMs: null,
      written,
    };
  }

  /**
   * A film: its poster, a 640 px still of it, and a 1080p H.264 copy with the
   * metadata stripped — a phone's video carries where it was shot.
   */
  private async copyFilm(piece: Pending, base: string): Promise<Copied> {
    const written: string[] = [];
    if (!piece.poster_key) throw new Error('The film has no poster yet');
    if (!piece.width_px || !piece.height_px) throw new Error('The film has no known size');

    const poster = await readAll(await this.storage.readStream(piece.poster_key));
    const posterKey = `${base}-poster.webp`;
    await this.storage.putDerived(posterKey, poster, 'image/webp');
    written.push(posterKey);

    const thumbKey = `${base}-thumb.webp`;
    const thumb = await sharp(poster, { failOn: 'none' })
      .resize(THUMB_EDGE, THUMB_EDGE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: THUMB_QUALITY })
      .toBuffer();
    await this.storage.putDerived(thumbKey, thumb, 'image/webp');
    written.push(thumbKey);

    const sourceUrl = await this.storage.mediaUrl(piece.file_key, SOURCE_URL_TTL_SECONDS);
    if (!sourceUrl) throw new Error('Storage is not configured');
    const scale = filmScale(piece.width_px, piece.height_px);
    const folder = await mkdtemp(join(tmpdir(), 'virgo-showcase-'));
    const output = join(folder, 'film.mp4');
    const videoKey = `${base}.mp4`;
    try {
      await run(
        'ffmpeg',
        [
          '-v', 'error',
          '-i', sourceUrl,
          '-vf', `scale=${scale.width}:${scale.height}`,
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          // Sharper than the albums' 720p proxy, and still capped so a busy
          // shot cannot outrun a phone on mobile data.
          '-crf', '20',
          '-maxrate', '6000k',
          '-bufsize', '12000k',
          '-profile:v', 'high',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac', '-b:a', '160k', '-ac', '2',
          // Where and when it was shot stays with the original.
          '-map_metadata', '-1',
          '-movflags', '+faststart',
          '-f', 'mp4',
          '-y', output,
        ],
        { timeout: FILM_TIMEOUT_MS, maxBuffer: 2 * 1024 * 1024 },
      );
      await this.storage.putDerivedFile(videoKey, output, 'video/mp4');
      written.push(videoKey);
    } catch (err) {
      await this.storage.deleteKeys(written, 'showcase film failed');
      throw err;
    } finally {
      await rm(folder, { recursive: true, force: true });
    }

    return {
      kind: 'video',
      thumbKey,
      posterKey,
      videoKey,
      widths: [],
      width: scale.width,
      height: scale.height,
      durationMs: piece.duration_ms === null ? null : Number(piece.duration_ms),
      written,
    };
  }
}

function isFilm(row: { content_type: string | null }): boolean {
  return row.content_type?.startsWith('video/') ?? false;
}

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks);
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
