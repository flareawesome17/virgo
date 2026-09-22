import type { DatabaseService } from '../database/database.service';
import { FRIEND_PRESENTED, FRIEND_VISIBLE, relationshipCase } from './friend-sql';
import { FriendsRepository } from './friends.repository';

/**
 * What GET /friends and its total read.
 *
 * The database is faked, so these read the statements: every column qualified
 * (the mirror has the same names), one visibility predicate shared by the list
 * and its count, and an address only on the owner's own typed contacts. Which
 * rows the predicate actually keeps is checked against a real Postgres.
 */

function repositoryOver() {
  const query = jest.fn(async (_sql: string, _params?: unknown[]) => [] as unknown[]);
  const queryOne = jest.fn(async (_sql: string, _params?: unknown[]) => ({ count: '3' }));
  const db = { query, queryOne } as unknown as DatabaseService;
  return { repo: new FriendsRepository(db), query, queryOne };
}

describe('friend-sql fragments', () => {
  it('shows an address on legacy rows only, never on an accepted pair', () => {
    expect(FRIEND_PRESENTED).toMatch(
      /case when f\.friend_user_id is null then f\.friend_email end as friend_email/,
    );
    expect(FRIEND_PRESENTED).not.toMatch(/when f\.status = 'accepted'/);
    expect(FRIEND_PRESENTED).not.toMatch(/join users/);
  });

  it('keeps pending requests to and from a suspended account out of view', () => {
    const suspendedArms = FRIEND_VISIBLE.match(
      /not exists \(select 1 from users su where su\.id = f\.friend_user_id and su\.suspended_at is not null\)/g,
    );
    expect(suspendedArms).toHaveLength(2);
  });

  it('shows an outgoing request whether the other side is waiting or declined', () => {
    expect(FRIEND_VISIBLE).toMatch(
      /f\.status = 'pending' and f\.requested_by = 'me' and b\.requested_by = 'them' and b\.status in \('pending', 'declined'\)/,
    );
  });

  it('shows the decliner’s own record and not a requester’s copy of it', () => {
    // The only declined arm is the decliner's: a declined/me row, which the
    // release before this one wrote on the requester's side, is not listed.
    const declinedArms = FRIEND_VISIBLE.match(/f\.status = 'declined'[^)]*/g) ?? [];
    expect(declinedArms).toEqual(["f.status = 'declined' and f.requested_by = 'them'"]);
  });

  it('never shows a row across a block', () => {
    expect(FRIEND_VISIBLE).toMatch(/not exists \(select 1 from user_blocks ub/);
  });

  it('reads a declined request as still waiting, at any age', () => {
    const relationship = relationshipCase('m', 't');
    expect(relationship).toMatch(/t\.status in \('pending', 'declined'\) then 'pending_out'/);
    expect(relationship).not.toMatch(/interval/);
  });
});

describe('FriendsRepository', () => {
  it('lists presented, visible rows with every column qualified', async () => {
    const { repo, query } = repositoryOver();

    await repo.findAll('user-1', {
      orderBy: 'friend_name',
      direction: 'asc',
      filters: { status: 'pending', requested_by: 'them' },
    });

    const [sql, params] = query.mock.calls[0];
    expect(sql.startsWith(FRIEND_PRESENTED)).toBe(true);
    expect(sql).toContain(FRIEND_VISIBLE);
    expect(sql).toMatch(/where f\.user_id = \$1 and /);
    expect(sql).toMatch(/and f\.status = \$2 and f\.requested_by = \$3/);
    expect(sql).toMatch(/order by f\.friend_name ASC, f\.id ASC/);
    expect(sql).toMatch(/limit \$4 offset \$5/);
    expect(params).toEqual(['user-1', 'pending', 'them', 50, 0]);
  });

  it('ignores unknown filters and sorts, and clamps the page size', async () => {
    const { repo, query } = repositoryOver();

    await repo.findAll('user-1', {
      orderBy: 'friend_email',
      limit: 500,
      filters: { friend_user_id: 'someone', status: undefined },
    });

    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/order by f\.created_at DESC, f\.id DESC/);
    expect(sql).not.toMatch(/friend_user_id = \$2/);
    expect(params).toEqual(['user-1', 100, 0]);
  });

  it('counts with the same predicate as the list', async () => {
    const { repo, queryOne } = repositoryOver();

    await expect(repo.count('user-1', { status: 'accepted' })).resolves.toBe(3);

    const [sql, params] = queryOne.mock.calls[0];
    expect(sql).toContain(FRIEND_VISIBLE);
    expect(sql).toMatch(/left join friends b on b\.user_id = f\.friend_user_id and b\.friend_user_id = f\.user_id/);
    expect(sql).toMatch(/and f\.status = \$2/);
    expect(params).toEqual(['user-1', 'accepted']);
  });

  it('reads one row presented, without filtering it', async () => {
    const { repo, queryOne } = repositoryOver();

    await repo.findOne('user-1', 'row-1');

    const [sql, params] = queryOne.mock.calls[0];
    expect(sql.startsWith(FRIEND_PRESENTED)).toBe(true);
    expect(sql).not.toMatch(/user_blocks/);
    expect(params).toEqual(['row-1', 'user-1']);
  });
});
