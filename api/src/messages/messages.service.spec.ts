import { ForbiddenException, HttpException } from '@nestjs/common';
import type { DatabaseService } from '../database/database.service';
import type { FriendsService } from '../friends/friends.service';
import type { PushService } from '../notifications/push.service';
import type { PresenceService } from '../realtime/presence.service';
import type { RealtimeGateway } from '../realtime/realtime.gateway';
import type { BlocksService } from '../safety/blocks.service';
import { MessagesService } from './messages.service';

/**
 * Chat across a block.
 *
 * The database is faked: each statement is answered by matching its SQL, and
 * these tests read what ran and what was sent where. They pin the decisions —
 * who is refused and with which code, which frames are withheld and which are
 * not — and cannot prove the SQL itself; that is what the checks on a real
 * Postgres are for.
 */

const ME = '11111111-1111-4111-8111-111111111111';
const THEM = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const CONVO = '44444444-4444-4444-8444-444444444444';

type Row = Record<string, unknown>;
type Answer = (sql: string, params: unknown[]) => Row[] | undefined;

interface State {
  is_group?: boolean;
  others?: number;
  blocked_others?: number;
  my_block_id?: string | null;
  they_blocked_me?: boolean;
}

function harness(
  options: {
    state?: State | null;
    answer?: Answer;
    friends?: boolean;
    between?: { id: string; byMe: boolean } | null;
    visible?: string[];
    everyone?: string[];
  } = {},
) {
  const calls: { sql: string; params: unknown[] }[] = [];

  const answer = (sql: string, params: unknown[]): Row[] => {
    calls.push({ sql, params });
    const custom = options.answer?.(sql, params);
    if (custom) return custom;
    if (/count\(blk\.hit\)/.test(sql)) {
      return options.state === null
        ? []
        : [
            {
              is_group: false,
              others: 1,
              blocked_others: 0,
              my_block_id: null,
              they_blocked_me: false,
              ...options.state,
            },
          ];
    }
    if (/from conversation_participants p\s+where p\.conversation_id = \$1\s+and not exists/.test(sql)) {
      return (options.visible ?? [ME, THEM]).map((user_id) => ({ user_id }));
    }
    if (/^select user_id from conversation_participants where conversation_id = \$1$/.test(sql)) {
      return (options.everyone ?? [ME, THEM]).map((user_id) => ({ user_id }));
    }
    if (/insert into messages/.test(sql)) {
      return [{ id: 'm1', conversation_id: CONVO, sender_id: ME, body: String(params[2]) }];
    }
    if (/select user_id from conversation_participants\s+where conversation_id = \$1 and user_id = \$2/.test(sql)) {
      return [{ user_id: ME }];
    }
    return [];
  };

  const query = jest.fn(async (sql: string, params: unknown[] = []) => answer(sql, params));
  const queryOne = jest.fn(
    async (sql: string, params: unknown[] = []) => answer(sql, params)[0] ?? null,
  );
  const client = { query: jest.fn(async () => ({ rows: [{ id: CONVO }] })) };
  const transaction = jest.fn(async (fn: (c: typeof client) => Promise<unknown>) => fn(client));
  const db = { query, queryOne, transaction } as unknown as DatabaseService;

  const friends = { areFriends: jest.fn(async () => options.friends ?? true) };
  const push = { tokensFor: jest.fn(async () => [] as string[]), send: jest.fn() };
  const realtime = {
    emitToUsers: jest.fn(),
    onlineAmong: jest.fn((ids: readonly string[]) => new Set(ids)),
  };
  const presence = {
    lastSeen: jest.fn(
      async (ids: readonly string[]) =>
        new Map(ids.map((id) => [id, new Date('2026-09-01T00:00:00Z')])),
    ),
  };
  const blocks = { between: jest.fn(async () => options.between ?? null) };

  const service = new MessagesService(
    db,
    friends as unknown as FriendsService,
    push as unknown as PushService,
    realtime as unknown as RealtimeGateway,
    presence as unknown as PresenceService,
    blocks as unknown as BlocksService,
  );

  const ran = (pattern: RegExp) => calls.filter((c) => pattern.test(c.sql));
  return { service, calls, ran, realtime, presence, friends, blocks, transaction };
}

