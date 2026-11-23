import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { MoneyPackagesService } from '../money/money-packages.service';
import { MoneyPayMethodsService } from '../money/money-pay-methods.service';
import { pesoText } from '../money/money-nudges.service';
import { MIRRORED_ACCEPTED_JOIN } from '../friends/friend-sql';
import { FriendsService } from '../friends/friends.service';
import { PushService } from '../notifications/push.service';
import { PresenceService } from '../realtime/presence.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { blockedBetween } from '../safety/block-sql';
import { BlocksService } from '../safety/blocks.service';
import { StorageService } from '../storage/storage.service';
import {
  ChatFilesService,
  MAX_CHAT_CAPTION,
  type ChatAttachment,
  type ChatUploadTicket,
  type NewChatFile,
} from '../storage/chat-files.service';
import type { CardKind } from './cards/card-kinds';
import { unreadMessagesCount } from './unread-sql';

/**
 * Fills in the cards somebody shared: an album's photos, a booking, a job
 * post, a post, a package, a date. Registered by ChatCardsService, which
 * reads from modules this one cannot import without a cycle (hiring and
 * bookings already import messages).
 */
export interface CardFiller {
  fill(rows: MessageRow[]): Promise<void>;
}

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
  /** Kept at the top of this person's list. */
  pinned: boolean;
  /** Moved out of the list until something new is said in it. */
  archived: boolean;
  /** Marked unread by hand, to come back to. Cleared when it is read. */
  markedUnread: boolean;
  /**
   * The message a search matched, when it matched one: what the list opens
   * the chat at. Null otherwise.
   */
  matchId: string | null;
  /** Groups only: the one line everyone sees at the top of group info. */
  about: string | null;
  /** Whether the caller is one of this group's admins. False on a direct chat. */
  isAdmin: boolean;
  /** Who can add people to this group. Direct chats say 'everyone' and take nobody. */
  addPolicy: AddPolicy;
  /**
   * What made this group, if anything did: a workspace's team chat or a job's
   * crew chat. `originTitle` is the workspace's name or the job's title, as it
   * is now; `originId` is the workspace's id or the job post's.
   */
  origin: GroupOrigin | null;
  originId: string | null;
  originTitle: string | null;
}

/** Who can add people to a group. */
export type AddPolicy = 'everyone' | 'admins';

/** What a group was made for: a workspace's team, or the people hired on a job. */
export type GroupOrigin = 'workspace' | 'crew';

/** Pinned messages one chat can hold. Everyone in it sees the same ones. */
export const MAX_PINNED_MESSAGES = 3;

/** How long a group's About can be. */
export const GROUP_ABOUT_MAX = 200;

/** Messages either side of the one a search or a pin opens the chat at. */
export const AROUND_EACH_SIDE = 20;

/** Most matches one search inside a chat lists, newest first. */
export const MAX_SEARCH_MATCHES = 200;

/** A group's settings an admin can change. Anything left out stays as it is. */
export interface GroupPatch {
  title?: string;
  about?: string | null;
  /** A public address of an image the admin uploaded, or null to take it off. */
  photoUrl?: string | null;
  addPolicy?: AddPolicy;
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
   * role and the booking rather than as a bubble. 'pay-card' is somebody
   * sending how to pay them: its context names their way to pay, and the
   * details are filled in fresh on every read (withPayCards). The rest are
   * things somebody shared from Virgo (CardKind), filled in the same way by
   * ChatCardsService.
   */
  kind?: 'text' | 'job-accepted' | 'pay-card' | 'notice' | 'photos' | 'file' | CardKind;
  /**
   * Photos and files sent from somebody's device, in order: on 'photos' and
   * 'file' messages only. One can still be `uploading` (the words go first on
   * a weak signal) and turns `ready` through a `message-edited` frame.
   */
  attachments?: ChatAttachment[];
  /** Whatever the card needs to render. Null on a typed message. */
  context?: Record<string, unknown> | null;
  /**
   * The id the sender's app gave the message before sending it. Lets that app
   * match the stored message to the bubble it drew while sending. Null on
   * anything sent before apps made one, and on system messages.
   */
  client_id?: string | null;
  /** When the sender last changed the words. Null on a message never edited. */
  edited_at?: Date | null;
  /** Sent with Forward rather than typed. */
  forwarded?: boolean;
  /**
   * Who reacted and with what, oldest first. One entry per person. The apps
   * count and group them, and name people from the participant list they
   * already hold.
   */
  reactions?: { userId: string; reaction: Reaction }[];
  /** When somebody pinned it for the chat. Null when it is not pinned. */
  pinned_at?: Date | null;
  /** Who pinned it. Only on the pins list. */
  pinned_by_name?: string | null;
}

/**
 * The reactions there are. A fixed set: six cover what a crew says with one
 * tap, and a seventh would be a picker nobody reads on a busy shoot day.
 * Keys rather than emoji — see migration 111.
 */
export const REACTIONS = ['like', 'love', 'haha', 'wow', 'sad', 'thanks'] as const;
export type Reaction = (typeof REACTIONS)[number];

/**
 * How long after sending you can still fix a message. Long enough to catch a
 * wrong time or a typo in a rate, short enough that nobody rewrites what the
 * other person already answered.
 */
export const EDIT_WINDOW_MINUTES = 15;

/** Chats one person can keep pinned at the top of their list. */
export const MAX_PINNED = 5;

/** Chats one Forward can go to at once. */
export const MAX_FORWARD_TARGETS = 5;

/** What one person can change about how a chat sits in their own list. */
export interface ListStatePatch {
  pinned?: boolean;
  archived?: boolean;
  markedUnread?: boolean;
}

/**
 * One message as every reader gets it: the sender's name, and a preview of
 * what it replies to.
 *
 * Shared by the thread, the live frame and the response to a send. The live
 * frame used to carry the bare inserted row, so a group's new line arrived
 * without a name and a reply arrived as "Message unavailable" until the next
 * refetch filled them in.
 */
const MESSAGE_COLUMNS = `m.id, m.conversation_id, m.sender_id, m.created_at,
                m.deleted_at, m.mentions, m.reply_to_id, m.kind, m.context, m.client_id,
                m.edited_at, m.forwarded, m.pinned_at,
                -- Every reaction on it, as one small array. The primary key
                -- starts with message_id, so this is an index lookup per row.
                coalesce((
                  select json_agg(json_build_object('userId', mr.user_id, 'reaction', mr.reaction)
                                  order by mr.created_at)
                    from message_reactions mr
                   where mr.message_id = m.id
                ), '[]'::json) as reactions,
                -- A tombstone carries no text. Cleared on delete, so this is
                -- belt and braces rather than the only thing hiding it.
                case when m.deleted_at is null then m.body else '' end as body,
                coalesce(u.display_name, split_part(u.email, '@', 1)) as sender_name,
                case when r.deleted_at is null then r.body else null end as reply_to_body,
                coalesce(ru.display_name, split_part(ru.email, '@', 1)) as reply_to_sender,
                (r.id is not null and r.deleted_at is not null) as reply_to_deleted`;

const MESSAGE_JOINS = `join users u on u.id = m.sender_id
           left join messages r on r.id = m.reply_to_id
           left join users ru on ru.id = r.sender_id`;

/** A wallet's name on a pay card's text line; a bank or "other" says its own. */
const PAY_KIND_NAMES: Record<string, string> = {
  gcash: 'GCash',
  maya: 'Maya',
  bank: 'Bank',
  other: 'Other',
};

