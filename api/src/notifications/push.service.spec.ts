import type { DatabaseService } from '../database/database.service';
import { AppUpdatesService } from './app-updates.service';
import { PushService } from './push.service';

/**
 * No pushes to a suspended account.
 *
 * Every push goes through one of two token reads: PushService.tokensFor, for
 * anything addressed to a person (chat, notifications, the test push), and
 * the announcement fan-out. The database is faked, so these read the SQL;
 * which tokens it returns is checked on a real Postgres.
 */

const ME = '11111111-1111-4111-8111-111111111111';

type Row = Record<string, unknown>;

function dbOver(answer: (sql: string, params: unknown[]) => Row[] = () => []) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    return answer(sql, params);
  });
  const queryOne = jest.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    return answer(sql, params)[0] ?? null;
  });
  return { db: { query, queryOne } as unknown as DatabaseService, calls };
}

describe('PushService.tokensFor', () => {
  it('returns live tokens only while the account is not suspended', async () => {
    const { db, calls } = dbOver(() => [{ token: 'ExponentPushToken[a]' }]);

    await expect(new PushService(db).tokensFor(ME)).resolves.toEqual(['ExponentPushToken[a]']);

    const [read] = calls;
    expect(read.params).toEqual([ME]);
    expect(read.sql).toMatch(/join users u on u\.id = t\.user_id/);
    expect(read.sql).toMatch(/t\.disabled_at is null/);
    expect(read.sql).toMatch(/u\.suspended_at is null/);
  });
});

describe('AppUpdatesService announcement push', () => {
  it('leaves suspended accounts out of the fan-out', async () => {
    const { db, calls } = dbOver((sql) => {
      if (/insert into app_updates/.test(sql)) return [{ id: 'update-1' }];
      if (/from push_tokens t/.test(sql)) {
        return [{ token: 'ExponentPushToken[a]', platform: 'ios', app_version: '1.3.4' }];
      }
      return [];
    });
    const push = { send: jest.fn(async () => ({ sent: 1, failed: 0 })) };
    const service = new AppUpdatesService(db, push as unknown as PushService);

    const result = await service.announce({
      slug: 'v1-3-5',
      platforms: ['ios'],
      title: 'Virgo 1.3.5',
      body: 'Blocking and reporting.',
      push: true,
    });

    expect(result).toEqual({ id: 'update-1', created: true, pushed: 1 });
    const read = calls.find((c) => /from push_tokens t/.test(c.sql))!;
    expect(read.sql).toMatch(/join users u on u\.id = t\.user_id and u\.suspended_at is null/);
    expect(read.sql).toMatch(/t\.disabled_at is null/);
    expect(push.send).toHaveBeenCalledTimes(1);
  });
});
