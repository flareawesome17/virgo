import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { DatabaseService } from '../database/database.service';
import type { FriendsService } from '../friends/friends.service';
import type { MailConfig } from '../mail/mail.config';
import type { NotifyService } from '../notifications/notify.service';
import type { BlocksService } from '../safety/blocks.service';
import { EventAttendeesService } from './event-attendees.service';

/**
 * Inviting to an event, and answering an invitation, across a block.
 *
 * The database is faked: statements are answered by matching their SQL, and
 * these tests read which ran and whether anyone was told. The SQL itself is
 * checked on a real Postgres.
 */

const ME = '11111111-1111-4111-8111-111111111111';
const ORGANISER = '22222222-2222-4222-8222-222222222222';
const EVENT = 'event-1';
const GUEST = '33333333-3333-4333-8333-333333333333';
const OTHER = '44444444-4444-4444-8444-444444444444';

type Row = Record<string, unknown>;

function harness(
  options: {
    blocked?: boolean;
    /** Whether the update found a row to change. */
    changes?: boolean;
    invitation?: Row | null;
    /** Whether an invitee is on either side of a block with the event's party. */
    clash?: boolean;
    friends?: boolean;
  } = {},
) {
  const calls: { on: 'pool' | 'client'; sql: string; params: unknown[] }[] = [];

  const poolAnswer = (sql: string, params: unknown[]): Row[] => {
    calls.push({ on: 'pool', sql, params });
    if (/from event_attendees a\s+join schedule_events e on e\.id = a\.event_id\s+where a\.event_id = \$1 and a\.user_id = \$2/.test(sql)) {
      const invitation =
        options.invitation === undefined
          ? { id: 'attendee-1', status: 'pending', organiser_id: ORGANISER }
          : options.invitation;
      return invitation ? [invitation] : [];
    }
    if (/from users u, schedule_events e/.test(sql)) return [{ name: 'Mika', title: 'Shoot' }];
    if (/from schedule_events where id = \$1 and user_id = \$2/.test(sql)) {
      return [{ id: EVENT, title: 'Shoot', event_date: '2026-10-01', event_time: null }];
    }
    if (/with party as/.test(sql)) return [{ blocked: options.clash ?? false }];
    if (/insert into event_attendees/.test(sql)) {
      return (params[1] as string[]).map((user_id) => ({ user_id }));
    }
    if (/as name\s+from users where id = \$1/.test(sql)) return [{ name: 'Mika' }];
    return [];
  };
  const query = jest.fn(async (sql: string, params: unknown[] = []) => poolAnswer(sql, params));
  const queryOne = jest.fn(
    async (sql: string, params: unknown[] = []) => poolAnswer(sql, params)[0] ?? null,
  );
  const client = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ on: 'client', sql, params });
      if (/update event_attendees/.test(sql)) {
        return { rows: options.changes === false ? [] : [{ id: 'attendee-1' }] };
      }
      return { rows: [] };
    }),
  };
  const transaction = jest.fn(async (fn: (c: typeof client) => Promise<unknown>) => fn(client));
  const db = { query, queryOne, transaction } as unknown as DatabaseService;

  const notifier = { notify: jest.fn(async () => undefined) };
  const blocks = {
    between: jest.fn(async () => (options.blocked ? { id: 'block-1', byMe: true } : null)),
  };

  const friends = { areFriends: jest.fn(async () => options.friends ?? true) };

  const service = new EventAttendeesService(
    db,
    friends as unknown as FriendsService,
    notifier as unknown as NotifyService,
    { appUrl: 'https://web.example' } as unknown as MailConfig,
    blocks as unknown as BlocksService,
  );

  const clientSql = () => calls.filter((c) => c.on === 'client');
  const updates = () => calls.filter((c) => /update event_attendees/.test(c.sql));
  const inserts = () => calls.filter((c) => /insert into event_attendees/.test(c.sql));
  const clashes = () => calls.filter((c) => /with party as/.test(c.sql));
  return {
    service,
    calls,
    client,
    clientSql,
    updates,
    inserts,
    clashes,
    notifier,
    blocks,
    friends,
    query,
  };
}

