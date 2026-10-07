import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import { MediaLinkService } from './media-link.service';
import { StorageConfig } from './storage.config';
import { MAX_SOURCE_BYTES, ThumbnailsService } from './thumbnails.service';

/**
 * Gives the existing library the display copies a new upload gets.
 *
 * The copies changed — larger sizes, a copy at every photograph's own size,
 * a higher quality — and only uploads from then on get them on confirm.
 * Everything before is `display_version is null`, and this makes their copies
 * again from the original, a few a minute, oldest first, for as long as it
 * takes. Nothing breaks meanwhile: a photograph not yet reached keeps the
 * copies it had, or its original.
 *
 * Slow on purpose. Each file is a read of the whole original out of B2 and
 * a few seconds of sharp on the machine that also runs Postgres, the API and
 * the web servers, and nobody is waiting for any of it. So: one file at a
 * time, at most DISPLAY_BACKFILL_PER_MINUTE of them a minute, never more than
 * TICK_BUDGET_MS of work in a minute, and none at all while somebody's
 * upload is being processed in this process.
 *
 * Safe beside everything else that touches a row. Claims are leased under
 * `for update skip locked`, so two API processes never take the same file;
 * a file deleted while it is worked on is noticed when its row is written,
 * and what was made for it is removed (see refreshDisplayCopies); and a
 * file that fails is retried twice, later each time, and then left with
 * `display_version = -1` rather than read again every minute for ever.
 */

/** How long a claim is held before another tick may take the file again. */
const CLAIM_LEASE_MINUTES = 10;

/** Tries per file before it is given up on. */
export const MAX_DISPLAY_ATTEMPTS = 3;

/** `display_version` for a file this gave up on. */
export const DISPLAY_GAVE_UP = -1;

/**
 * Work started in one tick, at most. A file in progress is finished, so a
 * tick can run past this by one file; the cron's own guard stops the next
 * one from starting on top of it.
 */
const TICK_BUDGET_MS = 50_000;

/** Files a minute when DISPLAY_BACKFILL_PER_MINUTE is not set. */
const DEFAULT_PER_MINUTE = 10;

/**
 * How long ffmpeg may take over one HEIC here.
 *
 * Longer than a confirm's fifteen seconds, since nobody is waiting, but not
 * the portfolio backfill's two minutes: this holds one of the two slots the
 * confirms share for these decodes.
 */
const STILL_DECODE_TIMEOUT_MS = 60_000;

/**
 * Keys stored at a permanent public address — avatars, covers, a showcase's
 * web copy. The same rule as PUBLIC_KEY in storage.config.ts, written for
 * Postgres: they are re-encoded in place and never given display copies, and
 * the claim must not keep choosing them.
 */
const PUBLIC_KEY_SQL = '^users/[^/]+/(avatars|covers|showcases)/';

/** A photograph's row, as the claim hands it over. */
export interface DisplayBackfillRow {
  key: string;
  content_type: string | null;
  size_bytes: string | number;
  thumb_key: string | null;
  display_widths: number[] | null;
  blur_data_url: string | null;
  display_attempts: number;
}

/**
 * The claim: the oldest photograph still owed its copies, leased.
 *
 * Owed means made before display_version existed (null), stored in the
 * private bucket, confirmed (`ready`, or `not_required` for the images from
 * before 059 that never went through the queue) rather than still on its way
 * through a confirm, small enough to decode here, and not given up on or
 * leased to another tick. A GIF is left out: it gets no display copies.
 *
 * One statement, so the choosing and the leasing cannot be split by another
 * process doing the same.
 */
export const CLAIM_SQL = `update user_files f
    set display_attempts = f.display_attempts + 1,
        display_next_at = now() + ($2 * interval '1 minute')
  where f.key = (
          select key
            from user_files
           where display_version is null
             and content_type like 'image/%'
             and content_type <> 'image/gif'
             and processing_status in ('ready', 'not_required')
             and size_bytes <= $1
             and display_attempts < $3
             and coalesce(display_next_at, '-infinity') <= now()
             and key !~ '${PUBLIC_KEY_SQL}'
           order by created_at, key
           for update skip locked
           limit 1
        )
  returning f.key, f.content_type, f.size_bytes, f.thumb_key, f.display_widths,
            f.blur_data_url, f.display_attempts`;

