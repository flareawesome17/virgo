import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import { NotifyService } from '../notifications/notify.service';

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

  constructor(
    private readonly db: DatabaseService,
    private readonly notifier: NotifyService,
  ) {}

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
  async run(): Promise<{ expired: number; declined: number }> {
    /*
     * Expiring a post now answers the people still waiting on it, as closing
     * one does. It used to leave them "new" for ever: the poster's dot never
     * cleared, Accept stayed on offer for a job that was over, and nobody
     * who applied was ever told.
     *
     * The applications are locked in id order, the order a block and closing
     * a post both use, so the three cannot deadlock each other.
     */
    const { posts, declined } = await this.db.transaction(async (client) => {
      const expired = await client.query<{ id: string; title: string }>(
        `update hiring_posts
            set status = 'expired'
          where status = 'open'
            and (expires_at <= now()
                 -- A job for the 19th is worthless on the 20th, whatever its
                 -- nominal 30-day window says.
                 or (event_date is not null and event_date < current_date))
          returning id, title`,
        [],
      );
      if (expired.rows.length === 0) return { posts: [], declined: [] };

      const answered = await client.query<{ user_id: string; post_id: string }>(
        `update hiring_applications
            set status = 'declined', responded_at = now()
          where id in (select id from hiring_applications
                        where post_id = any($1::uuid[])
                          and status in ('new', 'shortlisted')
                        order by id
                          for update)
          returning user_id, post_id`,
        [expired.rows.map((p) => p.id)],
      );
      return { posts: expired.rows, declined: answered.rows };
    });

    // Outside the transaction: a notification that fails must not undo the
    // sweep, and the next one would only find nothing left to do.
    for (const post of posts) {
      const people = [...new Set(declined.filter((d) => d.post_id === post.id).map((d) => d.user_id))];
      if (people.length === 0) continue;
      try {
        await this.notifier.notify(people, {
          topic: 'job-response',
          title: 'Job ended',
          body: `“${post.title}” has ended, and your application closed with it.`,
          data: { type: 'job_response', postId: post.id, status: 'declined' },
        });
      } catch (error) {
        this.logger.warn(`could not tell applicants post ${post.id} ended: ${(error as Error).message}`);
      }
    }

    if (posts.length > 0) {
      this.logger.log(
        `expired ${posts.length} job post(s); ${declined.length} waiting application(s) declined`,
      );
    }
    return { expired: posts.length, declined: declined.length };
  }
}
