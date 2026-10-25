import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { PromosService } from '../promos/promos.service';
import type { StorageService } from '../storage/storage.service';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import type { SessionsService } from './sessions.service';
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function serviceFor(user: UserRow) {
  const users = {
    findByEmail: jest.fn(async () => user),
    findById: jest.fn(async () => user),
    findActiveRefreshToken: jest.fn(async () => ({ id: 't1', user_id: user.id })),
    revokeRefreshToken: jest.fn(async () => undefined),
    storeRefreshToken: jest.fn(async () => undefined),
    forgetPushToken: jest.fn(async () => undefined),
    enable: jest.fn(async () => ({ ...user, disabled_until: null })),
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

  const sessions = { alertNewSignIn: jest.fn(async () => undefined) };

  const service = new AuthService(
    users as unknown as UsersRepository,
    jwt as unknown as JwtService,
    config as unknown as ConfigService,
    {} as unknown as StorageService,
    {} as unknown as PromosService,
    twoFactor as unknown as TwoFactorService,
    sessions as unknown as SessionsService,
  );
  return { service, users, jwt, twoFactor, sessions };
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

describe('AuthService.forgetDevice', () => {
  it('finds the session by the same hash logout revokes', async () => {
    const { service, users } = serviceFor(userWith());

    await service.logout('refresh-token');
    await service.forgetDevice('refresh-token', 'ExponentPushToken[abc]');

    const [revokedHash] = users.revokeRefreshToken.mock.calls[0] as unknown as [string];
    expect(users.forgetPushToken).toHaveBeenCalledWith(revokedHash, 'ExponentPushToken[abc]');
    // Never the raw token: the table only holds hashes.
    expect(revokedHash).not.toBe('refresh-token');
  });
});

describe('AuthService.login and a paused account', () => {
  const PAUSED = { disabled_until: new Date(Date.now() + 30 * 86_400_000) };

  it('refuses sign-in during a pause, as before', async () => {
    const { service, users } = serviceFor(userWith(PAUSED));
    await expect(service.login('mika@example.com', PASSWORD)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ACCOUNT_DISABLED' }),
    });
    expect(users.enable).not.toHaveBeenCalled();
  });

  // There was no way back before the date: lifting it needed a session.
  it('lifts the pause and signs in when asked to', async () => {
    const { service, users } = serviceFor(userWith(PAUSED));
    const result = await service.login('mika@example.com', PASSWORD, { unpause: true });
    expect(users.enable).toHaveBeenCalledWith('user-1');
    expect(result).toHaveProperty('accessToken');
  });

  it('never lifts a suspension', async () => {
    const { service, users } = serviceFor(userWith({ ...PAUSED, ...SUSPENDED }));
    await expect(
      service.login('mika@example.com', PASSWORD, { unpause: true }),
    ).rejects.toEqual(suspendedRefusal);
    expect(users.enable).not.toHaveBeenCalled();
  });
});

/**
 * A signed-in device is one family of refresh tokens, so the console can list
 * it as one row and sign it out. Refreshing must keep the family, and only
 * the device type is kept — never an address.
 */
describe('AuthService and the device a session belongs to', () => {
  it('starts a new device at sign-in, with its User-Agent', async () => {
    const { service, users } = serviceFor(userWith());
    await service.login('mika@example.com', PASSWORD, { userAgent: 'Virgo/1 CFNetwork Darwin' });
    expect(users.storeRefreshToken).toHaveBeenCalledWith(
      'user-1',
      expect.any(String),
      expect.any(Date),
      { familyId: expect.stringMatching(UUID), userAgent: 'Virgo/1 CFNetwork Darwin', client: 'ios' },
    );
  });

  it('names the device in the access token, so a request can say where it came from', async () => {
    const { service, users, jwt } = serviceFor(userWith());
    await service.login('mika@example.com', PASSWORD, { userAgent: 'okhttp/4.12' });
    const [, , , device] = users.storeRefreshToken.mock.calls[0] as unknown as [
      string,
      string,
      Date,
      { familyId: string },
    ];
    expect(jwt.signAsync).toHaveBeenCalledWith(
      { sub: 'user-1', email: 'mika@example.com', sid: device.familyId },
      expect.anything(),
    );

    // And it stays the same device across a refresh.
    users.findActiveRefreshToken.mockResolvedValueOnce({
      id: 't1',
      user_id: 'user-1',
      family_id: 'family-1',
      user_agent: 'okhttp/4.12',
    } as never);
    await service.refresh('refresh-token');
    expect(jwt.signAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({ sid: 'family-1' }),
      expect.anything(),
    );
  });

  it('hands the session on to the request', () => {
    const strategy = new JwtStrategy({
      getOrThrow: () => 'a-test-secret-that-is-long-enough-to-sign-with',
    } as unknown as ConfigService);
    expect(strategy.validate({ sub: 'user-1', email: 'mika@example.com', sid: 'family-1' })).toEqual({
      id: 'user-1',
      email: 'mika@example.com',
      sessionId: 'family-1',
    });
    // A token from before tokens named their session still signs in.
    expect(strategy.validate({ sub: 'user-1', email: 'mika@example.com' }).sessionId).toBeUndefined();
  });

  it('keeps the device across a refresh', async () => {
    const { service, users } = serviceFor(userWith());
    users.findActiveRefreshToken.mockResolvedValueOnce({
      id: 't1',
      user_id: 'user-1',
      family_id: 'family-1',
      user_agent: 'okhttp/4.12',
    } as never);
    await service.refresh('refresh-token');
    expect(users.storeRefreshToken).toHaveBeenCalledWith(
      'user-1',
      expect.any(String),
      expect.any(Date),
      { familyId: 'family-1', userAgent: 'okhttp/4.12', client: 'android' },
    );
  });

  it('gives a token from before devices were tracked a family of its own', async () => {
    const { service, users } = serviceFor(userWith());
    await service.refresh('refresh-token', 'Mozilla/5.0 Chrome');
    expect(users.storeRefreshToken).toHaveBeenCalledWith(
      'user-1',
      expect.any(String),
      expect.any(Date),
      { familyId: expect.stringMatching(UUID), userAgent: 'Mozilla/5.0 Chrome', client: 'web' },
    );
  });

  it('keeps the client a session recorded, whatever the next request says', async () => {
    const { service, users } = serviceFor(userWith());
    users.findActiveRefreshToken.mockResolvedValueOnce({
      id: 't1',
      user_id: 'user-1',
      family_id: 'family-1',
      user_agent: 'Mozilla/5.0 Edg/155',
      client: 'desktop',
    } as never);
    await service.refresh('refresh-token', 'Mozilla/5.0 Edg/155');
    expect(users.storeRefreshToken).toHaveBeenCalledWith(
      'user-1',
      expect.any(String),
      expect.any(Date),
      expect.objectContaining({ client: 'desktop' }),
    );
  });

  it('tells the desktop app from Edge by its origin', async () => {
    const { service, users } = serviceFor(userWith());
    await service.login('mika@example.com', PASSWORD, {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/155 Edg/155',
      origin: 'http://127.0.0.1:41730',
    });
    expect(users.storeRefreshToken).toHaveBeenCalledWith(
      'user-1',
      expect.any(String),
      expect.any(Date),
      expect.objectContaining({ client: 'desktop' }),
    );
  });
});

/**
 * A new device signing in emails the owner; nothing else does.
 *
 * On 2026-10-25 a stranger signed in with an owner's password and deleted a
 * workspace two minutes later, and nobody was told.
 */
describe('AuthService and sign-in alerts', () => {
  it('alerts about a password sign-in, naming the session it made', async () => {
    const { service, users, sessions } = serviceFor(userWith());
    const context = { userAgent: 'Virgo/9 CFNetwork Darwin/27.0.0', country: 'US' };
    await service.login('mika@example.com', PASSWORD, context);

    const [, , , device] = users.storeRefreshToken.mock.calls[0] as unknown as [
      string,
      string,
      Date,
      { familyId: string },
    ];
    expect(sessions.alertNewSignIn).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'user-1' }),
      device.familyId,
      context,
    );
  });

  it('alerts once the second factor is in, not when the code is sent', async () => {
    const { service, sessions } = serviceFor(
      userWith({ two_factor_enabled_at: new Date('2026-02-01T00:00:00Z') }),
    );
    await service.login('mika@example.com', PASSWORD, { userAgent: 'okhttp/4.12' });
    expect(sessions.alertNewSignIn).not.toHaveBeenCalled();

    await service.completeTwoFactorLogin('challenge', '123456', { userAgent: 'okhttp/4.12' });
    expect(sessions.alertNewSignIn).toHaveBeenCalledTimes(1);
  });

  it('stays quiet for a refresh, which is the same device again', async () => {
    const { service, sessions } = serviceFor(userWith());
    await service.refresh('refresh-token', 'okhttp/4.12');
    expect(sessions.alertNewSignIn).not.toHaveBeenCalled();
  });

  it('stays quiet for a wrong password', async () => {
    const { service, sessions } = serviceFor(userWith());
    await expect(service.login('mika@example.com', 'wrong')).rejects.toThrow();
    expect(sessions.alertNewSignIn).not.toHaveBeenCalled();
  });
});
