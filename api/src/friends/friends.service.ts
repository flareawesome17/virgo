import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { OwnedResourceService } from '../common/owned-resource.service';
import { DatabaseService } from '../database/database.service';
import { MailConfig } from '../mail/mail.config';
import { friendRequest } from '../mail/mail.templates';
import { NotifyService } from '../notifications/notify.service';
import { normalizeHandle } from '../profiles/handles';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { blockedBetween, PAIR_LOCK_SQL, UUID_SHAPE } from '../safety/block-sql';
import { BlocksService } from '../safety/blocks.service';
import { generateId } from '../common/id';
import {
  cooling,
  MIRRORED_ACCEPTED_JOIN,
  relationshipCase,
} from './friend-sql';
import {
  FriendRow,
  FriendsRepository,
  FriendStatus,
  RequestedBy,
} from './friends.repository';

interface AccountRow {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
}

/** One side of a pair as a request reads it, under the lock. */
interface PairRow {
  user_id: string;
  status: FriendStatus;
  requested_by: RequestedBy;
  cooling: boolean;
}

export type Relationship = 'none' | 'pending_out' | 'pending_in' | 'accepted';

export interface PersonResult {
  id: string;
  name: string;
  /** Only when the query was this account's exact address. */
  email: string | null;
  avatarUrl: string | null;
  /** Only for a published profile. */
  handle: string | null;
  relationship: Relationship;
}

/** Who a request may be sent to: an account that is not paused or suspended. */
const TARGET_SELECT = `select id, email, display_name, avatar_url
   from users`;
const TARGET_ACTIVE = `(disabled_until is null or disabled_until <= now())
          and suspended_at is null`;

/**
 * Writes one side of a request. The target's address is never copied onto
 * the requester's row, nor the requester's onto the target's: nobody has
 * agreed to anything yet.
 */
const REQUEST_UPSERT = `insert into friends
    (id, user_id, friend_user_id, friend_name, friend_email,
     friend_avatar_url, status, requested_by)
  values ($1, $2, $3, $4, null, $5, 'pending', $6)
  on conflict (user_id, friend_user_id) where friend_user_id is not null
  do update set status = 'pending',
                requested_by = excluded.requested_by,
                friend_name = excluded.friend_name,
                friend_email = null,
                friend_avatar_url = excluded.friend_avatar_url
  returning id`;

/**
 * Friendships between real accounts.
 *
 * A friendship is two rows, one owned by each side, so both people can read and
 * act on it under the same `user_id`-scoped rules as every other resource. The
 * pair is written and updated together, under the pair lock (PAIR_LOCK_SQL),
 * which every path that creates, answers or removes a tie between two people
 * takes first.
 *
 * Reads go through friend-sql.ts, which shows only what both rows agree on and
 * never an address the owner did not type. A block closes the pair in both
 * directions, and a request looks the same to its sender whether it was
 * ignored or declined.
 *
 * Previously a request wrote a single row owned by the sender, describing a
 * name and email with no link to any account. The recipient therefore never
 * saw it, and "accepted" was a value the sender set on their own record.
 */
@Injectable()
export class FriendsService extends OwnedResourceService<FriendRow> {
  constructor(
    private readonly friends: FriendsRepository,
    private readonly db: DatabaseService,
    private readonly notifier: NotifyService,
    private readonly mailConfig: MailConfig,
    private readonly realtime: RealtimeGateway,
    private readonly blocks: BlocksService,
  ) {
    super(friends, 'Friend');
  }

  /**
   * Who among this user's friends is connected right now.
   *
   * The socket only pushes *changes*, so without a starting picture the
   * sidebar would show everyone offline until they happened to reconnect.
   * Read from the gateway's live sessions rather than `last_seen_at`: the
   * column is a timestamp of the last connect or disconnect, which says
   * nothing about whether a socket is open at this instant.
   *
   * Only friendships both sides still hold, and never across a block: a
   * single accepted row is what an unfriend used to leave behind, and it must
   * not keep telling the other person when you are online.
   */
  async presenceOfFriends(userId: string): Promise<
    { userId: string; online: boolean; lastSeenAt: string | null }[]
  > {
    const rows = await this.db.query<{ id: string; last_seen_at: Date | null }>(
      `select u.id, u.last_seen_at
         from friends f
         ${MIRRORED_ACCEPTED_JOIN('f', 'b')}
         join users u on u.id = f.friend_user_id
        where f.user_id = $1
          and f.status = 'accepted'
          and not ${blockedBetween('$1', 'u.id')}`,
      [userId],
    );

    const online = this.realtime.onlineAmong(rows.map((r) => r.id));
    return rows.map((r) => ({
      userId: r.id,
      online: online.has(r.id),
      lastSeenAt: r.last_seen_at ? new Date(r.last_seen_at).toISOString() : null,
    }));
  }

