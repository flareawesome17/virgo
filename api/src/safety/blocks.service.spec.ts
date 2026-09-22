import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { DatabaseService } from '../database/database.service';
import { BlocksService } from './blocks.service';

/**
 * Blocking: who a reference resolves to, what a block closes and in what
 * order, and what the blocked list gives away (nothing but the snapshot).
 *
 * The database is faked, so these read the statements. The order is the
 * contract that keeps a block from deadlocking against an accept — lock first,
 * applications in id order — and the rows each statement touches are checked
 * on a real Postgres.
 */

const ME = '11111111-1111-4111-8111-111111111111';
const THEM = '22222222-2222-4222-8222-222222222222';
const APP = '33333333-3333-4333-8333-333333333333';
const ENQ = '44444444-4444-4444-8444-444444444444';
const POST = '55555555-5555-4555-8555-555555555555';
const BLOCK = '66666666-6666-4666-8666-666666666666';

type Row = Record<string, unknown>;

const SNAPSHOT: Row = {
  id: BLOCK,
  blocked_name: 'Ana Cruz',
  blocked_handle: 'ana',
  blocked_avatar_url: null,
  created_at: new Date('2026-09-20T10:00:00Z'),
};

function serviceOver(answer: (sql: string, params: unknown[]) => Row[] = () => []) {
  const pool: { sql: string; params: unknown[] }[] = [];
  const onClient: { sql: string; params: unknown[] }[] = [];

  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    pool.push({ sql, params });
    return answer(sql, params);
  });
  const queryOne = jest.fn(async (sql: string, params: unknown[] = []) => {
    pool.push({ sql, params });
    return answer(sql, params)[0] ?? null;
  });
  const client = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      onClient.push({ sql, params });
      return { rows: /from user_blocks\s+where blocker_id = \$1 and blocked_id = \$2/.test(sql) ? [SNAPSHOT] : [] };
    }),
  };
  const transaction = jest.fn(async (fn: (c: typeof client) => Promise<unknown>) => fn(client));
  const db = { query, queryOne, transaction } as unknown as DatabaseService;

  return { service: new BlocksService(db), pool, onClient, transaction, client };
}

const byUserId = (sql: string, params: unknown[]): Row[] =>
  /select id from users where id = \$1/.test(sql) ? [{ id: params[0] }] : [];

