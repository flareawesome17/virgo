import { BadRequestException, ConflictException, ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { DatabaseService } from '../../database/database.service';
import type { FriendsService } from '../../friends/friends.service';
import type { MailConfig } from '../../mail/mail.config';
import type { PushService } from '../../notifications/push.service';
import type { PresenceService } from '../../realtime/presence.service';
import type { RealtimeGateway } from '../../realtime/realtime.gateway';
import type { BlocksService } from '../../safety/blocks.service';
import type { StorageService } from '../../storage/storage.service';
import { PinDto, UpdateGroupDto } from '../messages.controller';
import { MessagesService } from '../messages.service';
import { ChatCrewService } from './chat-crew.service';

/**
 * Chat phase 3: admins, group details, notices, pins, search, and the team
 * and crew chats that follow a workspace or a job.
 *
 * The database is faked, as in the other chat specs: these pin who is
 * refused, what is written and which frames go out. Every statement here was
 * also run against a real Postgres 18 through the API when it was written.
 */

const ME = '11111111-1111-4111-8111-111111111111';
const THEM = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const CONVO = '44444444-4444-4444-8444-444444444444';
const MSG = '66666666-6666-4666-8666-666666666666';
const POST = '77777777-7777-4777-8777-777777777777';

type Row = Record<string, unknown>;
type Answer = (sql: string, params: unknown[]) => Row[] | undefined;

interface Group {
  is_admin?: boolean;
  add_policy?: 'everyone' | 'admins';
  workspace_id?: string | null;
  hiring_post_id?: string | null;
  anchor_id?: string | null;
  photo_url?: string | null;
}

function harness(options: { group?: Group; answer?: Answer; frozen?: boolean; message?: Row | null } = {}) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const answer = (sql: string, params: unknown[]): Row[] => {
    calls.push({ sql, params });
    const custom = options.answer?.(sql, params);
    if (custom) return custom;
    if (/me\.is_admin, c\.add_policy/.test(sql)) {
      return [
        {
          is_group: true,
          is_admin: true,
          add_policy: 'everyone',
          workspace_id: null,
          hiring_post_id: null,
          anchor_id: null,
          photo_url: null,
          ...options.group,
        },
      ];
    }
    if (/count\(blk\.hit\)/.test(sql)) {
      return [
        {
          is_group: true,
          others: 2,
          blocked_others: options.frozen ? 2 : 0,
          my_block_id: null,
          they_blocked_me: false,
        },
      ];
    }
    if (/select m\.id, m\.sender_id, m\.body, m\.kind/.test(sql)) {
      return options.message === null
        ? []
        : [{ id: MSG, sender_id: THEM, body: 'Call time 5 AM', kind: 'text', context: null, deleted_at: null, created_at: new Date(), ...options.message }];
    }
    if (/^select user_id from conversation_participants where conversation_id = \$1$/.test(sql)) {
      return [{ user_id: ME }, { user_id: THEM }, { user_id: OTHER }];
    }
    if (/select coalesce\(display_name, split_part\(email, '@', 1\)\) as name from users/.test(sql)) {
      return [{ name: params[0] === ME ? 'Mika' : params[0] === THEM ? 'Ana' : 'Jo' }];
    }
    if (/insert into messages/.test(sql)) return [{ id: 'notice-1' }];
    if (/where m\.id = \$1$/.test(sql.trim())) {
      return [{ id: params[0], conversation_id: CONVO, sender_id: ME, body: 'x', kind: 'notice' }];
    }
    if (/select user_id from conversation_participants\s+where conversation_id = \$1 and user_id = \$2/.test(sql)) {
      return [{ user_id: ME }];
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
  const storage = {
    keyFromPublicUrl: jest.fn((url: string) => url.replace('https://cdn.example/', '')),
    deleteObject: jest.fn(async () => undefined),
  };
  const service = new MessagesService(
    db,
    { areFriends: jest.fn(async () => true) } as unknown as FriendsService,
    push as unknown as PushService,
    realtime as unknown as RealtimeGateway,
    { lastSeen: jest.fn(async () => new Map()) } as unknown as PresenceService,
    { between: jest.fn(async () => null) } as unknown as BlocksService,
    undefined,
    undefined,
    storage as unknown as StorageService,
  );
  const ran = (pattern: RegExp) => calls.filter((c) => pattern.test(c.sql));
  const frames = (type: string) => realtime.emitToUsers.mock.calls.filter(([, e]) => e.type === type);
  return { service, ran, frames, realtime, storage, push, db };
}

async function messageOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(HttpException);
    const body = (err as HttpException).getResponse();
    return typeof body === 'string' ? body : String((body as { message?: unknown }).message);
  }
  throw new Error('expected a refusal');
}