  /**
   * How many friends this person has. Mirrored pairs only, so the number
   * matches the people you could actually message. Not routed yet.
   */
  async connectionCount(userId: string): Promise<number> {
    const row = await this.db.queryOne<{ n: number }>(
      `select count(*)::int as n
         from friends f
         ${MIRRORED_ACCEPTED_JOIN('f', 'b')}
        where f.user_id = $1 and f.status = 'accepted'`,
      [userId],
    );
    return Number(row?.n ?? 0);
  }

  /** Friends these two have in common, both friendships mirrored. Not routed yet. */
  async mutualCount(viewerId: string, otherId: string): Promise<number> {
    const row = await this.db.queryOne<{ n: number }>(
      `select count(*)::int as n
         from friends a
         ${MIRRORED_ACCEPTED_JOIN('a', 'a2')}
         join friends o
           on o.user_id = $2
          and o.friend_user_id = a.friend_user_id
          and o.status = 'accepted'
         ${MIRRORED_ACCEPTED_JOIN('o', 'o2')}
        where a.user_id = $1
          and a.status = 'accepted'
          and a.friend_user_id <> $2`,
      [viewerId, otherId],
    );
    return Number(row?.n ?? 0);
  }

  /** Unfiltered on purpose: the caller themselves, and connect()'s two sides. */
  private async accountById(id: string): Promise<AccountRow | null> {
    return this.db.queryOne<AccountRow>(
      'select id, email, display_name, avatar_url from users where id = $1',
      [id],
    );
  }

  private nameFor(account: AccountRow): string {
    return account.display_name?.trim() || account.email.split('@')[0];
  }

