import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../../database/database.service';
import { DownloadCacheService } from '../download-cache.service';
import { StorageConfig } from '../storage.config';
import { StorageService } from '../storage.service';
import { MAX_SOURCE_BYTES, ThumbnailsService } from '../thumbnails.service';
import { HEIC_LEASE_MINUTES, HeicConverter, MAX_HEIC_ATTEMPTS } from './heic-converter.service';

/**
 * Converts the HEICs already in the library, and tidies up after conversions.
 *
 * A new upload is converted as its previews are made (ThumbnailsService
 * .generate). Everything uploaded before that, and anything whose conversion
 * failed and is due another try, is converted here: newest first, since
 * those are the deliveries most likely to be opened, a few a minute, one at
 * a time, never more than TICK_BUDGET_MS of work in a minute, and none while
 * an upload's own previews are being made in this process.
 *
 * Each tick also does two small jobs the conversions leave behind:
 *
 *   - deletes, by version id, each HEIC a JPEG replaced once its week as a
 *     way back is over (replaced_versions);
 *   - drops a copy of a just-converted file from the download cache when it
 *     is not the JPEG's size: a download that was reading the HEIC while it
 *     was replaced can have cached it after the converter cleared the cache.
 *
 * Claims are leased under `for update skip locked`, so two API processes
 * never take one file, and the confirm path takes its files the same way.
 */

/** Work started in one tick, at most; see DisplayBackfillService. */
const TICK_BUDGET_MS = 50_000;

/** Files a minute when HEIC_CONVERT_PER_MINUTE is not set. */
const DEFAULT_PER_MINUTE = 12;

/** How long libheif may take over one HEIC here, with nobody waiting. */
const SWEEP_DECODE_TIMEOUT_MS = 120_000;

/** Replaced versions deleted per tick, at most. */
const PURGE_BATCH = 100;

/** How long after a conversion its cached copy is still checked. */
const CACHE_RECHECK_MINUTES = 30;

/**
 * Keys stored at a permanent public address, which are re-encoded to WebP on
 * confirm and never converted here. The same rule as PUBLIC_KEY in
 * storage.config.ts, written for Postgres.
 */
const PUBLIC_KEY_SQL = '^users/[^/]+/(avatars|covers|showcases)/';

/** A HEIC as the claim hands it over. */
export interface HeicSweepRow {
  key: string;
  content_type: string;
  thumb_key: string | null;
  display_widths: number[] | null;
  blur_data_url: string | null;
  heic_attempts: number;
}

/**
 * The claim: the newest HEIC still to convert, leased.
 *
 * Still to convert means HEIC or HEIF by type, past its confirm (`pending`
 * is a confirm making its previews right now, which converts it itself),
 * small enough to read here, not given up on, not leased to anyone else, and
 * in the private bucket. One statement, so choosing and leasing cannot be
 * split by another process doing the same.
 */
export const HEIC_CLAIM_SQL = `update user_files f
    set heic_attempts = f.heic_attempts + 1,
        heic_next_at = now() + ($1 * interval '1 minute')
  where f.key = (
          select key
            from user_files
           where content_type in ('image/heic', 'image/heif')
             and processing_status in ('ready', 'failed', 'not_required')
             and heic_attempts < $2
             and coalesce(heic_next_at, '-infinity') <= now()
             and size_bytes <= $3
             and key !~ '${PUBLIC_KEY_SQL}'
           order by created_at desc, key
           for update skip locked
           limit 1
        )
  returning f.key, f.content_type, f.thumb_key, f.display_widths, f.blur_data_url,
            f.heic_attempts`;

@Injectable()
export class HeicSweepService {
  private readonly logger = new Logger(HeicSweepService.name);
  private running = false;
  private readonly perMinute: number;

