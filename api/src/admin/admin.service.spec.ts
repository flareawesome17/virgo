import type { DatabaseService } from '../database/database.service';
import type { MailService } from '../mail/mail.service';
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