describe('admins', () => {
  it('lets only admins add people when the group says so', async () => {
    const h = harness({
      group: { is_admin: false, add_policy: 'admins' },
      answer: (sql) => (/select is_group from conversations/.test(sql) ? [{ is_group: true }] : undefined),
    });
    await expect(h.service.addMember(ME, CONVO, OTHER)).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.ran(/insert into conversation_participants/)).toHaveLength(0);
  });

  it('says who added whom, in the thread and without a push', async () => {
    const h = harness({
      answer: (sql) => {
        if (/select is_group from conversations/.test(sql)) return [{ is_group: true }];
        if (/insert into conversation_participants/.test(sql)) return [{ user_id: OTHER }];
        return undefined;
      },
    });
    await h.service.addMember(ME, CONVO, OTHER);
    const [notice] = h.ran(/'notice', \$4::jsonb/);
    expect(notice.params.slice(0, 3)).toEqual([CONVO, ME, 'Mika added Jo']);
    expect(h.push.send).not.toHaveBeenCalled();
    expect(h.frames('message')).toHaveLength(1);
  });

  it('keeps the workspace owner an admin of the team chat', async () => {
    const h = harness({
      group: { workspace_id: 'ws-1', anchor_id: THEM },
      answer: (sql) => (/select is_admin from conversation_participants/.test(sql) ? [{ is_admin: true }] : undefined),
    });
    expect(await messageOf(h.service.setAdmin(ME, CONVO, THEM, false))).toBe(
      "The workspace's owner is always an admin of its team chat",
    );
  });

  it('never leaves a group without an admin', async () => {
    const h = harness({
      answer: (sql) => {
        if (/select is_admin from conversation_participants/.test(sql)) return [{ is_admin: true }];
        if (/and is_admin and user_id <> \$2/.test(sql)) return [{ count: '0' }];
        return undefined;
      },
    });
    expect(await messageOf(h.service.setAdmin(ME, CONVO, ME, false))).toBe('Make someone else an admin first');
  });

  it('refuses a non-admin who tries to make admins or remove people', async () => {
    const h = harness({ group: { is_admin: false } });
    await expect(h.service.setAdmin(ME, CONVO, THEM, true)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(h.service.removeMember(ME, CONVO, THEM)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("will not remove the crew chat's poster, or yourself", async () => {
    const h = harness({ group: { hiring_post_id: POST, anchor_id: THEM } });
    expect(await messageOf(h.service.removeMember(ME, CONVO, THEM))).toBe(
      "Whoever posted the job can't be removed from its crew chat",
    );
    expect(await messageOf(h.service.removeMember(ME, CONVO, ME))).toBe('Leave the group instead');
  });

  it('removes somebody with a notice from the admin, and hands the admin on when none is left', async () => {
    const h = harness();
    await h.service.removeMember(ME, CONVO, THEM);
    const [removed] = h.ran(/delete from conversation_participants/);
    expect(removed.params).toEqual([CONVO, THEM]);
    expect(h.ran(/set is_admin = true/)).toHaveLength(1);
    const [notice] = h.ran(/'notice', \$4::jsonb/);
    expect(notice.params.slice(1, 3)).toEqual([ME, 'Mika removed Ana']);
    // The person removed hears it too, so the chat leaves their list.
    expect(h.frames('conversation')[0][0]).toEqual([ME, THEM, OTHER]);
  });
});

describe('group details', () => {
  it('are for admins only', async () => {
    const h = harness({ group: { is_admin: false } });
    await expect(h.service.updateGroup(ME, CONVO, { about: 'Call sheets here' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    // An app from before admins renames through here too.
    await expect(h.service.rename(ME, CONVO, 'New name')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("will not rename a team chat: it is the workspace's name", async () => {
    const h = harness({ group: { workspace_id: 'ws-1', anchor_id: ME } });
    expect(await messageOf(h.service.updateGroup(ME, CONVO, { title: 'Other' }))).toMatch(
      /Rename the workspace to rename it/,
    );
  });

  it("takes a photo only from the admin's own avatars, and deletes the one it replaces", async () => {
    const h = harness({
      group: { photo_url: `https://cdn.example/users/${THEM}/avatars/old.jpg` },
      answer: (sql) => {
        if (/update conversations set/.test(sql)) {
          return [{ title: 'Crew', about: null, photo_url: `https://cdn.example/users/${ME}/avatars/new.jpg`, add_policy: 'everyone' }];
        }
        if (/as used/.test(sql)) return [{ used: false }];
        return undefined;
      },
    });
    await expect(
      h.service.updateGroup(ME, CONVO, { photoUrl: `https://cdn.example/users/${THEM}/avatars/x.jpg` }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await h.service.updateGroup(ME, CONVO, { photoUrl: `https://cdn.example/users/${ME}/avatars/new.jpg` });
    // From the avatars of whoever uploaded the old one, not the admin's.
    expect(h.storage.deleteObject).toHaveBeenCalledWith(THEM, `users/${THEM}/avatars/old.jpg`);
  });

  it('keeps a replaced photo that something else still shows', async () => {
    const h = harness({
      group: { photo_url: `https://cdn.example/users/${ME}/avatars/me.jpg` },
      answer: (sql) => {
        if (/update conversations set/.test(sql)) return [{ title: 'Crew', about: null, photo_url: null, add_policy: 'everyone' }];
        if (/as used/.test(sql)) return [{ used: true }];
        return undefined;
      },
    });
    await h.service.updateGroup(ME, CONVO, { photoUrl: null });
    expect(h.storage.deleteObject).not.toHaveBeenCalled();
  });

  it('caps the About and checks who can add people', async () => {
    expect(await validate(plainToInstance(UpdateGroupDto, { about: 'x'.repeat(201) }))).toHaveLength(1);
    expect(await validate(plainToInstance(UpdateGroupDto, { addPolicy: 'anyone' }))).toHaveLength(1);
    expect(await validate(plainToInstance(UpdateGroupDto, { about: null, photoUrl: null }))).toHaveLength(0);
    expect(await validate(plainToInstance(PinDto, { replace: 'not-an-id' }))).toHaveLength(1);
  });
});

describe('pins', () => {
  it('asks which one to take down when three are pinned', async () => {
    const h = harness({
      answer: (sql) =>
        /pinned_at is not null and deleted_at is null/.test(sql) ? [{ id: 'a' }, { id: 'b' }, { id: 'c' }] : undefined,
    });
    const err = await h.service.pin(ME, CONVO, MSG).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(((err as ConflictException).getResponse() as { code: string }).code).toBe('PINS_FULL');
    expect(h.ran(/set pinned_at = now\(\)/)).toHaveLength(0);
  });

  it('takes the named one down for it, and tells everyone with one small frame', async () => {
    const h = harness({
      answer: (sql) =>
        /pinned_at is not null and deleted_at is null/.test(sql) ? [{ id: 'a' }, { id: 'b' }, { id: 'c' }] : undefined,
    });
    await h.service.pin(ME, CONVO, MSG, 'b');
    expect(h.ran(/set pinned_at = null, pinned_by = null where id = \$1/)[0].params).toEqual(['b']);
    expect(h.ran(/set pinned_at = now\(\), pinned_by = \$2/)[0].params).toEqual([MSG, ME]);
    expect(h.frames('pins')).toEqual([[[ME, THEM, OTHER], { type: 'pins', conversationId: CONVO }]]);
  });

  it('will not pin a notice, or in a frozen chat', async () => {
    await expect(harness({ message: { kind: 'notice' } }).service.pin(ME, CONVO, MSG)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(harness({ frozen: true }).service.pin(ME, CONVO, MSG)).rejects.toBeInstanceOf(HttpException);
  });

  it('unpins on unsend', async () => {
    const h = harness({
      answer: (sql) =>
        /select sender_id, deleted_at, kind, pinned_at from messages/.test(sql)
          ? [{ sender_id: ME, deleted_at: null, kind: 'text', pinned_at: new Date() }]
          : undefined,
    });
    await h.service.deleteMessage(ME, CONVO, MSG, 'everyone');
    expect(h.ran(/deleted_at = now\(\), pinned_at = null, pinned_by = null/)).toHaveLength(1);
    expect(h.frames('pins')).toHaveLength(1);
  });

  it('refuses to unsend or react to a notice', async () => {
    const h = harness({
      message: { kind: 'notice' },
      answer: (sql) =>
        /select sender_id, deleted_at, kind, pinned_at from messages/.test(sql)
          ? [{ sender_id: ME, deleted_at: null, kind: 'notice', pinned_at: null }]
          : undefined,
    });
    await expect(h.service.deleteMessage(ME, CONVO, MSG, 'everyone')).rejects.toBeInstanceOf(BadRequestException);
    await expect(h.service.react(ME, CONVO, MSG, 'love')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('search and opening a chat at a message', () => {
  it('searches words, not patterns, and leaves notices out', async () => {
    const h = harness();
    await h.service.search(ME, CONVO, ' 50% ');
    const [select] = h.ran(/position\(lower\(\$3\)/);
    expect(select.params[2]).toBe('50%');
    expect(select.sql).toMatch(/m\.kind <> 'notice'/);
  });

  it('answers nothing for an empty search without asking the database', async () => {
    const h = harness();
    expect(await h.service.search(ME, CONVO, '   ')).toEqual({ matches: [] });
    expect(h.ran(/position\(lower/)).toHaveLength(0);
  });

  it('says whether the window around a message reaches the newest', async () => {
    const older = Array.from({ length: 21 }, (_, i) => ({ id: `o${i}` }));
    const newer = Array.from({ length: 21 }, (_, i) => ({ id: `n${i}` }));
    const h = harness({
      answer: (sql) => {
        if (/where m\.id = \$3 and/.test(sql)) return [{ id: MSG, created_at: new Date() }];
        if (/<= \(select a\.created_at, a\.id/.test(sql)) return older;
        if (/> \(select a\.created_at, a\.id/.test(sql)) return newer;
        return undefined;
      },
    });
    const thread = await h.service.messages(ME, CONVO, 100, undefined, undefined, MSG);
    expect(thread.hasNewer).toBe(true);
    // Twenty newer, newest first, then the message and twenty older.
    expect(thread.messages).toHaveLength(41);
    expect(thread.messages[0].id).toBe('n19');
    expect(thread.messages[20].id).toBe('o0');
  });

  it('is a 404 for a message the reader cannot see', async () => {
    const h = harness();
    await expect(h.service.messages(ME, CONVO, 100, undefined, undefined, MSG)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('ChatCrewService', () => {
  function crew(answer: Answer) {
    const calls: { sql: string; params: unknown[] }[] = [];
    const run = (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return answer(sql, params) ?? [];
    };
    const db = {
      query: jest.fn(async (sql: string, params: unknown[] = []) => run(sql, params)),
      queryOne: jest.fn(async (sql: string, params: unknown[] = []) => run(sql, params)[0] ?? null),
    } as unknown as DatabaseService;
    const messages = {
      createLinkedGroup: jest.fn(async () => ({ id: CONVO, created: true })),
      joinLinked: jest.fn(async () => true),
      departLinked: jest.fn(async () => true),
      postNotice: jest.fn(async () => undefined),
      renameLinked: jest.fn(async () => undefined),
      send: jest.fn(async () => ({})),
    };
    const service = new ChatCrewService(
      db,
      messages as unknown as MessagesService,
      { siteUrl: 'https://virgo.ph' } as MailConfig,
    );
    return { service, messages, calls };
  }
  const name = (sql: string) =>
    /as name from users/.test(sql) ? [{ name: 'Jo Reyes' }] : undefined;

  it('makes the team chat when the second person joins, without clients', async () => {
    const h = crew((sql) => {
      if (/from workspaces/.test(sql)) return [{ name: 'Santos Studio', user_id: ME }];
      if (/select role from collaborators/.test(sql)) return [{ role: 'editor' }];
      if (/collaborator_user_id as user_id/.test(sql)) {
        expect(sql).toMatch(/role <> 'client'/);
        return [{ user_id: THEM }];
      }
      return name(sql);
    });
    await h.service.workspaceJoined('ws-1', THEM);
    expect(h.messages.createLinkedGroup).toHaveBeenCalledWith({
      createdBy: ME,
      title: 'Santos Studio',
      memberIds: [THEM],
      workspaceId: 'ws-1',
    });
    expect(h.messages.postNotice).toHaveBeenCalledWith(
      CONVO,
      ME,
      'Team chat for Santos Studio. People join and leave it with the workspace.',
      { event: 'team-chat', workspaceId: 'ws-1' },
    );
  });

  it('leaves a client out of the team chat', async () => {
    const h = crew((sql) => {
      if (/from workspaces/.test(sql)) return [{ name: 'Santos Studio', user_id: ME }];
      if (/select role from collaborators/.test(sql)) return [{ role: 'client' }];
      return undefined;
    });
    await h.service.workspaceJoined('ws-1', THEM);
    expect(h.messages.createLinkedGroup).not.toHaveBeenCalled();
    expect(h.messages.joinLinked).not.toHaveBeenCalled();
  });

  it('adds a later joiner to the team chat it has, and takes a leaver out', async () => {
    const h = crew((sql) => {
      if (/from workspaces/.test(sql)) return [{ name: 'Santos Studio', user_id: ME }];
      if (/select role from collaborators/.test(sql)) return [{ role: 'photographer' }];
      if (/where workspace_id = \$1$/.test(sql.trim())) return [{ id: CONVO }];
      return name(sql);
    });
    await h.service.workspaceJoined('ws-1', OTHER);
    expect(h.messages.joinLinked).toHaveBeenCalledWith(
      CONVO,
      OTHER,
      'Jo Reyes joined Santos Studio and this chat',
      { event: 'joined', via: 'workspace', subjectId: OTHER },
    );
    await h.service.workspaceLeft('ws-1', OTHER);
    expect(h.messages.departLinked).toHaveBeenCalledWith(
      CONVO,
      OTHER,
      'Jo Reyes left Santos Studio and this chat',
      { event: 'left', via: 'workspace', subjectId: OTHER },
    );
  });

  it('never throws at the workspace code that called it', async () => {
    const h = crew(() => {
      throw new Error('connection reset');
    });
    await expect(h.service.workspaceJoined('ws-1', THEM)).resolves.toBeUndefined();
    await expect(h.service.workspaceLeft('ws-1', THEM)).resolves.toBeUndefined();
    await expect(h.service.hired(POST, THEM)).resolves.toBeUndefined();
    await expect(h.service.unbooked(POST, THEM)).resolves.toBeUndefined();
  });

  it('starts a crew chat only for the poster, and only with two hired', async () => {
    const notMine = crew(() => undefined);
    await expect(notMine.service.startCrew(THEM, POST)).rejects.toBeInstanceOf(NotFoundException);

    const one = crew((sql) => {
      if (/from hiring_posts where id = \$1 and user_id = \$2/.test(sql)) return [{ id: POST, title: 'Santos Wedding', slug: 'santos-wedding' }];
      if (/select distinct a\.user_id/.test(sql)) return [{ user_id: THEM }];
      return undefined;
    });
    expect(await messageOf(one.service.startCrew(ME, POST))).toBe('Hire at least 2 people to start a crew chat');
  });

  it('starts it with everyone hired, a notice, then the job card', async () => {
    const h = crew((sql) => {
      if (/from hiring_posts where id = \$1 and user_id = \$2/.test(sql)) return [{ id: POST, title: 'Santos Wedding', slug: 'santos-wedding' }];
      if (/select distinct a\.user_id/.test(sql)) return [{ user_id: THEM }, { user_id: OTHER }];
      return name(sql);
    });
    expect(await h.service.startCrew(ME, POST)).toEqual({ id: CONVO });
    expect(h.messages.createLinkedGroup).toHaveBeenCalledWith({
      createdBy: ME,
      title: 'Santos Wedding crew',
      memberIds: [THEM, OTHER],
      hiringPostId: POST,
    });
    expect(h.messages.send).toHaveBeenCalledWith(
      ME,
      CONVO,
      'Job post: Santos Wedding\nhttps://virgo.ph/jobs/santos-wedding',
      { card: { kind: 'job-post', context: { postId: POST } } },
    );
  });

  it('keeps somebody still hired for another role in the crew chat', async () => {
    const h = crew((sql) => {
      if (/where hiring_post_id = \$1/.test(sql)) return [{ id: CONVO }];
      if (/as held/.test(sql)) return [{ held: true }];
      return undefined;
    });
    await h.service.unbooked(POST, THEM);
    expect(h.messages.departLinked).not.toHaveBeenCalled();
  });

  it('takes somebody whose booking fell through out of the crew chat', async () => {
    const h = crew((sql) => {
      if (/where hiring_post_id = \$1/.test(sql)) return [{ id: CONVO }];
      if (/as held/.test(sql)) return [{ held: false }];
      return name(sql);
    });
    await h.service.unbooked(POST, THEM);
    expect(h.messages.departLinked).toHaveBeenCalledWith(
      CONVO,
      THEM,
      'Jo Reyes is no longer on this job',
      { event: 'left', via: 'crew', subjectId: THEM },
    );
  });
});
