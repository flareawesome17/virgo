import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { DatabaseService } from '../database/database.service';
import type { MailConfig } from '../mail/mail.config';
import type { NotifyService } from '../notifications/notify.service';
import type { RealtimeGateway } from '../realtime/realtime.gateway';
import type { BlocksService } from '../safety/blocks.service';
import { FriendsRepository } from './friends.repository';
import { FriendsService } from './friends.service';

/**
 * The friend request core, respond, remove and connect.
 *
 * The database is faked: statements are answered by matching their SQL, and
 * these tests read which statements ran, in what order and with what. They
 * pin the decisions — the lock first, the silent cooldown, a decline that
 * looks like silence, no addresses copied — and cannot prove the SQL itself.
 * That is what the migration's checks on a real Postgres are for.
 */

const ME = '11111111-1111-4111-8111-111111111111';
const THEM = '22222222-2222-4222-8222-222222222222';

type Row = Record<string, unknown>;
type Answer = (sql: string, params: unknown[]) => Row[] | undefined;

interface PairSide {
  user_id: string;
  status: 'pending' | 'accepted' | 'declined';
  requested_by: 'me' | 'them';
  cooling?: boolean;
}

const account = (id: string, email: string, name: string | null) => ({
  id,
  email,
  display_name: name,
  avatar_url: `https://cdn.example/${id}.jpg`,
});

const ACCOUNTS: Record<string, Row> = {
  [ME]: account(ME, 'me@example.com', 'Mika Reyes'),
  [THEM]: account(THEM, 'them@example.com', 'Ana Cruz'),
};

const PRESENTED = { id: 'row-mine', friend_email: null, status: 'pending' };

function harness(
  options: {
    /** Answers for statements on the transaction's client. */
    client?: Answer;
    /** Answers for statements on the pool, checked before the defaults. */
    pool?: Answer;
    unavailable?: boolean;
  } = {},
) {
  const calls: { on: 'pool' | 'client'; sql: string; params: unknown[] }[] = [];

  const poolAnswer = (sql: string, params: unknown[]): Row[] => {
    calls.push({ on: 'pool', sql, params });
    const custom = options.pool?.(sql, params);
    if (custom) return custom;
    if (
      /from users where id = \$1$/.test(sql.trim()) ||
      /where id = \$1\s+and \(disabled_until/.test(sql)
    ) {
      const found = ACCOUNTS[String(params[0])];
      return found ? [found] : [];
    }
    if (/from friends f\s+left join friends b/.test(sql)) return [PRESENTED];
    return [];
  };

  const query = jest.fn(async (sql: string, params: unknown[] = []) =>
    poolAnswer(sql, params),
  );
  const queryOne = jest.fn(
    async (sql: string, params: unknown[] = []) => poolAnswer(sql, params)[0] ?? null,
  );

  const clientQuery = jest.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ on: 'client', sql, params });
    const custom = options.client?.(sql, params);
    if (custom) return { rows: custom };
    if (/insert into friends/.test(sql)) return { rows: [{ id: `row-${params[2] === THEM ? 'mine' : 'theirs'}` }] };
    if (/returning f?\.?id/.test(sql)) return { rows: [{ id: 'updated' }] };
    return { rows: [] };
  });
  const client = { query: clientQuery };

  const transaction = jest.fn(async (fn: (c: typeof client) => Promise<unknown>) =>
    fn(client),
  );

  const db = { query, queryOne, transaction } as unknown as DatabaseService;
  const blocks = {
    between: jest.fn(async () => null),
    unavailable: jest.fn(async () => options.unavailable ?? false),
  };
  const notifier = { notify: jest.fn(async () => undefined) };
  const realtime = { onlineAmong: jest.fn(() => new Set<string>()) };

  const service = new FriendsService(
    new FriendsRepository(db),
    db,
    notifier as unknown as NotifyService,
    { appUrl: 'https://web.example' } as unknown as MailConfig,
    realtime as unknown as RealtimeGateway,
    blocks as unknown as BlocksService,
  );

  const clientSql = () => calls.filter((c) => c.on === 'client');
  const upserts = () => clientSql().filter((c) => /insert into friends/.test(c.sql));

  return { service, calls, clientSql, upserts, blocks, notifier, transaction, query, client };
}

