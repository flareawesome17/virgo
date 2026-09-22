import { blockedBetween, suspendedAccount } from '../safety/block-sql';

/**
 * How friendships are read, in one place.
 *
 * A friendship is two rows, one owned by each side, and almost every bug this
 * module has had came from some query trusting one row on its own: a half-pair
 * counted as a friend, an orphaned request left in an inbox, an email copied
 * across before anyone agreed to anything. Everything that reads the pair —
 * the list and its count, search, Nearby, presence, chat participants — builds
 * on these fragments instead of writing its own.
 *
 * Aliases passed in are the caller's own, never request data.
 */

/** How long a decline holds a repeat request silently. */
export const COOLDOWN_DAYS = 30;

/**
 * Joins `f` to its mirror `b`, and only when both sides say accepted.
 *
 * One accepted row is not a friendship. It is what an unfriend used to leave
 * behind, and counting it would show someone as a friend who is not one.
 */
export const MIRRORED_ACCEPTED_JOIN = (f: string, b: string): string =>
  `join friends ${b} on ${b}.user_id = ${f}.friend_user_id and ${b}.friend_user_id = ${f}.user_id and ${b}.status = 'accepted'`;

/**
 * True for the decliner's own row while the decline is recent enough to hold
 * a repeat request silently.
 *
 * declined_at is kept by a trigger (069). updated_at is the fallback for a row
 * declined before it existed, which the migration backfilled anyway.
 */
export const cooling = (t: string): string =>
  `(${t}.status = 'declined' and ${t}.requested_by = 'them' and coalesce(${t}.declined_at, ${t}.updated_at) > now() - interval '${COOLDOWN_DAYS} days')`;

/**
 * The viewer's relationship to someone, from both rows: `m` is the viewer's
 * row and `t` is the other person's.
 *
 * A request the other person declined reads exactly like one they have not
 * answered — 'pending_out', at any age. Letting it lapse back to 'none' after
 * the window would itself be the signal, telling the requester they were
 * turned down.
 */
export const relationshipCase = (m: string, t: string): string =>
  `case when ${m}.status = 'accepted' and ${t}.status = 'accepted' then 'accepted' when ${m}.status = 'pending' and ${m}.requested_by = 'them' and ${t}.status = 'pending' and ${t}.requested_by = 'me' then 'pending_in' when ${m}.status = 'pending' and ${m}.requested_by = 'me' and ${t}.requested_by = 'them' and ${t}.status in ('pending', 'declined') then 'pending_out' else 'none' end`;

/**
 * Which of the owner's rows are shown. `f` is the owner's row, `b` its mirror
 * (left-joined, so absent for legacy rows and orphans).
 *
 * - Legacy free-text rows, always: they describe no account.
 * - The owner's own decline records.
 * - Friendships both sides accepted.
 * - An incoming request whose sender is still asking.
 * - An outgoing request the other side has not withdrawn — answered or not,
 *   because a decline has to look like silence.
 *
 * Never across a block, and a request from or to a suspended account is
 * hidden (not deleted) until the suspension is lifted. A friendship with a
 * suspended account stays listed.
 */
export const FRIEND_VISIBLE = `(f.friend_user_id is null or (not ${blockedBetween('f.user_id', 'f.friend_user_id')} and ((f.status = 'declined' and f.requested_by = 'them') or (f.status = 'accepted' and b.status = 'accepted') or (f.status = 'pending' and f.requested_by = 'them' and b.status = 'pending' and b.requested_by = 'me' and not ${suspendedAccount('f.friend_user_id')}) or (f.status = 'pending' and f.requested_by = 'me' and b.requested_by = 'them' and b.status in ('pending', 'declined') and not ${suspendedAccount('f.friend_user_id')}))))`;

/**
 * A friend row as clients see it, with the mirror joined as `b` for
 * FRIEND_VISIBLE.
 *
 * friend_email only on legacy free-text rows, where it is the address the
 * owner typed themselves. On every row that points at an account it is null —
 * a friendship, including one made by accepting a hire enquiry or a job
 * application, never hands over an address. The stored copies are still
 * written, so a rollback to the release before this one shows friends what it
 * always did; they are masked here, whatever wrote them.
 */
export const FRIEND_PRESENTED = `select f.id, f.user_id, f.friend_user_id, f.friend_name,
       case when f.friend_user_id is null then f.friend_email end as friend_email,
       f.friend_avatar_url, f.status, f.requested_by, f.created_at, f.updated_at
  from friends f
  left join friends b on b.user_id = f.friend_user_id and b.friend_user_id = f.user_id`;
