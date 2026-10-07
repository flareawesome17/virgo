import type { DatabaseService } from '../database/database.service';
import type { NotifyService } from '../notifications/notify.service';
import { MoneyInsightsService } from './money-insights.service';
import { MoneyNudgesService, recapLine } from './money-nudges.service';
import { MAX_RECURRING, MoneyRecurringService, dayName } from './money-recurring.service';

/**
 * Insights, repeating entries and the monthly recap. The SQL is run against
 * real Postgres where it is checked; these pin the scoping, the refusals, and
 * what a person is told.
 */

const ME = '11111111-1111-4111-8111-111111111111';
const ENTRY = '22222222-2222-4222-8222-222222222222';
const REC = '66666666-6666-4666-8666-666666666666';

function recurringRow(overrides: Record<string, unknown> = {}) {
  return {
    id: REC,
    user_id: ME,
    kind: 'expense',
    amount_minor: 129_900,
    withheld_minor: 0,
    category: 'software',
    method: 'card',
    counterparty: 'Adobe',
    note: null,
    day_of_month: 28,
    next_on: '2026-10-28',
    stopped_at: null,
    created_at: new Date('2026-10-08T00:00:00Z'),
    ...overrides,
  };
}

function recurringOver(options: {
  entry?: Record<string, unknown> | null;
  running?: number;
  made?: number;
  current?: Record<string, unknown> | null;
} = {}) {
  const txQueries: { sql: string; args?: unknown[] }[] = [];
  let duePasses = options.made ?? 0;
  const tx = {
    query: jest.fn(async (sql: string, args?: unknown[]) => {
      txQueries.push({ sql, args });
      if (sql.startsWith('select kind, amount_minor')) {
        return { rows: options.entry === undefined ? [{
          kind: 'expense', amount_minor: 129_900, withheld_minor: 0, category: 'software',
          method: 'card', counterparty: 'Adobe', note: null, occurred_on: '2026-07-31', recurring_id: null,
        }] : options.entry ? [options.entry] : [] };
      }
      if (sql.includes('count(*)::int as n')) return { rows: [{ n: options.running ?? 0 }] };
      if (sql.includes('insert into money_recurring')) return { rows: [recurringRow()] };
      if (sql.includes('for update skip locked')) {
        if (duePasses <= 0) return { rows: [] };
        duePasses -= 1;
        return { rows: [recurringRow({ next_on: '2026-08-28' })] };
      }
      if (sql.includes('insert into money_entries')) return { rowCount: 1, rows: [] };
      if (sql.startsWith('select * from money_recurring')) return { rows: [recurringRow()] };
      if (sql.includes('pg_try_advisory_xact_lock')) return { rows: [{ ok: false }] };
      return { rows: [] };
    }),
  };
  const db = {
    queryOne: jest.fn(async (sql: string) => {
      if (sql.startsWith('select * from money_recurring')) {
        return options.current === undefined ? recurringRow() : options.current;
      }
      if (sql.includes('update money_recurring')) return recurringRow();
      return null;
    }),
    query: jest.fn(async () => [] as unknown[]),
    transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const service = new MoneyRecurringService(db as unknown as DatabaseService);
  return { service, db, tx, txQueries };
}

describe('MoneyRecurringService.create', () => {
  it("repeats the caller's entry from the month after it, on the 28th at the latest", async () => {
    const { service, txQueries } = recurringOver();
    const { recurring, note } = await service.create(ME, ENTRY);
    expect(recurring).toMatchObject({ id: REC, dayOfMonth: 28, stopped: false });
    expect(note).toBe('Repeats every month on the 28th.');

    const read = txQueries.find((q) => q.sql.startsWith('select kind, amount_minor'))!;
    expect(read.sql).toContain('where id = $1 and user_id = $2');
    expect(read.args).toEqual([ENTRY, ME]);
    const insert = txQueries.find((q) => q.sql.includes('insert into money_recurring'))!;
    // The 31st becomes the 28th, so every month has the day.
    expect(insert.args?.[8]).toBe(28);
    expect(insert.args?.[9]).toBe('2026-07-31');
    const link = txQueries.find((q) => q.sql.startsWith('update money_entries set recurring_id'))!;
    expect(link.args).toEqual([REC, ENTRY]);
  });

  it('says how many months it caught up on', async () => {
    const { service } = recurringOver({ made: 2 });
    const { added, note } = await service.create(ME, ENTRY);
    expect(added).toBe(2);
    expect(note).toBe('Repeats every month on the 28th. Added 2 months since this one.');
  });

  it('makes an expense as paid on its day, and income as still due', async () => {
    const { service, txQueries } = recurringOver({ made: 1 });
    await service.create(ME, ENTRY);
    const made = txQueries.find((q) => q.sql.includes('insert into money_entries'))!;
    expect(made.sql).toContain('on conflict (recurring_id, occurred_on)');
    // paid_on: the day itself for an expense.
    expect(made.args?.[6]).toBe('2026-08-28');
  });

  it("404s an entry that isn't the caller's", async () => {
    const { service, txQueries } = recurringOver({ entry: null });
    await expect(service.create(ME, ENTRY)).rejects.toMatchObject({ status: 404 });
    expect(txQueries.some((q) => q.sql.includes('insert'))).toBe(false);
  });

  it('refuses an entry that already repeats', async () => {
    const { service } = recurringOver({
      entry: { kind: 'expense', amount_minor: 1, withheld_minor: 0, category: 'software', method: null,
        counterparty: null, note: null, occurred_on: '2026-10-01', recurring_id: REC },
    });
    await expect(service.create(ME, ENTRY)).rejects.toMatchObject({ status: 409 });
  });

  it(`stops at ${MAX_RECURRING} running at once`, async () => {
    const { service, txQueries } = recurringOver({ running: MAX_RECURRING });
    await expect(service.create(ME, ENTRY)).rejects.toThrow(`up to ${MAX_RECURRING}`);
    expect(txQueries.some((q) => q.sql.includes('insert'))).toBe(false);
  });
});

describe('MoneyRecurringService changes', () => {
  it('scopes edits to the caller and 404s anyone else', async () => {
    const { service, db } = recurringOver({ current: null });
    await expect(service.update(ME, REC, { amountMinor: 1 })).rejects.toMatchObject({ status: 404 });
    const [sql, args] = db.queryOne.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('where id = $1 and user_id = $2');
    expect(args).toEqual([REC, ME]);
  });

  it('refuses withholding on an expense, or more withheld than the amount', async () => {
    const { service } = recurringOver();
    await expect(service.update(ME, REC, { withheldMinor: 100 })).rejects.toThrow('Only income');
    const { service: income } = recurringOver({
      current: recurringRow({ kind: 'income', category: 'job', amount_minor: 1000 }),
    });
    await expect(income.update(ME, REC, { withheldMinor: 1001 })).rejects.toThrow("can't be more");
  });

  it('refuses a category from the other kind', async () => {
    const { service } = recurringOver();
    await expect(service.update(ME, REC, { category: 'job' })).rejects.toThrow('expense category');
  });

  it("stops only the caller's", async () => {
    const { service, db } = recurringOver();
    await expect(service.stop(ME, REC)).rejects.toMatchObject({ status: 404 });
    const [sql, args] = db.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('where id = $1 and user_id = $2');
    expect(args).toEqual([REC, ME]);
  });

  it('leaves the run to whichever process holds the lock', async () => {
    const { service, txQueries } = recurringOver();
    await expect(service.run()).resolves.toBe(0);
    expect(txQueries.some((q) => q.sql.includes('for update skip locked'))).toBe(false);
  });

  it('names the day', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 28].map(dayName)).toEqual([
      'the 1st', 'the 2nd', 'the 3rd', 'the 4th', 'the 11th', 'the 12th', 'the 13th',
      'the 21st', 'the 22nd', 'the 23rd', 'the 28th',
    ]);
  });
});

