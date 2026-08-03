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
import { generateId } from '../common/id';
import { FriendRow, FriendsRepository } from './friends.repository';

interface AccountRow {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
}

/**
 * Friendships between real accounts.
 *
 * A friendship is two rows, one owned by each side, so both people can read and
 * act on it under the same `user_id`-scoped rules as every other resource. The
 * pair is written and updated together.
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
  ) {
    super(friends, 'Friend');
  }

  private async findAccountByEmail(email: string): Promise<AccountRow | null> {
    return this.db.queryOne<AccountRow>(
      `select id, email, display_name, avatar_url
         from users where lower(email) = lower($1)`,
      [email.trim()],
    );
  }

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
   * Each result carries the caller's relationship to that account, so the UI
   * can show "Add", "Pending" or "Friends" without a second round trip.
   *
   * A minimum query length and a hard result cap keep this from being a way to
   * walk the whole user table; the caller is always excluded.
   */
  async searchPeople(
    userId: string,
    query: string,
  ): Promise<
    {
      id: string;
      name: string;
      email: string;
      avatarUrl: string | null;
      relationship: 'none' | 'pending_out' | 'pending_in' | 'accepted';
    }[]
  > {
    const q = query.trim();
    if (q.length < 2) return [];

    const rows = await this.db.query<{
      id: string;
      email: string;
      display_name: string | null;
      avatar_url: string | null;
      status: string | null;
      requested_by: string | null;
    }>(
      `select u.id, u.email, u.display_name, u.avatar_url,
              f.status, f.requested_by
         from users u
         left join friends f
           on f.user_id = $1 and f.friend_user_id = u.id
        where u.id <> $1
          and (
                -- Opting out of discovery hides you from name search only.
                -- Someone who already knows your address can still reach you,
                -- which is what makes an invitation possible at all.
                (u.discoverable and u.display_name ilike $2)
                or lower(u.email) = lower($3)
              )
        order by u.display_name nulls last, u.email
        limit 20`,
      // Prefix match on the name, but an exact match on the email: a partial
      // email match would turn this into an address harvester.
      [userId, `${q}%`, q],
    );

    return rows.map((r) => ({
      id: r.id,
      name: this.nameFor({
        id: r.id,
        email: r.email,
        display_name: r.display_name,
        avatar_url: r.avatar_url,
      }),
      email: r.email,
      avatarUrl: r.avatar_url,
      relationship:
        r.status === 'accepted'
          ? 'accepted'
          : r.status === 'pending'
            ? r.requested_by === 'me'
              ? 'pending_out'
              : 'pending_in'
            : 'none',
    }));
  }

  /** Sends a request to an account chosen from search. */
  async sendRequestToUser(
    userId: string,
    targetUserId: string,
  ): Promise<{ status: string; friend: FriendRow }> {
    const target = await this.accountById(targetUserId);
    if (!target) throw new NotFoundException('That account no longer exists');
    return this.sendRequest(userId, target.email);
  }

  /** True when an accepted friendship exists in the caller's direction. */
  /**
   * Whether these two have actually agreed to know each other.
   *
   * Both rows must say so. A friendship is two rows written together by
   * `respond()`, and checking only the caller's own copy meant one side could
   * manufacture the relationship alone — which is precisely what the writable
   * `status` column allowed until it was removed.
   *
   * Requiring both is defence in depth: even if some future path writes one row
   * in isolation, it grants nothing on its own.
   */
  async areFriends(userId: string, otherUserId: string): Promise<boolean> {
    const row = await this.db.queryOne<{ both: string }>(
      `select count(*)::text as both
         from friends
        where status = 'accepted'
          and ((user_id = $1 and friend_user_id = $2)
            or (user_id = $2 and friend_user_id = $1))`,
      [userId, otherUserId],
    );
    return Number(row?.both ?? 0) === 2;
  }

  /**
   * Sends a friend request to the account holding `email`.
   *
   * Both directions are written in one transaction — mine as requested_by
   * 'me', theirs as 'them'. Half a pair would appear as a request on one side
   * only, which is exactly the old behaviour.
   */
  async sendRequest(
    userId: string,
    email: string,
  ): Promise<{ status: string; friend: FriendRow }> {
    if (!email?.trim()) {
      throw new BadRequestException('Choose someone to send a request to');
    }
    const target = await this.findAccountByEmail(email);

    // Same message whether no account uses the address or it is the caller's
    // own — otherwise this endpoint reports which emails are registered.
    if (!target || target.id === userId) {
      throw new NotFoundException('No Virgo account uses that email address');
    }

    const existing = await this.db.queryOne<FriendRow>(
      'select * from friends where user_id = $1 and friend_user_id = $2',
      [userId, target.id],
    );
    if (existing?.status === 'accepted') {
      throw new BadRequestException('You are already friends');
    }
    if (existing?.status === 'pending') {
      throw new BadRequestException(
        existing.requested_by === 'me'
          ? 'You have already sent them a request'
          : 'They have already sent you a request — accept it instead',
      );
    }

    const me = await this.accountById(userId);
    if (!me) throw new NotFoundException('Account not found');

    // A previously declined pair is reused: the unique index permits only one
    // row per direction.
    const upsert = `
      insert into friends
        (id, user_id, friend_user_id, friend_name, friend_email,
         friend_avatar_url, status, requested_by)
      values ($1, $2, $3, $4, $5, $6, 'pending', $7)
      on conflict (user_id, friend_user_id) where friend_user_id is not null
      do update set status = 'pending',
                    requested_by = excluded.requested_by,
                    friend_name = excluded.friend_name,
                    friend_email = excluded.friend_email,
                    friend_avatar_url = excluded.friend_avatar_url
      returning *`;

    const mine = await this.db.transaction(async (client) => {
      const { rows } = await client.query<FriendRow>(upsert, [
        generateId(),
        userId,
        target.id,
        this.nameFor(target),
        target.email,
        target.avatar_url,
        'me',
      ]);

      await client.query(upsert, [
        generateId(),
        target.id,
        userId,
        this.nameFor(me),
        me.email,
        me.avatar_url,
        'them',
      ]);

      return rows[0];
    });

    await this.notifier.notify([target.id], {
      topic: 'friend-request',
      title: 'New friend request',
      body: `${this.nameFor(me)} wants to connect on Virgo`,
      data: { type: 'friend_request', fromUserId: userId },
      email: friendRequest({
        requesterName: this.nameFor(me),
        url: `${this.mailConfig.appUrl}/network`,
      }),
    });

    return { status: 'pending', friend: mine };
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
   * Accepts an optional client so a caller already inside a transaction gets
   * one atomic unit rather than two that can half-fail.
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

  /** Accepts a request addressed to the caller, and tells the sender. */
  async accept(userId: string, id: string): Promise<FriendRow> {
    return this.respond(userId, id, 'accepted');
  }

  async decline(userId: string, id: string): Promise<FriendRow> {
    return this.respond(userId, id, 'declined');
  }

  private async respond(
    userId: string,
    id: string,
    status: 'accepted' | 'declined',
  ): Promise<FriendRow> {
    const mine = await this.db.queryOne<FriendRow>(
      'select * from friends where id = $1 and user_id = $2',
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

    const updated = await this.db.transaction(async (client) => {
      const { rows } = await client.query<FriendRow>(
        'update friends set status = $2 where id = $1 returning *',
        [id, status],
      );
      if (mine.friend_user_id) {
        // Keep the other direction in step, or the sender's copy stays
        // pending forever.
        await client.query(
          `update friends set status = $3
            where user_id = $1 and friend_user_id = $2`,
          [mine.friend_user_id, userId, status],
        );
      }
      return rows[0];
    });

    // Declining is deliberately silent. "X declined your request" is a message
    // nobody benefits from receiving.
    if (status === 'accepted' && mine.friend_user_id) {
      const me = await this.accountById(userId);
      await this.notifier.notify([mine.friend_user_id], {
        topic: 'friend-accepted',
        title: 'Friend request accepted',
        body: `${me ? this.nameFor(me) : 'Someone'} accepted your request`,
        data: { type: 'friend_accepted', fromUserId: userId },
      });
    }

    return updated;
  }
}
