import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OwnedResourceService } from '../common/owned-resource.service';
import { DatabaseService } from '../database/database.service';
import { PushService } from '../notifications/push.service';
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
    private readonly push: PushService,
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
  async areFriends(userId: string, otherUserId: string): Promise<boolean> {
    const row = await this.db.queryOne<{ id: string }>(
      `select id from friends
        where user_id = $1 and friend_user_id = $2 and status = 'accepted'`,
      [userId, otherUserId],
    );
    return row !== null;
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

    await this.notify(target.id, {
      title: 'New friend request',
      body: `${this.nameFor(me)} wants to connect on Virgo`,
      data: { type: 'friend_request', fromUserId: userId },
    });

    return { status: 'pending', friend: mine };
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

    if (status === 'accepted' && mine.friend_user_id) {
      const me = await this.accountById(userId);
      await this.notify(mine.friend_user_id, {
        title: 'Friend request accepted',
        body: `${me ? this.nameFor(me) : 'Someone'} accepted your request`,
        data: { type: 'friend_accepted', fromUserId: userId },
      });
    }

    return updated;
  }

  /**
   * Best-effort push.
   *
   * Never throws: a delivery failure must not roll back a friendship that is
   * already recorded, nor fail the request that created it.
   */
  private async notify(
    userId: string,
    message: { title: string; body: string; data: Record<string, unknown> },
  ): Promise<void> {
    try {
      const tokens = await this.push.tokensFor(userId);
      if (tokens.length === 0) return;
      await this.push.send(
        tokens.map((to) => ({
          to,
          title: message.title,
          body: message.body,
          channelId: 'reminders',
          sound: 'default' as const,
          data: message.data,
        })),
      );
    } catch {
      // Swallowed on purpose — see above.
    }
  }
}
