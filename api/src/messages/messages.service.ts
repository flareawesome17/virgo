import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { MIRRORED_ACCEPTED_JOIN } from '../friends/friend-sql';
import { FriendsService } from '../friends/friends.service';
import { PushService } from '../notifications/push.service';
import { PresenceService } from '../realtime/presence.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { blockedBetween } from '../safety/block-sql';
import { BlocksService } from '../safety/blocks.service';

/** The codes a chat refusal carries, which the clients switch on. */
type ChatRefusalCode = 'YOU_BLOCKED' | 'CHAT_UNAVAILABLE' | 'GROUP_MEMBER_UNAVAILABLE';

/**
 * A 403 the clients can tell apart from "you are not friends".
 *
 * The code is what they read; the message is shown as it is, so each one is a
 * whole sentence and none of the ones the blocked person can see says
 * "blocked".
 */
function refusal(code: ChatRefusalCode, message: string): ForbiddenException {
  return new ForbiddenException({ statusCode: 403, error: 'Forbidden', code, message });
}

/**
 * Where the caller stands in a conversation, for everything that writes to it.
 *
 * `others` and `blockedOthers` count the other members, and how many of them
 * are on either side of a block with the caller.
 */
interface SendState {
  isGroup: boolean;
  others: number;
  blockedOthers: number;
  /** The caller's own block on someone in here, if any — what unblocking takes. */
  myBlockId: string | null;
  /** Whether someone in here has blocked the caller. */
  theyBlockedMe: boolean;
}

/**
 * Nobody left the caller can reach: every other member is blocked with them.
 * Always the case in a direct chat across a block.
 */
function frozen(state: SendState): boolean {
  return state.others > 0 && state.blockedOthers === state.others;
}

export interface ConversationSummary {
  id: string;
  isGroup: boolean;
  /** Group title, or the other person's name for a direct chat. */
  title: string;
  avatarUrl: string | null;
  participantCount: number;
  lastMessage: string | null;
  lastAt: Date | null;
  lastSender: string | null;
  unread: number;
  /**
   * The message that matched a search, when the match was not on the title or
   * a participant's name. Lets the list say *why* a conversation is a result.
   */
  matchSnippet: string | null;
  /** Whether this member has muted it, and until when. */
  muted: boolean;
  mutedUntil: Date | null;
  /**
   * The other person, for a direct chat. Null on a group — "online" is not
   * something a group is, and a group's dot would have to mean something else.
   */
  otherUserId: string | null;
  otherOnline: boolean | null;
  otherLastSeenAt: Date | null;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: Date;
  sender_name?: string;
  /** Set when the message was deleted for everyone; `body` is then empty. */
  deleted_at?: Date | null;
  /** Account ids mentioned in the body. */
  mentions?: string[];
  reply_to_id?: string | null;
  /** Quoted preview of the message being replied to, if it still exists. */
  reply_to_body?: string | null;
  reply_to_sender?: string | null;
  reply_to_deleted?: boolean;
  /**
   * What sort of message this is.
   *
   * 'text' is somebody typing. 'job-accepted' is the app itself, marking the
   * moment an application was accepted — rendered as a card with the job, the
   * role and the booking rather than as a bubble.
   */
  kind?: 'text' | 'job-accepted';
  /** Whatever the card needs to render. Null on a typed message. */
  context?: Record<string, unknown> | null;
}

export interface Thread {
  messages: MessageRow[];
  /**
   * Where the caller had read up to *before* this request.
   *
   * Returned so the client can draw a "new messages" divider. It is read in the
   * same query as the messages, so the first load after opening a thread still
   * sees the pre-read value; `markRead` runs afterwards.
   */
  lastReadAt: Date | null;
  /**
   * False once a block has frozen the conversation, so the client can show a
   * notice instead of a composer that only ever fails.
   */
  canSend: boolean;
  /** Frozen because the caller blocked the other person, which they can undo. */
  blockedByMe: boolean;
  /** That block, when `blockedByMe` — what unblocking takes. */
  blockId: string | null;
}

export interface ParticipantRow {
  id: string;
  name: string;
  avatar_url: string | null;
  /** Their public profile address, only when they have published one. */
  handle: string | null;
  /** Whether they have a socket open right now. From the gateway, not the DB. */
  online?: boolean;
  /**
   * Meaningful when `online` is false. Null for anyone the caller is not
   * entitled to see come and go — across a block, or a group member who is
   * not their friend.
   */
  last_seen_at: Date | null;
  /**
   * How far this person has read. Drives the read receipt on your own
   * messages: yours is read once someone else's `last_read_at` passes it.
   */
  last_read_at: Date | null;
  /**
   * How far messages have reached this person's device.
   *
   * Always at or ahead of `last_read_at` — you cannot read what has not
   * arrived — and it is what separates "sent" from "delivered".
   */
  last_delivered_at: Date | null;
  /** Whether the caller has blocked this person. */
  blocked_by_me: boolean;
  /** The caller's block on them, which is what unblocking takes. */
  block_id: string | null;
}

