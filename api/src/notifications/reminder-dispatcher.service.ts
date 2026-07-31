import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import { PushService, type PushMessage } from './push.service';

interface DueReminder {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  reminder_time: Date;
  is_alarm_enabled: boolean;
}

/**
 * Sends reminders that have come due.
 *
 * Runs on the API rather than only on the device so a reminder still arrives
 * when the app has been force-quit, reinstalled, or is being used from a second
 * device. The device also schedules a local notification as a belt-and-braces
 * path for when it is offline; `data.reminderId` lets the client dedupe.
 */
@Injectable()
export class ReminderDispatcherService {
  private readonly logger = new Logger(ReminderDispatcherService.name);

  /** Guards against a slow sweep overlapping the next tick. */
  private running = false;

  constructor(
    private readonly db: DatabaseService,
    private readonly push: PushService,
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
        returning id, user_id, title, description, reminder_time, is_alarm_enabled`,
      [],
    );

    if (due.length === 0) return { reminders: 0, sent: 0, failed: 0 };

    // One token lookup per user rather than per reminder.
    const byUser = new Map<string, DueReminder[]>();
    for (const r of due) {
      const list = byUser.get(r.user_id) ?? [];
      list.push(r);
      byUser.set(r.user_id, list);
    }

    const messages: PushMessage[] = [];
    for (const [userId, reminders] of byUser) {
      const tokens = await this.push.tokensFor(userId);
      if (tokens.length === 0) continue;

      for (const reminder of reminders) {
        for (const to of tokens) {
          messages.push({
            to,
            title: reminder.title,
            body: reminder.description ?? 'Reminder',
            // The alarm channel carries sound and a higher importance; the
            // quiet one does not. Both must exist on the device.
            channelId: reminder.is_alarm_enabled ? 'alarms' : 'reminders',
            sound: reminder.is_alarm_enabled ? 'default' : null,
            data: { reminderId: reminder.id, type: 'reminder' },
          });
        }
      }
    }

    const { sent, failed } = await this.push.send(messages);
    if (sent > 0 || failed > 0) {
      this.logger.log(
        `Dispatched ${due.length} reminder(s): ${sent} sent, ${failed} failed`,
      );
    }
    return { reminders: due.length, sent, failed };
  }
}
