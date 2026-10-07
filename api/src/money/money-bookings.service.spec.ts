import type { DatabaseService } from '../database/database.service';
import { MoneyBookingsService } from './money-bookings.service';
import { MoneyNudgesService, pesoText } from './money-nudges.service';
import type { NotifyService } from '../notifications/notify.service';

/**
 * What Money offers from a booking, and the morning-after question. Which
 * bookings qualify is the SQL's to decide, and it is run against real
 * Postgres where it is checked; these pin who sees what and what is said.
 */

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const BOOKING = '44444444-4444-4444-8444-444444444444';

function bookingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: BOOKING,
    poster_id: OTHER,
    role: 'Second shooter',
    event_date: '2026-10-20',
    rate_minor: 800_000,
    post_title: 'Reyes wedding',
    other_name: 'Marco Santos',
    today: '2026-10-08',
    ...overrides,
  };
}

function bookingsOver(rows: unknown[], one: unknown = { one: 1 }) {
  const db = {
    query: jest.fn(async (_sql: string, _args?: unknown[]) => rows),
    queryOne: jest.fn(async (_sql: string, _args?: unknown[]) => one),
  };
  return { service: new MoneyBookingsService(db as unknown as DatabaseService), db };
}

describe('MoneyBookingsService.suggestions', () => {
  it("offers the creative who was hired the fee as income, due on the shoot day", async () => {
    const { service } = bookingsOver([bookingRow()]);
    const [s] = await service.suggestions(ME);
    expect(s).toEqual({
      bookingId: BOOKING,
      kind: 'income',
      category: 'job',
      amountMinor: 800_000,
      occurredOn: '2026-10-20',
      paid: false,
      counterparty: 'Marco Santos',
      note: 'Reyes wedding · Second shooter',
      postTitle: 'Reyes wedding',
      role: 'Second shooter',
      eventDate: '2026-10-20',
    });
  });

  it('offers whoever hired the same booking as a crew expense', async () => {
    const { service } = bookingsOver([bookingRow({ poster_id: ME })]);
    const [s] = await service.suggestions(ME);
    expect(s).toMatchObject({ kind: 'expense', category: 'crew' });
  });

  it("files an editor's fee as editing, and starts a past shoot as paid", async () => {
    const { service } = bookingsOver([bookingRow({ role: 'Photo/Video Editor', event_date: '2026-10-05' })]);
    const [s] = await service.suggestions(ME);
    expect(s).toMatchObject({ category: 'editing', paid: true, occurredOn: '2026-10-05' });
  });

  it('leaves the amount empty when no rate was agreed, and dates an undated booking today', async () => {
    const { service } = bookingsOver([bookingRow({ rate_minor: null, event_date: null })]);
    const [s] = await service.suggestions(ME);
    expect(s).toMatchObject({ amountMinor: null, occurredOn: '2026-10-08', paid: false });
  });

  it('reads only bookings the caller is on, agreed, uncancelled, unrecorded and not turned down', async () => {
    const { service, db } = bookingsOver([]);
    await service.suggestions(ME, BOOKING);
    const [sql, args] = db.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('(b.poster_id = $1 or b.creative_id = $1)');
    expect(sql).toContain('b.creative_confirmed_at is not null');
    expect(sql).toContain('b.cancelled_at is null');
    expect(sql).toMatch(/e\.user_id = \$1 and e\.booking_id = b\.id/);
    expect(sql).toMatch(/m\.dismissed_at is not null/);
    expect(args).toEqual([ME, BOOKING, 'Asia/Manila']);
  });
});

describe('MoneyBookingsService.dismiss', () => {
  it("404s a booking the caller isn't on, and writes nothing", async () => {
    const { service, db } = bookingsOver([], null);
    await expect(service.dismiss(ME, BOOKING)).rejects.toMatchObject({ status: 404 });
    expect(db.query).not.toHaveBeenCalled();
  });

  it('remembers "not this" for that person and booking', async () => {
    const { service, db } = bookingsOver([]);
    await service.dismiss(ME, BOOKING);
    const [sql, args] = db.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('insert into money_booking_prompts');
    expect(args).toEqual([ME, BOOKING]);
  });
});

describe('MoneyNudgesService', () => {
  function nudgesOver(options: { lock?: boolean; due?: unknown[] } = {}) {
    const tx = {
      query: jest.fn(async (sql: string) =>
        sql.includes('pg_try_advisory_xact_lock')
          ? { rows: [{ ok: options.lock ?? true }] }
          : { rows: options.due ?? [] },
      ),
    };
    const db = { transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)) };
    const notifier = { deliver: jest.fn(async () => ({ sent: 1, failed: 0 })) };
    const service = new MoneyNudgesService(
      db as unknown as DatabaseService,
      notifier as unknown as NotifyService,
    );
    return { service, tx, notifier };
  }

  it('asks the creative, opening the booking, with the agreed amount and who owes it', async () => {
    const { service, notifier } = nudgesOver({
      due: [{ booking_id: BOOKING, user_id: ME, post_title: 'Reyes wedding', rate_minor: 800_050, poster_name: 'Marco' }],
    });
    await expect(service.askAfterShoots()).resolves.toBe(1);
    const [deliveries] = notifier.deliver.mock.calls[0] as unknown as [Record<string, unknown>[]];
    expect(deliveries[0]).toMatchObject({
      userId: ME,
      topic: 'booking',
      title: 'Got paid for “Reyes wedding”?',
      data: { type: 'booking', bookingId: BOOKING },
    });
    expect(deliveries[0].body).toContain('₱8,000.50 from Marco');
  });

  it('claims each booking once, and never after "not this"', async () => {
    const { service, tx } = nudgesOver();
    await service.askAfterShoots();
    const sql = (tx.query.mock.calls[1] as unknown as [string])[0];
    expect(sql).toContain('money_booking_prompts.nudged_at is null');
    expect(sql).toContain('money_booking_prompts.dismissed_at is null');
    expect(sql).toMatch(/e\.paid_on is not null/);
  });

  it('does nothing when another process holds the run', async () => {
    const { service, tx, notifier } = nudgesOver({ lock: false });
    await expect(service.askAfterShoots()).resolves.toBe(0);
    expect(tx.query).toHaveBeenCalledTimes(1);
    expect(notifier.deliver).not.toHaveBeenCalled();
  });

  it('writes pesos the way the apps do', () => {
    expect(pesoText(800_000)).toBe('₱8,000');
    expect(pesoText(123_456_78)).toBe('₱123,456.78');
  });
});
