import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import { NotifyService, type Delivery } from './notify.service';

interface DueReminder {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  reminder_time: Date;
  updated_at: Date;
  is_alarm_enabled: boolean;
}

/**
 * Sends reminders that have come due.
 *
 * Runs on the API rather than only on the device so a reminder still arrives
 * when the app has been force-quit, reinstalled, or is being used from a second
 * device. The phone also schedules a local notification, which is exact and
 * works offline; a phone that reports it has done so (migration 076) is left
 * out of the push, or the reminder rang twice on it.
 *
 * Delivery goes through NotifyService, so a reminder reaches an open web tab
 * over the socket as well — the web app has no Expo token and used to get
 * nothing at all.
 */
@Injectable()
export class ReminderDispatcherService {
  private readonly logger = new Logger(ReminderDispatcherService.name);

  /** Guards against a slow sweep overlapping the next tick. */
  private running = false;

  constructor(
    private readonly db: DatabaseService,
    private readonly notifier: NotifyService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async sweep(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.dispatchDue();
    } catch (err) {
      this.logger.error(`Reminder sweep failed: ${String(err)}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * Claims and sends every reminder that is due.
   *
   * The claim and the send are separated deliberately: `notified_at` is stamped
   * first, in a single statement, so two API instances sweeping at the same
   * moment cannot both grab the same row and double-notify. The cost is that a
   * send failing after the claim drops that notification rather than retrying —
   * the right trade for an alarm, where a duplicate is worse than a miss and
   * the device's own local notification is the backstop.
   */
  async dispatchDue(): Promise<{ reminders: number; sent: number; failed: number }> {
    const due = await this.db.query<DueReminder>(
      `update reminders
          set notified_at = now()
        where id in (
          select id from reminders
           where notified_at is null
             and is_completed = false
             and reminder_time <= now()
             -- Anything older than a day is stale: the user has long since
             -- seen or missed it, and firing it now is just noise.
             and reminder_time > now() - interval '1 day'
             and (has_push_notification = true or is_alarm_enabled = true)
           order by reminder_time
           limit 200
           for update skip locked
        )
        returning id, user_id, title, description, reminder_time, updated_at, is_alarm_enabled`,
      [],
    );

    if (due.length === 0) return { reminders: 0, sent: 0, failed: 0 };

    // The phones that already have each reminder as a local alarm: they
    // scheduled after it last changed, before it was due (a reminder already
    // past is never scheduled), and far enough ahead to include it.
    const covered = await this.db.query<{ id: string; token: string }>(
      `select r.id, t.token
         from unnest($1::text[], $2::uuid[], $3::timestamptz[], $4::timestamptz[])
                as r(id, user_id, updated_at, reminder_time)
         join push_tokens t
           on t.user_id = r.user_id
          and t.reminders_synced_at >= r.updated_at
          and t.reminders_synced_at < r.reminder_time
          and (t.reminders_covered_until is null
               or t.reminders_covered_until >= r.reminder_time)`,
      [
        due.map((r) => r.id),
        due.map((r) => r.user_id),
        due.map((r) => r.updated_at),
        due.map((r) => r.reminder_time),
      ],
    );
    const skip = new Map<string, string[]>();
    for (const row of covered) skip.set(row.id, [...(skip.get(row.id) ?? []), row.token]);

    const deliveries: Delivery[] = due.map((reminder) => ({
      userId: reminder.user_id,
      topic: 'reminder' as const,
      title: reminder.title,
      body: reminder.description ?? 'Reminder',
      // The alarm channel carries sound and a higher importance; the quiet one
      // does not. Both must exist on the device.
      channelId: reminder.is_alarm_enabled ? ('alarms' as const) : ('reminders' as const),
      sound: reminder.is_alarm_enabled ? ('default' as const) : null,
      data: { reminderId: reminder.id, type: 'reminder' },
      skipTokens: skip.get(reminder.id),
    }));

    const { sent, failed } = await this.notifier.deliver(deliveries);
    if (sent > 0 || failed > 0) {
      this.logger.log(
        `Dispatched ${due.length} reminder(s): ${sent} sent, ${failed} failed`,
      );
    }
    return { reminders: due.length, sent, failed };
  }
}
