import type { DatabaseService } from '../database/database.service';
import type { MoneyPayMethodsService } from '../money/money-pay-methods.service';
import type { NotifyService } from '../notifications/notify.service';
import { BookingsService } from './bookings.service';

/**
 * How to pay the creative, on a booking.
 *
 * Shown to the poster, who pays, once the creative has confirmed and while
 * the booking stands; never to the creative, and never before.
 */

const POSTER = '11111111-1111-4111-8111-111111111111';
const CREATIVE = '22222222-2222-4222-8222-222222222222';

function bookingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'b1',
    application_id: 'a1',
    post_id: 'p1',
    poster_id: POSTER,
    creative_id: CREATIVE,
    role: 'Second shooter',
    event_date: '2026-11-14',
    location: 'Cebu City',
    rate_minor: 600_000,
    currency: 'PHP',
    notes: null,
    poster_confirmed_at: null,
    creative_confirmed_at: new Date('2026-11-01T00:00:00Z'),
    locked_at: null,
    cancelled_at: null,
    cancel_reason: null,
    created_at: new Date('2026-10-30T00:00:00Z'),
    updated_at: new Date('2026-11-01T00:00:00Z'),
    post_title: 'Reyes–Santos wedding',
    post_slug: 'reyes-santos',
    other_id: CREATIVE,
    other_name: 'Paolo Cruz',
    other_avatar: null,
    other_handle: null,
    conversation_id: null,
    ...overrides,
  };
}

function over(row: Record<string, unknown>) {
  const payMethods = {
    mainCardOf: jest.fn(async () => ({
      id: 'pm1',
      kind: 'gcash',
      label: null,
      accountName: 'Paolo Cruz',
      accountNumber: '0920 222 3344',
      qrUrl: null,
      detailsChangedAt: '2026-10-01T00:00:00.000Z',
    })),
  };
  const service = new BookingsService(
    { queryOne: jest.fn(async () => row) } as unknown as DatabaseService,
    {} as unknown as NotifyService,
    payMethods as unknown as MoneyPayMethodsService,
  );
  jest.spyOn(service as never, 'present').mockImplementation(((r: Record<string, unknown>, viewer: string) => ({
    id: r.id,
    yourSide: viewer === r.poster_id ? 'poster' : 'creative',
    confirmed: !!r.creative_confirmed_at,
    cancelledAt: r.cancelled_at ? String(r.cancelled_at) : null,
  })) as never);
  return { service, payMethods };
}

describe('BookingsService.byId payTo', () => {
  it("shows the poster the creative's main way to pay once they have confirmed", async () => {
    const { service, payMethods } = over(bookingRow());
    const booking = await service.byId(POSTER, 'b1');
    expect(payMethods.mainCardOf).toHaveBeenCalledWith(CREATIVE);
    expect(booking.payTo).toMatchObject({ accountName: 'Paolo Cruz', accountNumber: '0920 222 3344' });
  });

  it('shows nothing to the creative, before confirming, or once cancelled', async () => {
    for (const [viewer, row] of [
      [CREATIVE, bookingRow()],
      [POSTER, bookingRow({ creative_confirmed_at: null })],
      [POSTER, bookingRow({ cancelled_at: new Date() })],
    ] as const) {
      const { service, payMethods } = over(row);
      const booking = await service.byId(viewer, 'b1');
      expect(booking.payTo).toBeUndefined();
      expect(payMethods.mainCardOf).not.toHaveBeenCalled();
    }
  });
});