/** The body a refusal carries, which is what the clients read. */
async function refusalOf(promise: Promise<unknown>): Promise<Record<string, unknown>> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(HttpException);
    return (err as HttpException).getResponse() as Record<string, unknown>;
  }
  throw new Error('expected a refusal');
}

describe('MessagesService.send across a block', () => {
  it('tells the blocker it was them, and writes nothing', async () => {
    const h = harness({ state: { others: 1, blocked_others: 1, my_block_id: 'b1' } });

    const body = await refusalOf(h.service.send(ME, CONVO, 'hello'));

    expect(body).toEqual({
      statusCode: 403,
      error: 'Forbidden',
      code: 'YOU_BLOCKED',
      message: 'You blocked this person. Unblock them to send messages.',
    });
    expect(h.ran(/insert into messages/)).toHaveLength(0);
    expect(h.realtime.emitToUsers).not.toHaveBeenCalled();
  });

  it('tells the blocked person only that they cannot reply', async () => {
    const h = harness({
      state: { others: 1, blocked_others: 1, my_block_id: null, they_blocked_me: true },
    });

    const body = await refusalOf(h.service.send(ME, CONVO, 'hello'));

    expect(body.code).toBe('CHAT_UNAVAILABLE');
    expect(body.message).toBe("You can't reply to this conversation.");
    expect(JSON.stringify(body)).not.toMatch(/block/i);
    expect(h.ran(/insert into messages/)).toHaveLength(0);
  });

  it('refuses before looking at the text, so the reason never depends on it', async () => {
    const h = harness({ state: { others: 1, blocked_others: 1, my_block_id: 'b1' } });

    const body = await refusalOf(h.service.send(ME, CONVO, '   '));

    expect(body.code).toBe('YOU_BLOCKED');
  });

  it('freezes a group once every other member is blocked with the sender', async () => {
    const h = harness({
      state: { is_group: true, others: 2, blocked_others: 2, my_block_id: 'b1' },
    });

    const body = await refusalOf(h.service.send(ME, CONVO, 'hello'));

    // A group never says whose block it is: there may be more than one.
    expect(body.code).toBe('CHAT_UNAVAILABLE');
  });

  it('lets a group message through, silencing the pair towards each other', async () => {
    const h = harness({
      state: { is_group: true, others: 2, blocked_others: 1 },
      visible: [ME, OTHER],
      answer: (sql) =>
        /p\.user_id = any\(\$2::uuid\[\]\)/.test(sql) ? [{ user_id: OTHER }] : undefined,
    });

    await h.service.send(ME, CONVO, 'hello @both', { mentionIds: [THEM, OTHER] });

    expect(h.ran(/insert into messages/)).toHaveLength(1);

    const [mentions] = h.ran(/p\.user_id = any\(\$2::uuid\[\]\)/);
    expect(mentions.sql).toMatch(/user_blocks/);
    expect(mentions.sql).toMatch(/ub\.blocker_id = \$3 and ub\.blocked_id = p\.user_id/);

    const [recipients] = h.ran(/muted_until is null/);
    expect(recipients.sql).toMatch(/user_blocks/);
    expect(recipients.params).toEqual([CONVO, ME]);

    // The live frame goes to exactly who participantIdsVisibleTo returned.
    const frames = h.realtime.emitToUsers.mock.calls.filter(([, e]) => e.type === 'message');
    expect(frames).toHaveLength(1);
    expect(frames[0][0]).toEqual([ME, OTHER]);
  });

  it('answers a conversation the caller is not in with a 404', async () => {
    const h = harness({ state: null });

    await expect(h.service.send(ME, CONVO, 'hello')).rejects.toThrow('Conversation not found');
  });
});

