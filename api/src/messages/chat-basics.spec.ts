import { BadRequestException, ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { DatabaseService } from '../database/database.service';
import type { FriendsService } from '../friends/friends.service';
import { LinkPreviewsService } from '../link-previews/link-previews.service';
import type { PushService } from '../notifications/push.service';
import type { PresenceService } from '../realtime/presence.service';
import type { RealtimeGateway } from '../realtime/realtime.gateway';
import type { BlocksService } from '../safety/blocks.service';
import { ForwardDto, ReactDto } from './messages.controller';
import { MAX_PINNED, MessagesService } from './messages.service';
import { MAX_SAVED_REPLIES, SavedRepliesService } from './saved-replies.service';

/**
 * Chat phase 1: reactions, edits, forwarding, list state, saved replies and
 * link previews.
 *
 * The database is faked, as in messages.service.spec.ts: these pin who is
 * refused, what is written and which frames go out. The SQL itself was run
 * against a real Postgres when it was written.
 */

const ME = '11111111-1111-4111-8111-111111111111';
const THEM = '22222222-2222-4222-8222-222222222222';
const CONVO = '44444444-4444-4444-8444-444444444444';
const OTHER_CONVO = '55555555-5555-4555-8555-555555555555';
const MSG = '66666666-6666-4666-8666-666666666666';

type Row = Record<string, unknown>;

interface Options {
  /** The send-state row: membership plus blocks. */
  frozen?: boolean;
  /** The message as visibleMessage reads it. Null: not visible. */
  message?: Row | null;
  /** How many other chats are pinned already. */
  pinned?: number;
  /** Conversations whose send() throws. */
  failing?: string[];
}

function harness(options: Options = {}) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const answer = (sql: string, params: unknown[]): Row[] => {
    calls.push({ sql, params });
    if (/count\(blk\.hit\)/.test(sql)) {
      if (options.failing?.includes(params[0] as string)) return [];
      return [
        {
          is_group: false,
          others: 1,
          blocked_others: options.frozen ? 1 : 0,
          my_block_id: null,
          they_blocked_me: !!options.frozen,
        },
      ];
    }
    if (/select m\.id, m\.sender_id, m\.body, m\.kind/.test(sql)) {
      return options.message === null
        ? []
        : [
            {
              id: MSG,
              sender_id: ME,
              body: 'Call time is 5:30',
              kind: 'text',
              context: null,
              deleted_at: null,
              created_at: new Date(),
              ...options.message,
            },
          ];
    }
    if (/pinned_at is not null and conversation_id <> \$2/.test(sql)) {
      return [{ count: String(options.pinned ?? 0) }];
    }
    if (/update conversation_participants set/.test(sql)) {
      return [{ pinned_at: null, archived_at: new Date(), marked_unread: false }];
    }
    if (/select user_id, reaction from message_reactions/.test(sql)) {
      return [{ user_id: ME, reaction: 'love' }];
    }
    if (/insert into messages/.test(sql)) return [{ id: 'new' }];
    if (/where m\.id = \$1$/.test(sql.trim())) {
      return [{ id: params[0], conversation_id: CONVO, sender_id: ME, body: 'x', reactions: [] }];
    }
    if (/from conversation_participants p\s+where p\.conversation_id = \$1\s+and not exists/.test(sql)) {
      return [{ user_id: ME }, { user_id: THEM }];
    }
    if (/select user_id from conversation_participants\s+where conversation_id = \$1 and user_id = \$2/.test(sql)) {
      return options.failing?.includes(params[0] as string) ? [] : [{ user_id: ME }];
    }
    return [];
  };
  const query = jest.fn(async (sql: string, params: unknown[] = []) => answer(sql, params));
  const queryOne = jest.fn(async (sql: string, params: unknown[] = []) => answer(sql, params)[0] ?? null);
  const client = { query: jest.fn(async (sql: string, params: unknown[] = []) => ({ rows: answer(sql, params) })) };
  const transaction = jest.fn(async (fn: (c: typeof client) => Promise<unknown>) => fn(client));
  const db = { query, queryOne, transaction } as unknown as DatabaseService;
  const realtime = { emitToUsers: jest.fn(), onlineAmong: jest.fn(() => new Set<string>()) };
  const push = { tokensFor: jest.fn(async () => []), send: jest.fn(), badgeCounts: jest.fn(async () => new Map()) };
  const service = new MessagesService(
    db,
    { areFriends: jest.fn(async () => true) } as unknown as FriendsService,
    push as unknown as PushService,
    realtime as unknown as RealtimeGateway,
    { lastSeen: jest.fn(async () => new Map()) } as unknown as PresenceService,
    { between: jest.fn(async () => null) } as unknown as BlocksService,
  );
  const ran = (pattern: RegExp) => calls.filter((c) => pattern.test(c.sql));
  return { service, ran, realtime, transaction, client };
}