  constructor(
    private readonly db: DatabaseService,
    private readonly thumbs: ThumbnailsService,
    private readonly heic: HeicConverter,
    private readonly storage: StorageService,
    private readonly cache: DownloadCacheService,
    private readonly storageConfig: StorageConfig,
    config: ConfigService,
  ) {
    // 0 stops converting the existing library without a deploy; new uploads
    // are still converted as they arrive. HEIC_TO_JPEG=off stops both.
    const raw = Number(config.get<string>('HEIC_CONVERT_PER_MINUTE', String(DEFAULT_PER_MINUTE)));
    this.perMinute = Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : DEFAULT_PER_MINUTE;
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    if (this.running || !this.storageConfig.isConfigured) return;
    this.running = true;
    const started = Date.now();
    try {
      // Before any conversion, so a busy minute never holds up a deletion
      // that is already due.
      await this.purgeReplaced();
      await this.recheckCache();
      if (!this.heic.enabled) return;
      for (let done = 0; done < this.perMinute; done++) {
        if (Date.now() - started >= TICK_BUDGET_MS) break;
        if (this.thumbs.busy) break;
        const file = await this.db.queryOne<HeicSweepRow>(HEIC_CLAIM_SQL, [
          HEIC_LEASE_MINUTES,
          MAX_HEIC_ATTEMPTS,
          MAX_SOURCE_BYTES,
        ]);
        if (!file) break;
        await this.convertOne(file);
      }
    } catch (error) {
      // The claim itself failed — the database, most likely. Next minute.
      this.logger.warn(
        `HEIC sweep stopped: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }

  private async convertOne(file: HeicSweepRow): Promise<void> {
    // The claim's pattern copies the bucket rule; a public prefix added to
    // one and not the other must not be converted. Given up on at once.
    if (this.storageConfig.isPublicKey(file.key)) {
      await this.heic.fail(file.key, MAX_HEIC_ATTEMPTS, 'a public key');
      return;
    }
    try {
      await this.thumbs.convertStored(
        {
          key: file.key,
          contentType: file.content_type,
          thumbKey: file.thumb_key,
          displayWidths: file.display_widths,
          blurDataUrl: file.blur_data_url,
        },
        SWEEP_DECODE_TIMEOUT_MS,
      );
    } catch (error) {
      await this.heic.fail(
        file.key,
        file.heic_attempts,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Deletes the HEICs whose week as a way back is over. A deletion that
   * fails is tried again a day later rather than every minute.
   */
  async purgeReplaced(): Promise<number> {
    const due = await this.db.query<{ key: string; version_id: string }>(
      `select key, version_id from replaced_versions
        where purge_at <= now()
        order by purge_at
        limit $1`,
      [PURGE_BATCH],
    );
    let purged = 0;
    for (const { key, version_id } of due) {
      try {
        await this.storage.deleteVersion(key, version_id);
        await this.db.query('delete from replaced_versions where key = $1 and version_id = $2', [
          key,
          version_id,
        ]);
        purged += 1;
      } catch (error) {
        await this.db
          .query(
            `update replaced_versions set purge_at = now() + interval '1 day'
              where key = $1 and version_id = $2`,
            [key, version_id],
          )
          .catch(() => undefined);
        this.logger.warn(
          `Could not delete the replaced HEIC behind ${key}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    if (purged > 0) this.logger.log(`Deleted ${purged} replaced HEIC version(s)`);
    return purged;
  }

  /**
   * Drops cached copies of just-converted files that are not the JPEG.
   *
   * The converter clears the cache as it replaces a file, but a download
   * already reading the HEIC can finish writing its copy after that, and the
   * cache would then serve HEIC bytes as the JPEG. Size tells them apart.
   */
  async recheckCache(): Promise<number> {
    const recent = await this.db.query<{ key: string; size_bytes: string | number }>(
      `select key, size_bytes from user_files
        where converted_at > now() - ($1 * interval '1 minute')`,
      [CACHE_RECHECK_MINUTES],
    );
    let dropped = 0;
    for (const { key, size_bytes } of recent) {
      const cached = await this.cache.cachedSize(key);
      if (cached !== null && cached !== Number(size_bytes)) {
        await this.cache.forget(key);
        dropped += 1;
      }
    }
    return dropped;
  }
}