describe('BlocksService.block', () => {
  it('closes everything between the pair in one transaction, in a fixed order', async () => {
    const { service, onClient, transaction } = serviceOver(byUserId);

    await service.block(ME, { userId: THEM });

    expect(transaction).toHaveBeenCalledTimes(1);
    const order = [
      /pg_advisory_xact_lock/,
      /insert into user_blocks[\s\S]*on conflict \(blocker_id, blocked_id\) do nothing/,
      /delete from friends[\s\S]*not \(status = 'declined' and requested_by = 'them'\)/,
      /update hire_enquiries[\s\S]*status = 'new'/,
      /update hiring_applications[\s\S]*/,
      /update collaborators[\s\S]*status = 'pending'/,
      /update event_attendees[\s\S]*e\.event_date >= current_date/,
      /delete from notifications/,
    ];
    order.forEach((pattern, i) => expect(onClient[i].sql).toMatch(pattern));

    expect(onClient[0].params).toEqual([ME, THEM]);
    for (const statement of onClient.slice(1, 7)) {
      expect(statement.params).toEqual([ME, THEM]);
    }
  });

  it('declines applications through rows locked in id order', async () => {
    const { service, onClient } = serviceOver(byUserId);
    await service.block(ME, { userId: THEM });

    const applications = onClient.find((c) => /hiring_applications a\s+set status/.test(c.sql))!;
    expect(applications.sql).toMatch(/a\.status in \('new', 'shortlisted'\)/);
    expect(applications.sql).toMatch(/order by a\.id\s+for update of a/);
  });

  it('snapshots what the blocker could see, not the live account', async () => {
    const { service, onClient } = serviceOver(byUserId);
    await service.block(ME, { userId: THEM });

    const insert = onClient.find((c) => /insert into user_blocks/.test(c.sql))!;
    expect(insert.sql).toMatch(/blocked_name, blocked_handle, blocked_avatar_url/);
    expect(insert.sql).toMatch(/\$1::uuid/);
    expect(insert.params).toEqual([ME, THEM]);
  });

  it('keeps the handle to what the handle path would find', async () => {
    const { service, onClient } = serviceOver(byUserId);
    await service.block(ME, { userId: THEM });

    const insert = onClient.find((c) => /insert into user_blocks/.test(c.sql))!;
    const handle = /case when not t\.blocked_me([\s\S]*?)then u\.handle/.exec(insert.sql)?.[1] ?? '';
    expect(handle).toMatch(/u\.public_profile/);
    expect(handle).toMatch(/u\.disabled_until is null or u\.disabled_until <= now\(\)/);
    expect(handle).toMatch(/u\.suspended_at is null/);
  });

  it('stores a neutral name, no photo and no handle for someone who already blocked the caller', async () => {
    const { service, onClient } = serviceOver(byUserId);
    await service.block(ME, { userId: THEM });

    const insert = onClient.find((c) => /insert into user_blocks/.test(c.sql))!;
    // Their block of me: they are the blocker, I am the one blocked.
    expect(insert.sql).toMatch(/x\.blocker_id = u\.id\s+and x\.blocked_id = \$1::uuid\) as blocked_me/);
    expect(insert.sql).toMatch(/case when t\.blocked_me then 'Virgo member'/);
    expect(insert.sql).toMatch(/case when not t\.blocked_me then u\.avatar_url end/);
    expect(insert.sql).toMatch(/case when not t\.blocked_me\s+and u\.public_profile/);
  });

  it('still resolves any account by user id, so a mutual block and a paused harasser can be blocked', async () => {
    const { service, pool } = serviceOver(byUserId);
    await service.block(ME, { userId: THEM });

    const [lookup] = pool;
    expect(lookup.sql).toBe('select id from users where id = $1');
    expect(lookup.params).toEqual([THEM]);
  });

  it('clears the blocker’s notifications about the person and what was just closed', async () => {
    const { service, onClient } = serviceOver(byUserId);
    await service.block(ME, { userId: THEM });

    const notifications = onClient[onClient.length - 2];
    expect(notifications.sql).toMatch(/delete from notifications n\s+where n\.user_id = \$1/);
    expect(notifications.sql).toMatch(/n\.data->>'fromUserId' = \$3/);
    expect(notifications.sql).toMatch(/n\.data->>'applicationId' in/);
    expect(notifications.sql).toMatch(/n\.data->>'collaboratorId' in/);
    expect(notifications.sql).toMatch(/n\.data->>'type' = 'event_invite'/);
    expect(notifications.params).toEqual([ME, THEM, THEM]);
  });

  it('sends nothing and returns exactly the five public keys', async () => {
    const { service } = serviceOver(byUserId);
    const blocked = await service.block(ME, { userId: THEM });

    expect(Object.keys(blocked).sort()).toEqual(
      ['avatarUrl', 'blockedAt', 'handle', 'id', 'name'].sort(),
    );
    expect(blocked).toEqual({
      id: BLOCK,
      name: 'Ana Cruz',
      avatarUrl: null,
      handle: 'ana',
      blockedAt: '2026-09-20T10:00:00.000Z',
    });
  });
});

