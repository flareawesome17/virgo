import { ForbiddenException } from '@nestjs/common';
import type { UserRow } from './users.repository';

/**
 * Why this account may not have a session right now, or null when it may.
 *
 * Pure, so the rule reads in one place and can be tested without a database:
 * AuthService refuses every token it would issue through this.
 *
 * A console suspension comes first. It outranks a pause the person set
 * themselves — telling a suspended account "it comes back on the 14th" would
 * be a promise nobody made.
 *
 * A pause returns its date rather than hiding it. Someone who paused their
 * account and forgot needs to be told when it comes back, or their only option
 * is to guess — and a bare "account disabled" reads as a ban.
 */
export function accountRefusal(
  user: Pick<UserRow, 'suspended_at' | 'disabled_until'>,
  now: number = Date.now(),
): ForbiddenException | null {
  if (user.suspended_at) {
    return new ForbiddenException({
      message:
        'This account has been suspended. If you think this is a mistake, email support@virgo.ph.',
      error: 'AccountSuspended',
      code: 'ACCOUNT_SUSPENDED',
      statusCode: 403,
    });
  }

  if (!user.disabled_until) return null;
  const until = new Date(user.disabled_until);
  // Lifts on its own: nothing clears the column, the comparison just stops
  // being true. See migration 027.
  if (until.getTime() <= now) return null;

  return new ForbiddenException({
    message: `You paused this account. It comes back on ${until.toISOString().slice(0, 10)}.`,
    error: 'AccountDisabled',
    code: 'ACCOUNT_DISABLED',
    disabledUntil: until.toISOString(),
    statusCode: 403,
  });
}
