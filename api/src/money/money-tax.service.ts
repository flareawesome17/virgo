import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { MEDIA_LOCAL_ZONE } from '../storage/capture-time';
import {
  estimateTax,
  taxDeadlines,
  VAT_THRESHOLD_MINOR,
  VAT_WARNING_MINOR,
  type TaxDeadline,
  type TaxEstimates,
} from './money-tax';

/** One client's withholding in one quarter: what a single 2307 covers. */
export interface Form2307Group {
  /** As typed on the entries, the spelling used most; null when none was. */
  client: string | null;
  quarter: 1 | 2 | 3 | 4;
  withheldMinor: number;
  grossMinor: number;
  entries: { id: string; paidOn: string; amountMinor: number; withheldMinor: number; received: boolean }[];
  /** Every entry in it ticked: the form is in hand. */
  received: boolean;
}

export interface MoneyTax {
  year: number;
  /** Counted up to here: today while the year runs, else 31 December. */
  through: string;
  /** Income paid in the year, before withholding: gross receipts. */
  grossMinor: number;
  expenseMinor: number;
  /** What clients withheld: the credit their 2307s carry. */
  withheldMinor: number;
  quarters: { quarter: 1 | 2 | 3 | 4; grossMinor: number; expenseMinor: number; withheldMinor: number }[];
  /** Gross against the ₱3M VAT line. */
  threshold: { limitMinor: number; warnMinor: number; status: 'under' | 'near' | 'over' };
  /** Null above the VAT line, where none of the three applies. */
  estimates: TaxEstimates | null;
  form2307: Form2307Group[];
  deadlines: TaxDeadline[];
}

function manilaToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MEDIA_LOCAL_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Tax help: the numbers a self-employed creative's returns are made from,
 * three estimates of what they might owe, the 2307s to collect, and when
 * each return is due. Read from the ledger, counted on the day money moved
 * (cash basis), and strictly the caller's own.
 *
 * Estimates for planning. Nothing here files, certifies or advises, and the
 * clients say so wherever these numbers show.
 */
@Injectable()
export class MoneyTaxService {
  constructor(private readonly db: DatabaseService) {}

  async year(userId: string, year: number): Promise<MoneyTax> {
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;
    const today = manilaToday();
    const through = Number(today.slice(0, 4)) === year ? today : to;

    const [quarters, withheld] = await Promise.all([
      this.db.query<{ quarter: number; gross: string; expense: string; withheld: string }>(
        `select extract(quarter from paid_on)::int as quarter,
                coalesce(sum(amount_minor) filter (where kind = 'income'), 0)::text as gross,
                coalesce(sum(amount_minor) filter (where kind = 'expense'), 0)::text as expense,
                coalesce(sum(withheld_minor) filter (where kind = 'income'), 0)::text as withheld
           from money_entries
          where user_id = $1 and paid_on between $2::date and $3::date
          group by 1`,
        [userId, from, to],
      ),
      this.db.query<{
        id: string;
        counterparty: string | null;
        paid_on: string;
        amount_minor: number;
        withheld_minor: number;
        received: boolean;
      }>(
        `select id, counterparty, paid_on, amount_minor, withheld_minor,
                form_2307_at is not null as received
           from money_entries
          where user_id = $1 and kind = 'income' and withheld_minor > 0
            and paid_on between $2::date and $3::date
          order by paid_on, created_at
          limit 2000`,
        [userId, from, to],
      ),
    ]);

    const byQuarter = new Map(quarters.map((q) => [q.quarter, q]));
    const quarterList = ([1, 2, 3, 4] as const).map((quarter) => {
      const q = byQuarter.get(quarter);
      return {
        quarter,
        grossMinor: Number(q?.gross ?? 0),
        expenseMinor: Number(q?.expense ?? 0),
        withheldMinor: Number(q?.withheld ?? 0),
      };
    });
    const grossMinor = quarterList.reduce((n, q) => n + q.grossMinor, 0);
    const expenseMinor = quarterList.reduce((n, q) => n + q.expenseMinor, 0);
    const withheldMinor = quarterList.reduce((n, q) => n + q.withheldMinor, 0);

    // A client issues one 2307 a quarter for what they withheld in it, so the
    // checklist is grouped that way: by the client's name, however it was
    // typed, and the quarter it was paid in.
    const groups = new Map<string, Form2307Group & { names: Map<string, number> }>();
    for (const e of withheld) {
      const name = e.counterparty?.trim() || null;
      const quarter = (Math.floor((Number(e.paid_on.slice(5, 7)) - 1) / 3) + 1) as 1 | 2 | 3 | 4;
      const key = `${name?.toLowerCase() ?? ''}|${quarter}`;
      let group = groups.get(key);
      if (!group) {
        group = { client: name, quarter, withheldMinor: 0, grossMinor: 0, entries: [], received: true, names: new Map() };
        groups.set(key, group);
      }
      if (name) group.names.set(name, (group.names.get(name) ?? 0) + 1);
      group.withheldMinor += e.withheld_minor;
      group.grossMinor += e.amount_minor;
      group.received &&= e.received;
      group.entries.push({
        id: e.id,
        paidOn: e.paid_on,
        amountMinor: e.amount_minor,
        withheldMinor: e.withheld_minor,
        received: e.received,
      });
    }
    const form2307 = [...groups.values()]
      .map(({ names, ...group }) => ({
        ...group,
        client: names.size > 0 ? [...names.entries()].sort((a, b) => b[1] - a[1])[0][0] : null,
      }))
      // Still to collect first, then by quarter and client.
      .sort(
        (a, b) =>
          Number(a.received) - Number(b.received) ||
          a.quarter - b.quarter ||
          (a.client ?? '').localeCompare(b.client ?? ''),
      );

    return {
      year,
      through,
      grossMinor,
      expenseMinor,
      withheldMinor,
      quarters: quarterList,
      threshold: {
        limitMinor: VAT_THRESHOLD_MINOR,
        warnMinor: VAT_WARNING_MINOR,
        status:
          grossMinor > VAT_THRESHOLD_MINOR ? 'over' : grossMinor >= VAT_WARNING_MINOR ? 'near' : 'under',
      },
      estimates: estimateTax({ grossMinor, expenseMinor, withheldMinor }),
      form2307,
      deadlines: taxDeadlines(year),
    };
  }

  /**
   * Ticks entries' 2307s as received, or not — usually a client's whole
   * quarter at once, which is what one form covers. Only the caller's income
   * with tax withheld; anything else in the list is refused, not skipped,
   * so a mistake is seen.
   */
  async mark2307(userId: string, entryIds: string[], received: boolean): Promise<{ updated: number }> {
    const unique = [...new Set(entryIds)];
    // In a transaction, so a refused list changes nothing at all.
    return this.db.transaction(async (tx) => {
      const result = await tx.query<{ id: string }>(
        `update money_entries
            set form_2307_at = case when $3::boolean then coalesce(form_2307_at, now()) else null end
          where id = any($1::uuid[]) and user_id = $2 and kind = 'income' and withheld_minor > 0
          returning id`,
        [unique, userId, received],
      );
      if (result.rows.length !== unique.length) {
        throw new BadRequestException('Only your own income with tax withheld has a 2307.');
      }
      return { updated: result.rows.length };
    });
  }
}
