import type { LoginOutcome } from '@/api/console';

/** How each sign-in outcome reads, and the colour of its dot. */
export const LOGIN_OUTCOME: Record<
  LoginOutcome,
  { label: string; tone: 'ok' | 'warn' | 'danger' | 'muted' }
> = {
  success: { label: 'Signed in', tone: 'ok' },
  bad_password: { label: 'Wrong password', tone: 'warn' },
  bad_code: { label: 'Wrong code', tone: 'warn' },
  locked: { label: 'Refused: locked', tone: 'danger' },
  disabled: { label: 'Refused: disabled', tone: 'danger' },
  unknown: { label: 'No such account', tone: 'muted' },
};
