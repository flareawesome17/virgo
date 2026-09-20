import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import { blurDataUrl } from './blur';
import { MediaLinkService, proxyKeyFor } from './media-link.service';
import { StorageService } from './storage.service';

const run = promisify(execFile);
const MAX_ATTEMPTS = 3;

/**
 * How long a claim is held before another tick may take it.
 *
 * Widened from 15 when this worker stopped only probing and started
 * transcoding: the lease has to outlast the slowest job it can pick up, or a
 * second tick claims a film that is still encoding and both write the same
 * output. It must stay comfortably above PROXY_TIMEOUT_MS.
 */
const CLAIM_LEASE_MINUTES = 45;

/**
 * Two, not four.
 *
 * Four was sized for pulling a poster frame, which is one seek and one
 * decode. A proxy encode is minutes of saturated CPU, and four at once on a
 * box also running Postgres, the API and two Next servers starves all of
 * them. Throughput here is worth less than the API staying responsive —
 * nothing is waiting on a film that has already finished uploading.
 */
const BATCH_SIZE = 2;

/**
 * Presigned source URLs have to outlive the whole job, not just the probe.
 * ffmpeg reads the original over HTTP for the length of the encode, and a URL
 * that expires mid-transcode fails at whatever percentage it had reached.
 */
const SOURCE_URL_TTL_SECONDS = 60 * 60;

/** Ceiling on one proxy encode. Must stay well under CLAIM_LEASE_MINUTES. */
const PROXY_TIMEOUT_MS = 20 * 60_000;

/** Longest edge of the proxy rendition. 1280 is 720p landscape. */
const PROXY_EDGE = 1280;

interface PendingMedia {
  key: string;
  content_type: string | null;
  processing_attempts: number;
}

interface ProbeStream {
  codec_type?: string;
  width?: number;
  height?: number;
  duration?: string;
  tags?: Record<string, string>;
  side_data_list?: { rotation?: number }[];
}

interface ProbeResult {
  streams?: ProbeStream[];
  format?: { duration?: string; tags?: Record<string, string> };
}

export function posterKeyFor(key: string): string {
  return `${key.replace(/\.[^./]+$/, '')}-poster.webp`;
}

/**
 * Proxy dimensions for a source, capped on the LONG edge.
 *
 * Capping the long edge rather than the width is what makes vertical film
 * work. A 1080×1920 phone export capped on width stays 1080 wide and 1920
 * tall — bigger than the source it was meant to shrink; capped on the long
 * edge it becomes 720×1280, which is the intent.
 *
 * Both dimensions are rounded to even numbers because libx264 with yuv420p
 * refuses odd ones, and it refuses them by failing the encode rather than by
 * rounding.
 */
export function proxyScale(
  width: number,
  height: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  const factor = longest > PROXY_EDGE ? PROXY_EDGE / longest : 1;
  const even = (value: number) => Math.max(2, Math.round((value * factor) / 2) * 2);
  return { width: even(width), height: even(height) };
}

