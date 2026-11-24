import { Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import type { BillingService } from '../billing/billing.service';
import type { MailConfig } from '../mail/mail.config';
import type { MailService } from '../mail/mail.service';
import type { ChatFilesService } from '../storage/chat-files.service';
import type { ReceiptFilesService } from '../storage/receipt-files.service';
import type { StorageService } from '../storage/storage.service';
import type { SupportFilesService } from '../storage/support-files.service';
import { AccountService } from './account.service';
import type { AppleIdentityService } from './apple-identity.service';
import type { AppleTokensService } from './apple-tokens.service';
import { DeleteAccountDto, DisableAccountDto } from './dto/auth.dto';
import type { UserRow, UsersRepository } from './users.repository';

/**
 * Pausing and deleting an account that signs in with Apple.
 *
 * An account Apple made has a password nobody was told, so these confirm with
 * Apple instead. Deleting also ends the Apple sign-in, as Apple's review rules
 * require, and never lets that stop the delete.
 */

const PASSWORD = 'correct horse';
const HASH = bcrypt.hashSync(PASSWORD, 4);
const APPLE = { identityToken: 'header.payload.signature', nonce: 'n'.repeat(32), authorizationCode: 'code-1' };

function accountFor(
  row: Partial<UserRow>,
  options: { verify?: () => Promise<{ sub: string }>; revoke?: () => Promise<string> } = {},
) {
  const user = {
    id: 'user-1',
    email: 'ana@example.com',
    display_name: 'Ana',
    password_hash: HASH,
    apple_sub: null,
    ...row,
  } as UserRow;
  const users = {
    findById: jest.fn(async () => user),
    remove: jest.fn(async () => true),
    disable: jest.fn(async () => undefined),
    revokeAllForUser: jest.fn(async () => undefined),
  };
  const storage = {
    wipeAll: jest.fn(async () => ({ deleted: 2, failed: 0 })),
    deletePrefix: jest.fn(async () => ({ deleted: 0, failed: 0 })),
  };
  const none = { eraseFor: jest.fn(async () => 0) };
  const apple = {
    verify: jest.fn(options.verify ?? (async () => ({ sub: 'apple-sub-1' }))),
  };
  const appleTokens = { revokeWithCode: jest.fn(options.revoke ?? (async () => 'revoked')) };
  const account = new AccountService(
    users as unknown as UsersRepository,
    storage as unknown as StorageService,
    { send: jest.fn(async () => undefined) } as unknown as MailService,
    { appUrl: 'https://app.virgo.test' } as unknown as MailConfig,
    { cancelBeforeDeletion: jest.fn(async () => 0) } as unknown as BillingService,
    none as unknown as SupportFilesService,
    none as unknown as ReceiptFilesService,
    none as unknown as ChatFilesService,
    apple as unknown as AppleIdentityService,
    appleTokens as unknown as AppleTokensService,
  );
  return { account, users, apple, appleTokens };
}

/** The `code` a 403 carries. */
async function refusalCode(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (err) {
    expect((err as { getStatus?: () => number }).getStatus?.()).toBe(403);
    return (err as { getResponse: () => { code?: string } }).getResponse().code;
  }
  throw new Error('expected a refusal');
}

beforeEach(() => {
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('AccountService.remove, confirmed with Apple', () => {
  it('deletes the account Apple vouches for, and ends its Apple sign-in first', async () => {
    const { account, users, apple, appleTokens } = accountFor({ apple_sub: 'apple-sub-1' });

    await expect(account.remove('user-1', { apple: APPLE })).resolves.toEqual({
      deleted: true,
      filesDeleted: 2,
    });

    expect(apple.verify).toHaveBeenCalledWith(APPLE.identityToken, APPLE.nonce);
    expect(appleTokens.revokeWithCode).toHaveBeenCalledWith('code-1', 'user-1');
    expect(users.remove).toHaveBeenCalledWith('user-1');
    expect(appleTokens.revokeWithCode.mock.invocationCallOrder[0]).toBeLessThan(
      users.remove.mock.invocationCallOrder[0],
    );
  });

  it('deletes anyway when Apple could not be told', async () => {
    const { account, users } = accountFor(
      { apple_sub: 'apple-sub-1' },
      { revoke: async () => 'failed' },
    );
    await account.remove('user-1', { apple: APPLE });
    expect(users.remove).toHaveBeenCalled();
  });

  it('refuses a different Apple ID, and touches nothing', async () => {
    const { account, users, appleTokens } = accountFor(
      { apple_sub: 'apple-sub-1' },
      { verify: async () => ({ sub: 'someone-else' }) },
    );
    expect(await refusalCode(account.remove('user-1', { apple: APPLE }))).toBe('WRONG_APPLE_ID');
    expect(appleTokens.revokeWithCode).not.toHaveBeenCalled();
    expect(users.remove).not.toHaveBeenCalled();
  });

  it('refuses Apple for an account that does not sign in with it', async () => {
    const { account, apple, users } = accountFor({ apple_sub: null });
    expect(await refusalCode(account.remove('user-1', { apple: APPLE }))).toBe('NOT_APPLE');
    expect(apple.verify).not.toHaveBeenCalled();
    expect(users.remove).not.toHaveBeenCalled();
  });

  it('turns a token Apple did not sign into a 403, not a 401 the apps would refresh and resend', async () => {
    const { account, users } = accountFor(
      { apple_sub: 'apple-sub-1' },
      {
        verify: async () => {
          throw new UnauthorizedException('Apple could not confirm that sign-in. Try again.');
        },
      },
    );
    expect(await refusalCode(account.remove('user-1', { apple: APPLE }))).toBe('APPLE_REFUSED');
    expect(users.remove).not.toHaveBeenCalled();
  });

  it('passes on Apple being out of reach as it is', async () => {
    const { account } = accountFor(
      { apple_sub: 'apple-sub-1' },
      {
        verify: async () => {
          throw new ServiceUnavailableException();
        },
      },
    );
    await expect(account.remove('user-1', { apple: APPLE })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('still takes the password of an account that also signs in with Apple, with nothing to revoke', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn');
    const { account, users, appleTokens } = accountFor({ apple_sub: 'apple-sub-1' });
    await account.remove('user-1', { password: PASSWORD });
    expect(appleTokens.revokeWithCode).not.toHaveBeenCalled();
    expect(users.remove).toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('was not revoked'));
  });

  it('leaves the password path as it was for everyone else', async () => {
    const { account, appleTokens } = accountFor({});
    expect(await refusalCode(account.remove('user-1', { password: 'wrong' }))).toBe('WRONG_PASSWORD');
    await account.remove('user-1', { password: PASSWORD });
    expect(appleTokens.revokeWithCode).not.toHaveBeenCalled();
  });

  it('a console delete of an Apple account has no code, and goes ahead', async () => {
    const { account, users, appleTokens } = accountFor({ apple_sub: 'apple-sub-1' });
    await account.removeByStaff('user-1');
    expect(appleTokens.revokeWithCode).not.toHaveBeenCalled();
    expect(users.remove).toHaveBeenCalled();
  });
});

describe('AccountService.disable, confirmed with Apple', () => {
  it('pauses the account Apple vouches for, without ending its Apple sign-in', async () => {
    const { account, users, appleTokens } = accountFor({ apple_sub: 'apple-sub-1' });
    const result = await account.disable('user-1', { apple: APPLE }, 30);
    expect(result.disabledUntil).toEqual(expect.any(String));
    expect(users.disable).toHaveBeenCalled();
    expect(appleTokens.revokeWithCode).not.toHaveBeenCalled();
  });

  it('refuses a different Apple ID', async () => {
    const { account, users } = accountFor(
      { apple_sub: 'apple-sub-1' },
      { verify: async () => ({ sub: 'someone-else' }) },
    );
    expect(await refusalCode(account.disable('user-1', { apple: APPLE }, 30))).toBe('WRONG_APPLE_ID');
    expect(users.disable).not.toHaveBeenCalled();
  });
});

describe('the closing requests', () => {
  const check = async (cls: new () => object, body: object) =>
    (
      await validate(plainToInstance(cls, body), {
        whitelist: true,
        forbidNonWhitelisted: true,
      })
    ).map((e) => e.property);

  it('accept Apple in place of the password', async () => {
    expect(await check(DeleteAccountDto, { confirm: 'DELETE', apple: APPLE })).toEqual([]);
    expect(await check(DisableAccountDto, { days: 30, apple: APPLE })).toEqual([]);
  });

  it('accept the password as before', async () => {
    expect(await check(DeleteAccountDto, { confirm: 'DELETE', password: PASSWORD })).toEqual([]);
    expect(await check(DisableAccountDto, { days: 30, password: PASSWORD })).toEqual([]);
  });

  it('refuse neither', async () => {
    expect(await check(DeleteAccountDto, { confirm: 'DELETE' })).toEqual(['password']);
    expect(await check(DisableAccountDto, { days: 30 })).toEqual(['password']);
  });

  it('refuse an Apple confirmation without its token', async () => {
    expect(
      await check(DeleteAccountDto, { confirm: 'DELETE', apple: { nonce: APPLE.nonce } }),
    ).toEqual(['apple']);
  });

  it('still want DELETE typed out', async () => {
    expect(await check(DeleteAccountDto, { apple: APPLE })).toEqual(['confirm']);
  });
});