describe('MessagesService.openDirect across a block', () => {
  it('tells the blocker, who can undo it', async () => {
    const h = harness({ between: { id: 'b1', byMe: true } });

    const body = await refusalOf(h.service.openDirect(ME, THEM));

    expect(body.code).toBe('YOU_BLOCKED');
    expect(body.message).toBe('You blocked this person. Unblock them to start a chat.');
    expect(h.friends.areFriends).not.toHaveBeenCalled();
  });

  it('gives the blocked person exactly the not-friends answer, with no code', async () => {
    // The block deleted the friendship, and areFriends is block-aware anyway.
    const h = harness({ between: { id: 'b1', byMe: false }, friends: false });

    const err = await h.service.openDirect(ME, THEM).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ForbiddenException);
    const body = (err as ForbiddenException).getResponse() as Record<string, unknown>;
    expect(body.message).toBe('You can only chat with people you are connected with');
    expect(body.code).toBeUndefined();
    expect(h.transaction).not.toHaveBeenCalled();
  });
});

describe('MessagesService groups across a block', () => {
  it('will not create a group that puts a blocked pair together', async () => {
    const h = harness({
      answer: (sql) => (/b\.blocker_id = any\(\$1::uuid\[\]\)/.test(sql) ? [{ blocked: true }] : undefined),
    });

    const body = await refusalOf(h.service.createGroup(ME, 'Shoot', [THEM, OTHER]));

    expect(body.code).toBe('GROUP_MEMBER_UNAVAILABLE');
    expect(body.message).toBe("Some of the people you picked can't be in a group together.");
    const [check] = h.ran(/b\.blocker_id = any\(\$1::uuid\[\]\)/);
    expect(check.params).toEqual([[ME, THEM, OTHER]]);
    expect(h.transaction).not.toHaveBeenCalled();
  });

  it('will not add someone blocked with anyone already in the group', async () => {
    const h = harness({
      answer: (sql) => {
        if (/select is_group from conversations/.test(sql)) return [{ is_group: true }];
        if (/join user_blocks b/.test(sql)) return [{ blocked: true }];
        return undefined;
      },
    });

    const body = await refusalOf(h.service.addMember(ME, CONVO, OTHER));

    expect(body.code).toBe('GROUP_MEMBER_UNAVAILABLE');
    expect(body.message).toBe("They can't be added to this group.");
    expect(h.ran(/insert into conversation_participants/)).toHaveLength(0);
  });
});

describe('MessagesService.deleteMessage across a block', () => {
  const mine = (sql: string) =>
    /select sender_id, deleted_at from messages/.test(sql) ? [{ sender_id: ME, deleted_at: null }] : undefined;

  it('keeps what the blocked person sent: no delete for everyone', async () => {
    const h = harness({
      state: { others: 1, blocked_others: 1, they_blocked_me: true },
      answer: mine,
    });

    const body = await refusalOf(h.service.deleteMessage(ME, CONVO, 'm1', 'everyone'));

    expect(body.code).toBe('CHAT_UNAVAILABLE');
    expect(body.message).toBe(
      "Messages in this conversation can't be deleted for everyone any more.",
    );
    expect(h.ran(/update messages set body = ''/)).toHaveLength(0);
  });

  it('still lets them delete for themselves', async () => {
    const h = harness({
      state: { others: 1, blocked_others: 1, they_blocked_me: true },
      answer: mine,
    });

    await expect(h.service.deleteMessage(ME, CONVO, 'm1', 'me')).resolves.toEqual({
      deleted: true,
      scope: 'me',
    });
  });

  it('sends a retraction to every participant, a blocked one included', async () => {
    // The blocker retracting their own line: the blocked member's open thread
    // must lose the text too, and a retraction reveals nothing.
    const h = harness({
      state: { others: 1, blocked_others: 1, my_block_id: 'b1' },
      everyone: [ME, THEM],
      visible: [ME],
      answer: mine,
    });

    await h.service.deleteMessage(ME, CONVO, 'm1', 'everyone');

    const frames = h.realtime.emitToUsers.mock.calls.filter(
      ([, e]) => e.type === 'message-deleted',
    );
    expect(frames).toHaveLength(1);
    expect(frames[0][0]).toEqual([ME, THEM]);
  });
});

