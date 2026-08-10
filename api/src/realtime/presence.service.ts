import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

/**
 * Who is online, and who is allowed to know.
 *
 * Presence itself lives in the gateway — it is a fact about open sockets. This
 * is the part that needs the database: recording when somebody was last seen,
 * and working out who should be told when that changes.
 *
 * Kept out of the gateway so the gateway stays a transport. Kept out of
 * MessagesService because that already depends on the gateway, and a gateway
 * that depended back on it would be a cycle.
 *
 * **Presence is not public.** It is shared only with people you already share
 * a conversation with. Broadcasting every connect to every account would leak
 * a working pattern — when somebody is at their desk, when they stopped — to
 * strangers who happen to have the app open.
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
   * Everyone entitled to hear that this person's presence changed.
   *
   * Anyone sharing a conversation with them — which is exactly the set of
   * people who have a screen where the answer is rendered.
   */
  async audienceFor(userId: string): Promise<string[]> {
    try {
      // Chat partners *and* accepted friends. Partners alone was right while
      // presence only decorated the chat list; a friends list in the sidebar
      // needs it for people you have never messaged, who would otherwise sit
      // there permanently grey.
      const rows = await this.db.query<{ user_id: string }>(
        `select distinct other.user_id
           from conversation_participants mine
           join conversation_participants other
             on other.conversation_id = mine.conversation_id
          where mine.user_id = $1
            and other.user_id <> $1
          union
         select distinct case
                  when f.user_id = $1 then f.friend_user_id
                  else f.user_id
                end as user_id
           from friends f
          where f.status = 'accepted'
            and f.friend_user_id is not null
            and (f.user_id = $1 or f.friend_user_id = $1)`,
        [userId],
      );
      // The union can yield a null when a legacy row has no account attached.
      return rows.map((r) => r.user_id).filter((id): id is string => !!id);
    } catch (err) {
      this.logger.debug(`Could not resolve presence audience: ${String(err)}`);
      return [];
    }
  }

  /** The other members of a conversation, if the caller is in it. */
  async othersInConversation(
    userId: string,
    conversationId: string,
  ): Promise<{ allowed: boolean; others: string[]; name: string }> {
    try {
      const rows = await this.db.query<{ user_id: string; name: string }>(
        `select p.user_id,
                coalesce(u.display_name, split_part(u.email, '@', 1)) as name
           from conversation_participants p
           join users u on u.id = p.user_id
          where p.conversation_id = $1`,
        [conversationId],
      );

      const me = rows.find((r) => r.user_id === userId);
      // Membership is checked here rather than trusted from the client: a
      // typing frame naming someone else's conversation would otherwise be a
      // way to discover that it exists.
      if (!me) return { allowed: false, others: [], name: '' };

      return {
        allowed: true,
        others: rows.filter((r) => r.user_id !== userId).map((r) => r.user_id),
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
