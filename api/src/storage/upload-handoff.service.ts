import { HttpException, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import {
  StorageService,
  type HandoffFile,
  type HandoffTicket,
} from './storage.service';
import { ThumbnailsService } from './thumbnails.service';

/**
 * Background uploads, the server's half (docs/BACKGROUND_UPLOADS.md).
 *
 * A phone with the native upload module hands a whole batch to iOS or Android
 * and may be closed before any of it lands, so nothing on the phone is left to
 * say "it arrived". This keeps a row per handed-over file and finishes each
 * one when it lands, exactly as the phone's confirm would. The phone still
 * finishes what it sees land while it is open (`finish`), so files show at
 * once; both paths are idempotent.
 */

export type HandoffOutcome = 'filed' | 'cancelled' | 'expired' | 'refused' | 'gone';

/** What the phone is told about one handed-over file. */
export type HandoffResult =
  | { key: string; state: 'filed'; size: number }
  | { key: string; state: 'waiting' }
  | { key: string; state: 'gone' }
  | { key: string; state: 'refused'; reason: string }
  | { key: string; state: 'unknown' };

interface HandoffRow {
  key: string;
  user_id: string;
  album_id: string | null;
  original_name: string | null;
  /** bigint, which node-postgres returns as text. */
  last_modified: string | null;
  content_type: string;
  size_bytes: string;
  upload_id: string | null;
  part_count: number | null;
  finished_at: Date | null;
  outcome: HandoffOutcome | null;
  last_error: string | null;
}

const COLUMNS = `key, user_id, album_id, original_name, last_modified, content_type,
  size_bytes, upload_id, part_count, finished_at, outcome, last_error`;

/** Rows the job looks at per run, and how many of them at once. */
const SWEEP_BATCH = 200;
const SWEEP_CONCURRENCY = 8;

/**
 * A handoff is first looked at once it is a little old (the phone usually
 * finishes it itself first), then again after as many minutes as it has been
 * looked at, up to this many. A batch waiting hours in a phone's queue is
 * looked at every five minutes, not every one.
 */
const MAX_CHECK_GAP_MINUTES = 5;

/** Open rows are still looked at this long past their URLs' expiry. */
const EXPIRY_GRACE_MINUTES = 60;

/** Finished rows are kept this long, for support. */
const KEEP_FINISHED_DAYS = 7;

@Injectable()
export class UploadHandoffService {
  private readonly logger = new Logger(UploadHandoffService.name);
  private running = false;

  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    private readonly thumbs: ThumbnailsService,
  ) {}

  /**
   * Mints a batch and records it. A batch that cannot be recorded is released
   * and refused: unrecorded, nothing would ever finish it.
   */
  async create(
    userId: string,
    albumId: string,
    files: HandoffFile[],
  ): Promise<{ handoffs: HandoffTicket[] }> {
    const tickets = await this.storage.createHandoffs(userId, albumId, files);
    try {
      await this.db.query(
        `insert into upload_handoffs
           (key, user_id, album_id, original_name, last_modified, content_type,
            size_bytes, upload_id, part_count, expires_at)
         select * from unnest(
           $1::text[], $2::uuid[], $3::text[], $4::text[], $5::bigint[], $6::text[],
           $7::bigint[], $8::text[], $9::int[], $10::timestamptz[])
         on conflict (key) do nothing`,
        [
          tickets.map((ticket) => ticket.key),
          tickets.map(() => userId),
          tickets.map(() => albumId),
          files.map((file) => file.originalName?.slice(0, 255) ?? null),
          files.map((file) => file.lastModified ?? null),
          tickets.map((ticket) => ticket.contentType),
          tickets.map((ticket) => ticket.size),
          tickets.map((ticket) => ticket.multipart?.uploadId ?? null),
          tickets.map((ticket) => ticket.multipart?.partCount ?? null),
          tickets.map((ticket) => ticket.expiresAt),
        ],
      );
    } catch (err) {
      await Promise.all(
        tickets.map((ticket) =>
          this.storage.discardHandoff({
            key: ticket.key,
            uploadId: ticket.multipart?.uploadId ?? null,
          }),
        ),
      );
      throw err;
    }
    return { handoffs: tickets };
  }

  /**
   * Finishes these of the caller's handoffs now, if they have landed: the
   * phone calls this as each one's transfer ends, so a file shows in its album
   * at once rather than at the job's next run.
   */
  async finish(userId: string, keys: string[]): Promise<{ results: HandoffResult[] }> {
    const rows = await this.rowsFor(userId, keys);
    const results = await mapLimited(keys, SWEEP_CONCURRENCY, async (key) => {
      const row = rows.get(key);
      if (!row) return { key, state: 'unknown' } as const;
      if (row.finished_at) return finishedResult(row);
      return this.settle(row);
    });
    return { results };
  }

  /** Lets go of these of the caller's handoffs: the person removed them. */
  async cancel(userId: string, keys: string[]): Promise<{ cancelled: number }> {
    const rows = await this.rowsFor(userId, keys);
    let cancelled = 0;
    for (const row of rows.values()) {
      if (row.finished_at) continue;
      await this.storage.discardHandoff({ key: row.key, uploadId: row.upload_id });
      if (await this.close(row.key, 'cancelled', null)) cancelled++;
    }
    return { cancelled };
  }

  /**
   * Closes the row of a key the phone confirmed itself, the way it confirms
   * any upload, so the job does not look at it again. Best effort.
   */
  async markFiled(userId: string, key: string): Promise<void> {
    try {
      await this.db.query(
        `update upload_handoffs set finished_at = now(), outcome = 'filed'
          where key = $1 and user_id = $2 and finished_at is null`,
        [key, userId],
      );
    } catch (err) {
      this.logger.warn(`Could not close handoff ${key}: ${String(err)}`);
    }
  }

  /**
   * Every minute: finish what has landed, close what has expired, and forget
   * what finished a week ago. One run at a time.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async sweep(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.closeExpired();
      const due = await this.db.query<HandoffRow>(
        `select ${COLUMNS} from upload_handoffs
          where finished_at is null
            and created_at < now() - interval '30 seconds'
            and expires_at > now() - make_interval(mins => $2)
            and (checked_at is null
                 or checked_at < now() - make_interval(mins => least(checks, $3)))
          order by checked_at nulls first
          limit $1`,
        [SWEEP_BATCH, EXPIRY_GRACE_MINUTES, MAX_CHECK_GAP_MINUTES],
      );
      await mapLimited(due, SWEEP_CONCURRENCY, (row) => this.settle(row));
      await this.db.query(
        `delete from upload_handoffs
          where finished_at is not null
            and finished_at < now() - make_interval(days => $1)`,
        [KEEP_FINISHED_DAYS],
      );
    } catch (err) {
      this.logger.error(`Handoff sweep failed: ${String(err)}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * Gives up on handoffs whose URLs ran out more than the grace period ago,
   * releasing whatever of them is still held.
   */
  private async closeExpired(): Promise<void> {
    const expired = await this.db.query<HandoffRow>(
      `select ${COLUMNS} from upload_handoffs
        where finished_at is null
          and expires_at <= now() - make_interval(mins => $1)
        limit $2`,
      [EXPIRY_GRACE_MINUTES, SWEEP_BATCH],
    );
    for (const row of expired) {
      await this.storage.discardHandoff({ key: row.key, uploadId: row.upload_id });
      await this.close(row.key, 'expired', row.last_error);
    }
  }

  /** Looks at one open handoff and records what it found. */
  private async settle(row: HandoffRow): Promise<HandoffResult> {
    try {
      const found = await this.storage.finishHandoff({
        key: row.key,
        userId: row.user_id,
        albumId: row.album_id,
        originalName: row.original_name,
        lastModified: row.last_modified === null ? null : Number(row.last_modified),
        uploadId: row.upload_id,
        partCount: row.part_count,
      });
      if (found.state === 'filed') {
        await this.close(row.key, 'filed', null);
        this.thumbnail(row.key, found.contentType ?? row.content_type, found.size);
        return { key: row.key, state: 'filed', size: found.size };
      }
      if (found.state === 'gone') {
        await this.close(row.key, 'gone', null);
        return { key: row.key, state: 'gone' };
      }
      await this.touch(row.key, null);
      return { key: row.key, state: 'waiting' };
    } catch (err) {
      if (err instanceof HttpException && err.getStatus() >= 400 && err.getStatus() < 500) {
        // Refused: over the ceiling, out of storage, or no longer allowed in
        // the album. Nothing of it is kept.
        const reason = err.message;
        await this.storage.discardHandoff({ key: row.key, uploadId: row.upload_id });
        await this.close(row.key, 'refused', reason);
        return { key: row.key, state: 'refused', reason };
      }
      // Storage or the database having a bad moment: looked at again later.
      await this.touch(row.key, String(err).slice(0, 500));
      return { key: row.key, state: 'waiting' };
    }
  }

  private async rowsFor(userId: string, keys: string[]): Promise<Map<string, HandoffRow>> {
    const rows = await this.db.query<HandoffRow>(
      `select ${COLUMNS} from upload_handoffs where user_id = $1 and key = any($2::text[])`,
      [userId, keys],
    );
    return new Map(rows.map((row) => [row.key, row]));
  }

  /** Marks a row finished. False when it already was. */
  private async close(
    key: string,
    outcome: HandoffOutcome,
    lastError: string | null,
  ): Promise<boolean> {
    const rows = await this.db.query<{ key: string }>(
      `update upload_handoffs
          set finished_at = now(), outcome = $2, last_error = $3
        where key = $1 and finished_at is null
        returning key`,
      [key, outcome, lastError],
    );
    return rows.length > 0;
  }

  private async touch(key: string, lastError: string | null): Promise<void> {
    await this.db.query(
      `update upload_handoffs
          set checks = checks + 1, checked_at = now(), last_error = $2
        where key = $1`,
      [key, lastError],
    );
  }

  /** As after a phone's confirm: made in the background, never awaited. */
  private thumbnail(key: string, contentType: string | null, size: number): void {
    const failed = (err: unknown) =>
      this.logger.error(`Background thumbnail failed for ${key}: ${String(err)}`);
    try {
      this.thumbs.generateOnce(key, contentType, size).catch(failed);
    } catch (err) {
      failed(err);
    }
  }
}

/** What a phone is told about a handoff that was already finished. */
function finishedResult(row: HandoffRow): HandoffResult {
  switch (row.outcome) {
    case 'filed':
      return { key: row.key, state: 'filed', size: Number(row.size_bytes) };
    case 'refused':
      return { key: row.key, state: 'refused', reason: row.last_error ?? 'Refused' };
    default:
      return { key: row.key, state: 'gone' };
  }
}

/** `fn` over `items`, at most `limit` at a time, results in order. */
async function mapLimited<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const at = next++;
      results[at] = await fn(items[at]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