async function codeOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(HttpException);
    return ((err as HttpException).getResponse() as Record<string, unknown>).code;
  }
  throw new Error('expected a refusal');
}

describe('reactions', () => {
  it('sets one, replacing yours, and tells the room without a push', async () => {
    const h = harness();
    const result = await h.service.react(ME, CONVO, MSG, 'love');
    expect(h.ran(/on conflict \(message_id, user_id\)\s+do update set reaction/)).toHaveLength(1);
    expect(result.reactions).toEqual([{ userId: ME, reaction: 'love' }]);
    expect(h.realtime.emitToUsers).toHaveBeenCalledWith([ME, THEM], {
      type: 'reaction',
      conversationId: CONVO,
      messageId: MSG,
      userId: ME,
      reaction: 'love',
    });
  });

  it('takes it back with null', async () => {
    const h = harness();
    await h.service.react(ME, CONVO, MSG, null);
    expect(h.ran(/delete from message_reactions where message_id = \$1 and user_id = \$2/)).toHaveLength(1);
  });

  it('is refused in a frozen thread and on an unsent message', async () => {
    expect(await codeOf(harness({ frozen: true }).service.react(ME, CONVO, MSG, 'like'))).toBe(
      'CHAT_UNAVAILABLE',
    );
    await expect(
      harness({ message: { deleted_at: new Date() } }).service.react(ME, CONVO, MSG, 'like'),
    ).rejects.toThrow(BadRequestException);
    await expect(harness({ message: null }).service.react(ME, CONVO, MSG, 'like')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('accepts only the six keys, or null', async () => {
    const errors = async (body: unknown) =>
      (await validate(plainToInstance(ReactDto, body))).length;
    expect(await errors({ reaction: 'love' })).toBe(0);
    expect(await errors({ reaction: null })).toBe(0);
    expect(await errors({ reaction: 'fire' })).toBeGreaterThan(0);
    expect(await errors({ reaction: '❤️' })).toBeGreaterThan(0);
  });
});

describe('editing', () => {
  it('keeps the old words and changes the message in one transaction', async () => {
    const h = harness();
    await h.service.edit(ME, CONVO, MSG, 'Call time is 5:00');
    expect(h.transaction).toHaveBeenCalledTimes(1);
    const [save, change] = h.client.query.mock.calls;
    expect(save[0]).toMatch(/insert into message_edits/);
    expect(save[1]).toEqual([MSG, 'Call time is 5:30']);
    expect(change[0]).toMatch(/set body = \$2, edited_at = now\(\)/);
    expect(h.realtime.emitToUsers).toHaveBeenCalledWith(
      [ME, THEM],
      expect.objectContaining({ type: 'message-edited', conversationId: CONVO }),
    );
  });

  it('writes nothing when the words did not change', async () => {
    const h = harness();
    await h.service.edit(ME, CONVO, MSG, '  Call time is 5:30 ');
    expect(h.transaction).not.toHaveBeenCalled();
  });

  it("refuses someone else's message, a card, and one past the window", async () => {
    await expect(
      harness({ message: { sender_id: THEM } }).service.edit(ME, CONVO, MSG, 'x'),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      harness({ message: { kind: 'job-accepted' } }).service.edit(ME, CONVO, MSG, 'x'),
    ).rejects.toThrow('cannot be edited');
    await expect(
      harness({ message: { created_at: new Date(Date.now() - 16 * 60_000) } }).service.edit(
        ME,
        CONVO,
        MSG,
        'x',
      ),
    ).rejects.toThrow('15 minutes');
  });
});

describe('forwarding', () => {
  it('sends a copy marked forwarded, and skips a chat it cannot reach', async () => {
    const h = harness({ failing: [OTHER_CONVO] });
    const result = await h.service.forward(ME, CONVO, MSG, [CONVO, OTHER_CONVO]);
    expect(result).toEqual({ sent: 1, skipped: 1 });
    const [insert] = h.ran(/insert into messages/);
    expect(insert.params[6]).toBe(true);
  });

  it('refuses more than five chats and anything but a typed message', async () => {
    const six = Array.from({ length: 6 }, (_, i) => `${i}`.repeat(8) + '-0000-4000-8000-000000000000');
    expect(
      (await validate(plainToInstance(ForwardDto, { conversationIds: six }))).length,
    ).toBeGreaterThan(0);
    await expect(harness().service.forward(ME, CONVO, MSG, six)).rejects.toThrow('up to 5');
    await expect(
      harness({ message: { kind: 'job-accepted' } }).service.forward(ME, CONVO, MSG, [OTHER_CONVO]),
    ).rejects.toThrow('cannot be forwarded');
  });
});

describe('list state', () => {
  it(`refuses a pin past ${MAX_PINNED}`, async () => {
    await expect(
      harness({ pinned: MAX_PINNED }).service.setListState(ME, CONVO, { pinned: true }),
    ).rejects.toThrow(`up to ${MAX_PINNED}`);
  });

  it('archiving unpins, and only the caller hears about it', async () => {
    const h = harness();
    const result = await h.service.setListState(ME, CONVO, { archived: true });
    const [update] = h.ran(/update conversation_participants set/);
    expect(update.sql).toMatch(/archived_at = coalesce\(archived_at, now\(\)\), pinned_at = null/);
    expect(result).toEqual({ pinned: false, archived: true, markedUnread: false });
    expect(h.realtime.emitToUsers).toHaveBeenCalledWith([ME], { type: 'conversation', conversationId: CONVO });
  });

  it('brings an archived chat back when something is sent in it', async () => {
    const h = harness();
    await h.service.send(ME, CONVO, 'hello');
    expect(h.ran(/set archived_at = null\s+where conversation_id = \$1 and archived_at is not null/)).toHaveLength(1);
  });
});

describe('catching up on a weak signal', () => {
  it('asks only for messages newer than the one the app has', async () => {
    const h = harness();
    await h.service.messages(ME, CONVO, 30, undefined, MSG);
    const [read] = h.ran(/order by m\.created_at desc, m\.id desc/);
    expect(read.sql).toMatch(/\(m\.created_at, m\.id\) > \(\s+select a\.created_at, a\.id from messages a/);
    expect(read.params).toEqual([CONVO, 30, ME, null, MSG]);
  });
});

describe('saved replies', () => {
  it(`stops at ${MAX_SAVED_REPLIES}`, async () => {
    const db = { queryOne: jest.fn(async () => null) } as unknown as DatabaseService;
    await expect(new SavedRepliesService(db).create(ME, 'Rates', 'Photo only')).rejects.toThrow(
      `up to ${MAX_SAVED_REPLIES}`,
    );
  });
});

describe('link previews', () => {
  const config = { get: () => undefined } as never;
  const shares = {
    preview: jest.fn(async () => ({ title: 'Santos Wedding', part: 'album', total: 3, counts: { image: 3, video: 0, audio: 0 }, thumbs: [] })),
  };

  it('previews only Virgo pages, and never fetches what it is given', async () => {
    const db = { queryOne: jest.fn() } as unknown as DatabaseService;
    const service = new LinkPreviewsService(db, config, shares as never, {} as never);
    await expect(service.preview(ME, 'https://example.com/u/mika')).rejects.toThrow(NotFoundException);
    await expect(service.preview(ME, 'not a url at all ::')).rejects.toThrow(NotFoundException);
    expect(await service.preview(ME, 'https://client.virgo.ph/s/statement/abcdefghijklmnopqrst')).toEqual({
      kind: 'statement',
      url: 'https://client.virgo.ph/s/statement/abcdefghijklmnopqrst',
      title: 'Package statement',
    });
    expect(db.queryOne).not.toHaveBeenCalled();
  });

  it('hands a client link to the share service', async () => {
    const service = new LinkPreviewsService({} as never, config, shares as never, {} as never);
    const preview = await service.preview(ME, 'virgo.ph/s/abcdefghijklmnopqrstuv');
    expect(shares.preview).toHaveBeenCalledWith('abcdefghijklmnopqrstuv');
    expect(preview).toMatchObject({ kind: 'album', title: 'Santos Wedding', total: 3 });
  });
});
