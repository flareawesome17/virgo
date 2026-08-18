import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import { StorageService } from './storage.service';

const run = promisify(execFile);
const MAX_ATTEMPTS = 3;
const CLAIM_LEASE_MINUTES = 15;
const BATCH_SIZE = 4;

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

/** Durable, restart-safe metadata extraction for video and audio uploads. */
@Injectable()
export class MediaProcessingService {
  private readonly logger = new Logger(MediaProcessingService.name);
  private running = false;

  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
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
    const sourceUrl = await this.storage.mediaUrl(file.key, 20 * 60);
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
      if (video) posterKey = await this.createPoster(file.key, sourceUrl, durationMs);

      await this.db.query(
        `update user_files
            set poster_key = $2,
                width_px = $3,
                height_px = $4,
                duration_ms = $5,
                media_title = $6,
                media_artist = $7,
                processing_status = 'ready',
                next_processing_at = null,
                processed_at = now()
          where key = $1`,
        [
          file.key,
          posterKey,
          width ?? null,
          height ?? null,
          durationMs,
          cleanTag(tags.title),
          cleanTag(tags.artist),
        ],
      );
    } catch (error) {
      await this.fail(
        file,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async createPoster(
    key: string,
    sourceUrl: string,
    durationMs: number | null,
  ): Promise<string | null> {
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
      return posterKey;
    } finally {
      await rm(folder, { recursive: true, force: true });
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