describe('EventAttendeesService.invite', () => {
  it('checks everyone joining against the pending and accepted party, and each other', async () => {
    const h = harness();

    await expect(h.service.invite(ORGANISER, EVENT, [GUEST, OTHER, GUEST])).resolves.toEqual({
      invited: 2,
    });

    const [clash] = h.clashes();
    expect(clash.params).toEqual([EVENT, [GUEST, OTHER]]);
    expect(clash.sql).toMatch(/a\.event_id = \$1 and a\.status in \('pending', 'accepted'\)/);
    expect(clash.sql).toMatch(/from unnest\(\$2::uuid\[\]\) as j\(id\)/);
    // Someone already on the event is not joining, whatever a later block says.
    expect(clash.sql).toMatch(/where j\.id not in \(select user_id from party\)/);
    // Both directions: whoever placed the block.
    expect(clash.sql).toMatch(
      /b\.blocker_id in \(select id from joining\)\s+and b\.blocked_id in \(select id from everyone\)/,
    );
    expect(clash.sql).toMatch(
      /b\.blocked_id in \(select id from joining\)\s+and b\.blocker_id in \(select id from everyone\)/,
    );
    expect(h.inserts()).toHaveLength(1);
    expect(h.notifier.notify).toHaveBeenCalledTimes(1);
  });

  it('refuses one invitee across a block with the party, writing and telling nothing', async () => {
    const h = harness({ clash: true });

    await expect(h.service.invite(ORGANISER, EVENT, [GUEST])).rejects.toThrow(
      new ForbiddenException("They can't be invited to this event."),
    );
    expect(h.inserts()).toHaveLength(0);
    expect(h.notifier.notify).not.toHaveBeenCalled();
  });

  it('refuses a batch without saying who', async () => {
    const h = harness({ clash: true });

    await expect(h.service.invite(ORGANISER, EVENT, [GUEST, OTHER])).rejects.toThrow(
      new ForbiddenException("Some of the people you picked can't be invited to this event."),
    );
    expect(h.inserts()).toHaveLength(0);
  });

  it('keeps the friends-only refusal, before the block check', async () => {
    const h = harness({ friends: false });

    await expect(h.service.invite(ORGANISER, EVENT, [GUEST])).rejects.toThrow(
      new ForbiddenException('You can only invite people you are friends with'),
    );
    expect(h.clashes()).toHaveLength(0);
    expect(h.inserts()).toHaveLength(0);
  });
});

describe('EventAttendeesService.respond', () => {
  it.each([true, false])(
    'takes the pair lock with the organiser first (accept=%s)',
    async (accept) => {
      const h = harness();

      await h.service.respond(ME, EVENT, accept);

      const [first] = h.clientSql();
      expect(first.sql).toMatch(/pg_advisory_xact_lock/);
      expect(first.params).toEqual([ME, ORGANISER]);
      expect(h.blocks.between).toHaveBeenCalledWith(ME, ORGANISER, h.client);
    },
  );

  it('refuses to accept across a block, as if there were no invitation, and writes nothing', async () => {
    const h = harness({ blocked: true });

    await expect(h.service.respond(ME, EVENT, true)).rejects.toThrow(
      new NotFoundException('Invitation not found'),
    );
    expect(h.updates()).toHaveLength(0);
    expect(h.notifier.notify).not.toHaveBeenCalled();
  });

  it('lets someone drop out across a block, without telling the organiser', async () => {
    const h = harness({ blocked: true });

    await expect(h.service.respond(ME, EVENT, false)).resolves.toEqual({ status: 'declined' });
    expect(h.updates()).toHaveLength(1);
    expect(h.notifier.notify).not.toHaveBeenCalled();
  });

  it('tells nobody about an answer that changed nothing', async () => {
    const h = harness({ changes: false });

    await h.service.respond(ME, EVENT, true);

    const [update] = h.updates();
    expect(update.sql).toMatch(/status <> \$2/);
    expect(update.params).toEqual(['attendee-1', 'accepted']);
    expect(h.notifier.notify).not.toHaveBeenCalled();
  });

  it('tells the organiser about a real answer', async () => {
    const h = harness();

    await h.service.respond(ME, EVENT, true);

    expect(h.notifier.notify).toHaveBeenCalledTimes(1);
    expect(h.notifier.notify.mock.calls[0]).toEqual([
      [ORGANISER],
      expect.objectContaining({ topic: 'event-response' }),
    ]);
  });

  it('answers not-found for an invitation that is not theirs, before any lock', async () => {
    const h = harness({ invitation: null });

    await expect(h.service.respond(ME, EVENT, true)).rejects.toThrow(
      new NotFoundException('Invitation not found'),
    );
    expect(h.clientSql()).toHaveLength(0);
  });
});

describe('EventAttendeesService.invitations', () => {
  it('never lists one from an organiser across a block', async () => {
    const h = harness();

    await h.service.invitations(ME);

    const [sql, params] = h.query.mock.calls[0];
    expect(sql).toMatch(/user_blocks/);
    expect(sql).toMatch(/ub\.blocked_id = e\.user_id/);
    expect(params).toEqual([ME, 'pending']);
  });
});