/** What the conversation list can be narrowed or paged by. */
export interface ConversationsOptions {
  /** Matches a group name, a participant's name, or a message body. */
  q?: string;
  /** Just this one conversation. */
  id?: string;
  /**
   * The archived chats instead of the list. Ignored by a search, which looks
   * everywhere, and by a lookup of one chat by id.
   */
  archived?: boolean;
  limit?: number;
  offset?: number;
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
  /**
   * Only when the thread was asked for around one message: whether there are
   * messages newer than the newest one returned. False means it reaches the
   * newest message, and the app can carry on live from it.
   */
  hasNewer?: boolean;
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
  /** One of the group's admins. Always false in a direct chat. */
  is_admin: boolean;
  /** When they joined this chat: "in this group since Nov 12". */
  joined_at: Date;
  /** What they do, from their profile: role keys, then their own words. */
  roles: string[];
  custom_roles: string[];
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
    // Optional so a module without Money still builds; pay cards then show
    // as their plain text and cannot be sent.
    @Optional() private readonly payMethods?: MoneyPayMethodsService,
    @Optional() private readonly packages?: MoneyPackagesService,
    // Optional for the same reason: a group photo is checked against, and
    // tidied out of, the uploader's own avatars. Without it a photo cannot be
    // set and nothing is deleted.
    @Optional() private readonly storage?: StorageService,
    // Photos and files from people's phones (Phase 4). Without it they show
    // as their plain line and none can be sent.
    @Optional() private readonly chatFiles?: ChatFilesService,
  ) {}

  private readonly log = new Logger(MessagesService.name);

  private cardFiller: CardFiller | null = null;

  /** Called once by ChatCardsService as the app starts. */
  useCardFiller(filler: CardFiller): void {
    this.cardFiller = filler;
  }

  /**
   * Every card in these rows, filled in as it is now. A card that cannot be
   * filled says so in its own context rather than failing the thread: the
   * words around it still have to load.
   */
  private async withCards<T extends MessageRow>(rows: T[]): Promise<T[]> {
    await this.withPayCards(rows);
    await this.withFiles(rows);
    if (this.cardFiller && rows.some((r) => r.kind && r.kind !== 'text' && r.kind !== 'notice')) {
      await this.cardFiller.fill(rows);
    }
    return rows;
  }

  /**
   * Fills each pay card with its sender's way to pay as it is now: the
   * details, a fresh link to the QR, and when they last changed. A card whose
   * way to pay was removed, or that names one its sender does not own, gets
   * `method: null`. A card deleted for everyone keeps nothing.
   */
  private async withPayCards<T extends MessageRow>(rows: T[]): Promise<T[]> {
    const cards = rows.filter((r) => r.kind === 'pay-card');
    if (cards.length === 0) return rows;
    const ids = cards
      .map((r) => r.context?.payMethodId)
      .filter((id): id is string => typeof id === 'string');
    const found = this.payMethods ? await this.payMethods.cardsByIds(ids) : new Map();
    for (const row of cards) {
      if (row.deleted_at) {
        row.context = null;
        continue;
      }
      const id = row.context?.payMethodId;
      const card = typeof id === 'string' ? found.get(id) : undefined;
      // Only the sender's own: a card cannot show somebody else's account.
      const method =
        card && card.ownerId === row.sender_id
          ? {
              id: card.id,
              kind: card.kind,
              label: card.label,
              accountName: card.accountName,
              accountNumber: card.accountNumber,
              qrUrl: card.qrUrl,
              detailsChangedAt: card.detailsChangedAt,
            }
          : null;
      row.context = { ...row.context, method };
    }
    return rows;
  }

  /**
   * The photos and files on these rows, in order. An unsent one keeps none,
   * whatever an open report is still holding on to.
   */
  private async withFiles<T extends MessageRow>(rows: T[]): Promise<T[]> {
    const carrying = rows.filter((r) => r.kind === 'photos' || r.kind === 'file');
    if (carrying.length === 0) return rows;
    const live = carrying.filter((r) => !r.deleted_at);
    const found = this.chatFiles
      ? await this.chatFiles.forMessages(live.map((r) => r.id))
      : new Map<string, ChatAttachment[]>();
    for (const row of carrying) {
      row.attachments = row.deleted_at ? [] : (found.get(row.id) ?? []);
      if (row.deleted_at) row.context = null;
    }
    return rows;
  }

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
   *
   * And said out loud, like a read. The receipt was written and never
   * announced, so a sender's ticks only moved when their own app happened to
   * refetch the thread — "delivered" in practice never showed. Each
   * conversation whose receipt moved now tells the people in it.
   */
  private async markDelivered(userId: string, conversationId?: string): Promise<void> {
    try {
      const moved = await this.db.query<{ conversation_id: string }>(
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
                )
          returning p.conversation_id`,
        [userId, conversationId ?? null],
      );
      const at = new Date().toISOString();
      for (const { conversation_id } of moved) {
        // Not across a block, the same as a read.
        this.realtime.emitToUsers(await this.participantIdsVisibleTo(conversation_id, userId), {
          type: 'delivered',
          conversationId: conversation_id,
          userId,
          at,
        });
      }
    } catch {
      // Swallowed on purpose — see above.
    }
  }

  /**
   * Tells people a conversation changed under them: it was created, renamed,
   * gained or lost a member, or was muted or removed on another of their
   * devices.
   *
   * The frame carries only the id. Each client refetches what it shows, so
   * none of the detail is decided twice. Group changes waited for the
   * sixty-second poll before this: someone added to a group did not see it
   * until then, and a rename did not show on anyone else's phone.
   */
  private announce(userIds: readonly string[], conversationId: string): void {
    if (userIds.length === 0) return;
    this.realtime.emitToUsers([...new Set(userIds)], { type: 'conversation', conversationId });
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

    const created = await this.db.transaction(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `insert into conversations (is_group, title, created_by)
         values (true, $1, $2) returning id`,
        [name, userId],
      );
      const id = rows[0].id;
      // Whoever makes a group is its admin.
      await client.query(
        `insert into conversation_participants (conversation_id, user_id, is_admin)
         select $1, m, m = $3::uuid from unnest($2::uuid[]) m`,
        [id, [userId, ...unique], userId],
      );
      return { id };
    });
    this.announce([userId, ...unique], created.id);
    return created;
  }

  /**
   * Makes a group that belongs to something: a workspace's team chat or a
   * job's crew chat. For ChatCrewService, never a request.
   *
   * No friend check, unlike createGroup. Being in the workspace, or hired on
   * the job, is what puts somebody here, and a crew is not all friends with
   * each other. Two members across a block are silenced towards each other,
   * as in any group they share. The maker is its admin; only admins add
   * people. One per workspace and one per job: a second call while the first
   * is still writing finds the first one's chat and returns it.
   */
  async createLinkedGroup(input: {
    createdBy: string;
    title: string;
    memberIds: string[];
    workspaceId?: string;
    hiringPostId?: string;
  }): Promise<{ id: string; created: boolean }> {
    const members = [...new Set([input.createdBy, ...input.memberIds])];
    const made = await this.db.transaction(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `insert into conversations (is_group, title, created_by, workspace_id, hiring_post_id, add_policy)
         values (true, $1, $2, $3, $4, 'admins')
         on conflict do nothing
         returning id`,
        [input.title.trim() || 'Group', input.createdBy, input.workspaceId ?? null, input.hiringPostId ?? null],
      );
      if (rows.length === 0) return null;
      await client.query(
        `insert into conversation_participants (conversation_id, user_id, is_admin)
         select $1, m, m = $3::uuid from unnest($2::uuid[]) m`,
        [rows[0].id, members, input.createdBy],
      );
      return rows[0].id;
    });
    if (made) {
      this.announce(members, made);
      return { id: made, created: true };
    }
    const existing = await this.db.queryOne<{ id: string }>(
      `select id from conversations
        where ($1::text is not null and workspace_id = $1)
           or ($2::uuid is not null and hiring_post_id = $2)
        limit 1`,
      [input.workspaceId ?? null, input.hiringPostId ?? null],
    );
    if (!existing) throw new ConflictException('That chat could not be made');
    return { id: existing.id, created: false };
  }

  /**
   * Puts somebody into a group because of something outside it: they joined
   * the workspace, or were hired on the job. For ChatCrewService. Writes the
   * notice when they were not already in it, and tells everyone.
   */
  async joinLinked(
    conversationId: string,
    userId: string,
    notice: string,
    context: Record<string, unknown>,
  ): Promise<boolean> {
    const rows = await this.db.query<{ user_id: string }>(
      `insert into conversation_participants (conversation_id, user_id)
       values ($1, $2)
       on conflict (conversation_id, user_id) do nothing
       returning user_id`,
      [conversationId, userId],
    );
    if (rows.length === 0) return false;
    await this.notice(conversationId, userId, notice, context);
    this.announce(await this.participantIds(conversationId), conversationId);
    return true;
  }

  /**
   * Takes somebody out of a group because of something outside it: they left
   * the workspace, or their booking on the job was cancelled. For
   * ChatCrewService. Nothing happens when they were not in it.
   */
  async departLinked(
    conversationId: string,
    userId: string,
    notice: string,
    context: Record<string, unknown>,
  ): Promise<boolean> {
    return this.depart(conversationId, userId, notice, context);
  }

  /** A notice from ChatCrewService: "Team chat for Santos Studio…". */
  async postNotice(
    conversationId: string,
    senderId: string,
    body: string,
    context: Record<string, unknown>,
  ): Promise<void> {
    await this.notice(conversationId, senderId, body, context);
  }

  /** A team chat takes its workspace's new name. For ChatCrewService. */
  async renameLinked(conversationId: string, title: string): Promise<void> {
    const name = title.trim();
    if (!name) return;
    await this.db.query('update conversations set title = $2 where id = $1', [
      conversationId,
      name.slice(0, 120),
    ]);
    this.announce(await this.participantIds(conversationId), conversationId);
  }

  /**
   * Writes a notice: the chat saying who joined, left, was added or removed.
   *
   * From the person it is about (or who did it), so an app from before
   * notices shows it as a line from them that still reads right. Never
   * pushed and never counted as unread; it still bumps the chat in the list,
   * since something did happen in it, and it does not bring a chat back out
   * of anybody's archive.
   */
  private async notice(
    conversationId: string,
    senderId: string,
    body: string,
    context: Record<string, unknown>,
  ): Promise<void> {
    try {
      const inserted = await this.db.queryOne<{ id: string }>(
        `insert into messages (conversation_id, sender_id, body, kind, context)
         values ($1, $2, $3, 'notice', $4::jsonb) returning id`,
        [conversationId, senderId, body.trim().slice(0, 4000), JSON.stringify(context)],
      );
      const row = await this.joinedMessage(inserted!.id);
      // Everyone in it, the way a card the app writes goes: a notice says
      // nothing a block should keep from anyone.
      this.realtime.emitToUsers(await this.participantIds(conversationId), {
        type: 'message',
        conversationId,
        message: row,
      });
    } catch (err) {
      // The membership change stands; a missing line about it is the lesser
      // problem.
      this.log.warn(`Could not write a notice in ${conversationId}: ${String(err)}`);
    }
  }

  /** "Ana Lim", as everywhere else names people. */
  private async nameOf(userId: string): Promise<string> {
    const row = await this.db.queryOne<{ name: string }>(
      `select coalesce(display_name, split_part(email, '@', 1)) as name from users where id = $1`,
      [userId],
    );
    return row?.name ?? 'Someone';
  }

  /**
   * A group, and where the caller stands in it. Throws Not Found for a chat
   * they are not in, and Bad Request for a direct chat.
   */
  private async groupFor(
    userId: string,
    conversationId: string,
  ): Promise<{
    isAdmin: boolean;
    addPolicy: AddPolicy;
    workspaceId: string | null;
    hiringPostId: string | null;
    /** Who cannot be removed or lose admin here: the workspace's owner, the job's poster. */
    anchorId: string | null;
    photoUrl: string | null;
  }> {
    const row = await this.db.queryOne<{
      is_group: boolean;
      is_admin: boolean;
      add_policy: AddPolicy;
      workspace_id: string | null;
      hiring_post_id: string | null;
      anchor_id: string | null;
      photo_url: string | null;
    }>(
      `select c.is_group, me.is_admin, c.add_policy, c.workspace_id, c.hiring_post_id, c.photo_url,
              coalesce((select w.user_id from workspaces w where w.id = c.workspace_id),
                       (select hp.user_id from hiring_posts hp where hp.id = c.hiring_post_id)) as anchor_id
         from conversations c
         join conversation_participants me on me.conversation_id = c.id and me.user_id = $2
        where c.id = $1`,
      [conversationId, userId],
    );
    if (!row) throw new NotFoundException('Conversation not found');
    if (!row.is_group) throw new BadRequestException('That only works in a group');
    return {
      isAdmin: row.is_admin,
      addPolicy: row.add_policy,
      workspaceId: row.workspace_id,
      hiringPostId: row.hiring_post_id,
      anchorId: row.anchor_id,
      photoUrl: row.photo_url,
    };
  }

  /**
   * Takes somebody out of a group, keeping it with an admin: when the last
   * admin goes, whoever has been in it longest becomes one. Writes the notice
   * and tells everyone who was in it, the person leaving included, so it
   * leaves their list.
   */
  private async depart(
    conversationId: string,
    userId: string,
    notice: string,
    context: Record<string, unknown>,
    /** Who the notice is from: the person leaving, or the admin who removed them. */
    noticeFrom: string = userId,
  ): Promise<boolean> {
    const members = await this.participantIds(conversationId);
    if (!members.includes(userId)) return false;
    await this.db.transaction(async (client) => {
      await client.query(
        `delete from conversation_participants
          where conversation_id = $1 and user_id = $2`,
        [conversationId, userId],
      );
      await client.query(
        `update conversation_participants p
            set is_admin = true
          where p.conversation_id = $1
            and not exists (select 1 from conversation_participants a
                             where a.conversation_id = $1 and a.is_admin)
            and p.user_id = (select p2.user_id from conversation_participants p2
                              where p2.conversation_id = $1
                              order by p2.joined_at, p2.user_id
                              limit 1)`,
        [conversationId],
      );
    });
    if (members.length > 1) await this.notice(conversationId, noticeFrom, notice, context);
    this.announce(members, conversationId);
    return true;
  }

  /**
   * Adds someone to an existing group. Members can invite their own friends,
   * unless the group lets only its admins add people.
   */
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
    const group = await this.groupFor(userId, conversationId);
    if (group.addPolicy === 'admins' && !group.isAdmin) {
      throw new ForbiddenException('Only admins can add people to this group');
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
    // Everyone now in it, the person added included: the group appears in
    // their list, and everyone else's member count and names move.
    if (rows.length > 0) {
      const [actor, added] = await Promise.all([this.nameOf(userId), this.nameOf(memberId)]);
      await this.notice(conversationId, userId, `${actor} added ${added}`, {
        event: 'added',
        actorId: userId,
        subjectId: memberId,
      });
      this.announce(await this.participantIds(conversationId), conversationId);
    }
    return { added: rows.length > 0 };
  }

  /**
   * Makes a member an admin, or stops them being one. Admins only.
   *
   * A group always keeps at least one admin, and a team chat's workspace
   * owner and a crew chat's poster are always admins of it.
   */
  async setAdmin(
    userId: string,
    conversationId: string,
    memberId: string,
    admin: boolean,
  ): Promise<{ isAdmin: boolean }> {
    const group = await this.groupFor(userId, conversationId);
    if (!group.isAdmin) throw new ForbiddenException('Only admins can change who is an admin');
    const target = await this.db.queryOne<{ is_admin: boolean }>(
      `select is_admin from conversation_participants
        where conversation_id = $1 and user_id = $2`,
      [conversationId, memberId],
    );
    if (!target) throw new NotFoundException('They are not in this group');
    if (target.is_admin === admin) return { isAdmin: admin };

    if (!admin) {
      if (memberId === group.anchorId) {
        throw new BadRequestException(
          group.workspaceId
            ? "The workspace's owner is always an admin of its team chat"
            : 'Whoever posted the job is always an admin of its crew chat',
        );
      }
      const others = await this.db.queryOne<{ count: string }>(
        `select count(*)::text as count from conversation_participants
          where conversation_id = $1 and is_admin and user_id <> $2`,
        [conversationId, memberId],
      );
      if (Number(others?.count ?? 0) === 0) {
        throw new BadRequestException('Make someone else an admin first');
      }
    }

    await this.db.query(
      `update conversation_participants set is_admin = $3
        where conversation_id = $1 and user_id = $2`,
      [conversationId, memberId, admin],
    );
    this.announce(await this.participantIds(conversationId), conversationId);
    return { isAdmin: admin };
  }

  /**
   * Takes somebody out of a group. Admins only, and not themselves (that is
   * leaving). They stop seeing new messages, and the chat says they were
   * removed. A team chat's workspace owner and a crew chat's poster stay.
   */
  async removeMember(
    userId: string,
    conversationId: string,
    memberId: string,
  ): Promise<{ removed: boolean }> {
    if (memberId === userId) throw new BadRequestException('Leave the group instead');
    const group = await this.groupFor(userId, conversationId);
    if (!group.isAdmin) throw new ForbiddenException('Only admins can remove people');
    if (memberId === group.anchorId) {
      throw new BadRequestException(
        group.workspaceId
          ? "The workspace's owner can't be removed from its team chat"
          : "Whoever posted the job can't be removed from its crew chat",
      );
    }
    const [actor, removed] = await Promise.all([this.nameOf(userId), this.nameOf(memberId)]);
    const gone = await this.depart(
      conversationId,
      memberId,
      `${actor} removed ${removed}`,
      { event: 'removed', actorId: userId, subjectId: memberId },
      userId,
    );
    if (!gone) throw new NotFoundException('They are not in this group');
    return { removed: true };
  }

  /**
   * Changes a group's name, About, photo, or who can add people. Admins only.
   *
   * A team chat is named after its workspace, so renaming the workspace is
   * what renames it. A photo must be one the admin uploaded to their own
   * avatars, which is where the apps put it; the one it replaces is deleted,
   * unless something else still shows it.
   */
  async updateGroup(
    userId: string,
    conversationId: string,
    patch: GroupPatch,
  ): Promise<{ id: string; title: string; about: string | null; photoUrl: string | null; addPolicy: AddPolicy }> {
    const group = await this.groupFor(userId, conversationId);
    if (!group.isAdmin) {
      throw new ForbiddenException("Only admins can change this group's details");
    }

    const sets: string[] = [];
    const params: unknown[] = [conversationId];
    const set = (column: string, value: unknown) => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };

    if (patch.title !== undefined) {
      const name = patch.title.trim();
      if (!name) throw new BadRequestException('Give the group a name');
      if (group.workspaceId) {
        throw new BadRequestException(
          'This chat is named after its workspace. Rename the workspace to rename it.',
        );
      }
      set('title', name.slice(0, 120));
    }
    if (patch.about !== undefined) {
      const about = patch.about?.trim() ?? '';
      if (about.length > GROUP_ABOUT_MAX) {
        throw new BadRequestException(`Keep it to ${GROUP_ABOUT_MAX} characters`);
      }
      set('about', about || null);
    }
    if (patch.photoUrl !== undefined) {
      if (patch.photoUrl !== null) {
        const key = this.storage?.keyFromPublicUrl(patch.photoUrl);
        if (!key || !key.startsWith(`users/${userId}/avatars/`)) {
          throw new BadRequestException('Upload the photo from the app, then set it');
        }
      }
      set('photo_url', patch.photoUrl);
    }
    if (patch.addPolicy !== undefined) set('add_policy', patch.addPolicy);
    if (sets.length === 0) throw new BadRequestException('Nothing to change');

    const row = await this.db.queryOne<{
      title: string | null;
      about: string | null;
      photo_url: string | null;
      add_policy: AddPolicy;
    }>(
      `update conversations set ${sets.join(', ')}
        where id = $1
        returning title, about, photo_url, add_policy`,
      params,
    );
    if (patch.photoUrl !== undefined && group.photoUrl && group.photoUrl !== row?.photo_url) {
      await this.discardGroupPhoto(group.photoUrl);
    }
    this.announce(await this.participantIds(conversationId), conversationId);
    return {
      id: conversationId,
      title: row?.title ?? 'Group',
      about: row?.about ?? null,
      photoUrl: row?.photo_url ?? null,
      addPolicy: row?.add_policy ?? 'everyone',
    };
  }

  /**
   * Deletes the object a replaced group photo was, from the avatars of
   * whoever uploaded it. Not while anything still shows it — another group,
   * or somebody's profile — and never fatal: the group has its new photo.
   */
  private async discardGroupPhoto(url: string): Promise<void> {
    try {
      const key = this.storage?.keyFromPublicUrl(url);
      const owner = key ? /^users\/([^/]+)\/avatars\//.exec(key)?.[1] : null;
      if (!this.storage || !key || !owner) return;
      const used = await this.db.queryOne<{ used: boolean }>(
        `select exists (select 1 from conversations where photo_url = $1)
             or exists (select 1 from users where avatar_url = $1) as used`,
        [url],
      );
      if (used?.used) return;
      await this.storage.deleteObject(owner, key);
    } catch (err) {
      this.log.warn(`Could not remove a replaced group photo: ${String(err)}`);
    }
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
    // Only the caller: muting is theirs, and their other devices show it.
    this.announce([userId], conversationId);
    return { muted: !!until && until.getTime() > Date.now(), mutedUntil: until };
  }

  /**
   * Renames a group. Its admins may, since groups have admins: any member
   * could before, and a crew chat renamed by whoever happened to tap it is
   * the kind of thing admins exist to stop. A direct chat is titled from the
   * other person, so a stored title would never be shown.
   */
  async rename(
    userId: string,
    conversationId: string,
    title: string,
  ): Promise<{ id: string; title: string }> {
    const updated = await this.updateGroup(userId, conversationId, { title });
    return { id: updated.id, title: updated.title };
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
      await this.depart(conversationId, userId, `${await this.nameOf(userId)} left`, {
        event: 'left',
        subjectId: userId,
      });
      return { deleted: true, left: true };
    }

    await this.db.query(
      `update conversation_participants
          set cleared_at = now(), last_read_at = now()
        where conversation_id = $1 and user_id = $2`,
      [conversationId, userId],
    );
    // Only the caller. The other person's thread is untouched by this.
    this.announce([userId], conversationId);
    return { deleted: true, left: false };
  }

  /**
   * Leaving deletes only your membership; the conversation survives. A group
   * says so, and keeps an admin.
   */
  async leave(userId: string, conversationId: string): Promise<{ left: boolean }> {
    await this.assertMember(userId, conversationId);
    const convo = await this.db.queryOne<{ is_group: boolean }>(
      'select is_group from conversations where id = $1',
      [conversationId],
    );
    if (convo?.is_group) {
      await this.depart(conversationId, userId, `${await this.nameOf(userId)} left`, {
        event: 'left',
        subjectId: userId,
      });
      return { left: true };
    }
    const members = await this.participantIds(conversationId);
    await this.db.query(
      `delete from conversation_participants
        where conversation_id = $1 and user_id = $2`,
      [conversationId, userId],
    );
    this.announce(members, conversationId);
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
  async conversations(
    userId: string,
    options: ConversationsOptions = {},
  ): Promise<ConversationSummary[]> {
    const q = options.q;
    const term = q?.trim() ? `%${q.trim()}%` : null;
    const only = options.id ?? null;
    const archived = options.archived === true;
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 100);
    const offset = Math.max(options.offset ?? 0, 0);

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
      match_id: string | null;
      muted_until: Date | null;
      other_blocked: boolean;
      pinned_at: Date | null;
      archived_at: Date | null;
      marked_unread: boolean;
      photo_url: string | null;
      about: string | null;
      add_policy: AddPolicy;
      workspace_id: string | null;
      hiring_post_id: string | null;
      is_admin: boolean;
      origin_title: string | null;
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
                  -- "Jo joined" is never something to read.
                  and m.kind <> 'notice'
                  and (me.cleared_at is null or m.created_at > me.cleared_at)
                  and (me.last_read_at is null or m.created_at > me.last_read_at)
                  and not exists (
                        select 1 from message_deletions d
                         where d.message_id = m.id and d.user_id = $1
                      )
                  and not ${blockedBetween('$1', 'm.sender_id')}
              ) as unread,
              hit.body as match_body,
              hit.id as match_id,
              me.muted_until,
              me.pinned_at,
              me.archived_at,
              me.marked_unread,
              c.photo_url,
              c.about,
              c.add_policy,
              c.workspace_id,
              c.hiring_post_id,
              me.is_admin,
              -- The workspace's name or the job's title as they are now: "From
              -- your Santos Wedding job".
              coalesce((select w.name from workspaces w where w.id = c.workspace_id),
                       (select hp.title from hiring_posts hp where hp.id = c.hiring_post_id))
                as origin_title,
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
           -- A card's body is its line and then its link, for apps without
           -- cards; the list shows the line alone.
           select case when m.deleted_at is not null then 'Message deleted'
                       when m.kind <> 'text' then split_part(m.body, chr(10), 1)
                       else m.body end as body,
                  m.created_at,
                  -- A notice names its people itself: "Jo joined", not "Jo: Jo joined".
                  case when m.kind = 'notice' then null
                       else coalesce(u.display_name, split_part(u.email, '@', 1)) end as sender_name
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
           select m.id, m.body
             from messages m
            where $2::text is not null
              and m.conversation_id = c.id
              and m.deleted_at is null
              and m.kind <> 'notice'
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
          (me.cleared_at is null or last.created_at is not null or $3::uuid is not null)
          -- One conversation by id, for a thread whose row is not on the
          -- first page of the list. Asked for by id, it is found even when
          -- deleted from the list: the thread itself is still open.
          and ($3::uuid is null or c.id = $3)
          -- The list, or the archived chats. A search and a lookup by id find
          -- a chat wherever it is kept.
          and (
            $3::uuid is not null
            or $2::text is not null
            or (me.archived_at is not null) = $6::boolean
          )
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
        -- Pinned chats first, then by activity. The id breaks ties, so a page
        -- boundary between two rows with the same time cannot show one of
        -- them twice and the other never.
        order by (me.pinned_at is not null) desc,
                 coalesce(last.created_at, c.created_at) desc, c.id desc
        limit $4 offset $5`,
      [userId, term, only, limit, offset, archived],
    );

    // Listing conversations is proof their messages reached this device.
    await this.markDelivered(userId, only ?? undefined);

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
      // A group shows the photo an admin set, or nothing (the apps draw its
      // initial). Not a team chat's workspace cover: that comes from an album
      // some of the team may not be allowed to open.
      avatarUrl: r.is_group ? r.photo_url : r.other_avatar,
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
      pinned: !!r.pinned_at,
      archived: !!r.archived_at,
      markedUnread: r.marked_unread === true,
      matchId: r.match_id,
      about: r.is_group ? r.about : null,
      isAdmin: r.is_group && r.is_admin === true,
      addPolicy: r.is_group ? r.add_policy : 'everyone',
      origin: r.workspace_id ? 'workspace' : r.hiring_post_id ? 'crew' : null,
      originId: r.workspace_id ?? r.hiring_post_id ?? null,
      originTitle: r.workspace_id || r.hiring_post_id ? r.origin_title : null,
    }));
  }

  /**
   * How many chats are waiting in Archived, for the row at the top of the
   * list. Counted the way the list shows them: one deleted from the list and
   * quiet since does not count.
   */
  async archivedCount(userId: string): Promise<number> {
    const row = await this.db.queryOne<{ count: string }>(
      `select count(*)::text as count
         from conversation_participants me
        where me.user_id = $1
          and me.archived_at is not null
          and (me.cleared_at is null
               or exists (select 1 from messages m
                           where m.conversation_id = me.conversation_id
                             and m.created_at > me.cleared_at))`,
      [userId],
    );
    return Number(row?.count ?? 0);
  }

  /**
   * Pins, archives or marks a chat unread, for the caller only.
   *
   * Pinned and archived exclude each other: a chat pinned to the top of the
   * list cannot also be out of it. Archiving unpins; pinning brings it back.
   */
  async setListState(
    userId: string,
    conversationId: string,
    patch: ListStatePatch,
  ): Promise<{ pinned: boolean; archived: boolean; markedUnread: boolean }> {
    await this.assertMember(userId, conversationId);

    if (patch.pinned === true) {
      const row = await this.db.queryOne<{ count: string }>(
        `select count(*)::text as count from conversation_participants
          where user_id = $1 and pinned_at is not null and conversation_id <> $2`,
        [userId, conversationId],
      );
      if (Number(row?.count ?? 0) >= MAX_PINNED) {
        throw new BadRequestException(`You can pin up to ${MAX_PINNED} chats`);
      }
    }

    const sets: string[] = [];
    if (patch.pinned !== undefined) {
      // Keeps the original time when pinned twice, so the order holds.
      sets.push(patch.pinned ? 'pinned_at = coalesce(pinned_at, now())' : 'pinned_at = null');
      if (patch.pinned) sets.push('archived_at = null');
    }
    if (patch.archived !== undefined) {
      sets.push(patch.archived ? 'archived_at = coalesce(archived_at, now())' : 'archived_at = null');
      if (patch.archived) sets.push('pinned_at = null');
    }
    if (patch.markedUnread !== undefined) {
      sets.push(`marked_unread = ${patch.markedUnread ? 'true' : 'false'}`);
    }
    if (sets.length === 0) throw new BadRequestException('Nothing to change');

    const row = await this.db.queryOne<{
      pinned_at: Date | null;
      archived_at: Date | null;
      marked_unread: boolean;
    }>(
      `update conversation_participants set ${sets.join(', ')}
        where conversation_id = $1 and user_id = $2
        returning pinned_at, archived_at, marked_unread`,
      [conversationId, userId],
    );
    // Only the caller: their other devices move the row too.
    this.announce([userId], conversationId);
    return {
      pinned: !!row?.pinned_at,
      archived: !!row?.archived_at,
      markedUnread: row?.marked_unread === true,
    };
  }

  /** One conversation as the list shows it, for a thread opened from anywhere. */
  async conversation(userId: string, conversationId: string): Promise<ConversationSummary> {
    const [row] = await this.conversations(userId, { id: conversationId, limit: 1 });
    if (!row) throw new NotFoundException('Conversation not found');
    return row;
  }

  async messages(
    userId: string,
    conversationId: string,
    limit = 100,
    /**
     * Only messages older than this one, for paging back. By id rather than a
     * timestamp: (created_at, id) is compared exactly, so two messages sent in
     * the same millisecond are never skipped at a page boundary.
     */
    before?: string,
    /**
     * Only messages newer than this one: catching up after a dropped
     * connection without downloading the newest page again. Still newest
     * first and still capped at `limit`; a full page back means there may be
     * a gap, and the app fetches the newest page instead.
     */
    after?: string,
    /**
     * A message to open the chat at: the one a search matched, or a pin. The
     * messages around it, AROUND_EACH_SIDE either way, still newest first,
     * with `hasNewer` saying whether the newest of them is the chat's newest.
     * Not with `before` or `after`; `limit` does not apply.
     */
    around?: string,
  ): Promise<Thread> {
    const state = await this.sendState(conversationId, userId);

    if (around) {
      const visible = `m.conversation_id = $1
            and not exists (select 1 from message_deletions d
                             where d.message_id = m.id and d.user_id = $2)
            and (me.cleared_at is null or m.created_at > me.cleared_at)`;
      const anchor = await this.db.queryOne<{ created_at: Date; id: string }>(
        `select m.created_at, m.id
           from messages m
           join conversation_participants me
             on me.conversation_id = m.conversation_id and me.user_id = $2
          where m.id = $3 and ${visible}`,
        [conversationId, userId, around],
      );
      if (!anchor) throw new NotFoundException('That message is not in this chat any more');
      const [older, newer, me] = await Promise.all([
        this.db.query<MessageRow>(
          `select ${MESSAGE_COLUMNS}
             from messages m
             join conversation_participants me
               on me.conversation_id = m.conversation_id and me.user_id = $2
             ${MESSAGE_JOINS}
            where ${visible}
              and (m.created_at, m.id) <= (select a.created_at, a.id from messages a where a.id = $3)
            order by m.created_at desc, m.id desc
            limit $4`,
          [conversationId, userId, anchor.id, AROUND_EACH_SIDE + 1],
        ),
        this.db.query<MessageRow>(
          `select ${MESSAGE_COLUMNS}
             from messages m
             join conversation_participants me
               on me.conversation_id = m.conversation_id and me.user_id = $2
             ${MESSAGE_JOINS}
            where ${visible}
              and (m.created_at, m.id) > (select a.created_at, a.id from messages a where a.id = $3)
            order by m.created_at asc, m.id asc
            limit $4`,
          [conversationId, userId, anchor.id, AROUND_EACH_SIDE + 1],
        ),
        this.db.queryOne<{ last_read_at: Date | null }>(
          `select last_read_at from conversation_participants
            where conversation_id = $1 and user_id = $2`,
          [conversationId, userId],
        ),
      ]);
      const hasNewer = newer.length > AROUND_EACH_SIDE;
      const rows = [...newer.slice(0, AROUND_EACH_SIDE).reverse(), ...older];
      const blockedByMe = !state.isGroup && !!state.myBlockId;
      return {
        messages: await this.withCards(rows),
        lastReadAt: me?.last_read_at ?? null,
        canSend: !frozen(state),
        blockedByMe,
        blockId: blockedByMe ? state.myBlockId : null,
        hasNewer,
      };
    }

    const [messages, me] = await Promise.all([
      this.db.query<MessageRow>(
        `select ${MESSAGE_COLUMNS}
           from messages m
           ${MESSAGE_JOINS}
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
            -- Paging back. A cursor from another conversation matches no row,
            -- so the comparison is null and the page is empty.
            and (
                  $4::uuid is null
                  or (m.created_at, m.id) < (
                       select b.created_at, b.id from messages b
                        where b.id = $4 and b.conversation_id = $1
                     )
                )
            -- Catching up: only what is newer than the app's newest.
            and (
                  $5::uuid is null
                  or (m.created_at, m.id) > (
                       select a.created_at, a.id from messages a
                        where a.id = $5 and a.conversation_id = $1
                     )
                )
          order by m.created_at desc, m.id desc
          limit $2`,
        [conversationId, Math.min(Math.max(limit, 1), 200), userId, before ?? null, after ?? null],
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
      messages: await this.withCards(messages),
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

    const message = await this.db.queryOne<{
      sender_id: string;
      deleted_at: Date | null;
      kind: string;
      pinned_at: Date | null;
    }>(
      'select sender_id, deleted_at, kind, pinned_at from messages where id = $1 and conversation_id = $2',
      [messageId, conversationId],
    );
    if (!message) throw new NotFoundException('Message not found');

    if (scope === 'everyone') {
      // A notice is the chat's own record of who came and went, even though
      // an older app draws it as the person's own line.
      if (message.kind === 'notice') {
        throw new BadRequestException("That can't be deleted for everyone");
      }
      if (message.sender_id !== userId) {
        throw new ForbiddenException('You can only delete your own messages for everyone');
      }
      if (!state.isGroup && state.theyBlockedMe) {
        throw refusal(
          'CHAT_UNAVAILABLE',
          "Messages in this conversation can't be deleted for everyone any more.",
        );
      }
      // Unsent also takes it off the pins, and takes its photos and files.
      await this.unsend(conversationId, messageId, message.pinned_at !== null, message.kind);
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

  /** One message, joined the way a reader sees it. */
  private async joinedMessage(messageId: string): Promise<MessageRow | null> {
    const row = await this.db.queryOne<MessageRow>(
      `select ${MESSAGE_COLUMNS}
         from messages m
         ${MESSAGE_JOINS}
        where m.id = $1`,
      [messageId],
    );
    return row ? (await this.withCards([row]))[0] : null;
  }

  /**
   * Brings an archived chat back into everyone's list. Something new was
   * said in it, and an archive that swallowed new messages would be a mute
   * nobody asked for.
   */
  private async unarchive(conversationId: string): Promise<void> {
    await this.db.query(
      `update conversation_participants set archived_at = null
        where conversation_id = $1 and archived_at is not null`,
      [conversationId],
    );
  }

  /**
   * A message the caller can see, or a 404. The same rules as the thread:
   * not hidden by "delete for me", not before they cleared the chat.
   */
  async visibleMessage(
    userId: string,
    conversationId: string,
    messageId: string,
  ): Promise<{
    id: string;
    sender_id: string;
    body: string;
    kind: string;
    context: Record<string, unknown> | null;
    deleted_at: Date | null;
    created_at: Date;
  }> {
    const row = await this.db.queryOne<{
      id: string;
      sender_id: string;
      body: string;
      kind: string;
      context: Record<string, unknown> | null;
      deleted_at: Date | null;
      created_at: Date;
    }>(
      `select m.id, m.sender_id, m.body, m.kind, m.context, m.deleted_at, m.created_at
         from messages m
         join conversation_participants me
           on me.conversation_id = m.conversation_id and me.user_id = $3
        where m.id = $1 and m.conversation_id = $2
          and (me.cleared_at is null or m.created_at > me.cleared_at)
          and not exists (select 1 from message_deletions d
                           where d.message_id = m.id and d.user_id = $3)`,
      [messageId, conversationId, userId],
    );
    if (!row) throw new NotFoundException('Message not found');
    return row;
  }

  /**
   * Reacts to a message, changes the reaction, or takes it back (`null`).
   *
   * One per person. Not on an unsent message, and not in a thread a block has
   * frozen — a reaction is a small message, and the same rule applies.
   * Nobody is pushed: a reaction is not worth a phone lighting up.
   */
  async react(
    userId: string,
    conversationId: string,
    messageId: string,
    reaction: Reaction | null,
  ): Promise<{ reactions: { userId: string; reaction: Reaction }[] }> {
    const state = await this.sendState(conversationId, userId);
    if (frozen(state)) {
      throw refusal('CHAT_UNAVAILABLE', "You can't react in this conversation.");
    }
    const message = await this.visibleMessage(userId, conversationId, messageId);
    if (message.deleted_at) throw new BadRequestException('That message was unsent');
    if (message.kind === 'notice') throw new BadRequestException("That can't be reacted to");

    if (reaction === null) {
      await this.db.query(
        'delete from message_reactions where message_id = $1 and user_id = $2',
        [messageId, userId],
      );
    } else {
      await this.db.query(
        `insert into message_reactions (message_id, user_id, reaction)
         values ($1, $2, $3)
         on conflict (message_id, user_id)
         do update set reaction = excluded.reaction, created_at = now()`,
        [messageId, userId, reaction],
      );
    }

    const rows = await this.db.query<{ user_id: string; reaction: Reaction }>(
      `select user_id, reaction from message_reactions
        where message_id = $1 order by created_at`,
      [messageId],
    );
    const reactions = rows.map((r) => ({ userId: r.user_id, reaction: r.reaction }));

    // Like a read, not across a block.
    this.realtime.emitToUsers(await this.participantIdsVisibleTo(conversationId, userId), {
      type: 'reaction',
      conversationId,
      messageId,
      userId,
      reaction,
    });
    return { reactions };
  }

  /**
   * Changes the words of your own message, within EDIT_WINDOW_MINUTES of
   * sending it.
   *
   * What it said before is kept in message_edits, so a report filed later
   * still has it. Only typed messages: a card is the app's own words.
   * Mentions are kept as they were unless the edit names people again;
   * nobody is pushed for an edit.
   */
  async edit(
    userId: string,
    conversationId: string,
    messageId: string,
    body: string,
    mentionIds?: string[],
  ): Promise<MessageRow> {
    const state = await this.sendState(conversationId, userId);
    if (frozen(state)) {
      throw refusal('CHAT_UNAVAILABLE', "You can't change messages in this conversation.");
    }
    const text = body.trim();
    if (!text) throw new BadRequestException('Message cannot be empty');

    const message = await this.visibleMessage(userId, conversationId, messageId);
    if (message.sender_id !== userId) {
      throw new ForbiddenException('You can only edit your own messages');
    }
    if (message.deleted_at) throw new BadRequestException('That message was unsent');
    if (message.kind !== 'text') throw new BadRequestException('That message cannot be edited');
    if (Date.now() - new Date(message.created_at).getTime() > EDIT_WINDOW_MINUTES * 60_000) {
      throw new BadRequestException(
        `Messages can be edited for ${EDIT_WINDOW_MINUTES} minutes after sending`,
      );
    }

    if (text !== message.body) {
      let mentions: string[] | null = null;
      if (mentionIds) {
        const rows = await this.db.query<{ user_id: string }>(
          `select p.user_id from conversation_participants p
            where p.conversation_id = $1
              and p.user_id = any($2::uuid[])
              and p.user_id <> $3
              and not ${blockedBetween('$3', 'p.user_id')}`,
          [conversationId, [...new Set(mentionIds)], userId],
        );
        mentions = rows.map((r) => r.user_id);
      }
      await this.db.transaction(async (client) => {
        await client.query(
          'insert into message_edits (message_id, body) values ($1, $2)',
          [messageId, message.body],
        );
        await client.query(
          `update messages
              set body = $2, edited_at = now(), mentions = coalesce($3::uuid[], mentions)
            where id = $1`,
          [messageId, text, mentions],
        );
      });
    }

    const row = (await this.joinedMessage(messageId))!;
    this.realtime.emitToUsers(await this.participantIdsVisibleTo(conversationId, userId), {
      type: 'message-edited',
      conversationId,
      message: row,
    });
    return row;
  }

  /**
   * Sends a message on to other chats, as the caller's own, marked Forwarded.
   *
   * Only typed messages for now. Each target must be a chat the caller is in
   * and can still write to; one that cannot be written to is skipped rather
   * than failing the rest, and the answer says how many went.
   */
  async forward(
    userId: string,
    conversationId: string,
    messageId: string,
    targetIds: string[],
  ): Promise<{ sent: number; skipped: number }> {
    const targets = [...new Set(targetIds)];
    if (targets.length === 0) throw new BadRequestException('Pick a chat to forward to');
    if (targets.length > MAX_FORWARD_TARGETS) {
      throw new BadRequestException(`Forward to up to ${MAX_FORWARD_TARGETS} chats at once`);
    }

    await this.assertMember(userId, conversationId);
    const message = await this.visibleMessage(userId, conversationId, messageId);
    if (message.deleted_at) throw new BadRequestException('That message was unsent');

    // Photos and a file go on as the forwarder's own copies, counted toward
    // their storage: the sender unsending theirs takes nothing from the chat
    // they were forwarded to.
    if (message.kind === 'photos' || message.kind === 'file') {
      const chatFiles = this.requireFiles();
      const caption =
        typeof message.context?.caption === 'string' ? message.context.caption : null;
      let copied = 0;
      let full: unknown = null;
      for (const target of targets) {
        try {
          await this.assertMember(userId, target);
          await this.assertCanSend(userId, target);
          const ids = await chatFiles.copyForForward(userId, messageId, target);
          await this.sendFiles(userId, target, { attachmentIds: ids, caption, forwarded: true });
          copied += 1;
        } catch (err) {
          // Not a member, frozen by a block, or out of room: that one is
          // skipped. Out of room is said, since nothing else will go either.
          const body = err instanceof HttpException ? err.getResponse() : null;
          if (body && typeof body === 'object' && (body as { code?: string }).code === 'STORAGE_FULL') {
            full = err;
          }
        }
      }
      if (copied === 0) {
        if (full) throw full;
        throw new BadRequestException("That couldn't be forwarded");
      }
      return { sent: copied, skipped: targets.length - copied };
    }
    if (message.kind !== 'text') {
      throw new BadRequestException('That message cannot be forwarded');
    }

    let sent = 0;
    for (const target of targets) {
      try {
        await this.send(userId, target, message.body, { forwarded: true });
        sent += 1;
      } catch {
        // Not a member, or frozen by a block: that one is skipped.
      }
    }
    if (sent === 0) throw new BadRequestException("That couldn't be forwarded");
    return { sent, skipped: targets.length - sent };
  }

  /**
   * The chat's pinned messages, newest pin first, filled in like the thread.
   * Shared by everyone in it; each reader sees the ones still in their own
   * thread, so a pin from before they cleared the chat does not show.
   */
  async pins(userId: string, conversationId: string): Promise<MessageRow[]> {
    await this.assertMember(userId, conversationId);
    const rows = await this.db.query<MessageRow>(
      `select ${MESSAGE_COLUMNS},
              coalesce(pu.display_name, split_part(pu.email, '@', 1)) as pinned_by_name
         from messages m
         join conversation_participants me
           on me.conversation_id = m.conversation_id and me.user_id = $2
         ${MESSAGE_JOINS}
         left join users pu on pu.id = m.pinned_by
        where m.conversation_id = $1
          and m.pinned_at is not null
          and m.deleted_at is null
          and (me.cleared_at is null or m.created_at > me.cleared_at)
          and not exists (select 1 from message_deletions d
                           where d.message_id = m.id and d.user_id = $2)
        order by m.pinned_at desc
        limit ${MAX_PINNED_MESSAGES}`,
      [conversationId, userId],
    );
    return this.withCards(rows);
  }

  /**
   * Pins a message for everyone in the chat. Anyone in it can, three at most:
   * a fourth needs `replace`, the pin to take down for it, and without one
   * the answer is a 409 the apps turn into "which one?". Not a notice, not an
   * unsent message, and not in a chat a block has frozen. Nobody is pushed.
   */
  async pin(
    userId: string,
    conversationId: string,
    messageId: string,
    replace?: string,
  ): Promise<{ pins: MessageRow[] }> {
    const state = await this.sendState(conversationId, userId);
    if (frozen(state)) throw refusal('CHAT_UNAVAILABLE', "You can't pin in this conversation.");
    const message = await this.visibleMessage(userId, conversationId, messageId);
    if (message.deleted_at) throw new BadRequestException('That message was unsent');
    if (message.kind === 'notice') throw new BadRequestException("That can't be pinned");

    await this.db.transaction(async (client) => {
      // One pin at a time per chat, so two people pinning a third and a
      // fourth at once cannot both get in.
      await client.query('select id from conversations where id = $1 for update', [conversationId]);
      const { rows } = await client.query<{ id: string }>(
        `select id from messages
          where conversation_id = $1 and pinned_at is not null and deleted_at is null`,
        [conversationId],
      );
      const pinned = rows.map((r) => r.id);
      if (pinned.includes(messageId)) return;
      if (replace) {
        if (!pinned.includes(replace)) throw new BadRequestException('That one is not pinned');
        await client.query(
          'update messages set pinned_at = null, pinned_by = null where id = $1',
          [replace],
        );
      } else if (pinned.length >= MAX_PINNED_MESSAGES) {
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          code: 'PINS_FULL',
          message: `A chat can have ${MAX_PINNED_MESSAGES} pinned messages. Take one down to pin this.`,
        });
      }
      await client.query(
        'update messages set pinned_at = now(), pinned_by = $2 where id = $1',
        [messageId, userId],
      );
    });

    this.announcePins(await this.participantIds(conversationId), conversationId);
    return { pins: await this.pins(userId, conversationId) };
  }

  /** Takes a pin down, for everyone. Anyone in the chat can. */
  async unpin(
    userId: string,
    conversationId: string,
    messageId: string,
  ): Promise<{ pins: MessageRow[] }> {
    const state = await this.sendState(conversationId, userId);
    if (frozen(state)) throw refusal('CHAT_UNAVAILABLE', "You can't change pins in this conversation.");
    const rows = await this.db.query<{ id: string }>(
      `update messages set pinned_at = null, pinned_by = null
        where id = $1 and conversation_id = $2 and pinned_at is not null
        returning id`,
      [messageId, conversationId],
    );
    if (rows.length > 0) this.announcePins(await this.participantIds(conversationId), conversationId);
    return { pins: await this.pins(userId, conversationId) };
  }

  /**
   * Tells people the pins changed. Only the chat's id: each app asks for the
   * pins it may see, which is one small request. Older apps ignore the frame.
   */
  private announcePins(userIds: readonly string[], conversationId: string): void {
    if (userIds.length === 0) return;
    this.realtime.emitToUsers([...new Set(userIds)], { type: 'pins', conversationId });
  }

  /**
   * Searches one chat: every message whose words contain `q`, newest first,
   * as ids and times for the app to step through and open the chat at
   * (`around`). The same messages the reader's thread holds; not notices,
   * and a card by its line, not the link under it.
   */
  async search(
    userId: string,
    conversationId: string,
    q: string,
  ): Promise<{ matches: { id: string; createdAt: Date }[] }> {
    await this.assertMember(userId, conversationId);
    const term = q.trim();
    if (!term) return { matches: [] };
    const rows = await this.db.query<{ id: string; created_at: Date }>(
      `select m.id, m.created_at
         from messages m
         join conversation_participants me
           on me.conversation_id = m.conversation_id and me.user_id = $2
        where m.conversation_id = $1
          and m.deleted_at is null
          and m.kind <> 'notice'
          and (me.cleared_at is null or m.created_at > me.cleared_at)
          and not exists (select 1 from message_deletions d
                           where d.message_id = m.id and d.user_id = $2)
          -- position(), not ilike: what someone types is words, and a % or
          -- _ in it should not turn into a pattern.
          -- Photos by their caption alone ("Sent 4 photos" is every photo
          -- message), a file by its name and caption.
          and position(lower($3) in lower(case when m.kind in ('text', 'file') then m.body
                                               when m.kind = 'photos'
                                                 then coalesce(m.context->>'caption', '')
                                               else split_part(m.body, chr(10), 1) end)) > 0
        order by m.created_at desc, m.id desc
        limit ${MAX_SEARCH_MATCHES}`,
      [conversationId, userId, term.slice(0, 100)],
    );
    return { matches: rows.map((r) => ({ id: r.id, createdAt: r.created_at })) };
  }

  /**
   * Refuses a frozen thread, or one the caller is not in, before anything is
   * made: a card makes a client link or a calendar entry first, and neither
   * should exist for a message that could never be sent.
   */
  async assertCanSend(userId: string, conversationId: string): Promise<void> {
    const state = await this.sendState(conversationId, userId);
    if (frozen(state)) {
      throw !state.isGroup && state.myBlockId
        ? refusal('YOU_BLOCKED', 'You blocked this person. Unblock them to send messages.')
        : refusal('CHAT_UNAVAILABLE', "You can't reply to this conversation.");
    }
  }

  /**
   * Sends a card's new state to everyone who can see it — somebody answered a
   * date. As an edit frame, which apps from Phase 1 on already apply in place
   * (an edit with no `edited_at` shows no "Edited"), and older apps ignore.
   */
  async announceChanged(userId: string, conversationId: string, messageId: string): Promise<MessageRow | null> {
    const row = await this.joinedMessage(messageId);
    if (!row) return null;
    this.realtime.emitToUsers(await this.participantIdsVisibleTo(conversationId, userId), {
      type: 'message-edited',
      conversationId,
      message: row,
    });
    return row;
  }

  async send(
    userId: string,
    conversationId: string,
    body: string,
    options: {
      replyToId?: string;
      mentionIds?: string[];
      clientId?: string;
      /** Set by forward(), never by a request. */
      forwarded?: boolean;
      /**
       * A card rather than typed words: set by the card senders below, never
       * by a request. The body is then the card's plain line, which is what
       * the list, the push and an app from before cards show.
       */
      card?: {
        kind: CardKind | 'pay-card' | 'photos' | 'file';
        context: Record<string, unknown>;
      };
      /**
       * Uploads to put on the message, in order: set by sendFiles(), never by
       * a request. They go on inside the transaction that writes it, so a
       * message never exists with some of them missing.
       */
      attachmentIds?: string[];
    } = {},
  ): Promise<MessageRow> {
    // Before the text is even looked at: a frozen thread refuses whatever is
    // sent to it, and the reason must not depend on what was typed.
    await this.assertCanSend(userId, conversationId);

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

    // A send repeated with the same client id — the app retrying one whose
    // response it never got — stores nothing new. The conflict target names
    // the partial index's predicate, which is how Postgres finds it.
    const clientId = options.clientId ?? null;
    const insertSql = `insert into messages (conversation_id, sender_id, body, reply_to_id, mentions, client_id, forwarded, kind, context)
       values ($1, $2, $3, $4, $5::uuid[], $6::uuid, $7, $8, $9::jsonb)
       on conflict (sender_id, client_id) where client_id is not null do nothing
       returning id`;
    const insertParams = [
      conversationId,
      userId,
      text,
      replyToId,
      mentions,
      clientId,
      options.forwarded === true,
      options.card?.kind ?? 'text',
      options.card ? JSON.stringify(options.card.context) : null,
    ];
    const attachmentIds = options.attachmentIds ?? [];
    const files = this.chatFiles;
    const inserted =
      attachmentIds.length > 0 && files
        ? await this.db.transaction(async (tx) => {
            const result = await tx.query<{ id: string }>(insertSql, insertParams);
            const id = result.rows[0]?.id;
            if (id) await files.attach(tx, userId, id, attachmentIds);
            return result.rows[0] ?? null;
          })
        : await this.db.queryOne<{ id: string }>(insertSql, insertParams);

    if (!inserted) {
      // The first attempt got through. Answer with what it stored and nothing
      // else: it was already sent live and pushed, and doing either again is
      // the duplicate this exists to prevent.
      const earlier = await this.db.queryOne<{ id: string }>(
        `select id from messages
          where sender_id = $1 and client_id = $2::uuid and conversation_id = $3`,
        [userId, clientId, conversationId],
      );
      // The same id on a message in another conversation. Only a broken
      // client does that, and the other message is not this one.
      if (!earlier) throw new BadRequestException('That message id is already in use');
      return (await this.joinedMessage(earlier.id))!;
    }

    const row = await this.joinedMessage(inserted.id);

    // Bumps the conversation so the list re-sorts even before anyone reads it.
    await this.db.query('update conversations set updated_at = now() where id = $1', [
      conversationId,
    ]);
    await this.unarchive(conversationId);

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

    // Not awaited. It looked up and pushed to each recipient in turn, and the
    // sender's request waited for all of it: in a group, sending was slow in
    // proportion to its size. The message is stored and delivered live by
    // now, and notify never throws.
    //
    // A card pushes its line without the link under it: "Shared 6 photos
    // from Santos Wedding", not a client link's address on a lock screen.
    void this.notify(userId, conversationId, options.card ? text.split('\n')[0] : text, mentions);
    return row!;
  }

  // ─── Photos and files from your device (Phase 4) ─────────────────────────

  private requireFiles(): ChatFilesService {
    if (!this.chatFiles) {
      throw new ServiceUnavailableException("Photos and files can't be sent right now.");
    }
    return this.chatFiles;
  }

  /**
   * Signs the uploads for one message: up to ten photos, or one PDF. Refused
   * before anything is signed in a chat the caller is not in or cannot send
   * to, so no storage is spent on a message that could never go.
   */
  async createUploads(
    userId: string,
    conversationId: string,
    files: NewChatFile[],
  ): Promise<ChatUploadTicket[]> {
    const chatFiles = this.requireFiles();
    await this.assertMember(userId, conversationId);
    await this.assertCanSend(userId, conversationId);
    return chatFiles.createUploads(userId, conversationId, files);
  }

  /** A fresh link for an upload still on its way, after a long drop. */
  async resignUpload(
    userId: string,
    conversationId: string,
    attachmentId: string,
  ): Promise<ChatUploadTicket> {
    await this.assertMember(userId, conversationId);
    return this.requireFiles().resign(userId, attachmentId);
  }

  /**
   * An upload has arrived: it is checked and made ready, and when its message
   * is already in the chat, everyone there gets it as an edit frame.
   */
  async finishUpload(
    userId: string,
    conversationId: string,
    attachmentId: string,
  ): Promise<ChatAttachment> {
    await this.assertMember(userId, conversationId);
    const done = await this.requireFiles().finish(userId, attachmentId);
    if (done.conversationId !== conversationId) {
      throw new NotFoundException("That can't be sent any more. Pick it again.");
    }
    if (done.messageId) await this.announceChanged(userId, conversationId, done.messageId);
    return done.attachment;
  }

  /**
   * Sends photos or a file, with an optional caption. The message goes now,
   * even before the bytes have all arrived: on a weak signal the words come
   * first, and the photos fill in as they land.
   *
   * The body is the plain line ("Sent 4 photos", then the caption under it):
   * what the list, the push and an app from before Phase 4 show. The caption
   * is also kept on its own, for the apps that draw it under the photos.
   */
  async sendFiles(
    userId: string,
    conversationId: string,
    input: {
      attachmentIds: string[];
      caption?: string | null;
      clientId?: string;
      replyToId?: string;
      /** Set by forward(), never by a request. */
      forwarded?: boolean;
    },
  ): Promise<MessageRow> {
    const chatFiles = this.requireFiles();
    // A retry of one that got through answers with what it stored, before
    // its uploads (on that message now) are checked as if they were new.
    if (input.clientId) {
      const earlier = await this.db.queryOne<{ id: string }>(
        `select id from messages
          where sender_id = $1 and client_id = $2::uuid and conversation_id = $3`,
        [userId, input.clientId, conversationId],
      );
      if (earlier) return (await this.joinedMessage(earlier.id))!;
    }
    await this.assertMember(userId, conversationId);
    await this.assertCanSend(userId, conversationId);

    const info = await chatFiles.check(userId, conversationId, input.attachmentIds);
    const caption = (input.caption ?? '').trim().slice(0, MAX_CHAT_CAPTION) || null;
    const line =
      info.kind === 'file'
        ? `Sent a file: ${info.fileName}`
        : info.count === 1
          ? 'Sent a photo'
          : `Sent ${info.count} photos`;
    return this.send(userId, conversationId, caption ? `${line}\n${caption}` : line, {
      clientId: input.clientId,
      replyToId: input.replyToId,
      forwarded: input.forwarded,
      card: { kind: info.kind, context: { caption } },
      attachmentIds: input.attachmentIds,
    });
  }

  /** A photo or file on a message the caller can see, as an hour's download link. */
  async attachmentLink(
    userId: string,
    conversationId: string,
    messageId: string,
    attachmentId: string,
  ): Promise<{ url: string }> {
    const message = await this.visibleMessage(userId, conversationId, messageId);
    if (message.deleted_at) throw new NotFoundException('That message was unsent');
    return { url: await this.requireFiles().downloadUrl(messageId, attachmentId) };
  }

  /**
   * Files a copy of a chat photo or PDF into an album the caller may add to,
   * counted as an upload there would be.
   */
  async addToAlbum(
    userId: string,
    conversationId: string,
    messageId: string,
    attachmentId: string,
    albumId: string,
  ): Promise<{ added: boolean }> {
    const message = await this.visibleMessage(userId, conversationId, messageId);
    if (message.deleted_at) throw new NotFoundException('That message was unsent');
    await this.requireFiles().toAlbum(userId, messageId, attachmentId, albumId);
    return { added: true };
  }

  /**
   * What the caller's chat photos and files take up, and in which chats, for
   * the storage screen. A chat they have left is still listed: what they sent
   * there still counts, and they can still take it back.
   */
  async filesUsage(userId: string): Promise<{
    bytes: number;
    files: number;
    chats: {
      conversationId: string;
      title: string;
      isGroup: boolean;
      member: boolean;
      bytes: number;
      files: number;
    }[];
  }> {
    const usage = await this.requireFiles().usage(userId);
    const top = usage.chats.slice(0, 20);
    const names = await this.db.query<{
      id: string;
      is_group: boolean;
      title: string | null;
      member: boolean;
      other_name: string | null;
    }>(
      `select c.id, c.is_group, c.title,
              exists (select 1 from conversation_participants p
                       where p.conversation_id = c.id and p.user_id = $1) as member,
              (select coalesce(u.display_name, split_part(u.email, '@', 1))
                 from conversation_participants p
                 join users u on u.id = p.user_id
                where p.conversation_id = c.id and p.user_id <> $1
                order by p.joined_at limit 1) as other_name
         from conversations c
        where c.id = any($2::uuid[])`,
      [userId, top.map((c) => c.conversationId)],
    );
    const byId = new Map(names.map((n) => [n.id, n]));
    return {
      bytes: usage.bytes,
      files: usage.files,
      chats: top.flatMap((c) => {
        const n = byId.get(c.conversationId);
        if (!n) return [];
        return [
          {
            conversationId: c.conversationId,
            title: (n.is_group ? n.title : n.other_name) ?? (n.is_group ? 'Group' : 'Chat'),
            isGroup: n.is_group,
            member: n.member,
            bytes: c.bytes,
            files: c.files,
          },
        ];
      }),
    };
  }

  /**
   * The caller's own photo and file messages in one chat, newest first, for
   * the storage screen's "what you sent". Theirs whether or not they are
   * still in the chat.
   */
  async sentFiles(
    userId: string,
    conversationId: string,
    before?: string,
  ): Promise<MessageRow[]> {
    this.requireFiles();
    const rows = await this.db.query<MessageRow>(
      `select ${MESSAGE_COLUMNS}
         from messages m
         ${MESSAGE_JOINS}
        where m.conversation_id = $1 and m.sender_id = $2
          and m.kind in ('photos', 'file') and m.deleted_at is null
          and ($3::uuid is null
               or (m.created_at, m.id) < (select b.created_at, b.id from messages b where b.id = $3))
        order by m.created_at desc, m.id desc
        limit 60`,
      [conversationId, userId, before ?? null],
    );
    return this.withCards(rows);
  }

  /**
   * Unsends the caller's own photo and file messages, from the storage
   * screen: to free room, whether or not they are still in the chat. A block
   * does not stop it, as it stops unsending in the thread: this is the
   * sender's own storage, and taking something back reveals nothing.
   */
  async unsendFiles(userId: string, messageIds: string[]): Promise<{ unsent: number }> {
    this.requireFiles();
    const rows = await this.db.query<{ id: string; conversation_id: string; pinned_at: Date | null }>(
      `select id, conversation_id, pinned_at from messages
        where id = any($1::uuid[]) and sender_id = $2
          and kind in ('photos', 'file') and deleted_at is null`,
      [[...new Set(messageIds)], userId],
    );
    for (const row of rows) {
      await this.unsend(row.conversation_id, row.id, row.pinned_at !== null, 'photos');
    }
    return { unsent: rows.length };
  }

  /**
   * Unsending, wherever it is asked for: the words, earlier versions,
   * reactions and pin go, and so do any photos and files (unless an open
   * report holds them). Everyone in the chat is told.
   */
  private async unsend(
    conversationId: string,
    messageId: string,
    pinned: boolean,
    kind: string,
  ): Promise<void> {
    await this.db.query(
      `update messages set body = '', deleted_at = now(), pinned_at = null, pinned_by = null
        where id = $1 and deleted_at is null`,
      [messageId],
    );
    // Unsent means gone: the words it had before an edit, and the
    // reactions on it, go with the text.
    await this.db.query('delete from message_edits where message_id = $1', [messageId]);
    await this.db.query('delete from message_reactions where message_id = $1', [messageId]);
    if ((kind === 'photos' || kind === 'file') && this.chatFiles) {
      try {
        await this.chatFiles.removeForMessages([messageId]);
      } catch (err) {
        // The message is unsent either way; the sweep tries the files again.
        this.log.warn(`Unsent files not removed yet: ${String(err).slice(0, 160)}`);
      }
    }
    // Every participant, blocked or not. A retraction reveals nothing, and a
    // blocked member with the thread open must still lose the text.
    const everyone = await this.participantIds(conversationId);
    this.realtime.emitToUsers(everyone, {
      type: 'message-deleted',
      conversationId,
      messageId,
      scope: 'everyone',
    });
    if (pinned) this.announcePins(everyone, conversationId);
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
    const inserted = await this.db.queryOne<{ id: string }>(
      `insert into messages (conversation_id, sender_id, body, kind, context)
       values ($1, $2, $3, $4, $5::jsonb) returning id`,
      [conversationId, senderId, body.trim(), kind, JSON.stringify(context)],
    );
    const row = await this.joinedMessage(inserted!.id);

    await this.db.query('update conversations set updated_at = now() where id = $1', [
      conversationId,
    ]);
    await this.unarchive(conversationId);

    this.realtime.emitToUsers(await this.participantIds(conversationId), {
      type: 'message',
      conversationId,
      message: row,
    });

    return row!;
  }

  /**
   * Sends one of your ways to pay as a card: its details and QR, filled in
   * fresh whenever the thread is read (withPayCards). It can name one of your
   * packages, with what was left to pay on it when it was sent.
   *
   * Sent like a typed message — the same refusals in a frozen thread, the
   * same live frame and push — with a plain line as its body, which is what
   * the conversation list, the push and an app from before cards show.
   */
  async sendPayCard(
    userId: string,
    conversationId: string,
    input: { payMethodId: string; packageId?: string; clientId?: string },
  ): Promise<MessageRow> {
    await this.assertCanSend(userId, conversationId);
    if (!this.payMethods) throw new BadRequestException('Ways to pay cannot be sent from here.');

    // Only your own: the card is how somebody pays you.
    const card = (await this.payMethods.cardsByIds([input.payMethodId])).get(input.payMethodId);
    if (!card || card.ownerId !== userId) throw new NotFoundException('That way to pay was not found');

    let pkg: { id: string; title: string; balanceMinor: number } | null = null;
    if (input.packageId && this.packages) {
      // Throws Not Found for a package that is not the sender's.
      const { package: found } = await this.packages.get(userId, input.packageId);
      pkg = { id: found.id, title: found.title, balanceMinor: found.balanceMinor };
    }

    const name =
      (card.kind === 'bank' || card.kind === 'other') && card.label
        ? card.label
        : PAY_KIND_NAMES[card.kind];
    const body = [
      `How to pay: ${[name, card.accountName, card.accountNumber].filter(Boolean).join(' · ')}`,
      pkg && pkg.balanceMinor > 0 ? `${pkg.title}, balance ${pesoText(pkg.balanceMinor)}` : null,
    ]
      .filter(Boolean)
      .join('\n');
    const context = { payMethodId: card.id, ...(pkg ? { package: pkg } : {}) };

    // Sent like a typed line from here: the retry guard, the list coming back
    // out of the archive, the live frame and the push.
    return this.send(userId, conversationId, body, {
      clientId: input.clientId,
      card: { kind: 'pay-card', context },
    });
  }

  /** Marks the thread read up to now. */
  async markRead(userId: string, conversationId: string): Promise<{ read: boolean }> {
    await this.assertMember(userId, conversationId);
    // Reading it is also the end of "marked unread".
    await this.db.query(
      `update conversation_participants set last_read_at = now(), marked_unread = false
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

  /**
   * Total unread across every conversation, for the tab badge.
   *
   * The rules live in unread-sql.ts, shared with the app-icon badge a push
   * sets (PushService.badgeCounts), so the two cannot drift apart.
   */
  async unreadCount(userId: string): Promise<number> {
    const row = await this.db.queryOne<{ count: string }>(
      `select ${unreadMessagesCount('$1::uuid')}::text as count`,
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
              (c.is_group and p.is_admin) as is_admin,
              p.joined_at,
              u.roles,
              u.custom_roles,
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
        -- Admins first, as the group's info lists them.
        order by (c.is_group and p.is_admin) desc, name`,
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

      // Every recipient's pushes in one send, which batches them itself —
      // not a round trip to Expo per person.
      const tokenLists = await Promise.all(
        recipients.map(async (r) => ({ r, tokens: await this.push.tokensFor(r.user_id) })),
      );
      const reached = tokenLists.filter(({ tokens }) => tokens.length > 0).map(({ r }) => r.user_id);
      // The app-icon number, counted now the message is stored so it includes
      // this one. One query for every recipient. If it cannot be read the push
      // still goes, and the icon keeps whatever it said.
      const badges =
        reached.length > 0
          ? await this.push.badgeCounts(reached).catch(() => new Map<string, number>())
          : new Map<string, number>();
      const messages = tokenLists.flatMap(({ r, tokens }) =>
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
          ...(badges.has(r.user_id) ? { badge: badges.get(r.user_id) } : {}),
        })),
      );
      if (messages.length > 0) await this.push.send(messages);
    } catch {
      // Swallowed on purpose — see above.
    }
  }
}