  /**
   * Finds people to add as friends.
   *
   * Each result carries the caller's relationship to that account, worked out
   * from both rows, so the UI can show "Add", "Pending" or "Friends" without a
   * second round trip.
   *
   * A minimum query length and a hard result cap keep this from being a way to
   * walk the whole user table; the caller is always excluded, and so is anyone
   * paused, suspended, or on either side of a block. LIKE's wildcards in the
   * query are matched literally — unescaped, "%%" was every name on Virgo.
   *
   * The address comes back only when the query was that exact address: the
   * searcher typed it, so it tells them nothing. A name match never returns
   * one, or search would be an address harvester.
   */
  async searchPeople(userId: string, query: string): Promise<PersonResult[]> {
    const q = query.trim();
    if (q.length < 2) return [];

    const pattern = `${q.replace(/[!%_]/g, (c) => `!${c}`)}%`;

    const rows = await this.db.query<{
      id: string;
      name: string;
      email: string | null;
      avatar_url: string | null;
      handle: string | null;
      relationship: Relationship;
    }>(
      `select u.id,
              coalesce(nullif(btrim(u.display_name), ''), split_part(u.email, '@', 1)) as name,
              case when lower(u.email) = lower($3) then u.email end as email,
              u.avatar_url,
              case when u.public_profile then u.handle end as handle,
              ${relationshipCase('mine', 'theirs')} as relationship
         from users u
         left join friends mine on mine.user_id = $1 and mine.friend_user_id = u.id
         left join friends theirs on theirs.user_id = u.id and theirs.friend_user_id = $1
        where u.id <> $1
          and (u.disabled_until is null or u.disabled_until <= now())
          and u.suspended_at is null
          and not ${blockedBetween('$1', 'u.id')}
          and (
                -- Opting out of discovery hides you from name search only.
                -- Someone who already knows your address can still reach you,
                -- which is what makes an invitation possible at all.
                (u.discoverable and u.display_name ilike $2 escape '!')
                or lower(u.email) = lower($3)
              )
        order by u.display_name nulls last, u.id
        limit 20`,
      [userId, pattern, q],
    );

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email ?? null,
      avatarUrl: r.avatar_url,
      handle: r.handle ?? null,
      relationship: r.relationship,
    }));
  }

  /**
   * Whether these two have actually agreed to know each other.
   *
   * Both rows must say so. A friendship is two rows written together by
   * `respond()`, and checking only the caller's own copy meant one side could
   * manufacture the relationship alone — which is precisely what the writable
   * `status` column allowed until it was removed.
   *
   * Requiring both is defence in depth: even if some future path writes one row
   * in isolation, it grants nothing on its own. A block between them answers
   * no as well, whatever the rows say — this gates messages, groups, workspace
   * and event invites, and none of those may cross one.
   */
  async areFriends(userId: string, otherUserId: string): Promise<boolean> {
    const row = await this.db.queryOne<{ both: string }>(
      `select count(*)::text as both
         from friends
        where status = 'accepted'
          and ((user_id = $1 and friend_user_id = $2)
            or (user_id = $2 and friend_user_id = $1))
          and not ${blockedBetween('$1', '$2')}`,
      [userId, otherUserId],
    );
    return Number(row?.both ?? 0) === 2;
  }

  /**
   * Sends a request to the account holding `email`.
   *
   * Same message whether no account uses the address, it is the caller's own,
   * or the account is paused, suspended or on the other side of a block —
   * otherwise this endpoint reports which emails are registered, and to whom.
   */
  async sendRequest(
    userId: string,
    email: string,
  ): Promise<{ status: 'pending'; friend: FriendRow }> {
    if (!email?.trim()) {
      throw new BadRequestException('Choose someone to send a request to');
    }
    const notFound = 'No Virgo account uses that email address';

    const target = await this.db.queryOne<AccountRow>(
      `${TARGET_SELECT}
        where lower(email) = lower($1)
          and ${TARGET_ACTIVE}`,
      [email.trim()],
    );
    if (!target || target.id === userId) throw new NotFoundException(notFound);

    return this.requestAccount(userId, target, notFound);
  }

  /** Sends a request to an account picked from search or Nearby. */
  async sendRequestToUser(
    userId: string,
    targetUserId: string,
  ): Promise<{ status: 'pending'; friend: FriendRow }> {
    const notFound = 'That account no longer exists';
    if (!UUID_SHAPE.test(targetUserId ?? '')) throw new NotFoundException(notFound);
    if (targetUserId === userId) {
      throw new BadRequestException('You cannot send a request to yourself');
    }

    const target = await this.db.queryOne<AccountRow>(
      `${TARGET_SELECT}
        where id = $1
          and ${TARGET_ACTIVE}`,
      [targetUserId],
    );
    if (!target) throw new NotFoundException(notFound);

    return this.requestAccount(userId, target, notFound);
  }

  /**
   * Sends a request to the person behind a public handle.
   *
   * Resolved the way hire enquiries resolve one: a published profile of an
   * active account. Missing, unpublished, paused, suspended and blocked all
   * read as the same 404, so this cannot be used to learn any of them.
   */
  async sendRequestToHandle(
    userId: string,
    handle: string,
  ): Promise<{ status: 'pending'; friend: FriendRow }> {
    const notFound = 'Profile not found';
    const target = await this.db.queryOne<AccountRow>(
      `${TARGET_SELECT}
        where lower(handle) = $1
          and public_profile = true
          and ${TARGET_ACTIVE}`,
      [normalizeHandle(handle ?? '')],
    );
    if (!target) throw new NotFoundException(notFound);
    if (target.id === userId) {
      throw new BadRequestException('That is your own profile');
    }

    return this.requestAccount(userId, target, notFound);
  }

  /**
   * The one request core behind every entry point.
   *
   * Decided under the pair lock, from both rows as they stand — two requests
   * crossing each other, or a request racing an accept or a block, see each
   * other's writes rather than both passing a stale read.
   *
   * A request to someone who declined you in the last 30 days is held: your
   * own row says pending, theirs is left declined, nobody is notified, and the
   * response is the one a real send gets, in about the time a real send takes.
   * They are not asked again, and you cannot tell a decline from silence.
   */
  private async requestAccount(
    requesterId: string,
    target: AccountRow,
    notFoundMessage: string,
  ): Promise<{ status: 'pending'; friend: FriendRow }> {
    const me = await this.accountById(requesterId);
    if (!me) throw new NotFoundException('Account not found');

    const { id, notify } = await this.db.transaction(async (c) => {
      await c.query(PAIR_LOCK_SQL, [requesterId, target.id]);

      // Either direction, or either account suspended: the same 404 as an
      // account that does not exist.
      if (await this.blocks.unavailable(requesterId, target.id, c)) {
        throw new NotFoundException(notFoundMessage);
      }

      const { rows } = await c.query<PairRow>(
        `select user_id, status, requested_by, ${cooling('friends')} as cooling
           from friends
          where (user_id = $1 and friend_user_id = $2)
             or (user_id = $2 and friend_user_id = $1)`,
        [requesterId, target.id],
      );
      const mine = rows.find((r) => r.user_id === requesterId);
      const theirs = rows.find((r) => r.user_id === target.id);

      if (mine?.status === 'accepted' && theirs?.status === 'accepted') {
        throw new BadRequestException('You are already friends');
      }
      if (
        mine?.status === 'pending' &&
        mine.requested_by === 'them' &&
        theirs?.status === 'pending' &&
        theirs.requested_by === 'me'
      ) {
        throw new BadRequestException(
          'They have already sent you a request — accept it instead',
        );
      }
      // Answered or not, at any age: a declined request reads as one that is
      // still waiting, so asking again gets the same answer either way.
      if (
        mine?.status === 'pending' &&
        mine.requested_by === 'me' &&
        theirs?.requested_by === 'them' &&
        (theirs.status === 'pending' || theirs.status === 'declined')
      ) {
        throw new BadRequestException('You have already sent them a request');
      }

      const mineId = await this.upsertRequest(c, requesterId, target, 'me');
      if (theirs?.cooling) return { id: mineId, notify: false };

      await this.upsertRequest(c, target.id, me, 'them');
      return { id: mineId, notify: true };
    });

    // Sent without waiting for it. A real send otherwise answers only after
    // the push and the email have gone out, a held one straight away, and
    // that gap alone would tell the requester they had been declined.
    // NotifyService.deliver catches every failure, so nothing is left to
    // reject unhandled.
    if (notify) {
      void this.notifier.notify([target.id], {
        topic: 'friend-request',
        title: 'New friend request',
        body: `${this.nameFor(me)} wants to connect on Virgo`,
        data: { type: 'friend_request', fromUserId: requesterId },
        email: friendRequest({
          requesterName: this.nameFor(me),
          url: `${this.mailConfig.appUrl}/network`,
        }),
      });
    }

    return { status: 'pending', friend: await this.get(requesterId, id) };
  }

  /** One side of a request, owned by `ownerId` and pointing at `other`. */
  private async upsertRequest(
    c: PoolClient,
    ownerId: string,
    other: AccountRow,
    requestedBy: RequestedBy,
  ): Promise<string> {
    const { rows } = await c.query<{ id: string }>(REQUEST_UPSERT, [
      generateId(),
      ownerId,
      other.id,
      this.nameFor(other),
      other.avatar_url,
      requestedBy,
    ]);
    return rows[0].id;
  }

  /**
   * Makes two accounts friends outright, both directions, in one transaction.
   *
   * For flows where consent has already been given somewhere else — accepting a
   * hire enquiry is agreeing to work with the person who sent it, so making
   * them go and accept a separate friend request afterwards is ceremony.
   *
   * Deliberately not reachable from a controller, and deliberately not the
   * generic `OwnedRepository.update` path: writing `status` from a request body
   * is precisely the hole that let a sender accept their own request. This
   * writes *both* rows or neither, which is the invariant `areFriends` checks.
   *
   * Always takes the pair lock on the client it runs on, then refuses a pair
   * that is blocked or has a suspended side — which throws, rolling back the
   * accept that called it.
   *
   * Accepts an optional client so a caller already inside a transaction gets
   * one atomic unit rather than two that can half-fail. A caller that passes
   * one must already have taken PAIR_LOCK_SQL for this pair as the first
   * statement of its transaction; the lock is re-entrant, so taking it again
   * here returns at once, and the check here is only the fallback for the one
   * the caller made.
   */
  async connect(
    userIdA: string,
    userIdB: string,
    client?: PoolClient,
  ): Promise<void> {
    if (userIdA === userIdB) {
      throw new BadRequestException('You cannot connect to yourself');
    }

    const [a, b] = await Promise.all([
      this.accountById(userIdA),
      this.accountById(userIdB),
    ]);
    if (!a || !b) throw new NotFoundException('Account not found');

    // Emails are still written, so a rollback to the release before this one
    // shows friends each other's address as it always did. Nothing in this
    // release presents them (FRIEND_PRESENTED).
    const upsert = `
      insert into friends
        (id, user_id, friend_user_id, friend_name, friend_email,
         friend_avatar_url, status, requested_by)
      values ($1, $2, $3, $4, $5, $6, 'accepted', $7)
      on conflict (user_id, friend_user_id) where friend_user_id is not null
      do update set status = 'accepted',
                    friend_name = excluded.friend_name,
                    friend_email = excluded.friend_email,
                    friend_avatar_url = excluded.friend_avatar_url
      returning id`;

    const run = async (c: PoolClient) => {
      await c.query(PAIR_LOCK_SQL, [a.id, b.id]);
      if (await this.blocks.unavailable(a.id, b.id, c)) {
        throw new NotFoundException('Account not found');
      }
      await c.query(upsert, [
        generateId(), a.id, b.id, this.nameFor(b), b.email, b.avatar_url, 'me',
      ]);
      await c.query(upsert, [
        generateId(), b.id, a.id, this.nameFor(a), a.email, a.avatar_url, 'them',
      ]);
    };

    if (client) {
      await run(client);
      return;
    }
    await this.db.transaction(run);
  }

  /**
   * Edits the owner's own labels on a row, and answers with the presented
   * row — never the raw one, which may carry an address the owner did not type.
   */
  async update(
    userId: string,
    id: string,
    data: Record<string, unknown>,
  ): Promise<FriendRow> {
    await super.update(userId, id, data);
    return this.get(userId, id);
  }

  /**
   * Unfriends, cancels or clears — on both sides.
   *
   * - A legacy free-text row deletes only itself.
   * - An incoming request that is still being made is declined, not deleted,
   *   so it starts the cooldown the way the Decline button does.
   * - Anything else deletes the caller's row and the other side's, except the
   *   other side's own decline record: deleting your row must not reset a
   *   cooldown someone else started.
   *
   * Decided from both rows as they stand under the pair lock, not from the
   * read that found the row.
   */
  async remove(userId: string, id: string): Promise<void> {
    const own = await this.db.queryOne<{ id: string; friend_user_id: string | null }>(
      'select id, friend_user_id from friends where id = $1 and user_id = $2',
      [id, userId],
    );
    if (!own) throw new NotFoundException('Friend not found');

    if (!own.friend_user_id) {
      const deleted = await this.db.query<{ id: string }>(
        'delete from friends where id = $1 and user_id = $2 returning id',
        [id, userId],
      );
      if (deleted.length === 0) throw new NotFoundException('Friend not found');
      return;
    }

    const other = own.friend_user_id;
    await this.db.transaction(async (c) => {
      await c.query(PAIR_LOCK_SQL, [userId, other]);

      const { rows } = await c.query<{
        id: string;
        user_id: string;
        status: FriendStatus;
        requested_by: RequestedBy;
      }>(
        `select id, user_id, status, requested_by
           from friends
          where (user_id = $1 and friend_user_id = $2)
             or (user_id = $2 and friend_user_id = $1)`,
        [userId, other],
      );
      const mine = rows.find((r) => r.user_id === userId && r.id === id);
      if (!mine) throw new NotFoundException('Friend not found');
      const mirror = rows.find((r) => r.user_id === other);

      if (
        mine.status === 'pending' &&
        mine.requested_by === 'them' &&
        mirror?.status === 'pending' &&
        mirror.requested_by === 'me'
      ) {
        await c.query(
          `update friends set status = 'declined' where id = $1 and user_id = $2`,
          [id, userId],
        );
        return;
      }

      await c.query('delete from friends where id = $1 and user_id = $2', [
        id,
        userId,
      ]);
      await c.query(
        `delete from friends
          where user_id = $1 and friend_user_id = $2
            and not (status = 'declined' and requested_by = 'them')`,
        [other, userId],
      );
    });
  }

  /** Accepts a request addressed to the caller, and tells the sender. */
  async accept(userId: string, id: string): Promise<FriendRow> {
    return this.respond(userId, id, 'accepted');
  }

  async decline(userId: string, id: string): Promise<FriendRow> {
    return this.respond(userId, id, 'declined');
  }

  /**
   * Answers an incoming request.
   *
   * Accepting writes both rows, and only while the sender's side is still
   * pending/me — a request whose sender has since withdrawn, or across a
   * block, is a 404 rather than half a friendship and an "accepted your
   * request" push to someone who never sees it. Each accepted row takes the
   * other side's current address, for a rollback's sake only.
   *
   * Declining writes only the decliner's own row. The sender's stays pending,
   * so to them a decline looks exactly like no answer. The trigger from 069
   * stamps declined_at, which starts the cooldown.
   */
  private async respond(
    userId: string,
    id: string,
    status: 'accepted' | 'declined',
  ): Promise<FriendRow> {
    const mine = await this.db.queryOne<{
      id: string;
      friend_user_id: string | null;
      status: FriendStatus;
      requested_by: RequestedBy;
    }>(
      'select id, friend_user_id, status, requested_by from friends where id = $1 and user_id = $2',
      [id, userId],
    );
    if (!mine) throw new NotFoundException('Friend request not found');

    // Only incoming requests can be answered. Accepting your own outgoing one
    // would let anybody befriend anybody.
    if (mine.requested_by !== 'them') {
      throw new BadRequestException('That request was sent by you');
    }
    if (mine.status !== 'pending') {
      throw new BadRequestException(`That request is already ${mine.status}`);
    }

    const other = mine.friend_user_id;
    if (!other) {
      const updated = await this.db.query<{ id: string }>(
        `update friends set status = $2
          where id = $1 and user_id = $3 and status = 'pending'
          returning id`,
        [id, status, userId],
      );
      if (updated.length === 0) {
        throw new NotFoundException('Friend request not found');
      }
      return this.get(userId, id);
    }

    await this.db.transaction(async (c) => {
      await c.query(PAIR_LOCK_SQL, [userId, other]);

      if (status === 'declined') {
        const { rows } = await c.query<{ id: string }>(
          `update friends set status = 'declined'
            where id = $1 and user_id = $2
              and status = 'pending' and requested_by = 'them'
            returning id`,
          [id, userId],
        );
        if (rows.length === 0) {
          throw new NotFoundException('Friend request not found');
        }
        return;
      }

      if (await this.blocks.unavailable(userId, other, c)) {
        throw new NotFoundException('Friend request not found');
      }

      const own = await c.query<{ id: string }>(
        `update friends f
            set status = 'accepted', friend_email = u.email
           from users u
          where f.id = $1 and f.user_id = $2
            and f.status = 'pending' and f.requested_by = 'them'
            and u.id = f.friend_user_id
          returning f.id`,
        [id, userId],
      );
      if (own.rows.length === 0) {
        throw new NotFoundException('Friend request not found');
      }

      // The sender's side, only while they are still asking. Nothing to update
      // means there is no request any more, and the whole accept rolls back.
      const mirror = await c.query<{ id: string }>(
        `update friends f
            set status = 'accepted', friend_email = u.email
           from users u
          where f.user_id = $1 and f.friend_user_id = $2
            and f.status = 'pending' and f.requested_by = 'me'
            and u.id = f.friend_user_id
          returning f.id`,
        [other, userId],
      );
      if (mirror.rows.length === 0) {
        throw new NotFoundException('Friend request not found');
      }
    });

    // Declining is deliberately silent. "X declined your request" is a message
    // nobody benefits from receiving.
    if (status === 'accepted') {
      const me = await this.accountById(userId);
      await this.notifier.notify([other], {
        topic: 'friend-accepted',
        title: 'Friend request accepted',
        body: `${me ? this.nameFor(me) : 'Someone'} accepted your request`,
        data: { type: 'friend_accepted', fromUserId: userId },
      });
    }

    return this.get(userId, id);
  }
}
