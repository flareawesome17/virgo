import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { FriendsService } from '../friends/friends.service';
import { PushService } from '../notifications/push.service';

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
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: Date;
  sender_name?: string;
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
  ) {}

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

  /** The caller's conversations, most recently active first. */
  async conversations(userId: string): Promise<ConversationSummary[]> {
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
                  and (me.last_read_at is null or m.created_at > me.last_read_at)
              ) as unread
         from conversations c
         join conversation_participants me
           on me.conversation_id = c.id and me.user_id = $1
         left join lateral (
           select m.body, m.created_at,
                  coalesce(u.display_name, split_part(u.email, '@', 1)) as sender_name
             from messages m
             join users u on u.id = m.sender_id
            where m.conversation_id = c.id
            order by m.created_at desc
            limit 1
         ) last on true
        order by coalesce(last.created_at, c.created_at) desc
        limit 100`,
      [userId],
    );

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
    }));
  }

  async messages(
    userId: string,
    conversationId: string,
    limit = 100,
  ): Promise<MessageRow[]> {
    await this.assertMember(userId, conversationId);
    return this.db.query<MessageRow>(
      `select m.*, coalesce(u.display_name, split_part(u.email, '@', 1)) as sender_name
         from messages m
         join users u on u.id = m.sender_id
        where m.conversation_id = $1
        order by m.created_at desc
        limit $2`,
      [conversationId, Math.min(Math.max(limit, 1), 200)],
    );
  }

  async send(
    userId: string,
    conversationId: string,
    body: string,
  ): Promise<MessageRow> {
    await this.assertMember(userId, conversationId);

    const text = body.trim();
    if (!text) throw new BadRequestException('Message cannot be empty');

    const row = await this.db.queryOne<MessageRow>(
      `insert into messages (conversation_id, sender_id, body)
       values ($1, $2, $3) returning *`,
      [conversationId, userId, text],
    );

    // Bumps the conversation so the list re-sorts even before anyone reads it.
    await this.db.query('update conversations set updated_at = now() where id = $1', [
      conversationId,
    ]);

    await this.notify(userId, conversationId, text);
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
          and (p.last_read_at is null or m.created_at > p.last_read_at)`,
      [userId],
    );
    return Number(row?.count ?? 0);
  }

  /** People in a conversation. */
  async participants(userId: string, conversationId: string) {
    await this.assertMember(userId, conversationId);
    return this.db.query<{ id: string; name: string; avatar_url: string | null }>(
      `select u.id,
              coalesce(u.display_name, split_part(u.email, '@', 1)) as name,
              u.avatar_url
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

      const recipients = await this.db.query<{ user_id: string }>(
        `select user_id from conversation_participants
          where conversation_id = $1 and user_id <> $2`,
        [conversationId, senderId],
      );

      const title =
        meta?.is_group && meta.title
          ? `${meta.sender_name} · ${meta.title}`
          : (meta?.sender_name ?? 'New message');

      for (const r of recipients) {
        const tokens = await this.push.tokensFor(r.user_id);
        if (tokens.length === 0) continue;
        await this.push.send(
          tokens.map((to) => ({
            to,
            title,
            // Truncated: a preview should not spill a long message onto a lock
            // screen in full.
            body: body.length > 140 ? `${body.slice(0, 137)}…` : body,
            channelId: 'reminders',
            sound: 'default' as const,
            data: { type: 'message', conversationId },
          })),
        );
      }
    } catch {
      // Swallowed on purpose — see above.
    }
  }
}