describe('BlocksService.resolvePerson', () => {
  it('insists on exactly one reference', async () => {
    const { service } = serviceOver();
    await expect(service.resolvePerson(ME, {}, 'block')).rejects.toThrow(
      new BadRequestException('Choose one person'),
    );
    await expect(
      service.resolvePerson(ME, { userId: THEM, handle: 'ana' }, 'report'),
    ).rejects.toThrow(new BadRequestException('Choose one person'));
  });

  it('refuses yourself in the verb’s own words', async () => {
    const { service } = serviceOver(byUserId);
    await expect(service.resolvePerson(ME, { userId: ME }, 'block')).rejects.toThrow(
      new BadRequestException('You cannot block yourself'),
    );
    await expect(service.resolvePerson(ME, { userId: ME }, 'report')).rejects.toThrow(
      new BadRequestException('You cannot report yourself'),
    );
  });

  it('resolves an application to the other side, and only for its two sides', async () => {
    const { service } = serviceOver((sql) =>
      /from hiring_applications a/.test(sql) ? [{ applicant_id: THEM, owner_id: ME }] : [],
    );
    await expect(service.resolvePerson(ME, { applicationId: APP }, 'block')).resolves.toBe(THEM);
    await expect(
      service.resolvePerson('77777777-7777-4777-8777-777777777777', { applicationId: APP }, 'block'),
    ).rejects.toThrow(new NotFoundException('Person not found'));
  });

  it('resolves an enquiry to the other party, scoped to the caller', async () => {
    const { service, pool } = serviceOver((sql) =>
      /from hire_enquiries/.test(sql) ? [{ other_id: THEM }] : [],
    );
    await expect(service.resolvePerson(ME, { enquiryId: ENQ }, 'report')).resolves.toBe(THEM);
    expect(pool[0].params).toEqual([ENQ, ME]);
    expect(pool[0].sql).toMatch(/from_user_id = \$2 or to_user_id = \$2/);
  });

  it('resolves a job post to its poster', async () => {
    const { service } = serviceOver((sql) =>
      /from hiring_posts where id = \$1/.test(sql) ? [{ user_id: THEM }] : [],
    );
    await expect(service.resolvePerson(ME, { jobPostId: POST }, 'block')).resolves.toBe(THEM);
  });

  it('resolves a handle only to a published, active profile that has not blocked you', async () => {
    const { service, pool } = serviceOver((sql) =>
      /lower\(u\.handle\) = \$1/.test(sql) ? [{ id: THEM }] : [],
    );
    await expect(service.resolvePerson(ME, { handle: ' Ana ' }, 'block')).resolves.toBe(THEM);

    const [lookup] = pool;
    expect(lookup.params).toEqual(['ana', ME]);
    expect(lookup.sql).toMatch(/u\.public_profile = true/);
    expect(lookup.sql).toMatch(/disabled_until/);
    expect(lookup.sql).toMatch(/u\.suspended_at is null/);
    expect(lookup.sql).toMatch(/ub\.blocker_id = u\.id and ub\.blocked_id = \$2/);
  });

  it('gives one 404 for a handle that resolves to nobody', async () => {
    const { service } = serviceOver();
    await expect(service.resolvePerson(ME, { handle: 'nobody' }, 'block')).rejects.toThrow(
      new NotFoundException('Person not found'),
    );
  });

  it('gives 404 for a malformed id without asking the database', async () => {
    const { service, pool } = serviceOver();
    await expect(service.resolvePerson(ME, { userId: 'nope' }, 'block')).rejects.toThrow(
      new NotFoundException('Person not found'),
    );
    expect(pool).toHaveLength(0);
  });
});

describe('BlocksService reads', () => {
  it('lists the snapshot only: no users join, five keys a row', async () => {
    const { service, pool } = serviceOver((sql) => (/from user_blocks/.test(sql) ? [SNAPSHOT] : []));

    const list = await service.list(ME);

    expect(pool[0].sql).not.toMatch(/join users/);
    expect(pool[0].sql).toMatch(/order by created_at desc limit 200/);
    expect(list).toHaveLength(1);
    expect(Object.keys(list[0]).sort()).toEqual(
      ['avatarUrl', 'blockedAt', 'handle', 'id', 'name'].sort(),
    );
  });

  it('asks about blocks and suspensions in one question', async () => {
    const { service, pool } = serviceOver(() => [{ closed: true }]);
    await expect(service.unavailable(ME, THEM)).resolves.toBe(true);
    expect(pool[0].sql).toMatch(/user_blocks/);
    expect(pool[0].sql).toMatch(/suspended_at is not null/);
  });

  it('runs on the given client, inside the caller’s transaction', async () => {
    const { service, pool, client } = serviceOver();
    await service.unavailable(ME, THEM, client as unknown as PoolClient);
    await service.between(ME, THEM, client as unknown as PoolClient);
    expect(pool).toHaveLength(0);
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it('puts the caller’s own block first when both have blocked', async () => {
    const { service, pool } = serviceOver(() => [{ id: BLOCK, by_me: true }]);
    await expect(service.between(ME, THEM)).resolves.toEqual({ id: BLOCK, byMe: true });
    expect(pool[0].sql).toMatch(/order by \(blocker_id = \$1\) desc/);
  });
});

describe('BlocksService.unblock', () => {
  it('gives 404 for a malformed id without a query', async () => {
    const { service, pool } = serviceOver();
    await expect(service.unblock(ME, 'x')).rejects.toThrow(new NotFoundException('Block not found'));
    expect(pool).toHaveLength(0);
  });

  it('gives 404 when nothing of theirs was deleted', async () => {
    const { service, pool } = serviceOver();
    await expect(service.unblock(ME, BLOCK)).rejects.toThrow(new NotFoundException('Block not found'));
    expect(pool[0].params).toEqual([BLOCK, ME]);
    expect(pool[0].sql).toMatch(/blocker_id = \$2/);
  });
});