describe('MoneyInsightsService.year', () => {
  afterEach(() => jest.useRealTimers());

  function insightsOver(rows: Record<string, unknown[]> = {}) {
    const calls: { sql: string; args: unknown[] }[] = [];
    const db = {
      query: jest.fn(async (sql: string, args: unknown[]) => {
        calls.push({ sql, args });
        if (sql.includes('distinct extract(year')) return rows.years ?? [];
        if (sql.includes("to_char(paid_on, 'YYYY-MM')")) return rows.months ?? [];
        if (sql.includes('group by kind, category')) return rows.categories ?? [];
        if (sql.includes('mode() within group')) return rows.clients ?? [];
        if (sql.includes('from money_packages p')) return rows.packages ?? [];
        return [];
      }),
      queryOne: jest.fn(async (sql: string, args: unknown[]) => {
        calls.push({ sql, args });
        if (sql.includes('as unnamed')) return { income: '9000000', withheld: '150000', expense: '2000000', unnamed: '500000' };
        return { income: '7000000', expense: '1000000' };
      }),
    };
    return { service: new MoneyInsightsService(db as unknown as DatabaseService), calls };
  }

  it('gives all twelve months, scoped to the caller, counted when the money moved', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-08T03:00:00Z'), doNotFake: ['nextTick', 'setImmediate'] });
    const { service, calls } = insightsOver({
      years: [{ year: 2026 }, { year: 2025 }],
      months: [{ month: '2026-03', income: '4000000', expense: '500000' }],
    });
    const result = await service.year(ME, 2026);
    expect(result.months).toHaveLength(12);
    expect(result.months[0]).toEqual({ month: '2026-01', incomeMinor: 0, expenseMinor: 0 });
    expect(result.months[2]).toEqual({ month: '2026-03', incomeMinor: 4_000_000, expenseMinor: 500_000 });
    expect(result).toMatchObject({ incomeMinor: 9_000_000, withheldMinor: 150_000, expenseMinor: 2_000_000, unnamedIncomeMinor: 500_000 });
    for (const call of calls) {
      expect(call.sql).toContain('user_id = $1');
      expect(call.args[0]).toBe(ME);
    }
    expect(calls.find((c) => c.sql.includes("to_char(paid_on, 'YYYY-MM')"))!.sql).toContain('paid_on between');
  });

  it('compares this year with last year up to the same day, and a past year whole', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-08T03:00:00Z'), doNotFake: ['nextTick', 'setImmediate'] });
    const { service, calls } = insightsOver();
    expect((await service.year(ME, 2026)).lastYear).toEqual({ incomeMinor: 7_000_000, expenseMinor: 1_000_000, through: '2025-10-08' });
    const previous = calls.find((c) => !c.sql.includes('as unnamed') && c.sql.includes('as expense') && !c.sql.includes('to_char'))!;
    expect(previous.args).toEqual([ME, '2025-01-01', '2025-10-08']);
    expect((await service.year(ME, 2024)).lastYear.through).toBe('2023-12-31');
  });

  it('offers the year asked for in the switcher even with nothing in it', async () => {
    const { service } = insightsOver({ years: [{ year: 2025 }] });
    expect((await service.year(ME, 2026)).years).toEqual([2026, 2025]);
  });

  it("works out each job's profit", async () => {
    const { service } = insightsOver({
      packages: [{ id: 'p1', title: 'Garcia–Lim wedding', client_name: 'Bea', received: '5000000', costs: '800000' }],
    });
    expect((await service.year(ME, 2026)).packages[0]).toMatchObject({ receivedMinor: 5_000_000, costsMinor: 800_000, profitMinor: 4_200_000 });
  });
});

