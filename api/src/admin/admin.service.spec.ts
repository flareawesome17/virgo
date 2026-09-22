import type { DatabaseService } from '../database/database.service';
import type { MailService } from '../mail/mail.service';
import type { RealtimeGateway } from '../realtime/realtime.gateway';
import type { StorageService } from '../storage/storage.service';
import type { VisitsService } from '../visits/visits.service';
import { AdminService } from './admin.service';

/**
 * How many items the console says an album holds.
 *
 * The account page and the content list both showed `albums.item_count`, a
 * counter nothing maintains, which reads 0 for every album made since August
 * 2026.
 * Support reads these while working out why someone cannot upload, beside
 * storage figures summed from the files themselves, so the count comes from
 * the same files: every one of them, whatever its kind.
 *
 * The database is faked, so these read the queries, and fail if either goes
 * back to the column. Only a real Postgres can prove the count itself.
 */

/** Whether a query reads the stored column, rather than naming a count after it. */
function readsStoredCount(sql: string): boolean {
  return /\bitem_count\b/.test(sql.replace(/\bas\s+item_count\b/g, ''));
}

const COUNTS_FILES = /count\(\*\)\s+from\s+user_files\s+f\s+where\s+f\.album_id\s*=\s*a\.id\b/;

function serviceOver() {
  const query = jest.fn(async (_sql: string, _params?: unknown[]) => [] as unknown[]);
  // Only the account itself has to exist; every other single row may be absent.
  const queryOne = jest.fn(async (sql: string, _params?: unknown[]) =>
    sql.includes('from users where id') ? { id: 'user-1', plan: 'free' } : null,
  );
  const db = { query, queryOne } as unknown as DatabaseService;

  const service = new AdminService(
    db,
    {} as unknown as StorageService,
    {} as unknown as MailService,
    {} as unknown as VisitsService,
    {} as unknown as RealtimeGateway,
  );

  /** The one list query that reads albums. */
  const albumsQuery = () => {
    const asked = query.mock.calls
      .map(([sql]) => sql)
      .filter((sql) => /\bfrom albums a\b/.test(sql));
    expect(asked).toHaveLength(1);
    return asked[0];
  };

  return { service, albumsQuery };
}

describe('AdminService album item counts', () => {
  it('counts the files in each album on an account', async () => {
    const { service, albumsQuery } = serviceOver();

    await service.user('user-1');

    expect(readsStoredCount(albumsQuery())).toBe(false);
    expect(albumsQuery()).toMatch(COUNTS_FILES);
  });

  it('counts the files in each album on the content list', async () => {
    const { service, albumsQuery } = serviceOver();

    await service.albums({});

    expect(readsStoredCount(albumsQuery())).toBe(false);
    expect(albumsQuery()).toMatch(COUNTS_FILES);
  });
});

/**
 * Console suspension and people reports.
 *
 * Suspending writes suspended_at — what sign-in and every visibility filter
 * read — and ends the sessions that exist. It no longer touches a pause the
 * person set themselves. Read from the statements, as above.
 */
function suspensionHarness() {
  const query = jest.fn(async (_sql: string, _params?: unknown[]) => [] as unknown[]);
  const queryOne = jest.fn(
    async (sql: string, _params?: unknown[]): Promise<Record<string, unknown> | null> =>
    /^\s*update users/.test(sql)
      ? { id: 'user-1', email: 'mika@example.com', suspended_at: new Date('2026-09-22T00:00:00Z') }
      : { count: '7' },
  );
  const db = { query, queryOne } as unknown as DatabaseService;
  const realtime = { closeUser: jest.fn() };
  const visits = { summary: jest.fn(async () => ({})) };

  const service = new AdminService(
    db,
    {} as unknown as StorageService,
    {} as unknown as MailService,
    visits as unknown as VisitsService,
    realtime as unknown as RealtimeGateway,
  );
  return { service, query, queryOne, realtime };
}

describe('AdminService.setUserDisabled', () => {
  it('suspends: sets suspended_at, leaves the pause alone, ends every session', async () => {
    const { service, query, queryOne, realtime } = suspensionHarness();

    const result = await service.setUserDisabled('user-1', true, 'spam');

    const [update] = queryOne.mock.calls[0];
    expect(update).toMatch(/suspended_at = case when \$2 then coalesce\(suspended_at, now\(\)\) else null end/);
    expect(update).toMatch(/disabled_at = case when \$2 then now\(\) else null end/);
    expect(update).not.toMatch(/disabled_until/);

    const revoke = query.mock.calls.find(([sql]) => /update refresh_tokens set revoked_at = now\(\)/.test(sql));
    expect(revoke?.[1]).toEqual(['user-1']);
    expect(realtime.closeUser).toHaveBeenCalledWith('user-1');

    expect(result).toEqual({
      id: 'user-1',
      email: 'mika@example.com',
      disabled: true,
      suspendedAt: new Date('2026-09-22T00:00:00Z'),
      reason: 'spam',
    });
  });

  it('restores: clears suspended_at and revokes nothing', async () => {
    const { service, query, queryOne, realtime } = suspensionHarness();

    await service.setUserDisabled('user-1', false);

    expect(queryOne.mock.calls[0][1]).toEqual(['user-1', false]);
    expect(query).not.toHaveBeenCalled();
    expect(realtime.closeUser).not.toHaveBeenCalled();
  });
});

describe('AdminService.userReports', () => {
  it('clamps the page and joins the target and, when they still exist, the reporter', async () => {
    const { service, query } = suspensionHarness();

    await service.userReports({ limit: 0 });
    await service.userReports({ limit: 500, offset: -3 });

    expect(query.mock.calls[0][1]).toEqual([1, 0]);
    expect(query.mock.calls[1][1]).toEqual([100, 0]);
    const [sql] = query.mock.calls[0];
    expect(sql).toMatch(/join users t on t\.id = r\.target_id/);
    expect(sql).toMatch(/left join users u on u\.id = r\.reporter_id/);
    expect(sql).toMatch(/as target_report_count/);
  });

  it('adds people reports to the overview without folding them into job reports', async () => {
    const { service, queryOne } = suspensionHarness();
    queryOne.mockImplementationOnce(async () => ({ reports: '2', user_reports: '5' }));

    const overview = await service.overview(30);

    expect(overview.totals.userReports).toBe(5);
    expect(overview.totals.reports).toBe(2);
  });

  it('shows the suspension on the account list and page', async () => {
    const { service, query, queryOne } = suspensionHarness();
    queryOne.mockImplementation(async (sql: string) =>
      sql.includes('from users where id') ? { id: 'user-1', plan: 'free' } : null,
    );

    await service.users({});
    await service.user('user-1');

    expect(query.mock.calls[0][0]).toMatch(/u\.suspended_at/);
    const account = queryOne.mock.calls.find(([sql]) => sql.includes('from users where id'))!;
    expect(account[0]).toMatch(/suspended_at/);
  });
});
