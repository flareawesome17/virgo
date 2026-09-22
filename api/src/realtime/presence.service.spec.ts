import type { DatabaseService } from '../database/database.service';
import { PresenceService } from './presence.service';

/**
 * Who hears that someone came online, and who sees them type.
 *
 * The database is faked, so these read the SQL and what is done with the rows.
 * Which people the audience query actually returns is checked on a real
 * Postgres.
 */

const ME = '11111111-1111-4111-8111-111111111111';
const THEM = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';

function serviceOver(rows: Record<string, unknown>[]) {
  const query = jest.fn(async (_sql: string, _params?: unknown[]) => rows);
  const db = { query } as unknown as DatabaseService;
  return { service: new PresenceService(db), query };
}

describe('PresenceService.audienceFor', () => {
  it('is direct-chat partners and mirrored friends, never across a block', async () => {
    const { service, query } = serviceOver([{ user_id: THEM }]);

    await service.audienceFor(ME);

    const [sql, params] = query.mock.calls[0];
    // Group co-members are not in it.
    expect(sql).toMatch(/c\.is_group = false/);
    // A friend is both rows accepted, not one row on its own.
    expect(sql).toMatch(/join friends b on b\.user_id = f\.friend_user_id and b\.friend_user_id = f\.user_id and b\.status = 'accepted'/);
    expect(sql).toMatch(/f\.status = 'accepted'/);
    expect(sql).toMatch(/user_blocks/);
    expect(sql).toMatch(/ub\.blocked_id = x\.user_id/);
    expect(params).toEqual([ME]);
  });

  it('drops the null a legacy friend row can yield', async () => {
    const { service } = serviceOver([{ user_id: THEM }, { user_id: null }]);

    await expect(service.audienceFor(ME)).resolves.toEqual([THEM]);
  });

  it('answers nobody, rather than throwing, when the query fails', async () => {
    const query = jest.fn(async () => {
      throw new Error('connection reset');
    });
    const service = new PresenceService({ query } as unknown as DatabaseService);

    await expect(service.audienceFor(ME)).resolves.toEqual([]);
  });
});

describe('PresenceService.othersInConversation', () => {
  it('leaves out anyone blocked with the typist', async () => {
    const { service, query } = serviceOver([
      { user_id: ME, name: 'Mika', blocked: false },
      { user_id: THEM, name: 'Ana', blocked: true },
      { user_id: OTHER, name: 'Ben', blocked: false },
    ]);

    const result = await service.othersInConversation(ME, 'convo-1');

    expect(result).toEqual({ allowed: true, others: [OTHER], name: 'Mika' });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/user_blocks/);
    expect(sql).toMatch(/ub\.blocker_id = \$2 and ub\.blocked_id = p\.user_id/);
    expect(params).toEqual(['convo-1', ME]);
  });

  it('still refuses someone who is not in the conversation', async () => {
    const { service } = serviceOver([
      { user_id: THEM, name: 'Ana', blocked: false },
      { user_id: OTHER, name: 'Ben', blocked: false },
    ]);

    await expect(service.othersInConversation(ME, 'convo-1')).resolves.toEqual({
      allowed: false,
      others: [],
      name: '',
    });
  });
});

describe('PresenceService.mayConnect', () => {
  const over = (row: Record<string, unknown> | null | Error) => {
    const queryOne = jest.fn(async (_sql: string, _params?: unknown[]) => {
      if (row instanceof Error) throw row;
      return row;
    });
    const service = new PresenceService({ queryOne } as unknown as DatabaseService);
    return { service, queryOne };
  };

  it('admits an account that exists and is not suspended', async () => {
    const { service, queryOne } = over({ suspended_at: null });

    await expect(service.mayConnect(ME)).resolves.toBe(true);
    const [sql, params] = queryOne.mock.calls[0];
    expect(sql).toMatch(/select suspended_at from users where id = \$1/);
    expect(params).toEqual([ME]);
  });

  it('refuses a suspended account, and one that no longer exists', async () => {
    await expect(over({ suspended_at: new Date() }).service.mayConnect(ME)).resolves.toBe(false);
    await expect(over(null).service.mayConnect(ME)).resolves.toBe(false);
  });

  it('throws rather than guessing when the database cannot answer', async () => {
    await expect(over(new Error('connection reset')).service.mayConnect(ME)).rejects.toThrow(
      'connection reset',
    );
  });
});
