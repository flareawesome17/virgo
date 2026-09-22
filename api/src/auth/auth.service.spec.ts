import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { PromosService } from '../promos/promos.service';
import type { StorageService } from '../storage/storage.service';
import { AuthService } from './auth.service';
import type { TwoFactorService } from './two-factor.service';
import type { UserRow, UsersRepository } from './users.repository';

/**
 * Every way into a session refuses a suspended account.
 *
 * issueTokens is the one gate, so a path that forgets to ask cannot mint a
 * session anyway — finishing two-factor setup used to be exactly that path.
 */

const PASSWORD = 'correct horse battery staple';
const HASH = bcrypt.hashSync(PASSWORD, 4);

function userWith(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 'user-1',
    email: 'mika@example.com',
    password_hash: HASH,
    email_verified_at: new Date('2026-01-01T00:00:00Z'),
    disabled_until: null,
    suspended_at: null,
    two_factor_enabled_at: null,
    two_factor_recovery_codes: [],
    ...overrides,
  } as UserRow;
}

const SUSPENDED = { suspended_at: new Date('2026-09-01T00:00:00Z') };

function serviceFor(user: UserRow) {
  const users = {
    findByEmail: jest.fn(async () => user),
    findById: jest.fn(async () => user),
    findActiveRefreshToken: jest.fn(async () => ({ id: 't1', user_id: user.id })),
    revokeRefreshToken: jest.fn(async () => undefined),
    storeRefreshToken: jest.fn(async () => undefined),
  };
  const jwt = { signAsync: jest.fn(async () => 'access-token') };
  const config = {
    get: jest.fn((_key: string, fallback?: string) => fallback),
    getOrThrow: jest.fn(() => 'a-test-secret-that-is-long-enough-to-sign-with'),
  };
  const twoFactor = {
    confirmSetup: jest.fn(async () => ({ user, recoveryCodes: ['code-1'] })),
    completeLoginChallenge: jest.fn(async () => user),
    createLoginChallenge: jest.fn(async () => ({
      challengeToken: 'challenge',
      expiresIn: '10m' as const,
      email: user.email,
    })),
  };

  const service = new AuthService(
    users as unknown as UsersRepository,
    jwt as unknown as JwtService,
    config as unknown as ConfigService,
    {} as unknown as StorageService,
    {} as unknown as PromosService,
    twoFactor as unknown as TwoFactorService,
  );
  return { service, users, jwt, twoFactor };
}

const suspendedRefusal = expect.objectContaining({
  response: expect.objectContaining({ code: 'ACCOUNT_SUSPENDED' }),
});

describe('AuthService and a suspended account', () => {
  it('refuses to finish two-factor setup with a session', async () => {
    const { service, users, jwt } = serviceFor(userWith(SUSPENDED));

    await expect(
      service.confirmTwoFactorSetup('user-1', 'challenge', '123456'),
    ).rejects.toEqual(suspendedRefusal);
    expect(jwt.signAsync).not.toHaveBeenCalled();
    expect(users.storeRefreshToken).not.toHaveBeenCalled();
  });

  it('consumes the refresh token, then refuses to replace it', async () => {
    const { service, users, jwt } = serviceFor(userWith(SUSPENDED));

    await expect(service.refresh('refresh-token')).rejects.toEqual(suspendedRefusal);
    expect(users.revokeRefreshToken).toHaveBeenCalledTimes(1);
    expect(jwt.signAsync).not.toHaveBeenCalled();
    expect(users.storeRefreshToken).not.toHaveBeenCalled();
  });

  it('refuses the second factor', async () => {
    const { service, users } = serviceFor(userWith(SUSPENDED));

    await expect(service.completeTwoFactorLogin('challenge', '123456')).rejects.toEqual(
      suspendedRefusal,
    );
    expect(users.storeRefreshToken).not.toHaveBeenCalled();
  });

  it('refuses a password sign-in before emailing a login code', async () => {
    const { service, twoFactor } = serviceFor(
      userWith({ ...SUSPENDED, two_factor_enabled_at: new Date('2026-02-01T00:00:00Z') }),
    );

    await expect(service.login('mika@example.com', PASSWORD)).rejects.toEqual(suspendedRefusal);
    expect(twoFactor.createLoginChallenge).not.toHaveBeenCalled();
  });

  it('answers a wrong password the same way whether or not the account is suspended', async () => {
    const { service } = serviceFor(userWith(SUSPENDED));
    await expect(service.login('mika@example.com', 'wrong')).rejects.toThrow(
      'Invalid email or password',
    );
  });

  it('still signs in an account in good standing', async () => {
    const { service, users } = serviceFor(userWith());
    await expect(service.login('mika@example.com', PASSWORD)).resolves.toEqual(
      expect.objectContaining({ accessToken: 'access-token' }),
    );
    expect(users.storeRefreshToken).toHaveBeenCalledTimes(1);
  });
});
