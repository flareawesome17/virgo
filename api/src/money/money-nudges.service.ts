import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import { NotifyService, type Delivery } from '../notifications/notify.service';
import { MEDIA_LOCAL_ZONE } from '../storage/capture-time';

/** How long after a shoot it is still worth asking about. */
const ASK_WITHIN_DAYS = 7;
/** At most this many a run; the rest are asked the next morning. */
const BATCH = 500;
/** A payment counts as late, for the one reminder, from this many days on… */
const LATE_AFTER_DAYS = 3;
/** …and is not reminded about at all past this many. */
const LATE_WITHIN_DAYS = 7;

interface DueRow {
  booking_id: string;
  user_id: string;
  post_title: string;
  rate_minor: number | null;
  poster_name: string;
}

/** "₱8,000", "₱8,000.50": how an amount reads in a notification. */
export function pesoText(minor: number): string {
  const whole = Math.floor(minor / 100);
  const cents = minor % 100;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `₱${cents ? `${grouped}.${String(cents).padStart(2, '0')}` : grouped}`;
}

/**
 * "Got paid?" — asked once, the morning after a shoot.
 *
 * For the creative on an agreed, uncancelled booking whose day has passed,
 * who has not recorded being paid for it: no paid entry linked to that
 * booking. Asked at most once per booking (money_booking_prompts.nudged_at),
 * never after "not this", and only about the last week's shoots, so the first
 * run after this ships does not reach back over months.
 *
 * Under the bookings switch in notification settings, since that is what it
 * is about; and it opens the booking, whose screen offers the entry — which
 * also means a phone that has not updated yet still lands somewhere sensible.
 */
@Injectable()
export class MoneyNudgesService {
  private readonly logger = new Logger(MoneyNudgesService.name);
  private running = false;

  constructor(
    private readonly db: DatabaseService,
    private readonly notifier: NotifyService,
  ) {}

