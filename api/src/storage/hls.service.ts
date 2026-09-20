import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import { MediaLinkService, hlsPrefixFor } from './media-link.service';
import { StorageService } from './storage.service';

const run = promisify(execFile);

const MAX_ATTEMPTS = 3;

/**
 * One at a time.
 *
 * A ladder is three simultaneous H.264 encodes of the same film — roughly
 * three times the work the proxy does, on a machine that is also running
 * Postgres, the API, two Next servers and the proxy worker itself. The proxy
 * queue is already at two. Anything more here and an album upload and an
 * album share at the same time take the app down between them.
 */
const BATCH_SIZE = 1;

/** Has to outlast the slowest job. See LADDER_TIMEOUT_MS. */
const CLAIM_LEASE_MINUTES = 90;

/** Ceiling on one ladder. Three rungs of a long film is not quick. */
const LADDER_TIMEOUT_MS = 60 * 60_000;

/** Source URLs must outlive the whole encode, not just its first minute. */
const SOURCE_URL_TTL_SECONDS = 2 * 60 * 60;

/** Segment length. Six seconds is the HLS default and what players expect. */
const SEGMENT_SECONDS = 6;

export interface LadderRung {
  /** Target for the SHORT edge, so portrait film is not reduced to a strip. */
  shortEdge: number;
  /** kbit/s. */
  bitrate: number;
  maxrate: number;
  bufsize: number;
}

/**
 * The rung set, narrowest first.
 *
 * Three, chosen for what this audience actually watches on. 360p is the rung
 * that matters most — it is the one that plays when a client opens their
 * wedding film on mobile data, which the single 2.5 Mbps proxy from 060
 * cannot do. 1080p is the ceiling because the 500 MB upload cap means sources
 * are exports rather than masters.
 */
export const LADDER: readonly LadderRung[] = [
  { shortEdge: 360, bitrate: 800, maxrate: 856, bufsize: 1200 },
  { shortEdge: 720, bitrate: 2500, maxrate: 2675, bufsize: 3750 },
  { shortEdge: 1080, bitrate: 4500, maxrate: 4815, bufsize: 6750 },
];

export interface SizedRung extends LadderRung {
  width: number;
  height: number;
}

const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);

/**
 * The rungs worth encoding for a source, narrowest first.
 *
 * Measured on the SHORT edge, which is what makes vertical film work: a
 * 1080x1920 phone export has a short edge of 1080, so it earns all three
 * rungs and its 720 rung is 720x1280. Treating the rung as a height instead
 * would make that same rung 405x720 — a strip nobody asked for.
 *
 * A source never gets a rung it would have to be enlarged into, and a source
 * below the narrowest rung gets nothing: the proxy from 060 already covers
 * it, and a ladder with one rung is a worse MP4.
 */
export function ladderFor(width: number, height: number): SizedRung[] {
  if (!width || !height) return [];
  const short = Math.min(width, height);
  const portrait = height > width;

  return LADDER.filter((rung) => short >= rung.shortEdge).map((rung) => {
    const scale = rung.shortEdge / short;
    return portrait
      ? { ...rung, width: even(rung.shortEdge), height: even(height * scale) }
      : { ...rung, width: even(width * scale), height: even(rung.shortEdge) };
  });
}

/**
 * The ffmpeg invocation for a ladder.
 *
 * Pure, and exported, because it is the part most worth testing: a wrong
 * `-var_stream_map` produces a master playlist that looks right and refers to
 * renditions that were never written, which surfaces as a film that plays for
 * six seconds and stops.
 */