describe('MoneyNudgesService.sendRecaps', () => {
  it('tells each person their month once, and opens Insights', async () => {
    const rows = [
      { user_id: ME, month: '2026-09', income: '4500000', expense: '1230000' },
      { user_id: 'u2', month: '2026-09', income: '0', expense: '80000' },
    ];
    const tx = {
      query: jest.fn(async (sql: string) =>
        sql.includes('pg_try_advisory_xact_lock') ? { rows: [{ ok: true }] } : { rows },
      ),
    };
    const db = { transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)) };
    const notifier = { deliver: jest.fn(async () => ({ sent: 2, failed: 0 })) };
    const service = new MoneyNudgesService(db as unknown as DatabaseService, notifier as unknown as NotifyService);

    await expect(service.sendRecaps()).resolves.toBe(2);
    const [deliveries] = notifier.deliver.mock.calls[0] as unknown as [Record<string, unknown>[]];
    expect(deliveries[0]).toMatchObject({
      userId: ME,
      topic: 'money',
      title: 'Your September in Money',
      body: '₱45,000 in, ₱12,300 out — ₱32,700 kept. See the year so far in Insights.',
      data: { type: 'money', recap: '2026-09' },
    });
    expect(deliveries[1].body).toBe('₱800 went out. See where it went in Insights.');
    const sql = (tx.query.mock.calls[1] as unknown as [string])[0];
    expect(sql).toContain('on conflict (user_id, month) do nothing');
  });

  it('says plainly when more went out than came in', () => {
    expect(recapLine(500_000, 800_000)).toBe('₱5,000 in, ₱8,000 out — ₱3,000 more out than in. See the year so far in Insights.');
    expect(recapLine(500_000, 0)).toBe('₱5,000 came in. See the year so far in Insights.');
  });
});
