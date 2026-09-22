import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { MIRRORED_ACCEPTED_JOIN } from '../friends/friend-sql';
import { blockedBetween } from '../safety/block-sql';

/**
 * Who is online, and who is allowed to know.
 *
 * Presence itself lives in the gateway — it is a fact about open sockets. This
 * is the part that needs the database: recording when somebody was last seen,
 * and working out who should be told when that changes.
 *
 * Kept out of the gateway so the gateway stays a transport. Kept out of
 * MessagesService because that already depends on the gateway, and a gateway
 * that depended back on it would be a cycle. The block fragments are plain SQL
 * for the same reason: importing BlocksService here would be one more edge in
 * a graph the gateway sits at the bottom of.
 *
 * **Presence is not public.** It is shared only with direct-chat partners and
 * friends, and never across a block. Broadcasting every connect to every
 * account would leak a working pattern — when somebody is at their desk, when
 * they stopped — to strangers who happen to have the app open.
 */
@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Stamps the moment, for "last seen" once they are gone.
   *
   * Called on connect as well as disconnect: a process that is killed never
   * gets to run its disconnect handler, and a stamp from the start of the
   * session is a far better answer than one from whenever they last signed up.
   */
  async touch(userId: string): Promise<void> {
    try {
      await this.db.query(
        'update users set last_seen_at = now() where id = $1',
        [userId],
      );
    } catch (err) {
      // Presence is decoration. It must never take a socket down with it.
      this.logger.debug(`Could not stamp last_seen for ${userId}: ${String(err)}`);
    }
  }

  /**
   * Whether this account may hold a live session: it still exists and the
   * console has not suspended it.
   *
   * Asked when a socket authenticates, because the token cannot say. One
   * issued just before a suspension stays valid for up to fifteen minutes,
   * and the clients reconnect with the token they stored whenever the app
   * comes back to the foreground or the tab becomes visible again.
   *
   * Throws when the database cannot answer rather than guessing either way,
   * so the gateway can tell "no" from "could not ask" and refuse only the
   * first for good.
   */
  async mayConnect(userId: string): Promise<boolean> {
    const row = await this.db.queryOne<{ suspended_at: Date | null }>(
      'select suspended_at from users where id = $1',
      [userId],
    );
    return !!row && row.suspended_at === null;
  }

  /**
   * Everyone entitled to hear that this person's presence changed.
   *
   * Direct-chat partners and friends — the people who have a screen where the
   * answer is rendered — minus anyone on either side of a block with them.
   *
   * Group co-members are not in it. No screen shows a group member's dot, so
   * telling them was a stranger learning when you come and go for nothing.
   * Direct partners stay even after an unfriend: every direct thread started
   * as a friendship, and the thread is still usable.
   */
  async audienceFor(userId: string): Promise<string[]> {
    try {
      // Chat partners *and* friends. Partners alone was right while presence
      // only decorated the chat list; a friends list in the sidebar needs it
      // for people you have never messaged, who would otherwise sit there
      // permanently grey. A friend is both rows accepted — one row on its own
      // is what an unfriend used to leave behind.
      const rows = await this.db.query<{ user_id: string }>(
        `select x.user_id
           from (
             select other.user_id
               from conversation_participants mine
               join conversations c
                 on c.id = mine.conversation_id and c.is_group = false
               join conversation_participants other
                 on other.conversation_id = mine.conversation_id
                and other.user_id <> $1
              where mine.user_id = $1
             union
             select f.friend_user_id as user_id
               from friends f
               ${MIRRORED_ACCEPTED_JOIN('f', 'b')}
              where f.user_id = $1 and f.status = 'accepted'
           ) x
          where x.user_id is not null
            and not ${blockedBetween('$1', 'x.user_id')}`,
        [userId],
      );
      // The union can yield a null when a legacy row has no account attached.
      return rows.map((r) => r.user_id).filter((id): id is string => !!id);
    } catch (err) {
      this.logger.debug(`Could not resolve presence audience: ${String(err)}`);
      return [];
    }
  }

  /**
   * The other members of a conversation who may see the caller type, if the
   * caller is in it.
   *
   * Anyone on either side of a block with the caller is left out, in groups as
   * well: "is typing" from someone you blocked is them reaching you.
   */
  async othersInConversation(
    userId: string,
    conversationId: string,
  ): Promise<{ allowed: boolean; others: string[]; name: string }> {
    try {
      const rows = await this.db.query<{
        user_id: string;
        name: string;
        blocked: boolean;
      }>(
        `select p.user_id,
                coalesce(u.display_name, split_part(u.email, '@', 1)) as name,
                ${blockedBetween('$2', 'p.user_id')} as blocked
           from conversation_participants p
           join users u on u.id = p.user_id
          where p.conversation_id = $1`,
        [conversationId, userId],
      );

      const me = rows.find((r) => r.user_id === userId);
      // Membership is checked here rather than trusted from the client: a
      // typing frame naming someone else's conversation would otherwise be a
      // way to discover that it exists.
      if (!me) return { allowed: false, others: [], name: '' };

      return {
        allowed: true,
        others: rows
          .filter((r) => r.user_id !== userId && !r.blocked)
          .map((r) => r.user_id),
        name: me.name,
      };
    } catch (err) {
      this.logger.debug(`Could not resolve conversation members: ${String(err)}`);
      return { allowed: false, others: [], name: '' };
    }
  }

  /** Last-seen timestamps for a set of accounts. */
  async lastSeen(userIds: readonly string[]): Promise<Map<string, Date | null>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.db.query<{ id: string; last_seen_at: Date | null }>(
      'select id, last_seen_at from users where id = any($1::uuid[])',
      [[...new Set(userIds)]],
    );
    return new Map(rows.map((r) => [r.id, r.last_seen_at]));
  }
}