export function buildLadderArgs(
  sourceUrl: string,
  outDir: string,
  rungs: readonly SizedRung[],
): string[] {
  const splits = rungs.map((_, i) => `[s${i}]`).join('');
  const scales = rungs
    .map((rung, i) => `[s${i}]scale=${rung.width}:${rung.height}[v${i}]`)
    .join('; ');

  const args = [
    '-v', 'error',
    '-i', sourceUrl,
    '-filter_complex', `[0:v]split=${rungs.length}${splits}; ${scales}`,
  ];

  rungs.forEach((rung, i) => {
    args.push(
      '-map', `[v${i}]`,
      `-c:v:${i}`, 'libx264',
      `-b:v:${i}`, `${rung.bitrate}k`,
      `-maxrate:v:${i}`, `${rung.maxrate}k`,
      `-bufsize:v:${i}`, `${rung.bufsize}k`,
    );
  });

  // One audio mapping per rung: every variant carries its own audio, which is
  // what lets a player switch rungs without re-fetching a separate track.
  rungs.forEach(() => args.push('-map', 'a:0?'));

  args.push(
    '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
    '-preset', 'veryfast',
    '-profile:v', 'main',
    // 8-bit 4:2:0 — camera exports are frequently 10-bit or 4:2:2, which no
    // browser decodes.
    '-pix_fmt', 'yuv420p',
    // A keyframe every two seconds on every rung, independent of the source
    // frame rate. A fixed -g only lines up at some frame rates, and rungs
    // whose keyframes do not line up make the player stutter at exactly the
    // moment it switches quality — which is the thing a ladder exists for.
    '-force_key_frames', 'expr:gte(t,n_forced*2)',
    '-f', 'hls',
    '-hls_time', String(SEGMENT_SECONDS),
    '-hls_playlist_type', 'vod',
    // CMAF. The same segments can serve DASH later without re-packaging, and
    // fMP4 is the only HLS container that carries HEVC if a 4K rung is ever
    // wanted.
    '-hls_segment_type', 'fmp4',
    '-hls_flags', 'independent_segments',
    // ffmpeg appends the variant index to this, so the files land as
    // init_0.mp4, init_1.mp4, init_2.mp4 — one per rung, which is what each
    // variant playlist's EXT-X-MAP then points at. Verified against a real
    // three-rung encode; do not "fix" the name to match the argument.
    '-hls_fmp4_init_filename', 'init.mp4',
    '-hls_segment_filename', `${outDir}/v%v/%04d.m4s`,
    '-master_pl_name', 'master.m3u8',
    '-var_stream_map', rungs.map((_, i) => `v:${i},a:${i}`).join(' '),
    '-y',
    `${outDir}/v%v/playlist.m3u8`,
  );

  return args;
}

interface PendingLadder {
  key: string;
  width_px: number | null;
  height_px: number | null;
  hls_attempts: number;
}

/**
 * Builds adaptive-bitrate ladders, lazily.
 *
 * Its own queue rather than a job in MediaProcessingService, because the two
 * run at different times for different reasons. Metadata and the proxy happen
 * on upload for every film; a ladder happens when an album is SHARED, for the
 * films in it. Most work here is uploaded, delivered once and never streamed
 * again, and three rungs for a film nobody opens is the most expensive thing
 * this system could do by accident.
 */
