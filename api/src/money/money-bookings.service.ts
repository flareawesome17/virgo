import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { MEDIA_LOCAL_ZONE } from '../storage/capture-time';
import type { MoneyKind } from './money.categories';

/** The booking an entry was recorded from, as much as its ledger needs. */
export interface MoneyBookingLink {
  id: string;
  postTitle: string;
  role: string | null;
  eventDate: string | null;
  /** Cancelled since: the entry stays, but the person should know. */
  cancelled: boolean;
}

/**
 * An entry Money offers to record for an agreed booking, filled in from it.
 * Nothing is written until the person records it.
 */
export interface MoneySuggestion {
  bookingId: string;
  /** Income for the creative who was hired, an expense for whoever hired. */
  kind: MoneyKind;
  category: string;
  /** The agreed rate in centavos, or null when none was set. */
  amountMinor: number | null;
  /** The shoot day — or today, for a booking with no date. */
  occurredOn: string;
  /** Whether to start the form as paid: the shoot day has come. */
  paid: boolean;
  /** The other person on the booking. */
  counterparty: string;
  note: string;
  postTitle: string;
  role: string | null;
  eventDate: string | null;
}

interface SuggestionRow {
  id: string;
  poster_id: string;
  role: string | null;
  event_date: string | null;
  rate_minor: number | null;
  post_title: string;
  other_name: string;
  today: string;
}

/** How far back an agreed booking is still offered on its own. */
const OFFER_DAYS = 90;

/**
 * Money's side of bookings: what to offer, what an entry was recorded from,
 * and whether a booking is the caller's to record at all.
 *
 * Every query is scoped to bookings the caller is on — either side. A
 * booking id alone is never enough to read what two other people agreed.
 */
@Injectable()
export class MoneyBookingsService {
  constructor(private readonly db: DatabaseService) {}

  /** Refuses a booking the caller is not on, the same way as one that does not exist. */
  async assertParty(userId: string, bookingId: string): Promise<void> {
    const row = await this.db.queryOne<{ one: number }>(
      `select 1 as one from job_bookings
        where id = $1 and (poster_id = $2 or creative_id = $2)`,
      [bookingId, userId],
    );
    if (!row) throw new BadRequestException("That booking isn't one of yours.");
  }

  /** The bookings these entries were recorded from, by booking id. */
  async linksFor(userId: string, bookingIds: readonly string[]): Promise<Map<string, MoneyBookingLink>> {
    const links = new Map<string, MoneyBookingLink>();
    const unique = [...new Set(bookingIds)];
    if (unique.length === 0) return links;
    const rows = await this.db.query<{
      id: string;
      role: string | null;
      event_date: string | null;
      cancelled_at: Date | null;
      post_title: string;
    }>(
      `select b.id, b.role, b.event_date, b.cancelled_at, p.title as post_title
         from job_bookings b
         join hiring_posts p on p.id = b.post_id
        where b.id = any($1::uuid[]) and (b.poster_id = $2 or b.creative_id = $2)`,
      [unique, userId],
    );
    for (const r of rows) {
      links.set(r.id, {
        id: r.id,
        postTitle: r.post_title,
        role: r.role,
        eventDate: r.event_date,
        cancelled: r.cancelled_at !== null,
      });
    }
    return links;
  }

  /**
   * Agreed bookings the caller has not recorded yet and has not turned down:
   * soonest shoot first, from the last 90 days on. With `bookingId`, just that
   * one, however old — the booking's own screen offers it whenever it is open.
   */
  async suggestions(userId: string, bookingId: string | null = null): Promise<MoneySuggestion[]> {
    const rows = await this.db.query<SuggestionRow>(
      `select b.id, b.poster_id, b.role, b.event_date, b.rate_minor,
              p.title as post_title,
              coalesce(nullif(trim(o.display_name), ''), split_part(o.email, '@', 1)) as other_name,
              (now() at time zone $3::text)::date::text as today
         from job_bookings b
         join hiring_posts p on p.id = b.post_id
         join users o
           on o.id = case when b.poster_id = $1 then b.creative_id else b.poster_id end
        where (b.poster_id = $1 or b.creative_id = $1)
          and b.creative_confirmed_at is not null
          and b.cancelled_at is null
          and ($2::uuid is null or b.id = $2::uuid)
          and ($2::uuid is not null
               or b.event_date is null
               or b.event_date >= (now() at time zone $3::text)::date - ${OFFER_DAYS})
          and not exists (
                select 1 from money_entries e where e.user_id = $1 and e.booking_id = b.id)
          and not exists (
                select 1 from money_booking_prompts m
                 where m.user_id = $1 and m.booking_id = b.id and m.dismissed_at is not null)
        order by b.event_date nulls last, b.created_at
        limit 50`,
      [userId, bookingId, MEDIA_LOCAL_ZONE],
    );
    return rows.map((r) => {
      const kind: MoneyKind = r.poster_id === userId ? 'expense' : 'income';
      return {
        bookingId: r.id,
        kind,
        // Who hired is paying crew; who was hired earned a fee — an editor's
        // for editing, which is worth telling apart at tax time.
        category: kind === 'expense' ? 'crew' : /editor/i.test(r.role ?? '') ? 'editing' : 'job',
        amountMinor: r.rate_minor && r.rate_minor > 0 ? r.rate_minor : null,
        occurredOn: r.event_date ?? r.today,
        paid: r.event_date !== null && r.event_date <= r.today,
        counterparty: r.other_name.slice(0, 120),
        note: (r.role ? `${r.post_title} · ${r.role}` : r.post_title).slice(0, 1000),
        postTitle: r.post_title,
        role: r.role,
        eventDate: r.event_date,
      };
    });
  }

  /** "Not this": the booking is not offered to this person again. */
  async dismiss(userId: string, bookingId: string): Promise<void> {
    const row = await this.db.queryOne<{ one: number }>(
      `select 1 as one from job_bookings
        where id = $1 and (poster_id = $2 or creative_id = $2)`,
      [bookingId, userId],
    );
    if (!row) throw new NotFoundException('Booking not found');
    await this.db.query(
      `insert into money_booking_prompts (user_id, booking_id, dismissed_at)
       values ($1, $2, now())
       on conflict (user_id, booking_id) do update set dismissed_at = now()`,
      [userId, bookingId],
    );
  }
}
