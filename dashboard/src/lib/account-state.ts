/**
 * What is stopping a Virgo account, as the list and the account page both
 * show it.
 *
 * Two different things, kept apart on purpose. A suspension is the console's
 * and only the console lifts it. A pause is the person's own and ends by
 * itself. `disabled_at` cannot tell them apart: a self-pause sets it too and
 * leaves it behind when the pause ends, which is how everyone who had ever
 * paused used to show as disabled here.
 */
interface AccountFields {
  disabled_at?: string | null;
  suspended_at?: string | null;
  disabled_until?: string | null;
}

/**
 * Whether the console has suspended the account.
 *
 * The `in` check, not `??`: an API from before suspensions had their own
 * column sends no `suspended_at` at all, and only then is `disabled_at` the
 * best there is. A null `suspended_at` is an answer — not suspended — and must
 * not fall through to the old column.
 */
export function isSuspended(user: AccountFields): boolean {
  return 'suspended_at' in user ? !!user.suspended_at : !!user.disabled_at;
}

/** Whether the person has paused their own account and the pause has not run out. */
export function isPaused(user: AccountFields, now = Date.now()): boolean {
  return !!user.disabled_until && new Date(user.disabled_until).getTime() > now;
}