@Injectable()
export class HlsService {
  private readonly logger = new Logger(HlsService.name);
  private running = false;

  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    private readonly mediaLink: MediaLinkService,
  ) {}

  /**
   * Queues every film in an album.
   *
   * Called when a share link is created or re-enabled. Idempotent by the
   * `hls_status` filter: a film already queued, already built or already
   * failed three times is left alone, so re-sharing an album does not restart
   * work or retry something known broken.
   */
  async enqueueAlbum(albumId: string): Promise<number> {
    if (!this.mediaLink.isConfigured) return 0;
    const rows = await this.db.query<{ key: string }>(
      `update user_files
          set hls_status = 'pending', hls_next_at = now(), hls_attempts = 0
        where album_id = $1
          and split_part(coalesce(content_type, ''), '/', 1) = 'video'
          and hls_status = 'none'
        returning key`,
      [albumId],
    );
    if (rows.length > 0) {
      this.logger.log(`Queued ${rows.length} film(s) for a ladder in album ${albumId}`);
    }
    return rows.length;
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async processPending(): Promise<void> {
    if (this.running || !this.mediaLink.isConfigured) return;
    this.running = true;
    try {
      const claimed = await this.claimBatch();
      for (const file of claimed) await this.buildOne(file);
    } finally {
      this.running = false;
    }
  }

  private claimBatch(): Promise<PendingLadder[]> {
    return this.db.transaction(async (client) => {
      const selected = await client.query<PendingLadder>(
        `select key, width_px, height_px, hls_attempts
           from user_files
          where hls_status = 'pending'
            and coalesce(hls_next_at, created_at) <= now()
          order by coalesce(hls_next_at, created_at), created_at
          for update skip locked
          limit $1`,
        [BATCH_SIZE],
      );
      if (selected.rows.length === 0) return [];

      const keys = selected.rows.map((row) => row.key);
      await client.query(
        `update user_files
            set hls_attempts = hls_attempts + 1,
                hls_next_at = now() + ($2 * interval '1 minute')
          where key = any($1::text[])`,
        [keys, CLAIM_LEASE_MINUTES],
      );
      return selected.rows.map((row) => ({
        ...row,
        hls_attempts: row.hls_attempts + 1,
      }));
    });
  }

  private async buildOne(file: PendingLadder): Promise<void> {
    const rungs = ladderFor(file.width_px ?? 0, file.height_px ?? 0);
    if (rungs.length === 0) {
      // Not a failure: a film below the narrowest rung is already served well
      // by the proxy, and a one-rung ladder is a worse MP4 with more parts.
      await this.settle(file.key, 'none', 'below the narrowest rung');
      return;
    }

    const sourceUrl = await this.storage.mediaUrl(file.key, SOURCE_URL_TTL_SECONDS);
    if (!sourceUrl) {
      await this.fail(file, 'Storage is not configured');
      return;
    }

    const prefix = hlsPrefixFor(file.key);
    try {
      const staged = await this.mediaLink.stageDirFor(prefix);
      // ffmpeg will not create the per-rung directories itself.
      await Promise.all(
        rungs.map((_, i) => this.mediaLink.makeDir(`${staged}/v${i}`)),
      );

      await run('ffmpeg', buildLadderArgs(sourceUrl, staged, rungs), {
        timeout: LADDER_TIMEOUT_MS,
        maxBuffer: 4 * 1024 * 1024,
      });

      await this.mediaLink.publishDir(prefix);
      await this.db.query(
        `update user_files
            set hls_prefix = $2, hls_status = 'ready', hls_next_at = null
          where key = $1`,
        [file.key, prefix],
      );
      this.logger.log(`Ladder ready for ${file.key} (${rungs.length} rungs)`);
    } catch (error) {
      await this.mediaLink.discardDir(prefix);
      await this.fail(file, error instanceof Error ? error.message : String(error));
    }
  }

  /** Terminal state that is not an error — records it and stops retrying. */
  private async settle(key: string, status: string, why: string): Promise<void> {
    await this.db.query(
      `update user_files set hls_status = $2, hls_next_at = null where key = $1`,
      [key, status],
    );
    this.logger.log(`No ladder for ${key}: ${why}`);
  }

  /**
   * Retries with backoff, then gives up.
   *
   * Giving up is survivable in a way it would not be for the proxy: every
   * player falls back to `proxyUrl`, and failing that to the original, so a
   * film with no ladder still plays. It just does not adapt.
   */
  private async fail(file: PendingLadder, detail: string): Promise<void> {
    const exhausted = file.hls_attempts >= MAX_ATTEMPTS;
    const delayMinutes = Math.min(120, 15 * 2 ** (file.hls_attempts - 1));
    await this.db.query(
      `update user_files
          set hls_status = $2,
              hls_next_at = case when $2 = 'pending'
                then now() + ($3 * interval '1 minute') else null end
        where key = $1`,
      [file.key, exhausted ? 'failed' : 'pending', delayMinutes],
    );
    this.logger.warn(
      `Ladder ${exhausted ? 'failed' : 'will retry'} for ${file.key}: ${detail.slice(0, 240)}`,
    );
  }
}
