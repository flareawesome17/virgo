/**
 * SQL fragments for blocks and suspensions, with no DI.
 *
 * Plain strings so Presence, Discover and Profiles can use them without
 * importing a module. Every argument is interpolated, not bound, so it must be
 * a placeholder position (`'$2'`) or a column name the calling class wrote
 * itself (`'u.id'`) — never anything that came from a request.
 */

/**
 * True when either of the two has blocked the other.
 *
 * Both directions, always: being blocked has to look exactly like the other
 * person not being there, so a check that only asked "did I block them" would
 * tell the blocked side what happened.
 */
export const blockedBetween = (a: string, b: string): string =>
  `exists (select 1 from user_blocks ub where (ub.blocker_id = ${a} and ub.blocked_id = ${b}) or (ub.blocker_id = ${b} and ub.blocked_id = ${a}))`;

/**
 * True when the account in `col` is suspended from the console.
 *
 * Used to hide what a suspended account sent — its pending requests, its open
 * enquiries — rather than to delete it, so lifting the suspension brings it
 * all back. The same argument rule as blockedBetween applies.
 */
export const suspendedAccount = (col: string): string =>
  `exists (select 1 from users su where su.id = ${col} and su.suspended_at is not null)`;

/**
 * Serialises everything that creates, revives, answers or removes a tie
 * between two specific people: friend requests and their answers, unfriending,
 * connect(), a block, and the hire, job and event accepts.
 *
 * It must be the first statement of its transaction, before any row write and
 * before the reads the transaction decides on. Row locks taken first in one
 * path and this lock first in another is exactly the order inversion that
 * deadlocks, so there is one rule and every path follows it.
 *
 * The key is symmetric — least/greatest of the two ids — so ($1, $2) and
 * ($2, $1) take the same lock. Transaction-level advisory locks are re-entrant
 * within a session, which is what lets connect() take it again on a client
 * whose caller already holds it.
 */
export const PAIR_LOCK_SQL =
  `select pg_advisory_xact_lock(hashtextextended('virgo.pair:' || least($1::text, $2::text) || ':' || greatest($1::text, $2::text), 0))`;

/**
 * A uuid's shape, checked before a client-supplied id reaches a uuid column.
 * A malformed one would otherwise be a 22P02 from Postgres, which is a 500.
 */
export const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
