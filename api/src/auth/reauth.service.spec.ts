import * as bcrypt from 'bcryptjs';
import { ReauthService } from './reauth.service';
import type { TwoFactorService } from './two-factor.service';
import type { UserRow, UsersRepository } from './users.repository';

/**
 * The question asked before a workspace or an album is deleted.
 *
 * A session alone was enough on 2026-10-25, and the session was a stranger's.
 * Every refusal is a 403 with a code the apps can act on; an app from before
 * this sends nothing and is told to update.
 */

const PASSWORD = 'correct horse battery staple';
const HASH = bcrypt.hashSync(PASSWORD, 4);

function reauthFor(user: Partial<UserRow> | null) {
  const users = {
    findById: jest.fn(async () =>
      user ? ({ id: 'user-1', password_hash: HASH, two_factor_enabled_at: null, ...user } as UserRow) : null,
    ),
  };
  const twoFactor = { confirmDelete: jest.fn(async () => undefined) };
  const reauth = new ReauthService(
    users as unknown as UsersRepository,
    twoFactor as unknown as TwoFactorService,
  );
  return { reauth, twoFactor };
}

/** The `code` a refusal carries. */
async function refusalCode(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (err) {
    const status = (err as { getStatus?: () => number }).getStatus?.();
    expect(status).toBe(403);
    return ((err as { getResponse: () => { code?: string } }).getResponse()).code;
  }
  throw new Error('expected a refusal');
}

describe('ReauthService.confirmDelete', () => {
  it('lets the password through when two-factor is off', async () => {
    const { reauth } = reauthFor({});
    await expect(reauth.confirmDelete('user-1', { password: PASSWORD })).resolves.toBeUndefined();
  });

  it('refuses a wrong password', async () => {
    const { reauth } = reauthFor({});
    expect(await refusalCode(reauth.confirmDelete('user-1', { password: 'guess' }))).toBe('WRONG_PASSWORD');
  });

  it('tells an app that sends nothing to update, rather than failing for no reason', async () => {
    const { reauth } = reauthFor({});
    const err = await reauth.confirmDelete('user-1', {}).catch((e: unknown) => e);
    expect((err as { getResponse: () => { code: string; message: string } }).getResponse()).toEqual(
      expect.objectContaining({ code: 'REAUTH_REQUIRED', message: expect.stringMatching(/Update Virgo/) }),
    );
  });

  it('asks for the emailed code, not the password, when two-factor is on', async () => {
    const { reauth, twoFactor } = reauthFor({ two_factor_enabled_at: new Date() });

    // A stolen password is not enough on its own.
    expect(await refusalCode(reauth.confirmDelete('user-1', { password: PASSWORD }))).toBe(
      'TWO_FACTOR_REQUIRED',
    );
    expect(twoFactor.confirmDelete).not.toHaveBeenCalled();

    const token = 'c'.repeat(43);
    await reauth.confirmDelete('user-1', { challengeToken: token, code: '123456' });
    expect(twoFactor.confirmDelete).toHaveBeenCalledWith('user-1', token, '123456');
  });

  it('asks for the password when an app sends a code for an account without two-factor', async () => {
    const { reauth, twoFactor } = reauthFor({});
    expect(
      await refusalCode(reauth.confirmDelete('user-1', { challengeToken: 'c'.repeat(43), code: '123456' })),
    ).toBe('PASSWORD_REQUIRED');
    expect(twoFactor.confirmDelete).not.toHaveBeenCalled();
  });
});
