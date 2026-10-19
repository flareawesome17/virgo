import type { ConfigService } from '@nestjs/config';
import type { DatabaseService } from '../database/database.service';
import type { NotifyService } from '../notifications/notify.service';
import type { ReceiptFilesService } from '../storage/receipt-files.service';
import { MoneyNudgesService } from './money-nudges.service';
import { MoneyPackagesService } from './money-packages.service';
import { MoneyPayMethodsService, MAX_PAY_METHODS } from './money-pay-methods.service';
import type { MoneyService } from './money.service';
import { renderStatement, type StatementView } from './statement.template';

/**
 * Packages, how clients pay, the statement, and the payment reminders. The
 * SQL is run against real Postgres where it is checked; these pin the sums,
 * the refusals, and what a client is shown.
 */

const ME = '11111111-1111-4111-8111-111111111111';
const PKG = '55555555-5555-4555-8555-555555555555';

function packageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PKG,
    user_id: ME,
    title: 'Garcia–Lim wedding',
    client_name: 'Bea Garcia',
    total_minor: 5_000_000,
    event_date: '2026-11-14',
    note: null,
    share_token: null,
    shared_at: null,
    created_at: new Date('2026-10-08T00:00:00Z'),
    updated_at: new Date('2026-10-08T00:00:00Z'),
    received: '1500000',
    scheduled: '3500000',
    costs: '0',
    next_due: '2026-11-14',
    payments: 2,
    today: '2026-10-08',
    ...overrides,
  };
}

function packagesOver(options: { row?: Record<string, unknown> | null; existing?: { user_id: string } | null } = {}) {
  const queries: { sql: string; args?: unknown[] }[] = [];
  const db = {
    queryOne: jest.fn(async (sql: string, args?: unknown[]) => {
      queries.push({ sql, args });
      if (sql.startsWith('select user_id from money_packages')) return options.existing ?? null;
      if (sql.includes('count(*)::int as n')) return { n: 0 };
      if (sql.includes('::date::text as d')) return { d: '2026-10-08' };
      if (sql.includes('update money_packages') && sql.includes('share_token')) return { share_token: 'tok_abcdefghijklmnopqrstuvwxyz' };
      if (sql.includes('from money_packages p')) return options.row === undefined ? packageRow() : options.row;
      return null;
    }),
    query: jest.fn(async (sql: string, args?: unknown[]) => {
      queries.push({ sql, args });
      return [];
    }),
    transaction: jest.fn(async (fn: (tx: { query: jest.Mock }) => Promise<unknown>) => {
      const tx = {
        query: jest.fn(async (sql: string, args?: unknown[]) => {
          queries.push({ sql, args });
          return { rowCount: 1, rows: [] };
        }),
      };
      return fn(tx);
    }),
  };
  const money = {
    create: jest.fn(async () => ({})),
    forPackage: jest.fn(async () => []),
  };
  const config = { get: (key: string) => (key === 'CLIENT_DELIVERY_URL' ? 'https://client.virgo.test/' : undefined) };
  const payMethods = { list: jest.fn(async () => []) };
  const service = new MoneyPackagesService(
    db as unknown as DatabaseService,
    money as unknown as MoneyService,
    config as unknown as ConfigService,
    payMethods as unknown as MoneyPayMethodsService,
  );
  return { service, db, money, queries, payMethods };
}

describe('MoneyPackagesService sums', () => {
  it('works out what is left from the payments, and when the next is due', async () => {
    const { service } = packagesOver();
    const { package: p } = await service.get(ME, PKG);
    expect(p).toMatchObject({
      totalMinor: 5_000_000,
      receivedMinor: 1_500_000,
      scheduledMinor: 3_500_000,
      balanceMinor: 3_500_000,
      unscheduledMinor: 0,
      nextDueOn: '2026-11-14',
      overdue: false,
      paidInFull: false,
      shareUrl: null,
    });
  });

  it('says overdue when a payment day has gone, and never shows a negative balance', async () => {
    const { service } = packagesOver({ row: packageRow({ received: '5200000', scheduled: '0', next_due: null }) });
    const { package: paid } = await service.get(ME, PKG);
    expect(paid).toMatchObject({ balanceMinor: 0, paidInFull: true, overdue: false });

    const { service: late } = packagesOver({ row: packageRow({ next_due: '2026-10-01' }) });
    expect((await late.get(ME, PKG)).package.overdue).toBe(true);
  });

  it('takes the costs of the job off what it brought in', async () => {
    const { service, queries } = packagesOver({ row: packageRow({ costs: '420000' }) });
    const { package: p } = await service.get(ME, PKG);
    expect(p).toMatchObject({ receivedMinor: 1_500_000, costsMinor: 420_000, profitMinor: 1_080_000 });
    // A cost is never a payment: the balance still comes from income alone.
    expect(p.balanceMinor).toBe(3_500_000);
    expect(queries[0].sql).toContain("e.kind = 'income' and e.paid_on is not null");
    expect(queries[0].sql).toContain("filter (where e.kind = 'expense')");
  });

  it('counts what has no payment day yet', async () => {
    const { service } = packagesOver({ row: packageRow({ scheduled: '0', next_due: null }) });
    expect((await service.get(ME, PKG)).package.unscheduledMinor).toBe(3_500_000);
  });

  it("404s a package that isn't the caller's", async () => {
    const { service, queries } = packagesOver({ row: null });
    await expect(service.get(ME, PKG)).rejects.toMatchObject({ status: 404 });
    expect(queries[0].sql).toContain('p.id = $1 and p.user_id = $2');
  });
});