/**
 * Chat: direct and group, on one model.
 *
 * A direct chat is a conversation with two participants; a group has a title
 * and any number. Modelling direct messages as sender/recipient columns would
 * have meant a second implementation the moment groups arrived.
 *
 * Membership is restricted to accepted friends at the time a thread is opened
 * or someone is added. Without it, anyone holding an account id could open a
 * thread with any user, which is a harassment vector rather than a feature —
 * and collaborators are friends by construction, so the restriction costs
 * nothing real. Unfriending does not close a thread; a block does. It freezes
 * a direct chat both ways and keeps the history, and in a group it silences
 * the pair towards each other while everyone else carries on.
 */
@Injectable()
export class MessagesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly friends: FriendsService,
    private readonly push: PushService,
    private readonly realtime: RealtimeGateway,
    private readonly presence: PresenceService,
    private readonly blocks: BlocksService,
  ) {}

  /** Everyone in a conversation, for fan-out. */
  private async participantIds(conversationId: string): Promise<string[]> {
    const rows = await this.db.query<{ user_id: string }>(
      'select user_id from conversation_participants where conversation_id = $1',
      [conversationId],
    );
    return rows.map((r) => r.user_id);
  }

  /**
   * The members who may see what `actorId` just did live: everyone except
   * those on either side of a block with them. The actor is included, for
   * their other devices.
   */
  private async participantIdsVisibleTo(
    conversationId: string,
    actorId: string,
  ): Promise<string[]> {
    const rows = await this.db.query<{ user_id: string }>(
      `select p.user_id from conversation_participants p
        where p.conversation_id = $1
          and not ${blockedBetween('$2', 'p.user_id')}`,
      [conversationId, actorId],
    );
    return rows.map((r) => r.user_id);
  }

  /**
   * Membership plus the block picture, in one read. Replaces the bare
   * membership check on every path that writes to a thread or reports on it.
   *
   * The two scalar subqueries sit beside GROUP BY c.is_group, which they are
   * independent of. `others` counts every other member once: the lateral
   * yields at most one row per member, however many blocks there are.
   */
  private async sendState(
    conversationId: string,
    userId: string,
  ): Promise<SendState> {
    const row = await this.db.queryOne<{
      is_group: boolean;
      others: number;
      blocked_others: number;
      my_block_id: string | null;
      they_blocked_me: boolean;
    }>(
      `select c.is_group,
              count(o.user_id)::int as others,
              count(blk.hit)::int as blocked_others,
              (select ub.id
                 from user_blocks ub
                 join conversation_participants op
                   on op.conversation_id = $1 and op.user_id = ub.blocked_id
                where ub.blocker_id = $2
                order by ub.created_at
                limit 1) as my_block_id,
              exists (select 1
                        from user_blocks ub
                        join conversation_participants op
                          on op.conversation_id = $1 and op.user_id = ub.blocker_id
                       where ub.blocked_id = $2) as they_blocked_me
         from conversation_participants me
         join conversations c on c.id = me.conversation_id
         left join conversation_participants o
           on o.conversation_id = me.conversation_id and o.user_id <> $2
         left join lateral (
           select 1 as hit
             from user_blocks ub
            where (ub.blocker_id = $2 and ub.blocked_id = o.user_id)
               or (ub.blocker_id = o.user_id and ub.blocked_id = $2)
            limit 1
         ) blk on true
        where me.conversation_id = $1 and me.user_id = $2
        group by c.is_group`,
      [conversationId, userId],
    );
    if (!row) throw new NotFoundException('Conversation not found');
    return {
      isGroup: row.is_group,
      others: row.others,
      blockedOthers: row.blocked_others,
      myBlockId: row.my_block_id,
      theyBlockedMe: row.they_blocked_me,
    };
  }

  private async assertFriends(userId: string, otherIds: string[]): Promise<void> {
    for (const id of otherIds) {
      if (id === userId) {
        throw new BadRequestException('You are already in this conversation');
      }
      if (!(await this.friends.areFriends(userId, id))) {
        throw new ForbiddenException(
          'You can only chat with people you are connected with',
        );
      }
    }
  }

  /**
   * Records that messages have reached this user's device.
   *
   * Called from the read paths, because the recipient's app asking for their
   * messages *is* the evidence that the messages arrived — no separate
   * acknowledgement round trip, and nothing to get out of step.
   *
   * The `exists` guard keeps a poll on a quiet account from writing: without
   * it every client would issue an UPDATE every fifteen seconds forever.
   *
   * Best-effort. A failed receipt must never fail the fetch that carries the
   * messages themselves.
   */
  private async markDelivered(userId: string, conversationId?: string): Promise<void> {
    try {
      await this.db.query(
        `update conversation_participants p
            set last_delivered_at = now()
          where p.user_id = $1
            and ($2::uuid is null or p.conversation_id = $2)
            and exists (
                  select 1 from messages m
                   where m.conversation_id = p.conversation_id
                     and m.sender_id <> $1
                     and (p.last_delivered_at is null
                          or m.created_at > p.last_delivered_at)
                )`,
        [userId, conversationId ?? null],
      );
    } catch {
      // Swallowed on purpose — see above.
    }
  }

  /** Throws unless the caller is in the conversation. */
  private async assertMember(userId: string, conversationId: string): Promise<void> {
    const row = await this.db.queryOne<{ user_id: string }>(
      `select user_id from conversation_participants
        where conversation_id = $1 and user_id = $2`,
      [conversationId, userId],
    );
    if (!row) throw new NotFoundException('Conversation not found');
  }

  /**
   * Opens (or reuses) a one-to-one chat.
   *
   * Reused rather than created each time, or the same pair would accumulate
   * threads and messages would scatter between them.
   *
   * Someone who blocked the other person is told so, since unblocking is
   * theirs to do. The person blocked gets the ordinary not-friends answer —
   * the block deleted the friendship, so it is also the true one.
   */
  async openDirect(userId: string, otherId: string): Promise<{ id: string }> {
    const block = await this.blocks.between(userId, otherId);
    if (block?.byMe) {
      throw refusal(
        'YOU_BLOCKED',
        'You blocked this person. Unblock them to start a chat.',
      );
    }
    await this.assertFriends(userId, [otherId]);

    const existing = await this.db.queryOne<{ id: string }>(
      `select c.id
         from conversations c
         join conversation_participants a
           on a.conversation_id = c.id and a.user_id = $1
         join conversation_participants b
           on b.conversation_id = c.id and b.user_id = $2
        where c.is_group = false
          and (select count(*) from conversation_participants p
                where p.conversation_id = c.id) = 2
        limit 1`,
      [userId, otherId],
    );
    if (existing) return { id: existing.id };

    return this.db.transaction(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `insert into conversations (is_group, created_by)
         values (false, $1) returning id`,
        [userId],
      );
      const id = rows[0].id;
      await client.query(
        `insert into conversation_participants (conversation_id, user_id)
         values ($1, $2), ($1, $3)`,
        [id, userId, otherId],
      );
      return { id };
    });
  }

  /** Creates a group. Every member must already be a friend of the creator. */
  async createGroup(
    userId: string,
    title: string,
    memberIds: string[],
  ): Promise<{ id: string }> {
    const name = title.trim();
    if (!name) throw new BadRequestException('Give the group a name');

    const unique = [...new Set(memberIds)].filter((id) => id !== userId);
    if (unique.length === 0) {
      throw new BadRequestException('Add at least one person to the group');
    }
    await this.assertFriends(userId, unique);

    // Each member is the creator's friend, which rules out a block with the
    // creator. Two of the members may still have blocked each other, and a
    // group is the one way a blocked person could be put back in front of
    // someone. The message says only that some pair cannot be together, not
    // which, so the creator learns nothing about whom.
    const clash = await this.db.queryOne<{ blocked: boolean }>(
      `select exists (select 1 from user_blocks b
                       where b.blocker_id = any($1::uuid[])
                         and b.blocked_id = any($1::uuid[])) as blocked`,
      [[userId, ...unique]],
    );
    if (clash?.blocked) {
      throw refusal(
        'GROUP_MEMBER_UNAVAILABLE',
        "Some of the people you picked can't be in a group together.",
      );
    }

    return this.db.transaction(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `insert into conversations (is_group, title, created_by)
         values (true, $1, $2) returning id`,
        [name, userId],
      );
      const id = rows[0].id;
      await client.query(
        `insert into conversation_participants (conversation_id, user_id)
         select $1, unnest($2::uuid[])`,
        [id, [userId, ...unique]],
      );
      return { id };
    });
  }

  /** Adds someone to an existing group. Members can invite their own friends. */
  async addMember(
    userId: string,
    conversationId: string,
    memberId: string,
  ): Promise<{ added: boolean }> {
    await this.assertMember(userId, conversationId);

    const convo = await this.db.queryOne<{ is_group: boolean }>(
      'select is_group from conversations where id = $1',
      [conversationId],
    );
    if (!convo?.is_group) {
      throw new BadRequestException('Cannot add people to a direct chat');
    }
    await this.assertFriends(userId, [memberId]);

    // The same rule as creating a group, against everyone already in it.
    const clash = await this.db.queryOne<{ blocked: boolean }>(
      `select exists (
         select 1
           from conversation_participants p
           join user_blocks b
             on (b.blocker_id = p.user_id and b.blocked_id = $2)
             or (b.blocker_id = $2 and b.blocked_id = p.user_id)
          where p.conversation_id = $1
       ) as blocked`,
      [conversationId, memberId],
    );
    if (clash?.blocked) {
      throw refusal('GROUP_MEMBER_UNAVAILABLE', "They can't be added to this group.");
    }

    const rows = await this.db.query<{ user_id: string }>(
      `insert into conversation_participants (conversation_id, user_id)
       values ($1, $2)
       on conflict (conversation_id, user_id) do nothing
       returning user_id`,
      [conversationId, memberId],
    );
    return { added: rows.length > 0 };
  }

  /**
   * Silences push for this conversation until a moment in time.
   *
   * Null unmutes. A far-future timestamp is how "until I turn it back on" is
   * expressed, which keeps one column doing the work of a flag plus a schedule.
   */
  async mute(
    userId: string,
    conversationId: string,
    until: Date | null,
  ): Promise<{ muted: boolean; mutedUntil: Date | null }> {
    await this.assertMember(userId, conversationId);
    await this.db.query(
      `update conversation_participants set muted_until = $3
        where conversation_id = $1 and user_id = $2`,
      [conversationId, userId, until],
    );
    return { muted: !!until && until.getTime() > Date.now(), mutedUntil: until };
  }

  /** Renames a group. Any member may do it, as they all share the thread. */
  async rename(
    userId: string,
    conversationId: string,
    title: string,
  ): Promise<{ id: string; title: string }> {
    await this.assertMember(userId, conversationId);

    const name = title.trim();
    if (!name) throw new BadRequestException('Give the group a name');

    const convo = await this.db.queryOne<{ is_group: boolean }>(
      'select is_group from conversations where id = $1',
      [conversationId],
    );
    if (!convo?.is_group) {
      // A direct chat is titled from the other person, so a stored title would
      // never be shown and renaming would silently do nothing.
      throw new BadRequestException('Only a group can be renamed');
    }

    await this.db.query('update conversations set title = $2 where id = $1', [
      conversationId,
      name,
    ]);
    return { id: conversationId, title: name };
  }

  /**
   * Removes the conversation from this person's view.
   *
   * A group is also left, because staying in a group whose thread you have
   * emptied means the next message drags it back with no history. A direct
   * chat keeps its membership: the other person must still be able to write to
   * you, and their message reopens the thread from that point.
   */
  async deleteConversation(
    userId: string,
    conversationId: string,
  ): Promise<{ deleted: boolean; left: boolean }> {
    await this.assertMember(userId, conversationId);

    const convo = await this.db.queryOne<{ is_group: boolean }>(
      'select is_group from conversations where id = $1',
      [conversationId],
    );

    if (convo?.is_group) {
      await this.db.query(
        `delete from conversation_participants
          where conversation_id = $1 and user_id = $2`,
        [conversationId, userId],
      );
      return { deleted: true, left: true };
    }

    await this.db.query(
      `update conversation_participants
          set cleared_at = now(), last_read_at = now()
        where conversation_id = $1 and user_id = $2`,
      [conversationId, userId],
    );
    return { deleted: true, left: false };
  }

  /** Leaving deletes only your membership; the conversation survives. */
  async leave(userId: string, conversationId: string): Promise<{ left: boolean }> {
    await this.assertMember(userId, conversationId);
    await this.db.query(
      `delete from conversation_participants
        where conversation_id = $1 and user_id = $2`,
      [conversationId, userId],
    );
    return { left: true };
  }

  /**
   * The caller's conversations, most recently active first.
   *
   * `q` searches three things at once, because a person looking for a thread
   * remembers any of them: the group's name, who is in it, or something that
   * was said. A body match also returns the line it matched, so the row can
   * show why it is a result instead of the unrelated last message.
   */
  async conversations(userId: string, q?: string): Promise<ConversationSummary[]> {
    const term = q?.trim() ? `%${q.trim()}%` : null;

    const rows = await this.db.query<{
      id: string;
      is_group: boolean;
      title: string | null;
      other_name: string | null;
      other_id: string | null;
      other_avatar: string | null;
      participant_count: string;
      last_body: string | null;
      last_at: Date | null;
      last_sender: string | null;
      unread: string;
      match_body: string | null;
      muted_until: Date | null;
      other_blocked: boolean;
    }>(
      `select c.id, c.is_group, c.title,
              -- For a direct chat the title is the other participant.
              (select coalesce(u.display_name, split_part(u.email, '@', 1))
                 from conversation_participants p
                 join users u on u.id = p.user_id
                where p.conversation_id = c.id and p.user_id <> $1
                limit 1) as other_name,
              -- Their id, so presence can be looked up and matched against
              -- the live presence events the socket delivers.
              (select p.user_id
                 from conversation_participants p
                where p.conversation_id = c.id and p.user_id <> $1
                limit 1) as other_id,
              (select u.avatar_url
                 from conversation_participants p
                 join users u on u.id = p.user_id
                where p.conversation_id = c.id and p.user_id <> $1
                limit 1) as other_avatar,
              (select count(*)::text from conversation_participants p
                where p.conversation_id = c.id) as participant_count,
              last.body as last_body,
              last.created_at as last_at,
              last.sender_name as last_sender,
              -- Messages from someone blocked either way never count. In a
              -- group their lines still show; they just stop lighting the
              -- badge, on either side of the block.
              (select count(*)::text from messages m
                where m.conversation_id = c.id
                  and m.sender_id <> $1
                  and m.deleted_at is null
                  and (me.cleared_at is null or m.created_at > me.cleared_at)
                  and (me.last_read_at is null or m.created_at > me.last_read_at)
                  and not exists (
                        select 1 from message_deletions d
                         where d.message_id = m.id and d.user_id = $1
                      )
                  and not ${blockedBetween('$1', 'm.sender_id')}
              ) as unread,
              hit.body as match_body,
              me.muted_until,
              -- A direct chat across a block, whichever way round, so its dot
              -- can be darkened rather than showing when they come and go.
              (not c.is_group and exists (
                 select 1
                   from conversation_participants op
                   join user_blocks ub
                     on (ub.blocker_id = $1 and ub.blocked_id = op.user_id)
                     or (ub.blocker_id = op.user_id and ub.blocked_id = $1)
                  where op.conversation_id = c.id and op.user_id <> $1
              )) as other_blocked
         from conversations c
         join conversation_participants me
           on me.conversation_id = c.id and me.user_id = $1
         left join lateral (
           select case when m.deleted_at is null
                       then m.body else 'Message deleted' end as body,
                  m.created_at,
                  coalesce(u.display_name, split_part(u.email, '@', 1)) as sender_name
             from messages m
             join users u on u.id = m.sender_id
            where m.conversation_id = c.id
              and (me.cleared_at is null or m.created_at > me.cleared_at)
              and not exists (
                    select 1 from message_deletions d
                     where d.message_id = m.id and d.user_id = $1
                  )
            order by m.created_at desc
            limit 1
         ) last on true
         -- Most recent line matching the search, if any. Skipped entirely
         -- when nothing was typed, so the normal list costs no extra scan.
         -- Deleted messages are excluded: a search must not resurrect text
         -- that was removed from the thread.
         left join lateral (
           select m.body
             from messages m
            where $2::text is not null
              and m.conversation_id = c.id
              and m.deleted_at is null
              and (me.cleared_at is null or m.created_at > me.cleared_at)
              and m.body ilike $2
              and not exists (
                    select 1 from message_deletions d
                     where d.message_id = m.id and d.user_id = $1
                  )
            order by m.created_at desc
            limit 1
         ) hit on true
        where
          -- A conversation you deleted stays gone until something new arrives
          -- in it. Dropping your participant row instead would make a direct
          -- chat un-reopenable by the other person.
          (me.cleared_at is null or last.created_at is not null)
          and (
            $2::text is null
            or c.title ilike $2
            or hit.body is not null
            or exists (
                 select 1
                   from conversation_participants p
                   join users u on u.id = p.user_id
                  where p.conversation_id = c.id
                    and p.user_id <> $1
                    and coalesce(u.display_name, split_part(u.email, '@', 1)) ilike $2
               )
          )
        order by coalesce(last.created_at, c.created_at) desc
        limit 100`,
      [userId, term],
    );

    // Listing conversations is proof their messages reached this device.
    await this.markDelivered(userId);

    // Presence for the other side of each direct chat. Included here rather
    // than left to the socket because a client that has only just opened has
    // received no presence events yet — without this the dot would be dark
    // until somebody happened to connect or disconnect while it watched.
    //
    // Never across a block: the thread stays, their presence does not.
    const otherIds = rows
      .filter((r) => !r.is_group && r.other_id && !r.other_blocked)
      .map((r) => r.other_id!);
    const online = this.realtime.onlineAmong(otherIds);
    const seen = await this.presence.lastSeen(otherIds);

    return rows.map((r) => ({
      id: r.id,
      isGroup: r.is_group,
      title: r.is_group ? (r.title ?? 'Group') : (r.other_name ?? 'Conversation'),
      avatarUrl: r.is_group ? null : r.other_avatar,
      participantCount: Number(r.participant_count),
      lastMessage: r.last_body,
      lastAt: r.last_at,
      lastSender: r.last_sender,
      unread: Number(r.unread),
      // Only worth showing when it is not just the last message repeated.
      matchSnippet: r.match_body && r.match_body !== r.last_body ? r.match_body : null,
      muted: !!r.muted_until && r.muted_until.getTime() > Date.now(),
      mutedUntil: r.muted_until,
      // Null for groups: "online" is not a thing a group is. False, not null,
      // across a block — the live app darkens the dot only on false.
      otherUserId: r.is_group ? null : r.other_id,
      otherOnline: r.is_group
        ? null
        : !r.other_blocked && online.has(r.other_id ?? ''),
      otherLastSeenAt:
        r.is_group || r.other_blocked ? null : (seen.get(r.other_id ?? '') ?? null),
    }));
  }

  async messages(
    userId: string,
    conversationId: string,
    limit = 100,
  ): Promise<Thread> {
    const state = await this.sendState(conversationId, userId);

    const [messages, me] = await Promise.all([
      this.db.query<MessageRow>(
        `select m.id, m.conversation_id, m.sender_id, m.created_at,
                m.deleted_at, m.mentions, m.reply_to_id, m.kind, m.context,
                -- A tombstone carries no text. Cleared on delete, so this is
                -- belt and braces rather than the only thing hiding it.
                case when m.deleted_at is null then m.body else '' end as body,
                coalesce(u.display_name, split_part(u.email, '@', 1)) as sender_name,
                case when r.deleted_at is null then r.body else null end as reply_to_body,
                coalesce(ru.display_name, split_part(ru.email, '@', 1)) as reply_to_sender,
                (r.id is not null and r.deleted_at is not null) as reply_to_deleted
           from messages m
           join users u on u.id = m.sender_id
           left join messages r on r.id = m.reply_to_id
           left join users ru on ru.id = r.sender_id
          where m.conversation_id = $1
            -- Hidden by "delete for myself", which affects only this reader.
            and not exists (
                  select 1 from message_deletions d
                   where d.message_id = m.id and d.user_id = $3
                )
            -- Everything from before this reader deleted the conversation.
            and (
                  (select cleared_at from conversation_participants
                    where conversation_id = $1 and user_id = $3) is null
                  or m.created_at > (select cleared_at from conversation_participants
                                      where conversation_id = $1 and user_id = $3)
                )
          order by m.created_at desc
          limit $2`,
        [conversationId, Math.min(Math.max(limit, 1), 200), userId],
      ),
      this.db.queryOne<{ last_read_at: Date | null }>(
        `select last_read_at from conversation_participants
          where conversation_id = $1 and user_id = $2`,
        [conversationId, userId],
      ),
    ]);

    // Fetching a thread is proof its messages reached this device.
    await this.markDelivered(userId, conversationId);

    // Only a direct chat says whose block it is. In a group the caller may
    // have blocked one member and been blocked by another, and there is no
    // single block for a notice to offer to undo.
    const blockedByMe = !state.isGroup && !!state.myBlockId;
    return {
      messages,
      lastReadAt: me?.last_read_at ?? null,
      canSend: !frozen(state),
      blockedByMe,
      blockId: blockedByMe ? state.myBlockId : null,
    };
  }

  /**
   * Removes a message.
   *
   * Two genuinely different acts, not one with a flag:
   *   'me'       hides it from your own view and leaves the conversation as
   *              everyone else saw it.
   *   'everyone' clears the text for all participants and leaves a tombstone,
   *              so replies still have something to point at and the thread
   *              does not silently reorder.
   *
   * Only the sender may delete for everyone. Anyone may delete for themselves,
   * including messages they received.
   *
   * Someone who has been blocked in a direct chat can no longer delete for
   * everyone: what they sent is what the other person blocked them over, and
   * it has to survive for a report to mean anything.
   */
  async deleteMessage(
    userId: string,
    conversationId: string,
    messageId: string,
    scope: 'me' | 'everyone',
  ): Promise<{ deleted: boolean; scope: 'me' | 'everyone' }> {
    const state = await this.sendState(conversationId, userId);

    const message = await this.db.queryOne<{ sender_id: string; deleted_at: Date | null }>(
      'select sender_id, deleted_at from messages where id = $1 and conversation_id = $2',
      [messageId, conversationId],
    );
    if (!message) throw new NotFoundException('Message not found');

    if (scope === 'everyone') {
      if (message.sender_id !== userId) {
        throw new ForbiddenException('You can only delete your own messages for everyone');
      }
      if (!state.isGroup && state.theyBlockedMe) {
        throw refusal(
          'CHAT_UNAVAILABLE',
          "Messages in this conversation can't be deleted for everyone any more.",
        );
      }
      await this.db.query(
        `update messages set body = '', deleted_at = now()
          where id = $1 and deleted_at is null`,
        [messageId],
      );
      // Every participant, blocked or not. A retraction reveals nothing, and a
      // blocked member with the thread open must still lose the text.
      this.realtime.emitToUsers(await this.participantIds(conversationId), {
        type: 'message-deleted',
        conversationId,
        messageId,
        scope,
      });
      return { deleted: true, scope };
    }

    await this.db.query(
      `insert into message_deletions (message_id, user_id) values ($1, $2)
       on conflict do nothing`,
      [messageId, userId],
    );
    // Only the caller: hiding a message for yourself changes nobody else's view.
    this.realtime.emitToUsers([userId], {
      type: 'message-deleted',
      conversationId,
      messageId,
      scope,
    });
    return { deleted: true, scope };
  }

  async send(
    userId: string,
    conversationId: string,
    body: string,
    options: { replyToId?: string; mentionIds?: string[] } = {},
  ): Promise<MessageRow> {
    // Before the text is even looked at: a frozen thread refuses whatever is
    // sent to it, and the reason must not depend on what was typed.
    const state = await this.sendState(conversationId, userId);
    if (frozen(state)) {
      throw !state.isGroup && state.myBlockId
        ? refusal('YOU_BLOCKED', 'You blocked this person. Unblock them to send messages.')
        : refusal('CHAT_UNAVAILABLE', "You can't reply to this conversation.");
    }

    const text = body.trim();
    if (!text) throw new BadRequestException('Message cannot be empty');

    // A reply must point at a live message in this same thread — otherwise the
    // quoted preview would leak a line from a conversation the reader is not in.
    let replyToId: string | null = null;
    if (options.replyToId) {
      const target = await this.db.queryOne<{ id: string }>(
        'select id from messages where id = $1 and conversation_id = $2',
        [options.replyToId, conversationId],
      );
      if (!target) throw new BadRequestException('Cannot reply to that message');
      replyToId = target.id;
    }

    // Only real participants can be mentioned; anything else is dropped rather
    // than rejected, so a stale picker cannot fail an otherwise fine message.
    // So is anyone blocked either way: a mention is the loudest push there is.
    let mentions: string[] = [];
    if (options.mentionIds?.length) {
      const rows = await this.db.query<{ user_id: string }>(
        `select p.user_id from conversation_participants p
          where p.conversation_id = $1
            and p.user_id = any($2::uuid[])
            and p.user_id <> $3
            and not ${blockedBetween('$3', 'p.user_id')}`,
        [conversationId, [...new Set(options.mentionIds)], userId],
      );
      mentions = rows.map((r) => r.user_id);
    }

    const row = await this.db.queryOne<MessageRow>(
      `insert into messages (conversation_id, sender_id, body, reply_to_id, mentions)
       values ($1, $2, $3, $4, $5::uuid[]) returning *`,
      [conversationId, userId, text, replyToId, mentions],
    );

    // Bumps the conversation so the list re-sorts even before anyone reads it.
    await this.db.query('update conversations set updated_at = now() where id = $1', [
      conversationId,
    ]);

    // Live first: an open client should see the message now, not after the
    // push round trip. Muting does not apply here — it silences interruptions,
    // and a thread you are looking at is not an interruption. A block does
    // apply: in a group the two still share, each sees the other's lines on
    // the next fetch rather than live.
    this.realtime.emitToUsers(await this.participantIdsVisibleTo(conversationId, userId), {
      type: 'message',
      conversationId,
      message: row,
    });

    await this.notify(userId, conversationId, text, mentions);
    return row!;
  }

  /**
   * Writes a message the app itself is saying.
   *
   * Deliberately not `send()` with an extra flag. It skips the notification
   * entirely, and that is the whole difference: a system message marks
   * something that has *already* been announced through its own channel —
   * accepting an applicant notifies them, emails them and rings their phone —
   * so notifying again for the same moment is the same event twice.
   *
   * It still emits the live frame, because an open thread should show the card
   * the instant it exists rather than on the next refetch.
   *
   * No `assertMember`: the caller is the service that just created the
   * conversation, not a request. Nothing routes here from a controller.
   */
  async system(
    conversationId: string,
    senderId: string,
    kind: 'job-accepted',
    body: string,
    context: Record<string, unknown>,
  ): Promise<MessageRow> {
    const row = await this.db.queryOne<MessageRow>(
      `insert into messages (conversation_id, sender_id, body, kind, context)
       values ($1, $2, $3, $4, $5::jsonb) returning *`,
      [conversationId, senderId, body.trim(), kind, JSON.stringify(context)],
    );

    await this.db.query('update conversations set updated_at = now() where id = $1', [
      conversationId,
    ]);

    this.realtime.emitToUsers(await this.participantIds(conversationId), {
      type: 'message',
      conversationId,
      message: row,
    });

    return row!;
  }

  /** Marks the thread read up to now. */
  async markRead(userId: string, conversationId: string): Promise<{ read: boolean }> {
    await this.assertMember(userId, conversationId);
    await this.db.query(
      `update conversation_participants set last_read_at = now()
        where conversation_id = $1 and user_id = $2`,
      [conversationId, userId],
    );

    // Not across a block: "read" is a live signal of someone being there.
    this.realtime.emitToUsers(await this.participantIdsVisibleTo(conversationId, userId), {
      type: 'read',
      conversationId,
      userId,
      at: new Date().toISOString(),
    });
    return { read: true };
  }

  /** Total unread across every conversation, for the tab badge. */
  async unreadCount(userId: string): Promise<number> {
    const row = await this.db.queryOne<{ count: string }>(
      `select count(*)::text as count
         from messages m
         join conversation_participants p
           on p.conversation_id = m.conversation_id and p.user_id = $1
        where m.sender_id <> $1
          and m.deleted_at is null
          and (p.cleared_at is null or m.created_at > p.cleared_at)
          and (p.last_read_at is null or m.created_at > p.last_read_at)
          -- A muted conversation still counts as unread inside the app; the
          -- badge is a count, not an interruption. Muting only silences push.
          and not exists (
                select 1 from message_deletions d
                 where d.message_id = m.id and d.user_id = $1
              )
          -- A blocked sender, either way, never does — the same rule as the
          -- per-conversation count, so the tab and the list agree.
          and not ${blockedBetween('$1', 'm.sender_id')}`,
      [userId],
    );
    return Number(row?.count ?? 0);
  }

  /**
   * People in a conversation, with how far each has read.
   *
   * `last_read_at` rides along here rather than on each message: a read
   * receipt is a property of the reader, not of the message, and one timestamp
   * per member answers it for the whole thread.
   *
   * Across a block the member's presence is hidden, and in a direct chat their
   * receipts stop at the moment of the block — reading on afterwards is them
   * still being there. Presence is also hidden for a group co-member who is
   * not the caller's friend, as it is everywhere else.
   */
  async participants(userId: string, conversationId: string): Promise<ParticipantRow[]> {
    await this.assertMember(userId, conversationId);
    const rows = await this.db.query<
      Omit<ParticipantRow, 'online'> & { hide_presence: boolean }
    >(
      // The explicit null branches are not redundant: least() ignores nulls,
      // so least(null, blk.at) would invent a receipt at the block time.
      `select u.id,
              coalesce(u.display_name, split_part(u.email, '@', 1)) as name,
              u.avatar_url,
              case when u.public_profile then u.handle end as handle,
              u.last_seen_at,
              case when blk.at is null or c.is_group then p.last_read_at
                   when p.last_read_at is null then null
                   else least(p.last_read_at, blk.at) end as last_read_at,
              case when blk.at is null or c.is_group then p.last_delivered_at
                   when p.last_delivered_at is null then null
                   else least(p.last_delivered_at, blk.at) end as last_delivered_at,
              coalesce(blk.by_me, false) as blocked_by_me,
              blk.my_id as block_id,
              (blk.at is not null
                or (c.is_group
                    and p.user_id <> $2
                    and not exists (
                          select 1 from friends f
                          ${MIRRORED_ACCEPTED_JOIN('f', 'fb')}
                           where f.user_id = $2
                             and f.friend_user_id = p.user_id
                             and f.status = 'accepted'))) as hide_presence
         from conversation_participants p
         join conversations c on c.id = p.conversation_id
         join users u on u.id = p.user_id
         left join lateral (
           select min(ub.created_at) as at,
                  bool_or(ub.blocker_id = $2) as by_me,
                  (array_agg(ub.id) filter (where ub.blocker_id = $2))[1] as my_id
             from user_blocks ub
            where p.user_id <> $2
              and ((ub.blocker_id = $2 and ub.blocked_id = p.user_id)
                or (ub.blocker_id = p.user_id and ub.blocked_id = $2))
         ) blk on true
        where p.conversation_id = $1
        order by name`,
      [conversationId, userId],
    );

    // Online comes from the gateway, not the database: it is a fact about
    // sockets held in this process, and a column would be stale the moment
    // one died without running its disconnect handler.
    const online = this.realtime.onlineAmong(
      rows.filter((r) => !r.hide_presence).map((r) => r.id),
    );
    return rows.map(({ hide_presence, ...r }) => ({
      ...r,
      last_seen_at: hide_presence ? null : r.last_seen_at,
      online: !hide_presence && online.has(r.id),
    }));
  }

  /**
   * Best-effort push to everyone else in the conversation.
   *
   * Never throws: a delivery failure must not lose a message that is already
   * stored.
   */
  private async notify(
    senderId: string,
    conversationId: string,
    body: string,
    mentions: string[] = [],
  ): Promise<void> {
    try {
      const meta = await this.db.queryOne<{
        sender_name: string;
        is_group: boolean;
        title: string | null;
      }>(
        `select coalesce(u.display_name, split_part(u.email, '@', 1)) as sender_name,
                c.is_group, c.title
           from conversations c, users u
          where c.id = $1 and u.id = $2`,
        [conversationId, senderId],
      );

      // Muting silences push and nothing else — the message still arrives and
      // still counts as unread; it just does not interrupt. A block silences
      // it for good, both ways, in a group they still share.
      const recipients = await this.db.query<{ user_id: string }>(
        `select p.user_id from conversation_participants p
          where p.conversation_id = $1
            and p.user_id <> $2
            and (p.muted_until is null or p.muted_until <= now())
            and not ${blockedBetween('$2', 'p.user_id')}`,
        [conversationId, senderId],
      );

      const sender = meta?.sender_name ?? 'New message';
      const title =
        meta?.is_group && meta.title ? `${sender} · ${meta.title}` : sender;

      const mentioned = new Set(mentions);

      for (const r of recipients) {
        const tokens = await this.push.tokensFor(r.user_id);
        if (tokens.length === 0) continue;
        await this.push.send(
          tokens.map((to) => ({
            to,
            // Being named in a busy group is worth surfacing above the rest —
            // it is the difference between a thread you skim and one that
            // needs you.
            title: mentioned.has(r.user_id)
              ? `${sender} mentioned you${meta?.is_group && meta.title ? ` · ${meta.title}` : ''}`
              : title,
            // Truncated: a preview should not spill a long message onto a lock
            // screen in full.
            body: body.length > 140 ? `${body.slice(0, 137)}…` : body,
            // Its own channel, not 'reminders' — that one is silent and does
            // not vibrate by design, which is wrong for a message. Android
            // fixes importance at channel creation, so a message needs a
            // channel of its own rather than a louder send.
            channelId: 'messages',
            sound: 'default' as const,
            // Otherwise Android may hold the message until the next
            // maintenance window while the device is dozing.
            priority: 'high' as const,
            // `conversationId` is what the tap handler routes on.
            data: { type: 'message', conversationId },
          })),
        );
      }
    } catch {
      // Swallowed on purpose — see above.
    }
  }
}
