import type { ConfigService } from '@nestjs/config';
import type { ReauthService } from '../auth/reauth.service';
import type { DatabaseService } from '../database/database.service';
import type { MailConfig } from '../mail/mail.config';
import type { MailService } from '../mail/mail.service';
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
  const CHANGED = new Date('2026-11-03T02:00:00Z');
  const PROOF = { proof: { password: 'hunter2' }, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0' };
  const methodRow = {
    id: 'm1',
    user_id: ME,
    kind: 'gcash',
    label: null,
    account_name: 'Ana Reyes',
    account_number: '0917 000 0000',
    details_changed_at: CHANGED,
  };

  function methodsOver(options: { count?: number; current?: Record<string, unknown> | null; qr?: { id: string } | null } = {}) {
    const tx = {
      query: jest.fn(async (sql: string, args?: unknown[]) => {
        if (sql.startsWith('update money_pay_methods')) {
          return { rows: [{ ...methodRow, ...options.current, account_number: args?.[5], details_changed_at: args?.[6] ? new Date() : CHANGED }] };
        }
        return { rows: [methodRow] };
      }),
    };
    const db = {
      queryOne: jest.fn(async (sql: string) => {
        if (sql.includes('count(*)::int as n')) return { n: options.count ?? 0 };
        if (sql.startsWith('select email from users')) return { email: 'ana@example.test' };
        if (sql.includes('from money_pay_methods where id = $1')) {
          return options.current === null ? null : { ...methodRow, ...options.current };
        }
        return null;
      }),
      query: jest.fn(async (sql: string) => (sql.startsWith('delete from money_pay_methods') ? [{ id: 'm1' }] : [])),
      transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    const receipts = {
      verify: jest.fn(async () => undefined),
      attach: jest.fn(async () => undefined),
      forPayMethods: jest.fn(async () => (options.qr ? new Map([['m1', options.qr]]) : new Map())),
    };
    const reauth = { confirm: jest.fn(async () => undefined) };
    const mail = { send: jest.fn(async () => true) };
    const mailConfig = { appUrl: 'https://app.virgo.test' };
    const notifier = { notify: jest.fn(async () => undefined) };
    const service = new MoneyPayMethodsService(
      db as unknown as DatabaseService,
      receipts as unknown as ReceiptFilesService,
      reauth as unknown as ReauthService,
      mail as unknown as MailService,
      mailConfig as unknown as MailConfig,
      notifier as unknown as NotifyService,
    );
    return { service, receipts, tx, db, reauth, mail, notifier };
  }

  /** The alert is not waited on; let it finish. */
  const settle = () => new Promise((resolve) => setImmediate(resolve));

  it(`stops at ${MAX_PAY_METHODS} ways to pay`, async () => {
    const { service } = methodsOver({ count: MAX_PAY_METHODS });
    await expect(service.create(ME, { kind: 'gcash', accountNumber: '0917' }, PROOF)).rejects.toThrow('up to 4');
  });

  it('needs a number or a QR code a client can use', async () => {
    const { service } = methodsOver();
    await expect(service.create(ME, { kind: 'maya', accountName: 'Ana' }, PROOF)).rejects.toThrow(
      'Add the number, or a QR code',
    );
  });

  it('puts a QR code on the method, checked first', async () => {
    const { service, receipts, tx } = methodsOver();
    await service.create(ME, { kind: 'gcash', qrReceiptId: 'qr-1' }, PROOF);
    expect(receipts.verify).toHaveBeenCalledWith(ME, 'qr-1', { payMethodId: 'm1' });
    expect(receipts.attach).toHaveBeenCalledWith(tx, ME, { payMethodId: 'm1' }, 'qr-1');
  });

  it('asks for the password before a way to pay is added, and writes nothing when it is refused', async () => {
    const { service, reauth, db } = methodsOver();
    reauth.confirm.mockRejectedValueOnce(new Error('That password is not correct.'));
    await expect(service.create(ME, { kind: 'gcash', accountNumber: '0917 555 0199' }, PROOF)).rejects.toThrow(
      'not correct',
    );
    expect(reauth.confirm).toHaveBeenCalledWith(ME, { password: 'hunter2' }, 'pay_details');
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('emails and notifies the owner when one is added, with only the end of the number', async () => {
    const { service, mail, notifier } = methodsOver();
    await service.create(ME, { kind: 'gcash', accountNumber: '0917 000 0000' }, PROOF);
    await settle();
    const [to, email] = mail.send.mock.calls[0] as unknown as [string, { subject: string; text: string }];
    expect(to).toBe('ana@example.test');
    expect(email.subject).toBe('GCash was added to how clients pay you');
    expect(email.text).toContain('Number now ends in 0000');
    expect(email.text).not.toContain('0917 000 0000');
    expect(email.text).toContain('https://app.virgo.test/settings/devices');
    expect(notifier.notify).toHaveBeenCalledWith(
      [ME],
      expect.objectContaining({ topic: 'money', data: { type: 'money', payMethods: true } }),
    );
  });

  it('marks the details changed, and says so, when a number is swapped', async () => {
    const { service, tx, mail } = methodsOver();
    await service.update(ME, 'm1', { accountNumber: '0917 555 0199' }, PROOF);
    const [, args] = tx.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(args[6]).toBe(true);
    await settle();
    const [, email] = mail.send.mock.calls[0] as unknown as [string, { subject: string; text: string }];
    expect(email.subject).toBe('Your GCash pay details changed');
    expect(email.text).toContain('Number now ends in 0199');
  });

  it('says when a QR code is replaced', async () => {
    const { service, mail } = methodsOver({ qr: { id: 'qr-old' } });
    await service.update(ME, 'm1', { qrReceiptId: 'qr-new' }, PROOF);
    await settle();
    const [, email] = mail.send.mock.calls[0] as unknown as [string, { text: string }];
    expect(email.text).toContain('QR code replaced');
  });

  it('leaves the date alone, and says nothing, when a save changes nothing', async () => {
    const { service, tx, mail } = methodsOver();
    await service.update(ME, 'm1', { accountName: 'Ana Reyes', accountNumber: '0917 000 0000' }, PROOF);
    const [, args] = tx.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(args[6]).toBe(false);
    await settle();
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('asks for the password before one is removed, and tells the owner', async () => {
    const { service, reauth, mail } = methodsOver();
    await service.remove(ME, 'm1', PROOF);
    expect(reauth.confirm).toHaveBeenCalledWith(ME, { password: 'hunter2' }, 'pay_details');
    await settle();
    const [, email] = mail.send.mock.calls[0] as unknown as [string, { subject: string }];
    expect(email.subject).toBe('GCash was removed from how clients pay you');
  });

  it('makes one the main way to pay without a password, and only for its owner', async () => {
    const { service, reauth, db } = methodsOver({ current: null });
    await expect(service.makeMain(ME, 'm1')).rejects.toThrow('not found');
    expect(reauth.confirm).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
  });

  it('never lets a failed email undo the change', async () => {
    const { service, mail } = methodsOver();
    mail.send.mockRejectedValueOnce(new Error('SMTP down'));
    await expect(service.create(ME, { kind: 'gcash', accountNumber: '0917' }, PROOF)).resolves.toMatchObject({
      id: 'm1',
    });
    await settle();
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
      { id: 'm1', kind: 'gcash', label: null, accountName: 'Ana Reyes', accountNumber: '0917 000 0000', qr: { id: 'q', name: 'qr.png', contentType: 'image/png', sizeBytes: 1, url: 'https://bucket.test/qr.png?sig=1&x=2' }, detailsChangedAt: '2026-11-03T02:00:00.000Z' },
      { id: 'm2', kind: 'bank', label: 'BPI', accountName: 'Ana Reyes', accountNumber: '1234 5678 90', qr: null, detailsChangedAt: '2026-10-01T02:00:00.000Z' },
    ],
  };
  const LATER = new Date('2026-11-17T02:00:00Z');

  it('shows the balance, the next payment, and how to pay', () => {
    const html = renderStatement(view, LATER);
    expect(html).toContain('₱35,000');
    expect(html).toContain('Next payment: ₱35,000 due Sat, Nov 14, 2026');
    expect(html).toContain('0917 000 0000');
    expect(html).toContain('incl. ₱750 tax withheld (BIR 2307)');
    expect(html).toContain('not an official receipt or a BIR invoice');
  });

  it('leads with the amount to send and the main way to pay, and folds the rest', () => {
    const html = renderStatement(view, LATER);
    expect(html).toContain('Send ₱35,000 to Ana Reyes');
    expect(html.indexOf('How to pay')).toBeLessThan(html.indexOf('Still to pay'));
    expect(html).toContain('Open the QR to save it');
    expect(html).toContain('Paying from this phone?');
    expect(html).toContain('check that your app shows the name <strong>Ana Reyes</strong>');
    expect(html).toContain('<summary>Other ways to pay: BPI</summary>');
    expect(html.indexOf('0917 000 0000')).toBeLessThan(html.indexOf('1234 5678 90'));
  });

  it('says when the details last changed, and warns for a day after a change', () => {
    const settled = renderStatement(view, LATER);
    expect(settled).toContain('These pay details last changed Tue, Nov 3, 2026');
    expect(settled).not.toContain('These pay details are new');

    const fresh = renderStatement(view, new Date('2026-11-03T20:00:00Z'));
    expect(fresh).toContain('These pay details are new');
    expect(fresh).toContain('changed how to pay on Tue, Nov 3, 2026');
  });

  it('says the link is private', () => {
    expect(renderStatement(view, LATER)).toContain('Only people with this link can open it');
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