describe('MoneyPackagesService.create', () => {
  const input = {
    id: PKG,
    title: ' Garcia–Lim wedding ',
    clientName: 'Bea Garcia',
    totalMinor: 5_000_000,
    eventDate: '2026-11-14',
    deposit: { amountMinor: 1_500_000, paidOn: '2026-10-08' },
    balanceDueOn: '2026-11-14',
  };

  it('writes the deposit and the balance as payments toward the package', async () => {
    const { service, money } = packagesOver();
    await service.create(ME, input);
    expect(money.create).toHaveBeenCalledTimes(2);
    expect(money.create).toHaveBeenNthCalledWith(1, ME, expect.objectContaining({
      kind: 'income', amountMinor: 1_500_000, paidOn: '2026-10-08', occurredOn: '2026-10-08',
      packageId: PKG, note: 'Garcia–Lim wedding · Down payment', counterparty: 'Bea Garcia',
    }));
    expect(money.create).toHaveBeenNthCalledWith(2, ME, expect.objectContaining({
      amountMinor: 3_500_000, paidOn: null, occurredOn: '2026-11-14', note: 'Garcia–Lim wedding · Balance',
    }));
  });

  it('leaves the balance unscheduled when no day is given', async () => {
    const { service, money } = packagesOver();
    await service.create(ME, { ...input, balanceDueOn: null });
    expect(money.create).toHaveBeenCalledTimes(1);
  });

  it('refuses a down payment larger than the total', async () => {
    const { service, db } = packagesOver();
    await expect(
      service.create(ME, { ...input, deposit: { amountMinor: 6_000_000, paidOn: null } }),
    ).rejects.toThrow("can't be more than the total");
    expect(db.query).not.toHaveBeenCalled();
  });

  it('takes the package back out when the ledger refuses a payment', async () => {
    const { service, money, queries } = packagesOver();
    money.create.mockRejectedValueOnce(new Error("A payment can't be dated in the future."));
    await expect(service.create(ME, input)).rejects.toThrow('future');
    expect(queries.some((q) => q.sql.startsWith('delete from money_packages'))).toBe(true);
  });

  it("gives a retry the package it already made, and refuses someone else's id", async () => {
    const mine = packagesOver({ existing: { user_id: ME } });
    await mine.service.create(ME, input);
    expect(mine.money.create).not.toHaveBeenCalled();

    const theirs = packagesOver({ existing: { user_id: 'someone-else' } });
    await expect(theirs.service.create(ME, input)).rejects.toMatchObject({ status: 409 });
  });
});

describe('MoneyPackagesService sharing and removal', () => {
  it('shares on the client delivery host', async () => {
    const { service } = packagesOver();
    await expect(service.share(ME, PKG)).resolves.toEqual({
      url: 'https://client.virgo.test/s/statement/tok_abcdefghijklmnopqrstuvwxyz',
    });
  });

  it('deletes only the payments still due with the package, never a cost still owed', async () => {
    const { service, queries } = packagesOver();
    await service.remove(ME, PKG);
    const deleteEntries = queries.find((q) => q.sql.startsWith('delete from money_entries'))!;
    expect(deleteEntries.sql).toContain("kind = 'income' and paid_on is null");
    expect(deleteEntries.args).toEqual([PKG, ME]);
  });

  it('refuses a malformed statement token without asking the database', async () => {
    const { service, db } = packagesOver();
    await expect(service.statement('../../etc')).resolves.toBeNull();
    expect(db.queryOne).not.toHaveBeenCalled();
  });
});