/** A client answer for the pair read under the lock. */
const pairIs =
  (...sides: PairSide[]): Answer =>
  (sql) =>
    /select user_id, status, requested_by/.test(sql)
      ? sides.map((s) => ({ cooling: false, ...s }))
      : undefined;

describe('FriendsService.requestAccount', () => {
  it('takes the pair lock as the first statement, then checks the pair on that client', async () => {
    const h = harness();
    await h.service.sendRequestToUser(ME, THEM);

    const first = h.clientSql()[0];
    expect(first.sql).toMatch(/pg_advisory_xact_lock/);
    expect(first.params).toEqual([ME, THEM]);
    expect(h.blocks.unavailable).toHaveBeenCalledWith(ME, THEM, h.client);
    // The block check lands before anything is written.
    const firstUpsert = h.clientSql().findIndex((c) => /insert into friends/.test(c.sql));
    expect(h.blocks.unavailable.mock.invocationCallOrder[0]).toBeLessThan(
      h.client.query.mock.invocationCallOrder[firstUpsert],
    );
  });

  it('holds a repeat request inside the cooldown: only my row, nobody told', async () => {
    const h = harness({
      client: pairIs(
        { user_id: ME, status: 'declined', requested_by: 'me' },
        { user_id: THEM, status: 'declined', requested_by: 'them', cooling: true },
      ),
    });

    const result = await h.service.sendRequestToUser(ME, THEM);

    expect(h.upserts()).toHaveLength(1);
    const [only] = h.upserts();
    expect(only.params[1]).toBe(ME);
    expect(only.params[5]).toBe('me');
    expect(h.upserts().some((u) => u.params[1] === THEM)).toBe(false);
    expect(h.notifier.notify).not.toHaveBeenCalled();
    expect(result.status).toBe('pending');
    expect(result.friend).toEqual(PRESENTED);
  });

  it('answers "already sent" to a request they declined, at any age, and writes nothing', async () => {
    // 45 days on: the window has passed, and it still reads as waiting.
    const h = harness({
      client: pairIs(
        { user_id: ME, status: 'pending', requested_by: 'me' },
        { user_id: THEM, status: 'declined', requested_by: 'them', cooling: false },
      ),
    });

    await expect(h.service.sendRequestToUser(ME, THEM)).rejects.toThrow(
      new BadRequestException('You have already sent them a request'),
    );
    expect(h.upserts()).toHaveLength(0);
    expect(h.notifier.notify).not.toHaveBeenCalled();
  });

  it('answers "already sent" while my request is still pending inside the cooldown', async () => {
    const h = harness({
      client: pairIs(
        { user_id: ME, status: 'pending', requested_by: 'me' },
        { user_id: THEM, status: 'declined', requested_by: 'them', cooling: true },
      ),
    });

    await expect(h.service.sendRequestToUser(ME, THEM)).rejects.toThrow(
      'You have already sent them a request',
    );
    expect(h.upserts()).toHaveLength(0);
  });

  it('sends a real request outside the cooldown: both rows, then one notification', async () => {
    const h = harness();

    await h.service.sendRequestToUser(ME, THEM);

    expect(h.upserts().map((u) => [u.params[1], u.params[5]])).toEqual([
      [ME, 'me'],
      [THEM, 'them'],
    ]);
    expect(h.notifier.notify).toHaveBeenCalledTimes(1);
    expect(h.notifier.notify).toHaveBeenCalledWith(
      [THEM],
      expect.objectContaining({
        topic: 'friend-request',
        data: { type: 'friend_request', fromUserId: ME },
      }),
    );
  });

  it('answers a real send without waiting on its push and email, like a held one', async () => {
    const h = harness();
    // A delivery that never finishes: the push and the email still in flight.
    h.notifier.notify.mockImplementation(() => new Promise<undefined>(() => undefined));

    const result = await h.service.sendRequestToUser(ME, THEM);

    expect(result).toEqual({ status: 'pending', friend: PRESENTED });
    expect(h.notifier.notify).toHaveBeenCalledTimes(1);
    // Dispatched once the transaction's last statement has run, never inside it.
    const statements = h.client.query.mock.invocationCallOrder;
    expect(statements[statements.length - 1]).toBeLessThan(
      h.notifier.notify.mock.invocationCallOrder[0],
    );
  });

  it('is a full send when the decliner changes their mind', async () => {
    const h = harness({
      client: pairIs(
        { user_id: ME, status: 'declined', requested_by: 'them' },
        { user_id: THEM, status: 'pending', requested_by: 'me' },
      ),
    });

    await h.service.sendRequestToUser(ME, THEM);

    expect(h.upserts()).toHaveLength(2);
    expect(h.notifier.notify).toHaveBeenCalledTimes(1);
  });

  it('refuses a second request between friends, and one crossing theirs', async () => {
    const friends = harness({
      client: pairIs(
        { user_id: ME, status: 'accepted', requested_by: 'me' },
        { user_id: THEM, status: 'accepted', requested_by: 'them' },
      ),
    });
    await expect(friends.service.sendRequestToUser(ME, THEM)).rejects.toThrow(
      'You are already friends',
    );

    const crossing = harness({
      client: pairIs(
        { user_id: ME, status: 'pending', requested_by: 'them' },
        { user_id: THEM, status: 'pending', requested_by: 'me' },
      ),
    });
    await expect(crossing.service.sendRequestToUser(ME, THEM)).rejects.toThrow(
      'They have already sent you a request — accept it instead',
    );
    expect(crossing.upserts()).toHaveLength(0);
  });

  it('copies nobody’s address onto either row', async () => {
    const h = harness();
    await h.service.sendRequestToUser(ME, THEM);

    for (const upsert of h.upserts()) {
      expect(upsert.params).not.toContain('me@example.com');
      expect(upsert.params).not.toContain('them@example.com');
      expect(upsert.sql).toMatch(/friend_email = null/);
      expect(upsert.sql).toMatch(/values \(\$1, \$2, \$3, \$4, null,/);
    }
  });

  describe('by handle', () => {
    const handleTarget: Answer = (sql) =>
      /lower\(handle\) = \$1/.test(sql) ? [ACCOUNTS[THEM]] : undefined;

    it('finds only a published, active profile', async () => {
      const h = harness({ pool: handleTarget });
      await h.service.sendRequestToHandle(ME, '  Ana_Cruz ');

      const lookup = h.calls.find((c) => /lower\(handle\) = \$1/.test(c.sql))!;
      expect(lookup.sql).toMatch(/public_profile = true/);
      expect(lookup.sql).toMatch(/disabled_until is null or disabled_until <= now\(\)/);
      expect(lookup.sql).toMatch(/suspended_at is null/);
      expect(lookup.params).toEqual(['ana_cruz']);
    });

    it('gives 404 for a handle that resolves to nobody', async () => {
      const h = harness({ pool: (sql) => (/lower\(handle\)/.test(sql) ? [] : undefined) });
      await expect(h.service.sendRequestToHandle(ME, 'nobody')).rejects.toThrow(
        new NotFoundException('Profile not found'),
      );
    });

    it('refuses your own profile', async () => {
      const h = harness({
        pool: (sql) => (/lower\(handle\)/.test(sql) ? [ACCOUNTS[ME]] : undefined),
      });
      await expect(h.service.sendRequestToHandle(ME, 'mika')).rejects.toThrow(
        new BadRequestException('That is your own profile'),
      );
    });

    it('gives the same 404 across a block, whoever placed it, and writes nothing', async () => {
      const h = harness({ pool: handleTarget, unavailable: true });
      await expect(h.service.sendRequestToHandle(ME, 'ana_cruz')).rejects.toThrow(
        new NotFoundException('Profile not found'),
      );
      expect(h.upserts()).toHaveLength(0);
      expect(h.notifier.notify).not.toHaveBeenCalled();
    });
  });

  describe('by user id', () => {
    it('gives 404 for a malformed id without asking the database', async () => {
      const h = harness();
      await expect(h.service.sendRequestToUser(ME, 'not-a-uuid')).rejects.toThrow(
        new NotFoundException('That account no longer exists'),
      );
      expect(h.calls).toHaveLength(0);
    });

    it('refuses yourself with its own sentence', async () => {
      const h = harness();
      await expect(h.service.sendRequestToUser(ME, ME)).rejects.toThrow(
        new BadRequestException('You cannot send a request to yourself'),
      );
    });

    it('looks the target up among active accounts only', async () => {
      const h = harness();
      await h.service.sendRequestToUser(ME, THEM);
      const lookup = h.calls.find(
        (c) => c.on === 'pool' && /where id = \$1\s+and \(disabled_until/.test(c.sql),
      )!;
      expect(lookup.sql).toMatch(/suspended_at is null/);
    });

    it('gives its own 404 across a block', async () => {
      const h = harness({ unavailable: true });
      await expect(h.service.sendRequestToUser(ME, THEM)).rejects.toThrow(
        new NotFoundException('That account no longer exists'),
      );
    });
  });

  describe('by email', () => {
    const emailTarget =
      (row: Row | null): Answer =>
      (sql) =>
        /lower\(email\) = lower\(\$1\)/.test(sql) ? (row ? [row] : []) : undefined;

    it('keeps the unregistered-address sentence', async () => {
      const h = harness({ pool: emailTarget(null) });
      await expect(h.service.sendRequest(ME, 'who@example.com')).rejects.toThrow(
        new NotFoundException('No Virgo account uses that email address'),
      );
    });

    it('answers your own address the same way', async () => {
      const h = harness({ pool: emailTarget(ACCOUNTS[ME]) });
      await expect(h.service.sendRequest(ME, 'me@example.com')).rejects.toThrow(
        'No Virgo account uses that email address',
      );
    });

    it('answers a block the same way', async () => {
      const h = harness({ pool: emailTarget(ACCOUNTS[THEM]), unavailable: true });
      await expect(h.service.sendRequest(ME, 'them@example.com')).rejects.toThrow(
        new NotFoundException('No Virgo account uses that email address'),
      );
    });

    it('asks for someone when the address is blank', async () => {
      const h = harness();
      await expect(h.service.sendRequest(ME, '   ')).rejects.toThrow(
        new BadRequestException('Choose someone to send a request to'),
      );
    });
  });
});

describe('FriendsService.respond', () => {
  const incoming = (sql: string) =>
    /select id, friend_user_id, status, requested_by from friends/.test(sql)
      ? [{ id: 'req-1', friend_user_id: THEM, status: 'pending', requested_by: 'them' }]
      : undefined;

  it('accepts under the lock: my row, then theirs, then one notification', async () => {
    const h = harness({ pool: incoming });

    await h.service.accept(ME, 'req-1');

    const sql = h.clientSql().map((c) => c.sql);
    expect(sql[0]).toMatch(/pg_advisory_xact_lock/);
    expect(h.blocks.unavailable).toHaveBeenCalledWith(ME, THEM, h.client);
    const updates = h.clientSql().filter((c) => /update friends/.test(c.sql));
    expect(updates).toHaveLength(2);
    expect(updates[0].params).toEqual(['req-1', ME]);
    expect(updates[0].sql).toMatch(/f\.requested_by = 'them'/);
    expect(updates[1].params).toEqual([THEM, ME]);
    expect(updates[1].sql).toMatch(/f\.status = 'pending' and f\.requested_by = 'me'/);
    expect(h.notifier.notify).toHaveBeenCalledWith(
      [THEM],
      expect.objectContaining({ topic: 'friend-accepted' }),
    );
  });

  it('refuses an accept when my own row no longer updates, before touching theirs', async () => {
    const h = harness({
      pool: incoming,
      client: (sql) => (/where f\.id = \$1 and f\.user_id = \$2/.test(sql) ? [] : undefined),
    });

    await expect(h.service.accept(ME, 'req-1')).rejects.toThrow(
      new NotFoundException('Friend request not found'),
    );
    const updates = h.clientSql().filter((c) => /update friends/.test(c.sql));
    expect(updates).toHaveLength(1);
    expect(h.notifier.notify).not.toHaveBeenCalled();
  });

  it('refuses an accept whose sender has withdrawn, and tells nobody', async () => {
    const h = harness({
      pool: incoming,
      client: (sql) => (/where f\.user_id = \$1 and f\.friend_user_id = \$2/.test(sql) ? [] : undefined),
    });

    await expect(h.service.accept(ME, 'req-1')).rejects.toThrow(
      new NotFoundException('Friend request not found'),
    );
    expect(h.notifier.notify).not.toHaveBeenCalled();
  });

  it('refuses an accept across a block, or with a suspended side, and writes nothing', async () => {
    const h = harness({ pool: incoming, unavailable: true });

    await expect(h.service.accept(ME, 'req-1')).rejects.toThrow(
      new NotFoundException('Friend request not found'),
    );
    expect(h.clientSql().filter((c) => /update friends/.test(c.sql))).toHaveLength(0);
    expect(h.notifier.notify).not.toHaveBeenCalled();
  });

  it('declines with a single update to my own row, silently', async () => {
    const h = harness({ pool: incoming });

    await h.service.decline(ME, 'req-1');

    const updates = h.clientSql().filter((c) => /update friends/.test(c.sql));
    expect(updates).toHaveLength(1);
    expect(updates[0].params).toEqual(['req-1', ME]);
    expect(updates[0].sql).toMatch(/set status = 'declined'/);
    expect(h.notifier.notify).not.toHaveBeenCalled();
    // Declining needs no block check: it creates nothing.
    expect(h.blocks.unavailable).not.toHaveBeenCalled();
  });

  it('keeps the existing refusals', async () => {
    const outgoing = harness({
      pool: (sql) =>
        /select id, friend_user_id, status/.test(sql)
          ? [{ id: 'req-1', friend_user_id: THEM, status: 'pending', requested_by: 'me' }]
          : undefined,
    });
    await expect(outgoing.service.accept(ME, 'req-1')).rejects.toThrow(
      'That request was sent by you',
    );

    const answered = harness({
      pool: (sql) =>
        /select id, friend_user_id, status/.test(sql)
          ? [{ id: 'req-1', friend_user_id: THEM, status: 'declined', requested_by: 'them' }]
          : undefined,
    });
    await expect(answered.service.accept(ME, 'req-1')).rejects.toThrow(
      'That request is already declined',
    );

    const missing = harness();
    await expect(missing.service.accept(ME, 'req-1')).rejects.toThrow(
      new NotFoundException('Friend request not found'),
    );
  });
});

describe('FriendsService.remove', () => {
  const own = (friendUserId: string | null): Answer => (sql) =>
    /select id, friend_user_id from friends where id = \$1 and user_id = \$2/.test(sql)
      ? [{ id: 'row-1', friend_user_id: friendUserId }]
      : undefined;

  const inLock =
    (...rows: Row[]): Answer =>
    (sql) =>
      /select id, user_id, status, requested_by/.test(sql) ? rows : undefined;

  it('unfriends both sides in one locked transaction, keeping their decline record', async () => {
    const h = harness({
      pool: own(THEM),
      client: inLock(
        { id: 'row-1', user_id: ME, status: 'accepted', requested_by: 'me' },
        { id: 'row-2', user_id: THEM, status: 'accepted', requested_by: 'them' },
      ),
    });

    await h.service.remove(ME, 'row-1');

    const sql = h.clientSql();
    expect(sql[0].sql).toMatch(/pg_advisory_xact_lock/);
    const deletes = sql.filter((c) => /delete from friends/.test(c.sql));
    expect(deletes).toHaveLength(2);
    expect(deletes[0].params).toEqual(['row-1', ME]);
    expect(deletes[1].params).toEqual([THEM, ME]);
    expect(deletes[1].sql).toMatch(/not \(status = 'declined' and requested_by = 'them'\)/);
  });

  it('deletes a legacy row on its own, with no transaction', async () => {
    const h = harness({
      pool: (sql, params) =>
        own(null)(sql, params) ??
        (/delete from friends/.test(sql) ? [{ id: 'row-1' }] : undefined),
    });

    await h.service.remove(ME, 'row-1');

    expect(h.transaction).not.toHaveBeenCalled();
    expect(h.calls.filter((c) => /delete from friends/.test(c.sql))).toHaveLength(1);
  });

  it('declines an incoming request instead of deleting it, deciding from the locked read', async () => {
    // The row looked like anything at all before the lock; what counts is
    // what both rows say once it is held.
    const h = harness({
      pool: own(THEM),
      client: inLock(
        { id: 'row-1', user_id: ME, status: 'pending', requested_by: 'them' },
        { id: 'row-2', user_id: THEM, status: 'pending', requested_by: 'me' },
      ),
    });

    await h.service.remove(ME, 'row-1');

    const sql = h.clientSql();
    expect(sql.some((c) => /delete from friends/.test(c.sql))).toBe(false);
    const decline = sql.find((c) => /update friends set status = 'declined'/.test(c.sql))!;
    expect(decline.params).toEqual(['row-1', ME]);
  });

  it('gives 404 for a row that is not theirs, before or under the lock', async () => {
    const missing = harness();
    await expect(missing.service.remove(ME, 'row-1')).rejects.toThrow(
      new NotFoundException('Friend not found'),
    );

    const vanished = harness({ pool: own(THEM), client: inLock() });
    await expect(vanished.service.remove(ME, 'row-1')).rejects.toThrow(
      new NotFoundException('Friend not found'),
    );
    expect(vanished.clientSql().some((c) => /delete/.test(c.sql))).toBe(false);
  });
});

describe('FriendsService.update', () => {
  it('answers with the presented row, not the one the update returned', async () => {
    const raw = { id: 'row-1', friend_user_id: THEM, friend_email: 'typed@example.com' };
    const presented = { id: 'row-1', friend_user_id: THEM, friend_email: null };
    const h = harness({
      pool: (sql) => {
        if (/^\s*update friends/.test(sql)) return [raw];
        if (/from friends f\s+left join friends b/.test(sql)) return [presented];
        return undefined;
      },
    });

    const result = await h.service.update(ME, 'row-1', { friend_email: 'typed@example.com' });

    expect(result).toEqual(presented);
    const reread = h.calls.find((c) => /from friends f\s+left join friends b/.test(c.sql))!;
    expect(reread.sql).toMatch(
      /case when f\.friend_user_id is null then f\.friend_email end as friend_email/,
    );
  });
});

describe('FriendsService.connect', () => {
  it('takes the lock again on the caller’s client, then checks the pair there', async () => {
    const h = harness();

    await h.service.connect(ME, THEM, h.client as unknown as PoolClient);

    expect(h.transaction).not.toHaveBeenCalled();
    expect(h.clientSql()[0].sql).toMatch(/pg_advisory_xact_lock/);
    expect(h.blocks.unavailable).toHaveBeenCalledWith(ME, THEM, h.client);
    expect(h.upserts()).toHaveLength(2);
  });

  it('refuses a closed pair and writes neither row', async () => {
    const h = harness({ unavailable: true });

    await expect(h.service.connect(ME, THEM, h.client as unknown as PoolClient)).rejects.toThrow(
      new NotFoundException('Account not found'),
    );
    expect(h.upserts()).toHaveLength(0);
  });

  it('opens its own transaction, lock first, when given no client', async () => {
    const h = harness();
    await h.service.connect(ME, THEM);
    expect(h.transaction).toHaveBeenCalledTimes(1);
    expect(h.clientSql()[0].sql).toMatch(/pg_advisory_xact_lock/);
  });
});

describe('FriendsService reads', () => {
  it('areFriends refuses across a block', async () => {
    const h = harness({
      pool: (sql) => (/as both/.test(sql) ? [{ both: '2' }] : undefined),
    });
    await expect(h.service.areFriends(ME, THEM)).resolves.toBe(true);
    const sql = h.calls.find((c) => /as both/.test(c.sql))!.sql;
    expect(sql).toMatch(/user_blocks/);
  });

  it('searchPeople matches wildcards literally and returns an address only on an exact match', async () => {
    const h = harness({
      pool: (sql) =>
        /from users u/.test(sql)
          ? [{ id: THEM, name: 'Ana Cruz', email: null, avatar_url: null, handle: null, relationship: 'none' }]
          : undefined,
    });

    await h.service.searchPeople(ME, '%%');
    await h.service.searchPeople(ME, 'a_b');
    const result = await h.service.searchPeople(ME, '  a  ');

    const searches = h.calls.filter((c) => /from users u/.test(c.sql));
    expect(searches).toHaveLength(2);
    expect(searches[0].params).toEqual([ME, '!%!%%', '%%']);
    expect(searches[1].params).toEqual([ME, 'a!_b%', 'a_b']);
    const sql = searches[0].sql;
    expect(sql).toMatch(/escape '!'/);
    expect(sql).toMatch(/case when lower\(u\.email\) = lower\(\$3\) then u\.email end/);
    expect(sql).toMatch(/suspended_at is null/);
    expect(sql).toMatch(/user_blocks/);
    expect(result).toEqual([]);
  });

  it('searchPeople maps a name match to a null address', async () => {
    const h = harness({
      pool: (sql) =>
        /from users u/.test(sql)
          ? [{ id: THEM, name: 'Ana Cruz', email: null, avatar_url: null, handle: 'ana', relationship: 'pending_out' }]
          : undefined,
    });
    await expect(h.service.searchPeople(ME, 'Ana')).resolves.toEqual([
      { id: THEM, name: 'Ana Cruz', email: null, avatarUrl: null, handle: 'ana', relationship: 'pending_out' },
    ]);
  });

  it('presence and both counts read mirrored friendships only', async () => {
    const h = harness();
    await h.service.presenceOfFriends(ME);
    await h.service.connectionCount(ME);
    await h.service.mutualCount(ME, THEM);

    const mirrored = /join friends \w+ on \w+\.user_id = \w+\.friend_user_id and \w+\.friend_user_id = \w+\.user_id and \w+\.status = 'accepted'/;
    const reads = h.calls.filter((c) => /from friends/.test(c.sql));
    expect(reads).toHaveLength(3);
    for (const read of reads) expect(read.sql).toMatch(mirrored);
    expect(reads[0].sql).toMatch(/user_blocks/);
  });
});

describe('FriendsService and declined_at', () => {
  it('never writes the column: the trigger from 069 owns it', async () => {
    const incoming: Answer = (sql) =>
      /select id, friend_user_id, status, requested_by from friends/.test(sql)
        ? [{ id: 'req-1', friend_user_id: THEM, status: 'pending', requested_by: 'them' }]
        : undefined;
    const runs = [
      harness(),
      harness({ pool: incoming }),
      harness({ pool: incoming }),
      harness(),
    ];
    await runs[0].service.sendRequestToUser(ME, THEM);
    await runs[1].service.accept(ME, 'req-1');
    await runs[2].service.decline(ME, 'req-1');
    await runs[3].service.connect(ME, THEM);

    const statements = runs.flatMap((r) => r.calls.map((c) => c.sql));
    expect(statements.length).toBeGreaterThan(0);
    for (const sql of statements) expect(sql).not.toMatch(/declined_at\s*=/);
  });
});