/** Durable, restart-safe metadata extraction for video and audio uploads. */
@Injectable()
export class MediaProcessingService {
  private readonly logger = new Logger(MediaProcessingService.name);
  private running = false;

  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    private readonly mediaLink: MediaLinkService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async processPending(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const claimed = await this.claimBatch();
      await Promise.all(claimed.map((file) => this.processOne(file)));
    } finally {
      this.running = false;
    }
  }

  private claimBatch(): Promise<PendingMedia[]> {
    return this.db.transaction(async (client) => {
      const selected = await client.query<PendingMedia>(
        `select key, content_type, processing_attempts
           from user_files
          where processing_status = 'pending'
            and coalesce(next_processing_at, created_at) <= now()
          order by coalesce(next_processing_at, created_at), created_at
          for update skip locked
          limit $1`,
        [BATCH_SIZE],
      );
      if (selected.rows.length === 0) return [];

      const keys = selected.rows.map((row) => row.key);
      await client.query(
        `update user_files
            set processing_attempts = processing_attempts + 1,
                next_processing_at = now() + ($2 * interval '1 minute')
          where key = any($1::text[])`,
        [keys, CLAIM_LEASE_MINUTES],
      );
      return selected.rows.map((row) => ({
        ...row,
        processing_attempts: row.processing_attempts + 1,
      }));
    });
  }

  private async processOne(file: PendingMedia): Promise<void> {
    const sourceUrl = await this.storage.mediaUrl(file.key, SOURCE_URL_TTL_SECONDS);
    if (!sourceUrl) {
      await this.fail(file, 'Storage is not configured');
      return;
    }

    try {
      const { stdout } = await run(
        'ffprobe',
        [
          '-v',
          'error',
          '-show_entries',
          'stream=codec_type,width,height,duration:stream_tags=title,artist:stream_side_data=rotation:format=duration:format_tags=title,artist',
          '-of',
          'json',
          sourceUrl,
        ],
        { maxBuffer: 2 * 1024 * 1024, timeout: 120_000 },
      );
      const probe = JSON.parse(stdout) as ProbeResult;
      const video = probe.streams?.find((stream) => stream.codec_type === 'video');
      const audio = probe.streams?.find((stream) => stream.codec_type === 'audio');
      const rotation = Math.abs(video?.side_data_list?.[0]?.rotation ?? 0) % 180;
      const width = rotation === 90 ? video?.height : video?.width;
      const height = rotation === 90 ? video?.width : video?.height;
      const rawDuration =
        video?.duration ?? audio?.duration ?? probe.format?.duration ?? '0';
      const durationMs = Math.max(0, Math.round(Number(rawDuration) * 1000)) || null;
      const tags = { ...probe.format?.tags, ...audio?.tags };

      let posterKey: string | null = null;
      let posterBlur: string | null = null;
      let proxyKey: string | null = null;
      if (video) {
        const poster = await this.createPoster(file.key, sourceUrl, durationMs);
        posterKey = poster?.key ?? null;
        posterBlur = poster?.blur ?? null;
        proxyKey = await this.createProxy(file.key, sourceUrl, width, height);
      }

      await this.db.query(
        `update user_files
            set poster_key = $2,
                proxy_key = $3,
                width_px = $4,
                height_px = $5,
                duration_ms = $6,
                media_title = $7,
                media_artist = $8,
                blur_data_url = coalesce($9, blur_data_url),
                processing_status = 'ready',
                next_processing_at = null,
                processed_at = now()
          where key = $1`,
        [
          file.key,
          posterKey,
          proxyKey,
          width ?? null,
          height ?? null,
          durationMs,
          cleanTag(tags.title),
          cleanTag(tags.artist),
          posterBlur,
        ],
      );
    } catch (error) {
      await this.fail(
        file,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * The film tile's still, and the preview painted behind it.
   *
   * Returns both because the poster bytes are decoded here and nowhere else —
   * fetching them back out of B2 to make a twenty-pixel copy would be absurd.
   * Film tiles are the largest boxes in any gallery, so they are where a grey
   * rectangle is most visible.
   */
  private async createPoster(
    key: string,
    sourceUrl: string,
    durationMs: number | null,
  ): Promise<{ key: string; blur: string | null } | null> {
    const folder = await mkdtemp(join(tmpdir(), 'virgo-poster-'));
    const output = join(folder, 'poster.webp');
    const atSeconds = Math.max(
      0,
      Math.min(1, durationMs ? durationMs / 10_000 : 1),
    ).toFixed(2);
    try {
      await run(
        'ffmpeg',
        [
          '-v',
          'error',
          '-ss',
          atSeconds,
          '-i',
          sourceUrl,
          '-frames:v',
          '1',
          '-vf',
          "scale='min(1280,iw)':-2",
          '-quality',
          '78',
          '-y',
          output,
        ],
        { timeout: 180_000 },
      );
      const body = await readFile(output);
      const posterKey = posterKeyFor(key);
      await this.storage.putDerived(posterKey, body, 'image/webp');
      return { key: posterKey, blur: await blurDataUrl(body) };
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  }

  /**
   * A web-playable copy of a film, on the media volume.
   *
   * The original is whatever came off the camera: frequently HEVC, 10-bit or
   * ProRes, none of which a browser decodes, and frequently at a bitrate
   * chosen for an edit suite rather than for a phone on mobile data. This is
   * the copy a player actually gets.
   *
   * **Never throws**, on the same reasoning as `ThumbnailsService.generate`:
   * the metadata and the poster are already computed by the time this runs,
   * and losing them to a failed encode would cost the gallery its film tile
   * as well as its playback. A null proxy means the player falls back to the
   * original, which is exactly what shipped before this existed.
   *
   * The consequence is that a failure is not retried by the queue — the job
   * still completes. `proxy_key is null` is the backfill predicate, and the
   * `update` at the end of migration 060 is the tool.
   */
  private async createProxy(
    key: string,
    sourceUrl: string,
    width: number | undefined,
    height: number | undefined,
  ): Promise<string | null> {
    if (!this.mediaLink.isConfigured) return null;
    if (!width || !height) {
      this.logger.warn(`No proxy for ${key}: ffprobe reported no dimensions`);
      return null;
    }

    const proxyKey = proxyKeyFor(key);
    const scale = proxyScale(width, height);
    let staged: string | undefined;

    try {
      staged = await this.mediaLink.stagePathFor(proxyKey);
      await run(
        'ffmpeg',
        [
          '-v', 'error',
          '-i', sourceUrl,
          '-vf', `scale=${scale.width}:${scale.height}`,
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          // CRF with a ceiling: quality-targeted for the quiet parts, capped
          // so a confetti shot cannot spike past what a 4G connection holds.
          '-crf', '23',
          '-maxrate', '2500k',
          '-bufsize', '5000k',
          '-profile:v', 'main',
          // 8-bit 4:2:0. Camera exports are often 10-bit or 4:2:2, which is
          // most of why "this video cannot play in this browser" exists.
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
          // The moov atom at the front. Without it a player has to fetch the
          // end of the file before it can start, which over a long link is
          // the difference between playing and appearing to hang.
          '-movflags', '+faststart',
          '-f', 'mp4',
          '-y', staged,
        ],
        { timeout: PROXY_TIMEOUT_MS, maxBuffer: 2 * 1024 * 1024 },
      );
      // Rename into place only once ffmpeg has exited cleanly: nginx serves
      // this directory live, and a half-written mp4 looks like a corrupt one.
      await this.mediaLink.publish(proxyKey);
      return proxyKey;
    } catch (error) {
      if (staged) await rm(staged, { force: true }).catch(() => undefined);
      this.logger.warn(
        `Proxy failed for ${key}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private async fail(file: PendingMedia, detail: string): Promise<void> {
    const exhausted = file.processing_attempts >= MAX_ATTEMPTS;
    const delayMinutes = Math.min(60, 5 * 2 ** (file.processing_attempts - 1));
    await this.db.query(
      `update user_files
          set processing_status = $2,
              next_processing_at = case when $2 = 'pending'
                then now() + ($3 * interval '1 minute') else null end,
              processed_at = case when $2 = 'failed' then now() else processed_at end
        where key = $1`,
      [file.key, exhausted ? 'failed' : 'pending', delayMinutes],
    );
    this.logger.warn(
      `Media processing ${exhausted ? 'failed' : 'will retry'} for ${file.key}: ${detail.slice(0, 240)}`,
    );
  }
}

function cleanTag(value: string | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 255);
  return cleaned || null;
}
