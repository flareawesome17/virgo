import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';

/** Days a past event is kept before it is deleted. Override with EVENT_RETENTION_DAYS. */
const DEFAULT_RETENTION_DAYS = 30;

/**
 * Deletes events once they are long past.
 *
 * Not deleted the moment the date rolls over: an event finished yesterday is
 * still the most useful thing on the schedule this morning, and a shoot is
 * often reviewed for days afterwards. The window is a compromise between
 * clearing clutter and destroying a record of work — it is deliberately a
 * setting, not a constant, because the right answer depends on the studio.
 *
 * A reminder attached to a deleted event survives: its foreign key is
 * `on delete set null`, so the reminder detaches rather than disappearing with
 * something the user may not have realised was linked.
 */
@Injectable()
export class EventCleanupService {
  private readonly logger = new Logger(EventCleanupService.name);
  private running = false;

  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  private retentionDays(): number {
    const raw = Number(this.config.get<string>('EVENT_RETENTION_DAYS'));
    // A zero or negative window would delete today's events, so anything not a
    // sane positive number falls back to the default.
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_RETENTION_DAYS;
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async sweep(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const { deleted, days } = await this.purgeExpired();
      if (deleted > 0) {
        this.logger.log(`Removed ${deleted} event(s) older than ${days} days`);
      }
    } catch (err) {
      this.logger.error(`Event cleanup failed: ${String(err)}`);
    } finally {
      this.running = false;
    }
  }

  async purgeExpired(): Promise<{ deleted: number; days: number }> {
    const days = this.retentionDays();
    const rows = await this.db.query<{ id: string }>(
      // event_date is a plain date, so this compares whole days and is not
      // affected by the server's timezone.
      `delete from schedule_events
        where event_date < current_date - ($1::int)
        returning id`,
      [days],
    );
    return { deleted: rows.length, days };
  }
}
