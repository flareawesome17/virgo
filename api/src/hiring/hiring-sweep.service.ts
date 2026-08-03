import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';

/**
 * Closes posts that have run out of time.
 *
 * The board's credibility is the whole asset here. A creative who opens it and
 * finds three jobs from March does not conclude "these are old" — they
 * conclude Virgo is dead, and they do not come back. Nothing in the product
 * expires on its own, so this is what keeps the list honest.
 *
 * The public queries already filter on `expires_at` and `event_date`, so a
 * stale post is never *served* even between sweeps. This exists so the stored
 * status matches what everybody can see — the owner's own list would otherwise
 * show a job as "open" that no applicant can find.
 */
@Injectable()
export class HiringSweepService {
  private readonly logger = new Logger(HiringSweepService.name);
  private running = false;

  constructor(private readonly db: DatabaseService) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async sweep(): Promise<void> {
    // A long sweep overlapping the next one would double-count and, worse,
    // race its own updates.
    if (this.running) return;
    this.running = true;
    try {
      await this.run();
    } catch (error) {
      this.logger.error(`sweep failed: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /** Exposed so it can be triggered in a test or by hand. */
  async run(): Promise<{ expired: number }> {
    const rows = await this.db.query<{ id: string }>(
      `update hiring_posts
          set status = 'expired'
        where status = 'open'
          and (expires_at <= now()
               -- A job for the 19th is worthless on the 20th, whatever its
               -- nominal 30-day window says.
               or (event_date is not null and event_date < current_date))
        returning id`,
      [],
    );

    if (rows.length > 0) {
      this.logger.log(`expired ${rows.length} job post(s)`);
    }
    return { expired: rows.length };
  }
}
