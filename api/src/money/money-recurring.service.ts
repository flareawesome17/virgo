import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { MEDIA_LOCAL_ZONE } from '../storage/capture-time';
import { MONEY_CATEGORIES, type MoneyKind, type MoneyMethod } from './money.categories';

/** An entry that repeats every month, made into a real one when its day comes. */
export interface MoneyRecurring {
  id: string;
  kind: MoneyKind;
  amountMinor: number;
  withheldMinor: number;
  category: string;
  method: MoneyMethod | null;
  counterparty: string | null;
  note: string | null;
  /** The day of the month it falls on, 1 to 28. */
  dayOfMonth: number;
  /** When the next entry is made; meaningless once stopped. */
  nextOn: string;
  stopped: boolean;
  createdAt: string;
}

/** What can change about one: later entries follow, entries already made stay. */
export interface MoneyRecurringPatch {
  amountMinor?: number;
  withheldMinor?: number;
  category?: string;
  method?: MoneyMethod | null;
  counterparty?: string | null;
  note?: string | null;
}

interface RecurringRow {
  id: string;
  user_id: string;
  kind: MoneyKind;
  amount_minor: number;
  withheld_minor: number;
  category: string;
  method: MoneyMethod | null;
  counterparty: string | null;
  note: string | null;
  day_of_month: number;
  next_on: string;
  stopped_at: Date | null;
  created_at: Date;
}

/** At most this many running at once per account. */
export const MAX_RECURRING = 50;
/** Months made in one go: how far back repeating an old entry reaches. */
const CATCH_UP_MONTHS = 12;

function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** "the 5th": what a day of the month is called. */
export function dayName(day: number): string {
  const suffix =
    day >= 11 && day <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[day % 10] ?? 'th';
  return `the ${day}${suffix}`;
}

/**
 * Entries that repeat monthly: the Adobe subscription, the studio rent, a
 * retainer. Started from an entry the person already saved — "repeat this
 * every month" — and from then on an ordinary entry is made from it on its
 * day: an expense as paid, since a subscription takes the money itself;
 * income as due, for the creative to mark received like any other.
 *
 * Made at most once per template per day: the unique index on
 * (recurring_id, occurred_on) holds even if two runs overlap.
 */
@Injectable()
export class MoneyRecurringService {
  private readonly logger = new Logger(MoneyRecurringService.name);
  private running = false;

  constructor(private readonly db: DatabaseService) {}

  private present(r: RecurringRow): MoneyRecurring {
    return {
      id: r.id,
      kind: r.kind,
      amountMinor: r.amount_minor,
      withheldMinor: r.withheld_minor,
      category: r.category,
      method: r.method,
      counterparty: r.counterparty,
      note: r.note,
      dayOfMonth: r.day_of_month,
      nextOn: r.next_on,
      stopped: r.stopped_at !== null,
      createdAt: r.created_at.toISOString(),
    };
  }

  /** What repeats: running ones first, soonest next; then stopped ones. */
  async list(userId: string): Promise<MoneyRecurring[]> {
    const rows = await this.db.query<RecurringRow>(
      `select * from money_recurring where user_id = $1
        order by (stopped_at is not null), next_on, created_at
        limit 100`,
      [userId],
    );
    return rows.map((r) => this.present(r));
  }

  /**
   * Repeats one of the caller's entries every month on the same day (the
   * 28th, for days past it). The entry becomes the first of them; the next
   * falls a month after it. An entry dated months back is caught up at once —
   * up to a year of them — so the ledger reads as if it had repeated all
   * along, and the note says how many were added.
   */
  async create(
    userId: string,
    entryId: string,
  ): Promise<{ recurring: MoneyRecurring; added: number; note: string }> {
    return this.db.transaction(async (tx) => {
      const entry = await tx.query<{
        kind: MoneyKind;
        amount_minor: number;
        withheld_minor: number;
        category: string;
        method: MoneyMethod | null;
        counterparty: string | null;
        note: string | null;
        occurred_on: string;
        recurring_id: string | null;
      }>(
        `select kind, amount_minor, withheld_minor, category, method, counterparty, note,
                occurred_on, recurring_id
           from money_entries where id = $1 and user_id = $2
           for update`,
        [entryId, userId],
      );
      const source = entry.rows[0];
      if (!source) throw new NotFoundException('Entry not found');
      if (source.recurring_id) {
        throw new ConflictException('This entry already repeats every month.');
      }
      // Counted under a per-account lock, so two quick taps can't both slip
      // in under the cap.
      await tx.query('select pg_advisory_xact_lock(hashtext($1))', [`virgo.money-recurring:${userId}`]);
      const running = await tx.query<{ n: number }>(
        'select count(*)::int as n from money_recurring where user_id = $1 and stopped_at is null',
        [userId],
      );
      if ((running.rows[0]?.n ?? 0) >= MAX_RECURRING) {
        throw new BadRequestException(
          `You can have up to ${MAX_RECURRING} repeating entries. Stop one you no longer need first.`,
        );
      }
      const day = Math.min(Number(source.occurred_on.slice(8, 10)), 28);
      const inserted = await tx.query<RecurringRow>(
        `insert into money_recurring
           (user_id, kind, amount_minor, withheld_minor, category, method, counterparty, note,
            day_of_month, next_on)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9::int,
                 (date_trunc('month', $10::date) + interval '1 month')::date + ($9::int - 1))
         returning *`,
        [
          userId,
          source.kind,
          source.amount_minor,
          source.withheld_minor,
          source.category,
          source.method,
          source.counterparty,
          source.note,
          day,
          source.occurred_on,
        ],
      );
      const recurring = inserted.rows[0];
      await tx.query('update money_entries set recurring_id = $1 where id = $2', [recurring.id, entryId]);
      const added = await this.makeDue(tx, recurring.id);
      const fresh = await tx.query<RecurringRow>('select * from money_recurring where id = $1', [recurring.id]);
      const every = `Repeats every month on ${dayName(day)}.`;
      return {
        recurring: this.present(fresh.rows[0]),
        added,
        note:
          added === 0
            ? every
            : `${every} Added ${added} month${added === 1 ? '' : 's'} since this one.`,
      };
    });
  }

