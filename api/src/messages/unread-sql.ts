import { blockedBetween } from '../safety/block-sql';

/**
 * How many unread messages one person has, as a scalar subquery.
 *
 * The one definition of the messages half of every badge: the Messages count
 * in the apps (MessagesService.unreadCount) and the number a push sets on the
 * phone's app icon (PushService.badgeCounts). Two copies of these rules would
 * be two badges that disagree the first time either is changed.
 *
 * `user` is interpolated, not bound, so it must be a placeholder position
 * (`'$1'`) or a column the calling query wrote itself (`'r.id'`) — never
 * anything that came from a request. The same rule as block-sql.ts.
 */
export const unreadMessagesCount = (user: string): string => `(
  select count(*)
    from messages m
    join conversation_participants p
      on p.conversation_id = m.conversation_id and p.user_id = ${user}
   where m.sender_id <> ${user}
     and m.deleted_at is null
     and (p.cleared_at is null or m.created_at > p.cleared_at)
     and (p.last_read_at is null or m.created_at > p.last_read_at)
     -- Muted conversations are left out. Somebody muting a busy group is
     -- asking it to stop calling for attention, and a badge that never clears
     -- is exactly that. Its row in the list still shows its own count.
     and (p.muted_until is null or p.muted_until <= now())
     and not exists (
           select 1 from message_deletions d
            where d.message_id = m.id and d.user_id = ${user}
         )
     -- A blocked sender, either way, never does — the same rule as the
     -- per-conversation count, so the tab and the list agree.
     and not ${blockedBetween(user, 'm.sender_id')}
)`;
