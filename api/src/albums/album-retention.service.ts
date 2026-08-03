import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import { NotifyService } from '../notifications/notify.service';
import { StorageService } from '../storage/storage.service';

interface ExpiringFile {
  user_id: string;
  album_id: string;
  album_name: string;
  key: string;
}

/**
 * Deletes delivered work once its retention window has passed.
 *
 * `albums.retention_days` has been settable from the album-create screen since
 * the beginning — "delete after 30 days" and a custom option — and the API has
 * stored it faithfully. Nothing ever acted on it. Every photographer who set
 * it still has those files, and the setting was a promise the product did not
 * keep.
 *
 * The window is measured from when each file was uploaded, not from when the
 * album was made. An album worked on over three weeks should not have its last
 * upload deleted on the same day as its first.
 *
 * Deliberately quiet about *what* it removed beyond a count: this runs
 * unattended, and a log line naming a client's files is a log line that
 * outlives the files.
 */
@Injectable()
export class AlbumRetentionService {
  private readonly logger = new Logger(AlbumRetentionService.name);
  private running = false;

  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    private readonly notifier: NotifyService,
  ) {}

  /**
   * Daily rather than hourly.
   *
   * Retention is expressed in days, so finer granularity buys nothing and
   * costs a bucket round trip every hour for a job that will almost always
   * find nothing.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async sweep(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.deleteExpired();
    } catch (err) {
      this.logger.error(`Retention sweep failed: ${String(err)}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * Removes every file past its album's retention window.
   *
   * Batched by owner because the storage layer scopes deletes per user — the
   * key-prefix check that keeps one account from deleting another's objects
   * needs a user to check against.
   */
  async deleteExpired(): Promise<{ albums: number; deleted: number; failed: number }> {
    const expiring = await this.db.query<ExpiringFile>(
      `select f.user_id, f.album_id, a.name as album_name, f.key
         from user_files f
         join albums a on a.id = f.album_id
        where a.retention_days is not null
          -- 0 would mean "delete immediately", which is a mis-set value rather
          -- than an intent. Treated as off.
          and a.retention_days > 0
          and f.created_at < now() - make_interval(days => a.retention_days)
        limit 5000`,
      [],
    );

    if (expiring.length === 0) return { albums: 0, deleted: 0, failed: 0 };

    const byUser = new Map<string, string[]>();
    const albums = new Map<string, { userId: string; name: string; count: number }>();

    for (const row of expiring) {
      const keys = byUser.get(row.user_id) ?? [];
      keys.push(row.key);
      byUser.set(row.user_id, keys);

      const album = albums.get(row.album_id) ?? {
        userId: row.user_id,
        name: row.album_name,
        count: 0,
      };
      album.count += 1;
      albums.set(row.album_id, album);
    }

    let deleted = 0;
    let failed = 0;

    for (const [userId, keys] of byUser) {
      const result = await this.storage.deleteKeys(userId, keys);
      deleted += result.deleted;
      failed += result.failed;
    }

    this.logger.log(
      `Retention: removed ${deleted} file(s) across ${albums.size} album(s)` +
        (failed ? `, ${failed} failed` : ''),
    );

    // Told after the fact rather than warned beforehand: the whole point of
    // the setting is not having to think about it. This is a receipt, not a
    // decision to make.
    for (const [, album] of albums) {
      await this.notifier
        .notify([album.userId], {
          topic: 'retention',
          title: 'Delivered files cleaned up',
          body: `${album.count} file${album.count === 1 ? '' : 's'} removed from “${album.name}” as scheduled.`,
          data: { type: 'retention' },
        })
        .catch(() => {
          // Best effort. A missed receipt must not stop the sweep.
        });
    }

    return { albums: albums.size, deleted, failed };
  }

  /**
   * When each of a user's albums is next due to lose files, and how many.
   *
   * Lets a screen say "12 files in 6 days" rather than only echoing the
   * setting back — the difference between a policy and something you can see
   * coming.
   */
  async upcoming(userId: string): Promise<
    { album_id: string; album_name: string; files: number; next_deletion: Date }[]
  > {
    return this.db.query(
      `select a.id as album_id, a.name as album_name,
              count(*)::int as files,
              min(f.created_at + make_interval(days => a.retention_days)) as next_deletion
         from user_files f
         join albums a on a.id = f.album_id
        where a.user_id = $1
          and a.retention_days is not null
          and a.retention_days > 0
        group by a.id, a.name
        order by next_deletion`,
      [userId],
    );
  }
}