  @Cron('0 9 * * *', { name: 'money-got-paid', timeZone: MEDIA_LOCAL_ZONE })
  async askAfterShoots(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      // Claimed under a transaction-scoped advisory lock, so two API processes
      // never ask the same person twice; the asking itself happens after the
      // claim is committed.
      const due = await this.db.transaction(async (tx) => {
        const lock = await tx.query<{ ok: boolean }>(
          "select pg_try_advisory_xact_lock(hashtext('virgo.money-got-paid')) as ok",
        );
        if (!lock.rows[0]?.ok) return [] as DueRow[];
        const result = await tx.query<DueRow>(
          `with due as (
             select b.id as booking_id, b.creative_id as user_id, p.title as post_title,
                    b.rate_minor,
                    coalesce(nullif(trim(o.display_name), ''), split_part(o.email, '@', 1)) as poster_name
               from job_bookings b
               join hiring_posts p on p.id = b.post_id
               join users o on o.id = b.poster_id
              where b.creative_confirmed_at is not null
                and b.cancelled_at is null
                and b.event_date < (now() at time zone $1::text)::date
                and b.event_date >= (now() at time zone $1::text)::date - ${ASK_WITHIN_DAYS}
                and not exists (
                      select 1 from money_entries e
                       where e.user_id = b.creative_id and e.booking_id = b.id
                         and e.paid_on is not null)
              order by b.event_date
              limit ${BATCH}
           ),
           claimed as (
             insert into money_booking_prompts (user_id, booking_id, nudged_at)
             select user_id, booking_id, now() from due
             on conflict (user_id, booking_id) do update set nudged_at = excluded.nudged_at
              where money_booking_prompts.nudged_at is null
                and money_booking_prompts.dismissed_at is null
             returning user_id, booking_id
           )
           select due.* from due join claimed using (user_id, booking_id)`,
          [MEDIA_LOCAL_ZONE],
        );
        return result.rows;
      });
      if (due.length === 0) return 0;

      const deliveries: Delivery[] = due.map((d) => ({
        userId: d.user_id,
        topic: 'booking',
        title: `Got paid for “${d.post_title}”?`,
        body:
          d.rate_minor && d.rate_minor > 0
            ? `${pesoText(d.rate_minor)} from ${d.poster_name}. Record it in Money when it lands — or now, if it has.`
            : 'Record it in Money when it lands, so you know what the shoot really earned.',
        data: { type: 'booking', bookingId: d.booking_id },
      }));
      const { sent } = await this.notifier.deliver(deliveries);
      this.logger.log(`Asked ${due.length} creative(s) whether they were paid (${sent} pushed)`);
      return due.length;
    } catch (err) {
      this.logger.error(`"Got paid?" run failed: ${String(err)}`);
      return 0;
    } finally {
      this.running = false;
    }
  }

  /**
   * Payments a client owes: told the day before they are due, and once when
   * they are three days late — so the creative can send the statement, or
   * mark it received if it already came. Each said once per entry; a late
   * payment from more than a week back is left alone, so the first run after
   * this ships does not reach back over months.
   */
  @Cron('5 9 * * *', { name: 'money-payment-reminders', timeZone: MEDIA_LOCAL_ZONE })
  async remindPayments(): Promise<number> {
    if (this.reminding) return 0;
    this.reminding = true;
    try {
      const due = await this.db.transaction(async (tx) => {
        const lock = await tx.query<{ ok: boolean }>(
          "select pg_try_advisory_xact_lock(hashtext('virgo.money-payment-reminders')) as ok",
        );
        if (!lock.rows[0]?.ok) return [] as PaymentRow[];
        const result = await tx.query<PaymentRow>(
          `with today as (select (now() at time zone $1::text)::date as d),
           soon as (
             update money_entries e set due_reminded_at = now()
               from today
              where e.kind = 'income' and e.paid_on is null and e.due_reminded_at is null
                and e.occurred_on = today.d + 1
             returning e.id, e.user_id, e.amount_minor, e.withheld_minor, e.counterparty,
                       e.package_id, e.occurred_on, 'soon'::text as stage
           ),
           late as (
             update money_entries e set overdue_reminded_at = now()
               from today
              where e.kind = 'income' and e.paid_on is null and e.overdue_reminded_at is null
                and e.occurred_on between today.d - ${LATE_WITHIN_DAYS} and today.d - ${LATE_AFTER_DAYS}
             returning e.id, e.user_id, e.amount_minor, e.withheld_minor, e.counterparty,
                       e.package_id, e.occurred_on, 'late'::text as stage
           ),
           told as (select * from soon union all select * from late)
           select told.*, p.title as package_title, p.share_token is not null as shared
             from told left join money_packages p on p.id = told.package_id`,
          [MEDIA_LOCAL_ZONE],
        );
        return result.rows;
      });
      if (due.length === 0) return 0;

      const deliveries: Delivery[] = due.map((d) => {
        const amount = pesoText(d.amount_minor - d.withheld_minor);
        const who = d.counterparty ?? 'Your client';
        const what = d.package_title ? ` for “${d.package_title}”` : '';
        const next = d.shared
          ? 'Send them the statement again if they need a reminder.'
          : 'Share the statement from Money if they need a reminder.';
        return {
          userId: d.user_id,
          topic: 'money',
          title: d.stage === 'soon' ? `${amount} is due tomorrow` : `${amount} is overdue`,
          body:
            d.stage === 'soon'
              ? `${who}'s payment${what}. ${next}`
              : `${who}'s payment${what} was due ${shortDay(d.occurred_on)}. ${next} Or mark it received, if it came.`,
          data: {
            type: 'money',
            entryId: d.id,
            ...(d.package_id ? { packageId: d.package_id } : {}),
          },
        };
      });
      const { sent } = await this.notifier.deliver(deliveries);
      this.logger.log(`Reminded about ${due.length} payment(s) (${sent} pushed)`);
      return due.length;
    } catch (err) {
      this.logger.error(`Payment reminders failed: ${String(err)}`);
      return 0;
    } finally {
      this.reminding = false;
    }
  }

  private reminding = false;
}

interface PaymentRow {
  id: string;
  user_id: string;
  amount_minor: number;
  withheld_minor: number;
  counterparty: string | null;
  package_id: string | null;
  occurred_on: string;
  stage: 'soon' | 'late';
  package_title: string | null;
  shared: boolean | null;
}

/** "Oct 6" for a YYYY-MM-DD day. */
function shortDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