describe('MessagesService reads across a block', () => {
  it('reports a thread the caller froze, with the block to undo', async () => {
    const h = harness({ state: { others: 1, blocked_others: 1, my_block_id: 'b1' } });

    const thread = await h.service.messages(ME, CONVO);

    expect(thread.canSend).toBe(false);
    expect(thread.blockedByMe).toBe(true);
    expect(thread.blockId).toBe('b1');
  });

  it('names no block in a group, and an open thread can send', async () => {
    const h = harness({ state: { is_group: true, others: 2, blocked_others: 1, my_block_id: 'b1' } });

    const thread = await h.service.messages(ME, CONVO);

    expect(thread).toMatchObject({ canSend: true, blockedByMe: false, blockId: null });
  });

  it('sends read frames only to members not blocked with the reader', async () => {
    const h = harness({ visible: [ME, OTHER] });

    await h.service.markRead(ME, CONVO);

    const [frame] = h.realtime.emitToUsers.mock.calls.filter(([, e]) => e.type === 'read');
    expect(frame[0]).toEqual([ME, OTHER]);
  });

  it('hides presence across a block and caps receipts, never sending the flag itself', async () => {
    const seen = new Date('2026-09-20T10:00:00Z');
    const h = harness({
      answer: (sql) =>
        /hide_presence/.test(sql)
          ? [
              {
                id: THEM,
                name: 'Ana',
                avatar_url: null,
                handle: null,
                last_seen_at: seen,
                last_read_at: null,
                last_delivered_at: null,
                blocked_by_me: true,
                block_id: 'b1',
                hide_presence: true,
              },
              {
                id: OTHER,
                name: 'Ben',
                avatar_url: null,
                handle: 'ben',
                last_seen_at: seen,
                last_read_at: seen,
                last_delivered_at: seen,
                blocked_by_me: false,
                block_id: null,
                hide_presence: false,
              },
            ]
          : undefined,
    });

    const rows = await h.service.participants(ME, CONVO);

    expect(rows[0]).toMatchObject({ id: THEM, online: false, last_seen_at: null, block_id: 'b1' });
    expect(rows[0]).not.toHaveProperty('hide_presence');
    expect(rows[1]).toMatchObject({ id: OTHER, online: true, last_seen_at: seen });
    expect(h.realtime.onlineAmong).toHaveBeenCalledWith([OTHER]);

    const [select] = h.ran(/hide_presence/);
    // least() ignores nulls, so the null branch has to come first.
    expect(select.sql.indexOf('when p.last_read_at is null then null')).toBeGreaterThan(-1);
    expect(select.sql.indexOf('when p.last_read_at is null then null')).toBeLessThan(
      select.sql.indexOf('least(p.last_read_at'),
    );
    expect(select.params).toEqual([CONVO, ME]);
  });

  it('darkens a blocked direct chat in the list and never looks up its presence', async () => {
    const base = {
      is_group: false,
      title: null,
      other_name: 'Ana',
      other_avatar: null,
      participant_count: '2',
      last_body: 'hi',
      last_at: new Date(),
      last_sender: 'Ana',
      unread: '0',
      match_body: null,
      muted_until: null,
    };
    const h = harness({
      answer: (sql) =>
        /as other_blocked/.test(sql)
          ? [
              { ...base, id: 'c-blocked', other_id: THEM, other_blocked: true },
              { ...base, id: 'c-open', other_id: OTHER, other_blocked: false },
            ]
          : undefined,
    });

    const list = await h.service.conversations(ME);

    expect(list[0]).toMatchObject({ otherOnline: false, otherLastSeenAt: null });
    expect(list[1].otherOnline).toBe(true);
    expect(h.realtime.onlineAmong).toHaveBeenCalledWith([OTHER]);
    expect(h.presence.lastSeen).toHaveBeenCalledWith([OTHER]);

    const [select] = h.ran(/as other_blocked/);
    expect(select.sql).toMatch(/ub\.blocked_id = m\.sender_id/);
  });

  it('leaves blocked senders out of the tab badge', async () => {
    const h = harness();

    await h.service.unreadCount(ME);

    const [count] = h.ran(/count\(\*\)::text as count\s+from messages m/);
    expect(count.sql).toMatch(/user_blocks/);
    expect(count.sql).toMatch(/ub\.blocked_id = m\.sender_id/);
  });
});