/**
 * Minutes before a failed file is tried again: half an hour, then two.
 *
 * Long enough that a B2 outage does not use up every file's tries in the
 * three minutes it lasts.
 */
export function retryDelayMinutes(attempts: number): number {
  return 30 * 4 ** Math.max(0, attempts - 1);
}

@Injectable()
export class DisplayBackfillService {
  private readonly logger = new Logger(DisplayBackfillService.name);
  private running = false;
  private readonly perMinute: number;

  constructor(
    private readonly db: DatabaseService,
    private readonly thumbs: ThumbnailsService,
    private readonly mediaLink: MediaLinkService,
    private readonly storageConfig: StorageConfig,
    config: ConfigService,
  ) {
    // 0 turns it off without a deploy, should the library ever need to be
    // left alone — a B2 bill, a busy week.
    const raw = Number(config.get<string>('DISPLAY_BACKFILL_PER_MINUTE', String(DEFAULT_PER_MINUTE)));
    this.perMinute = Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : DEFAULT_PER_MINUTE;
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async refreshPending(): Promise<void> {
    if (this.running || this.perMinute === 0) return;
    // Without the media host there is nowhere to write a copy, and a file
    // claimed now would only use up a try.
    if (!this.mediaLink.isConfigured || !this.storageConfig.isConfigured) return;
    this.running = true;
    const started = Date.now();
    try {
      for (let done = 0; done < this.perMinute; done++) {
        if (Date.now() - started >= TICK_BUDGET_MS) break;
        if (this.thumbs.busy) break;
        const file = await this.claimNext();
        if (!file) break;
        await this.refreshOne(file);
      }
    } catch (error) {
      // The claim itself failed — the database, most likely. Next minute.
      this.logger.warn(
        `Display backfill stopped: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }

  private claimNext(): Promise<DisplayBackfillRow | null> {
    return this.db.queryOne<DisplayBackfillRow>(CLAIM_SQL, [
      MAX_SOURCE_BYTES,
      CLAIM_LEASE_MINUTES,
      MAX_DISPLAY_ATTEMPTS,
    ]);
  }

  private async refreshOne(file: DisplayBackfillRow): Promise<void> {
    // The claim's pattern is a copy of the bucket rule, and a public prefix
    // added to one and not the other must not get copies made for it. Given
    // up on at once: trying again would only choose it again.
    if (this.storageConfig.isPublicKey(file.key)) {
      await this.fail({ ...file, display_attempts: MAX_DISPLAY_ATTEMPTS }, 'a public key');
      return;
    }
    try {
      // Null is a file deleted while it was read, which is nobody's failure.
      await this.thumbs.refreshDisplayCopies(
        {
          key: file.key,
          contentType: file.content_type,
          thumbKey: file.thumb_key,
          displayWidths: file.display_widths,
          blurDataUrl: file.blur_data_url,
        },
        Number(file.size_bytes),
        { stillDecodeTimeoutMs: STILL_DECODE_TIMEOUT_MS },
      );
    } catch (error) {
      await this.fail(file, error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Puts a failed file back for later, or gives up on it.
   *
   * A row that has gone since it was claimed matches nothing here, which is
   * the right answer: there is nothing left to retry.
   */
  private async fail(file: DisplayBackfillRow, detail: string): Promise<void> {
    const exhausted = file.display_attempts >= MAX_DISPLAY_ATTEMPTS;
    try {
      await this.db.query(
        `update user_files
            set display_version = case when $2 then $3::smallint else display_version end,
                display_next_at = case when $2 then null
                  else now() + ($4 * interval '1 minute') end
          where key = $1`,
        [file.key, exhausted, DISPLAY_GAVE_UP, retryDelayMinutes(file.display_attempts)],
      );
    } catch (error) {
      // The lease runs out by itself, so the file comes round again anyway.
      this.logger.warn(
        `Could not record a failed display copy for ${file.key}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    this.logger.warn(
      `Display copies ${exhausted ? 'given up' : 'will retry'} for ${file.key}: ${detail.slice(0, 240)}`,
    );
  }
}
