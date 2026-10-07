import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { MEDIA_LOCAL_ZONE } from '../storage/capture-time';
import type { MoneyKind } from './money.categories';

export interface MoneyInsights {
  year: number;
  /** The years that have anything filed in them, newest first: what the switcher offers. */
  years: number[];
  /** January to December: money that moved in each month. */
  months: { month: string; incomeMinor: number; expenseMinor: number }[];
  incomeMinor: number;
  /** Of the income, what clients withheld. */
  withheldMinor: number;
  expenseMinor: number;
  /**
   * The year before, over the same stretch of days — all of it for a past
   * year, January to today's date for this one — so the two compare fairly.
   */
  lastYear: { incomeMinor: number; expenseMinor: number; through: string };
  /** Paid in the year, by kind and category, largest first. */
  byCategory: { kind: MoneyKind; category: string; totalMinor: number; count: number }[];
  /** Who paid the most, by the name on the entries. Up to eight. */
  topClients: { name: string; totalMinor: number; count: number }[];
  /** Income with no client named: the part topClients can't account for. */
  unnamedIncomeMinor: number;
  /**
   * Packages with money moving in the year, best earners first: what each
   * job brought in so far, what it cost, and the difference. Up to ten.
   */
  packages: {
    id: string;
    title: string;
    clientName: string | null;
    receivedMinor: number;
    costsMinor: number;
    profitMinor: number;
  }[];
}

/** Today in the Philippines, as YYYY-MM-DD. */
function manilaToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MEDIA_LOCAL_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Insights: a year of the ledger at a glance. Read-only, and — like the rest
 * of Money — strictly the caller's own entries.
 *
 * Counted when the money moved (paid_on), the way the summary and a
 * quarterly return count it: an unpaid invoice from March is not March's
 * income until it lands.
 */
@Injectable()
export class MoneyInsightsService {
  constructor(private readonly db: DatabaseService) {}

  async year(userId: string, year: number): Promise<MoneyInsights> {
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;
    const today = manilaToday();
    // Last year up to the same date, while this year is still running.
    const through =
      Number(today.slice(0, 4)) === year
        ? today.slice(5) === '02-29'
          ? `${year - 1}-02-28`
          : `${year - 1}-${today.slice(5)}`
        : `${year - 1}-12-31`;

    const [years, months, totals, previous, categories, clients, packages] = await Promise.all([
      this.db.query<{ year: number }>(
        `select distinct extract(year from filed_on)::int as year
           from money_entries where user_id = $1
          order by year desc`,
        [userId],
      ),
      this.db.query<{ month: string; income: string; expense: string }>(
        `select to_char(paid_on, 'YYYY-MM') as month,
                coalesce(sum(amount_minor) filter (where kind = 'income'), 0)::text as income,
                coalesce(sum(amount_minor) filter (where kind = 'expense'), 0)::text as expense
           from money_entries
          where user_id = $1 and paid_on between $2::date and $3::date
          group by 1`,
        [userId, from, to],
      ),
      this.db.queryOne<{ income: string; withheld: string; expense: string; unnamed: string }>(
        `select coalesce(sum(amount_minor) filter (where kind = 'income'), 0)::text as income,
                coalesce(sum(withheld_minor) filter (where kind = 'income'), 0)::text as withheld,
                coalesce(sum(amount_minor) filter (where kind = 'expense'), 0)::text as expense,
                coalesce(sum(amount_minor) filter (
                  where kind = 'income' and nullif(trim(counterparty), '') is null), 0)::text as unnamed
           from money_entries
          where user_id = $1 and paid_on between $2::date and $3::date`,
        [userId, from, to],
      ),
      this.db.queryOne<{ income: string; expense: string }>(
        `select coalesce(sum(amount_minor) filter (where kind = 'income'), 0)::text as income,
                coalesce(sum(amount_minor) filter (where kind = 'expense'), 0)::text as expense
           from money_entries
          where user_id = $1 and paid_on between $2::date and $3::date`,
        [userId, `${year - 1}-01-01`, through],
      ),
      this.db.query<{ kind: MoneyKind; category: string; total: string; count: number }>(
        `select kind, category, sum(amount_minor)::text as total, count(*)::int as count
           from money_entries
          where user_id = $1 and paid_on between $2::date and $3::date
          group by kind, category
          order by sum(amount_minor) desc, category`,
        [userId, from, to],
      ),
      // "Studio Lumen" and "studio lumen " are the same client; the name shown
      // is the spelling used most.
      this.db.query<{ name: string; total: string; count: number }>(
        `select mode() within group (order by trim(counterparty)) as name,
                sum(amount_minor)::text as total, count(*)::int as count
           from money_entries
          where user_id = $1 and kind = 'income' and paid_on between $2::date and $3::date
            and nullif(trim(counterparty), '') is not null
          group by lower(trim(counterparty))
          order by sum(amount_minor) desc, 1
          limit 8`,
        [userId, from, to],
      ),
      // A job's profit is all of it — received to date, less every cost —
      // listed under any year it had money move in.
      this.db.query<{
        id: string;
        title: string;
        client_name: string | null;
        received: string;
        costs: string;
      }>(
        `select p.id, p.title, p.client_name,
                coalesce(sum(e.amount_minor) filter (
                  where e.kind = 'income' and e.paid_on is not null), 0)::text as received,
                coalesce(sum(e.amount_minor) filter (where e.kind = 'expense'), 0)::text as costs
           from money_packages p
           join money_entries e on e.package_id = p.id and e.user_id = p.user_id
          where p.user_id = $1
          group by p.id
         having bool_or(e.paid_on between $2::date and $3::date)
          order by coalesce(sum(e.amount_minor) filter (
                     where e.kind = 'income' and e.paid_on is not null), 0)
                   - coalesce(sum(e.amount_minor) filter (where e.kind = 'expense'), 0) desc,
                   p.title
          limit 10`,
        [userId, from, to],
      ),
    ]);

    const byMonth = new Map(months.map((m) => [m.month, m]));
    const yearList = years.map((y) => y.year);
    if (!yearList.includes(year)) yearList.push(year);
    yearList.sort((a, b) => b - a);

    return {
      year,
      years: yearList,
      months: Array.from({ length: 12 }, (_, i) => {
        const month = `${year}-${String(i + 1).padStart(2, '0')}`;
        const row = byMonth.get(month);
        return {
          month,
          incomeMinor: Number(row?.income ?? 0),
          expenseMinor: Number(row?.expense ?? 0),
        };
      }),
      incomeMinor: Number(totals?.income ?? 0),
      withheldMinor: Number(totals?.withheld ?? 0),
      expenseMinor: Number(totals?.expense ?? 0),
      lastYear: {
        incomeMinor: Number(previous?.income ?? 0),
        expenseMinor: Number(previous?.expense ?? 0),
        through,
      },
      byCategory: categories.map((c) => ({
        kind: c.kind,
        category: c.category,
        totalMinor: Number(c.total),
        count: c.count,
      })),
      topClients: clients.map((c) => ({ name: c.name, totalMinor: Number(c.total), count: c.count })),
      unnamedIncomeMinor: Number(totals?.unnamed ?? 0),
      packages: packages.map((p) => {
        const received = Number(p.received);
        const costs = Number(p.costs);
        return {
          id: p.id,
          title: p.title,
          clientName: p.client_name,
          receivedMinor: received,
          costsMinor: costs,
          profitMinor: received - costs,
        };
      }),
    };
  }
}
