import type { DatabaseService } from '../database/database.service';
import type { NotifyService } from '../notifications/notify.service';
import { BookingsService } from './bookings.service';

/**
 * The "jobs done" count on a profile.
 *
 * Which bookings count is decided by the SQL alone, so these read the query:
 * agreed as the creative, not cancelled, and dated before today — today in
 * Manila, bound as a parameter, because current_date follows the database
 * session's zone and would lag Manila by eight hours every morning.
 */
function bookingsOver(row: { n: number } | null) {
  const queryOne = jest.fn(async (_sql: string, _params?: unknown[]) => row);
  const service = new BookingsService(
    { queryOne } as unknown as DatabaseService,
    {} as unknown as NotifyService,
  );
  return { service, queryOne };
}

describe('BookingsService.jobsDoneCount', () => {
  it('counts agreed, uncancelled jobs dated before today in Manila', async () => {
    const { service, queryOne } = bookingsOver({ n: 4 });

    await expect(service.jobsDoneCount('creative-1')).resolves.toBe(4);

    const [sql, params] = queryOne.mock.calls[0];
    expect(params).toEqual(['creative-1', 'Asia/Manila']);
    expect(sql).toMatch(/creative_id = \$1/);
    expect(sql).toMatch(/creative_confirmed_at is not null/);
    expect(sql).toMatch(/cancelled_at is null/);
    expect(sql).toContain('event_date < (now() at time zone $2::text)::date');
    expect(sql).not.toMatch(/current_date/);
  });

  it('is 0 when there is nothing to count', async () => {
    const { service } = bookingsOver(null);

    await expect(service.jobsDoneCount('creative-1')).resolves.toBe(0);
  });
});
