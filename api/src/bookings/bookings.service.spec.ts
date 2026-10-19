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

describe('BookingsService.update', () => {
  function withRow() {
    const query = jest.fn(async () => []);
    const notify = jest.fn(async () => undefined);
    const service = new BookingsService(
      { query } as unknown as DatabaseService,
      { notify } as unknown as NotifyService,
    );
    const row = {
      poster_id: 'poster-1', creative_id: 'creative-1', post_title: 'Wedding',
      role: 'Lead', event_date: '2027-02-14', location: 'Cebu', rate_minor: 1500000,
      notes: null, locked_at: new Date(),
    };
    jest.spyOn(service as never, 'requireOpen').mockResolvedValue(row as never);
    jest.spyOn(service as never, 'byId').mockResolvedValue({ id: 'b1' } as never);
    return { service, query, notify };
  }

  // Saving unchanged used to clear both confirmations and tell the creative
  // the terms had moved.
  it('changes nothing, and tells nobody, when nothing changed', async () => {
    const { service, query, notify } = withRow();
    await service.update('poster-1', 'b1', {
      role: 'Lead', eventDate: '2027-02-14', location: 'Cebu', rateMinor: 1500000, notes: null,
    });
    expect(query).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('clears the confirmations when something did change', async () => {
    const { service, query, notify } = withRow();
    await service.update('poster-1', 'b1', { rateMinor: 1800000 });
    expect(query).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('refuses moving the date into the past', async () => {
    const { service, query } = withRow();
    await expect(service.update('poster-1', 'b1', { eventDate: '2020-01-01' })).rejects.toThrow(
      'That date has already passed',
    );
    expect(query).not.toHaveBeenCalled();
  });
});
