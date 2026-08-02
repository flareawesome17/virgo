import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { FriendsService } from '../friends/friends.service';
import { PushService } from '../notifications/push.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

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
}

export interface ParticipantRow {
  id: string;
  name: string;
  avatar_url: string | null;
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
}

/**
 * Chat: direct and group, on one model.
 *
 * A direct chat is a conversation with two participants; a group has a title
 * and any number. Modelling direct messages as sender/recipient columns would
 * have meant a second implementation the moment groups arrived.
 *
 * Membership is restricted to accepted friends. Without it, anyone holding an
 * account id could open a thread with any user, which is a harassment vector
 * rather than a feature — and collaborators are friends by construction, so
 * the restriction costs nothing real.
 */
@Injectable()
export class MessagesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly friends: FriendsService,
    private readonly push: PushService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** Everyone in a conversation, for fan-out. */
  private async participantIds(conversationId: string): Promise<string[]> {
    const rows = await this.db.query<{ user_id: string }>(
      'select user_id from conversation_participants where conversation_id = $1',
      [conversationId],
    );
    return rows.map((r) => r.user_id);
  }

  private async assertFriends(userId: string, otherIds: string[]): Promise<void> {
    for (const id of otherIds) {
      if (id === userId) {
        throw new BadRequestException('You are already in this conversation');
      }
      if (!(await this.friends.areFriends(userId, id))) {
        throw new ForbiddenException(
          'You can only chat with people you are friends with',
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
   */
  async openDirect(userId: string, otherId: string): Promise<{ id: string }> {
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
      other_avatar: string | null;
      participant_count: string;
      last_body: string | null;
      last_at: Date | null;
      last_sender: string | null;
      unread: string;
      match_body: string | null;
      muted_until: Date | null;
    }>(
      `select c.id, c.is_group, c.title,
              -- For a direct chat the title is the other participant.
              (select coalesce(u.display_name, split_part(u.email, '@', 1))
                 from conversation_participants p
                 join users u on u.id = p.user_id
                where p.conversation_id = c.id and p.user_id <> $1
                limit 1) as other_name,
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
              ) as unread,
              hit.body as match_body,
              me.muted_until
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
    }));
  }

  async messages(
    userId: string,
    conversationId: string,
    limit = 100,
  ): Promise<Thread> {
    await this.assertMember(userId, conversationId);

    const [messages, me] = await Promise.all([
      this.db.query<MessageRow>(
        `select m.id, m.conversation_id, m.sender_id, m.created_at,
                m.deleted_at, m.mentions, m.reply_to_id,
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

    return { messages, lastReadAt: me?.last_read_at ?? null };
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
   */
  async deleteMessage(
    userId: string,
    conversationId: string,
    messageId: string,
    scope: 'me' | 'everyone',
  ): Promise<{ deleted: boolean; scope: 'me' | 'everyone' }> {
    await this.assertMember(userId, conversationId);

    const message = await this.db.queryOne<{ sender_id: string; deleted_at: Date | null }>(
      'select sender_id, deleted_at from messages where id = $1 and conversation_id = $2',
      [messageId, conversationId],
    );
    if (!message) throw new NotFoundException('Message not found');

    if (scope === 'everyone') {
      if (message.sender_id !== userId) {
        throw new ForbiddenException('You can only delete your own messages for everyone');
      }
      await this.db.query(
        `update messages set body = '', deleted_at = now()
          where id = $1 and deleted_at is null`,
        [messageId],
      );
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
    await this.assertMember(userId, conversationId);

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
    let mentions: string[] = [];
    if (options.mentionIds?.length) {
      const rows = await this.db.query<{ user_id: string }>(
        `select user_id from conversation_participants
          where conversation_id = $1
            and user_id = any($2::uuid[])
            and user_id <> $3`,
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
    // and a thread you are looking at is not an interruption.
    this.realtime.emitToUsers(await this.participantIds(conversationId), {
      type: 'message',
      conversationId,
      message: row,
    });

    await this.notify(userId, conversationId, text, mentions);
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

    this.realtime.emitToUsers(await this.participantIds(conversationId), {
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
              )`,
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
   */
  async participants(userId: string, conversationId: string): Promise<ParticipantRow[]> {
    await this.assertMember(userId, conversationId);
    return this.db.query<ParticipantRow>(
      `select u.id,
              coalesce(u.display_name, split_part(u.email, '@', 1)) as name,
              u.avatar_url,
              p.last_read_at,
              p.last_delivered_at
         from conversation_participants p
         join users u on u.id = p.user_id
        where p.conversation_id = $1
        order by name`,
      [conversationId],
    );
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
      // still counts as unread; it just does not interrupt.
      const recipients = await this.db.query<{ user_id: string }>(
        `select user_id from conversation_participants
          where conversation_id = $1
            and user_id <> $2
            and (muted_until is null or muted_until <= now())`,
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