describe('MoneyPayMethodsService', () => {
  function methodsOver(count = 0) {
    const tx = { query: jest.fn(async () => ({ rows: [{ id: 'm1', user_id: ME, kind: 'gcash', label: null, account_name: 'Ana Reyes', account_number: '0917 000 0000' }] })) };
    const db = {
      queryOne: jest.fn(async () => ({ n: count })),
      query: jest.fn(async () => []),
      transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const receipts = {
      verify: jest.fn(async () => undefined),
      attach: jest.fn(async () => undefined),
      forPayMethods: jest.fn(async () => new Map()),
    };
    const service = new MoneyPayMethodsService(db as unknown as DatabaseService, receipts as unknown as ReceiptFilesService);
    return { service, receipts, tx };
  }

  it(`stops at ${MAX_PAY_METHODS} ways to pay`, async () => {
    const { service } = methodsOver(MAX_PAY_METHODS);
    await expect(service.create(ME, { kind: 'gcash', accountNumber: '0917' })).rejects.toThrow('up to 4');
  });

  it('needs a number or a QR code a client can use', async () => {
    const { service } = methodsOver();
    await expect(service.create(ME, { kind: 'maya', accountName: 'Ana' })).rejects.toThrow('Add the number, or a QR code');
  });

  it('puts a QR code on the method, checked first', async () => {
    const { service, receipts, tx } = methodsOver();
    await service.create(ME, { kind: 'gcash', qrReceiptId: 'qr-1' });
    expect(receipts.verify).toHaveBeenCalledWith(ME, 'qr-1', { payMethodId: 'm1' });
    expect(receipts.attach).toHaveBeenCalledWith(tx, ME, { payMethodId: 'm1' }, 'qr-1');
  });
});

describe('renderStatement', () => {
  const view: StatementView = {
    creativeName: 'Ana <Reyes>',
    title: 'Garcia–Lim wedding',
    clientName: 'Bea Garcia',
    eventDate: '2026-11-14',
    totalMinor: 5_000_000,
    receivedMinor: 1_500_000,
    balanceMinor: 3_500_000,
    unscheduledMinor: 0,
    payments: [{ date: '2026-10-08', amountMinor: 1_500_000, withheldMinor: 75_000, method: 'gcash' }],
    due: [{ date: '2026-11-14', amountMinor: 3_500_000, overdue: false }],
    payMethods: [
      { id: 'm1', kind: 'gcash', label: null, accountName: 'Ana Reyes', accountNumber: '0917 000 0000', qr: { id: 'q', name: 'qr.png', contentType: 'image/png', sizeBytes: 1, url: 'https://bucket.test/qr.png?sig=1&x=2' } },
    ],
  };

  it('shows the balance, the next payment, and how to pay', () => {
    const html = renderStatement(view);
    expect(html).toContain('₱35,000');
    expect(html).toContain('Next payment: ₱35,000 due Sat, Nov 14, 2026');
    expect(html).toContain('0917 000 0000');
    expect(html).toContain('incl. ₱750 tax withheld (BIR 2307)');
    expect(html).toContain('not an official receipt or a BIR invoice');
  });

  it('escapes everything it is given and runs no script', () => {
    const html = renderStatement(view);
    expect(html).toContain('Ana &lt;Reyes&gt;');
    expect(html).not.toContain('<Reyes>');
    expect(html).toContain('src="https://bucket.test/qr.png?sig=1&amp;x=2"');
    expect(html).not.toMatch(/<script/i);
  });

  it('thanks a client who has paid in full, and asks for nothing more', () => {
    const html = renderStatement({ ...view, receivedMinor: 5_000_000, balanceMinor: 0, due: [] });
    expect(html).toContain('Paid in full');
    expect(html).not.toContain('How to pay');
  });
});

describe('MoneyNudgesService.remindPayments', () => {
  it('tells the creative what is due, from whom, and opens the package', async () => {
    const rows = [
      { id: 'e1', user_id: ME, amount_minor: 3_500_000, withheld_minor: 0, counterparty: 'Bea Garcia', package_id: PKG, occurred_on: '2026-10-09', stage: 'soon', package_title: 'Garcia–Lim wedding', shared: true },
      { id: 'e2', user_id: ME, amount_minor: 1_000_000, withheld_minor: 50_000, counterparty: null, package_id: null, occurred_on: '2026-10-04', stage: 'late', package_title: null, shared: null },
    ];
    const tx = {
      query: jest.fn(async (sql: string) =>
        sql.includes('pg_try_advisory_xact_lock') ? { rows: [{ ok: true }] } : { rows },
      ),
    };
    const db = { transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)) };
    const notifier = { deliver: jest.fn(async () => ({ sent: 2, failed: 0 })) };
    const service = new MoneyNudgesService(db as unknown as DatabaseService, notifier as unknown as NotifyService);

    await expect(service.remindPayments()).resolves.toBe(2);
    const [deliveries] = notifier.deliver.mock.calls[0] as unknown as [Record<string, unknown>[]];
    expect(deliveries[0]).toMatchObject({
      topic: 'money',
      title: '₱35,000 is due tomorrow',
      data: { type: 'money', entryId: 'e1', packageId: PKG },
    });
    expect(deliveries[0].body).toContain('Send them the statement again');
    expect(deliveries[1]).toMatchObject({ title: '₱9,500 is overdue', data: { type: 'money', entryId: 'e2' } });
    expect(deliveries[1].body).toContain('was due Oct 4');
    const sql = (tx.query.mock.calls[1] as unknown as [string])[0];
    expect(sql).toContain('e.due_reminded_at is null');
    expect(sql).toContain('e.overdue_reminded_at is null');
  });
});
