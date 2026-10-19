import { BadRequestException, GoneException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { DatabaseService } from '../database/database.service';
import type { ReceiptFilesService } from '../storage/receipt-files.service';
import { MoneyService, type MoneyEntryInput } from './money.service';
import type { MoneyBookingsService } from './money-bookings.service';

/**
 * The ledger's rules. The SQL itself is run against real Postgres where it is
 * checked; these pin what is refused, what is scoped to whom, and what a
 * retried save does.
 */

const ME = '11111111-1111-4111-8111-111111111111';
const ENTRY = '22222222-2222-4222-8222-222222222222';
const RECEIPT = '33333333-3333-4333-8333-333333333333';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: ENTRY,
    user_id: ME,
    kind: 'income',
    amount_minor: 1_500_000,
    withheld_minor: 0,
    currency: 'PHP',
    category: 'job',
    occurred_on: '2026-10-03',
    paid_on: '2026-10-03',
    method: 'gcash',
    reference: null,
    counterparty: 'Reyes wedding',
    note: null,
    filed_on: '2026-10-03',
    created_at: new Date('2026-10-03T02:00:00Z'),
    updated_at: new Date('2026-10-03T02:00:00Z'),
    ...overrides,
  };
}

function harness(options: { existing?: ReturnType<typeof row> | null; inserted?: boolean } = {}) {
  const txQueries: { sql: string; args: unknown[] }[] = [];
  const tx = {
    query: jest.fn(async (sql: string, args: unknown[]) => {
      txQueries.push({ sql, args });
      if (sql.includes('insert into money_entries')) {
        return { rows: options.inserted === false ? [] : [row({ id: args[0] })] };
      }
      if (sql.startsWith('select * from money_entries')) {
        return { rows: options.existing ? [options.existing] : [] };
      }
      if (sql.includes('update money_entries')) return { rows: [row()] };
      return { rows: [] };
    }),
  };
  const db = {
    queryOne: jest.fn(async (sql: string) => {
      if (sql.startsWith('select * from money_entries')) return options.existing ?? null;
      return null;
    }),
    query: jest.fn(async (_sql: string, _args?: unknown[]) => [] as unknown[]),
    transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const receipts = {
    verify: jest.fn(async () => undefined),
    attach: jest.fn(async () => undefined),
    forEntries: jest.fn(async () => new Map()),
  };
  const config = { getOrThrow: () => 'a-test-access-secret-that-is-long-enough' };
  const bookings = {
    assertParty: jest.fn(async () => undefined),
    linksFor: jest.fn(async () => new Map()),
    suggestions: jest.fn(async () => [] as unknown[]),
  };
  const service = new MoneyService(
    db as unknown as DatabaseService,
    receipts as unknown as ReceiptFilesService,
    config as unknown as ConfigService,
    bookings as unknown as MoneyBookingsService,
  );
  return { service, db, tx, txQueries, receipts, bookings };
}

const INCOME: MoneyEntryInput = {
  kind: 'income',
  amountMinor: 1_500_000,
  category: 'job',
  occurredOn: '2026-10-03',
  paidOn: '2026-10-03',
};

describe('MoneyService.create', () => {
  it('saves under the caller, never a user id from the body', async () => {
    const { service, txQueries } = harness();
    await service.create(ME, { ...INCOME, id: ENTRY });
    const insert = txQueries.find((q) => q.sql.includes('insert into money_entries'))!;
    expect(insert.args[0]).toBe(ENTRY);
    expect(insert.args[1]).toBe(ME);
    expect(insert.sql).toContain('on conflict (id) do nothing');
  });

  it('gives a retried save the entry it already wrote, not a second one', async () => {
    const { service, receipts } = harness({ inserted: false, existing: row() });
    const entry = await service.create(ME, { ...INCOME, id: ENTRY });
    expect(entry.id).toBe(ENTRY);
    expect(receipts.attach).not.toHaveBeenCalled();
  });

  it("refuses an id that is somebody else's entry, without showing it", async () => {
    const { service } = harness({ inserted: false, existing: null });
    await expect(service.create(ME, { ...INCOME, id: ENTRY })).rejects.toMatchObject({
      status: 409,
    });
  });

  it('checks a receipt landed before saving, and puts it on the entry in the same transaction', async () => {
    const { service, receipts, tx } = harness();
    await service.create(ME, { ...INCOME, id: ENTRY, receiptId: RECEIPT });
    expect(receipts.verify).toHaveBeenCalledWith(ME, RECEIPT, { entryId: ENTRY });
    expect(receipts.attach).toHaveBeenCalledWith(tx, ME, { entryId: ENTRY }, RECEIPT);
  });

  it('trims what was typed, and keeps nothing for blank text', async () => {
    const { service, txQueries } = harness();
    await service.create(ME, { ...INCOME, counterparty: '  Reyes wedding ', note: '   ' });
    const insert = txQueries.find((q) => q.sql.includes('insert into money_entries'))!;
    expect(insert.args[10]).toBe('Reyes wedding');
    expect(insert.args[11]).toBeNull();
  });

  it.each([
    ['an expense category on income', { category: 'meals' }, 'Pick an income category'],
    ['withholding on an expense', { kind: 'expense', category: 'meals', withheldMinor: 100 }, 'Only income'],
    ['more withheld than earned', { withheldMinor: 1_600_000 }, "can't be more than the amount"],
    ['a payment dated next year', { paidOn: '2099-01-01' }, "can't be dated in the future"],
    ['a date from another century', { occurredOn: '1899-12-31' }, 'between 2000 and 2100'],
  ] as const)('refuses %s', async (_name, change, message) => {
    const { service, db } = harness();
    await expect(
      service.create(ME, { ...INCOME, ...change } as MoneyEntryInput),
    ).rejects.toThrow(message);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('takes an unpaid income due later', async () => {
    const { service, txQueries } = harness();
    await service.create(ME, { ...INCOME, occurredOn: '2099-02-14', paidOn: null });
    const insert = txQueries.find((q) => q.sql.includes('insert into money_entries'))!;
    expect(insert.args[7]).toBeNull();
  });
});

describe('MoneyService and packages', () => {
  const PKG = '55555555-5555-4555-8555-555555555555';

  it("takes an expense as a cost of the job, once the package is the caller's", async () => {
    const { service, db } = harness();
    (db.queryOne as jest.Mock).mockImplementation(async (sql: string) =>
      sql.includes('from money_packages') ? { one: 1 } : null,
    );
    await service.create(ME, { ...INCOME, kind: 'expense', category: 'crew', paidOn: null, packageId: PKG });
    const [sql, args] = db.queryOne.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('from money_packages where id = $1 and user_id = $2');
    expect(args).toEqual([PKG, ME]);
  });

  it("refuses a package that isn't the caller's", async () => {
    const { service, tx } = harness();
    await expect(service.create(ME, { ...INCOME, packageId: PKG })).rejects.toThrow("isn't one of yours");
    expect(tx.query).not.toHaveBeenCalled();
  });
});

describe('MoneyService.update', () => {
  it('reads the entry scoped to the caller, and 404s for anyone else', async () => {
    const { service, db } = harness({ existing: null });
    await expect(service.update(ME, ENTRY, { amountMinor: 100 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const [sql, args] = db.queryOne.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('where id = $1 and user_id = $2');
    expect(args).toEqual([ENTRY, ME]);
  });

  it('leaves what the patch does not mention, and clears what it nulls', async () => {
    const { service, txQueries } = harness({ existing: row({ note: 'DP via GCash' }) });
    await service.update(ME, ENTRY, { paidOn: null });
    const update = txQueries.find((q) => q.sql.includes('update money_entries'))!;
    expect(update.args.slice(0, 2)).toEqual([ENTRY, ME]);
    expect(update.args[7]).toBeNull(); // paid_on
    expect(update.args[11]).toBe('DP via GCash'); // note kept
  });

  it('drops the withholding when income becomes an expense', async () => {
    const { service, txQueries } = harness({ existing: row({ withheld_minor: 75_000 }) });
    await service.update(ME, ENTRY, { kind: 'expense', category: 'crew' });
    const update = txQueries.find((q) => q.sql.includes('update money_entries'))!;
    expect(update.args[4]).toBe(0);
  });

  it('refuses a new kind whose categories do not include the old one', async () => {
    const { service } = harness({ existing: row({ category: 'job' }) });
    await expect(service.update(ME, ENTRY, { kind: 'expense' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('takes the receipt off when the patch sends null', async () => {
    const { service, receipts, tx } = harness({ existing: row() });
    await service.update(ME, ENTRY, { receiptId: null });
    expect(receipts.verify).not.toHaveBeenCalled();
    expect(receipts.attach).toHaveBeenCalledWith(tx, ME, { entryId: ENTRY }, null);
  });

  it('leaves the receipt alone when the patch does not mention it', async () => {
    const { service, receipts } = harness({ existing: row() });
    await service.update(ME, ENTRY, { note: 'Balance' });
    expect(receipts.attach).not.toHaveBeenCalled();
  });
});

describe('MoneyService and bookings', () => {
  const BOOKING = '44444444-4444-4444-8444-444444444444';

  it('records an entry from a booking only after checking the caller is on it', async () => {
    const { service, bookings, txQueries } = harness();
    await service.create(ME, { ...INCOME, bookingId: BOOKING });
    expect(bookings.assertParty).toHaveBeenCalledWith(ME, BOOKING);
    const insert = txQueries.find((q) => q.sql.includes('insert into money_entries'))!;
    expect(insert.args[12]).toBe(BOOKING);
  });

  it("refuses a booking that isn't the caller's before writing anything", async () => {
    const { service, bookings, db } = harness();
    bookings.assertParty.mockRejectedValueOnce(new BadRequestException("That booking isn't one of yours."));
    await expect(service.create(ME, { ...INCOME, bookingId: BOOKING })).rejects.toThrow("isn't one of yours");
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('keeps the booking an edit does not mention, without asking again', async () => {
    const { service, bookings, txQueries } = harness({ existing: row({ booking_id: BOOKING }) });
    await service.update(ME, ENTRY, { paidOn: '2026-10-04' });
    expect(bookings.assertParty).not.toHaveBeenCalled();
    const update = txQueries.find((q) => q.sql.includes('update money_entries'))!;
    expect(update.args[12]).toBe(BOOKING);
  });

  it('shows the booking an entry came from, read for the entry\'s owner', async () => {
    const { service, db, bookings } = harness();
    db.queryOne.mockResolvedValueOnce(row({ booking_id: BOOKING }) as never);
    bookings.linksFor.mockResolvedValueOnce(
      new Map([[BOOKING, { id: BOOKING, postTitle: 'Reyes wedding', role: 'Second shooter', eventDate: '2026-10-03', cancelled: true }]]) as never,
    );
    const entry = await service.get(ME, ENTRY);
    expect(bookings.linksFor).toHaveBeenCalledWith(ME, [BOOKING]);
    expect(entry.booking).toMatchObject({ postTitle: 'Reyes wedding', cancelled: true });
  });

  it("lists one booking's offer and its entries, scoped to the caller", async () => {
    const { service, db, bookings } = harness();
    await service.forBooking(ME, BOOKING);
    expect(bookings.suggestions).toHaveBeenCalledWith(ME, BOOKING);
    const [sql, args] = db.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('where user_id = $1 and booking_id = $2');
    expect(args).toEqual([ME, BOOKING]);
  });
});

describe('MoneyService.remove', () => {
  it("deletes only the caller's entry", async () => {
    const { service, db } = harness();
    db.query.mockResolvedValueOnce([{ id: ENTRY }]);
    await service.remove(ME, ENTRY);
    const [sql, args] = db.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('where id = $1 and user_id = $2');
    expect(args).toEqual([ENTRY, ME]);
  });

  it('404s when there was nothing of theirs to delete', async () => {
    const { service } = harness();
    await expect(service.remove(ME, ENTRY)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('MoneyService.list', () => {
  it('is scoped to the caller and cut on the filed date', async () => {
    const { service, db } = harness();
    await service.list(ME, { from: '2026-10-01', to: '2026-10-31', kind: 'expense' });
    const [sql, args] = db.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('user_id = $1');
    expect(sql).toContain('filed_on >= $2::date');
    expect(sql).toContain('order by filed_on desc, created_at desc');
    expect(args).toEqual([ME, '2026-10-01', '2026-10-31', 'expense', false, 100, 0]);
  });
});

describe('MoneyService.summary', () => {
  it('counts what was paid in the range, and everything outstanding', async () => {
    const { service, db } = harness();
    db.queryOne.mockResolvedValueOnce({
      income: '2500000',
      withheld: '50000',
      expense: '380000',
      entries: 7,
      owed_to_you: '1000000',
      owed_to_you_count: 1,
      you_owe: '0',
      you_owe_count: 0,
    } as never);
    const summary = await service.summary(ME, '2026-10-01', '2026-10-31');
    expect(summary).toMatchObject({
      incomeMinor: 2_500_000,
      withheldMinor: 50_000,
      expenseMinor: 380_000,
      owedToYouMinor: 1_000_000,
      owedToYouCount: 1,
    });
    const [sql, args] = db.queryOne.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('where user_id = $1');
    expect(sql).toMatch(/kind = 'income' and paid_on is null/);
    expect(args).toEqual([ME, '2026-10-01', '2026-10-31']);
  });

  it('refuses a range that ends before it starts', async () => {
    const { service } = harness();
    await expect(service.summary(ME, '2026-10-31', '2026-10-01')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('MoneyService.csv', () => {
  it('writes pesos, labels and a name for the month, and never a formula', async () => {
    const { service, db } = harness();
    db.query.mockResolvedValueOnce([
      { ...row({ withheld_minor: 75_000, note: '=HYPERLINK("http://x")' }), receipt_name: 'or.jpg' },
      {
        ...row({ kind: 'expense', category: 'transport', amount_minor: 35_050, paid_on: null, method: null, counterparty: 'Grab, airport' }),
        receipt_name: null,
      },
    ]);
    const { filename, body } = await service.csv(ME, '2026-10-01', '2026-10-31');
    expect(filename).toBe('virgo-money-2026-10.csv');
    expect(body.startsWith('﻿Date,Paid on,Type,Category,Amount (PHP)')).toBe(true);
    const lines = body.trim().split('\r\n');
    expect(lines[1]).toBe(
      `2026-10-03,2026-10-03,Income,Job fee,15000.00,750.00,14250.00,GCash,,Reyes wedding,"'=HYPERLINK(""http://x"")",or.jpg`,
    );
    expect(lines[2]).toBe('2026-10-03,Unpaid,Expense,Transport,350.50,0.00,350.50,,,"Grab, airport",,');
  });

  it('names a range that is not one month by its ends', async () => {
    const { service } = harness();
    const { filename } = await service.csv(ME, '2026-01-01', '2026-03-31');
    expect(filename).toBe('virgo-money-2026-01-01-to-2026-03-31.csv');
  });
});

describe('MoneyService export links', () => {
  it('reads back who and what a fresh link is for', () => {
    const { service } = harness();
    const { token } = service.exportLink(ME, '2026-10-01', '2026-10-31');
    expect(service.readExportLink(token)).toEqual({ userId: ME, from: '2026-10-01', to: '2026-10-31' });
  });

  it('refuses a link whose range or owner was changed', () => {
    const { service } = harness();
    const { token } = service.exportLink(ME, '2026-10-01', '2026-10-31');
    const [, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ u: 'someone-else', f: '2000-01-01', t: '2100-12-31', e: 9_999_999_999 }),
    ).toString('base64url');
    expect(() => service.readExportLink(`${forged}.${signature}`)).toThrow(NotFoundException);
    expect(() => service.readExportLink('garbage')).toThrow(NotFoundException);
  });

  it('refuses a link signed with the session secret itself', () => {
    const { service } = harness();
    const body = Buffer.from(
      JSON.stringify({ u: ME, f: '2026-10-01', t: '2026-10-31', e: 9_999_999_999 }),
    ).toString('base64url');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createHmac } = require('node:crypto') as typeof import('node:crypto');
    const signature = createHmac('sha256', 'a-test-access-secret-that-is-long-enough')
      .update(body)
      .digest('base64url');
    expect(() => service.readExportLink(`${body}.${signature}`)).toThrow(NotFoundException);
  });

  it('turns away a link five minutes on', () => {
    const { service } = harness();
    const now = Date.now();
    const spy = jest.spyOn(Date, 'now').mockReturnValue(now);
    const { token } = service.exportLink(ME, '2026-10-01', '2026-10-31');
    spy.mockReturnValue(now + 5 * 60 * 1000 + 1000);
    expect(() => service.readExportLink(token)).toThrow(GoneException);
    spy.mockRestore();
  });
});
