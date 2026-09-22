import { ForbiddenException } from '@nestjs/common';
import { accountRefusal } from './account-state';

/** Who may have a session. Suspension first, then a pause, then nobody. */

const NOW = Date.parse('2026-09-22T12:00:00Z');

function codeOf(refusal: ForbiddenException | null): unknown {
  return (refusal?.getResponse() as { code?: string } | undefined)?.code;
}

describe('accountRefusal', () => {
  it('refuses a suspended account with its own code', () => {
    const refusal = accountRefusal(
      { suspended_at: new Date('2026-09-01T00:00:00Z'), disabled_until: null },
      NOW,
    );
    expect(refusal).toBeInstanceOf(ForbiddenException);
    expect(codeOf(refusal)).toBe('ACCOUNT_SUSPENDED');
    expect(refusal?.getResponse()).toEqual({
      message:
        'This account has been suspended. If you think this is a mistake, email support@virgo.ph.',
      error: 'AccountSuspended',
      code: 'ACCOUNT_SUSPENDED',
      statusCode: 403,
    });
  });

  it('refuses a paused account with the date it comes back, as before', () => {
    const refusal = accountRefusal(
      { suspended_at: null, disabled_until: new Date('2026-10-01T00:00:00Z') },
      NOW,
    );
    expect(codeOf(refusal)).toBe('ACCOUNT_DISABLED');
    expect(refusal?.getResponse()).toEqual({
      message: 'You paused this account. It comes back on 2026-10-01.',
      error: 'AccountDisabled',
      code: 'ACCOUNT_DISABLED',
      disabledUntil: '2026-10-01T00:00:00.000Z',
      statusCode: 403,
    });
  });

  it('lets a pause that has ended through', () => {
    expect(
      accountRefusal(
        { suspended_at: null, disabled_until: new Date('2026-09-01T00:00:00Z') },
        NOW,
      ),
    ).toBeNull();
    expect(accountRefusal({ suspended_at: null, disabled_until: null }, NOW)).toBeNull();
  });

  it('puts a suspension ahead of a pause', () => {
    const refusal = accountRefusal(
      {
        suspended_at: new Date('2026-09-01T00:00:00Z'),
        disabled_until: new Date('2026-10-01T00:00:00Z'),
      },
      NOW,
    );
    expect(codeOf(refusal)).toBe('ACCOUNT_SUSPENDED');
  });
});