  /** Changes what later entries will be; entries already made stay as they are. */
  async update(userId: string, id: string, patch: MoneyRecurringPatch): Promise<MoneyRecurring> {
    const current = await this.db.queryOne<RecurringRow>(
      'select * from money_recurring where id = $1 and user_id = $2',
      [id, userId],
    );
    if (!current) throw new NotFoundException('Repeating entry not found');
    const next = {
      amountMinor: patch.amountMinor ?? current.amount_minor,
      withheldMinor: patch.withheldMinor ?? current.withheld_minor,
      category: patch.category ?? current.category,
      method: patch.method !== undefined ? patch.method : current.method,
      counterparty: patch.counterparty !== undefined ? text(patch.counterparty) : current.counterparty,
      note: patch.note !== undefined ? text(patch.note) : current.note,
    };
    if (!MONEY_CATEGORIES[current.kind].includes(next.category)) {
      throw new BadRequestException(
        current.kind === 'income'
          ? 'Pick an income category for this entry.'
          : 'Pick an expense category for this entry.',
      );
    }
    if (current.kind === 'expense' && next.withheldMinor > 0) {
      throw new BadRequestException('Only income can have tax withheld.');
    }
    if (next.withheldMinor > next.amountMinor) {
      throw new BadRequestException("Tax withheld can't be more than the amount.");
    }
    const row = await this.db.queryOne<RecurringRow>(
      `update money_recurring
          set amount_minor = $3, withheld_minor = $4, category = $5, method = $6,
              counterparty = $7, note = $8
        where id = $1 and user_id = $2
        returning *`,
      [
        id,
        userId,
        next.amountMinor,
        next.withheldMinor,
        next.category,
        next.method,
        next.counterparty,
        next.note,
      ],
    );
    return this.present(row!);
  }

  /** Stops it for good. The entries it made stay: they are money that moved. */
  async stop(userId: string, id: string): Promise<void> {
    const rows = await this.db.query<{ id: string }>(
      `update money_recurring set stopped_at = coalesce(stopped_at, now())
        where id = $1 and user_id = $2 returning id`,
      [id, userId],
    );
    if (rows.length === 0) throw new NotFoundException('Repeating entry not found');
  }

  /**
   * Makes the entries that are due — for one template, or (with no id) for
   * every running one — a month per pass, catching up should the job have
   * missed days. Each template's row is locked while it is advanced, and the
   * unique index refuses a second entry for the same day, so overlap is
   * harmless.
   */
  private async makeDue(tx: PoolClient, onlyId: string | null = null): Promise<number> {
    let made = 0;
    for (let pass = 0; pass < CATCH_UP_MONTHS; pass++) {
      const due = await tx.query<RecurringRow>(
        `select * from money_recurring
          where stopped_at is null
            and next_on <= (now() at time zone $1::text)::date
            and ($2::uuid is null or id = $2::uuid)
          order by next_on
          limit 500
          for update skip locked`,
        [MEDIA_LOCAL_ZONE, onlyId],
      );
      if (due.rows.length === 0) break;
      for (const r of due.rows) {
        const inserted = await tx.query(
          `insert into money_entries
             (user_id, kind, amount_minor, withheld_minor, category, occurred_on, paid_on, method,
              counterparty, note, recurring_id)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           on conflict (recurring_id, occurred_on) where recurring_id is not null do nothing`,
          [
            r.user_id,
            r.kind,
            r.amount_minor,
            r.withheld_minor,
            r.category,
            r.next_on,
            // A subscription takes its money itself; income waits to be received.
            r.kind === 'expense' ? r.next_on : null,
            r.method,
            r.counterparty,
            r.note,
            r.id,
          ],
        );
        made += inserted.rowCount ?? 0;
        await tx.query(
          `update money_recurring
              set next_on = (date_trunc('month', next_on) + interval '1 month')::date + (day_of_month - 1)
            where id = $1`,
          [r.id],
        );
      }
    }
    return made;
  }

  /** Early each morning, before anyone opens Money. */
  @Cron('0 6 * * *', { name: 'money-recurring', timeZone: MEDIA_LOCAL_ZONE })
  async run(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const made = await this.db.transaction(async (tx) => {
        const lock = await tx.query<{ ok: boolean }>(
          "select pg_try_advisory_xact_lock(hashtext('virgo.money-recurring')) as ok",
        );
        if (!lock.rows[0]?.ok) return 0;
        return this.makeDue(tx);
      });
      if (made > 0) this.logger.log(`Made ${made} repeating entr${made === 1 ? 'y' : 'ies'}`);
      return made;
    } catch (err) {
      this.logger.error(`Repeating entries failed: ${String(err)}`);
      return 0;
    } finally {
      this.running = false;
    }
  }
}
