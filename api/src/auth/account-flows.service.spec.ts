import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import type { DatabaseService } from '../database/database.service';
import type { MailConfig } from '../mail/mail.config';
import type { MailService } from '../mail/mail.service';
import type { PromosService } from '../promos/promos.service';
import { AccountFlowsService } from './account-flows.service';
import type { AuthTokensService } from './auth-tokens.service';
import type { UserRow, UsersRepository } from './users.repository';

/**
 * Changing a password or an address from inside a session.
 *
 * The shared rule: the password is checked again, and a wrong one is a 403 —
 * a 401 would read to the client as an expired session and be retried.
 */

const PASSWORD = 'correct horse battery staple';
const HASH = bcrypt.hashSync(PASSWORD, 4);

function userWith(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 'user-1',
    email: 'mika@example.com',
    display_name: 'Mika',
    password_hash: HASH,
    email_verified_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as UserRow;
}

function setup(options: { user?: UserRow; taken?: UserRow | null } = {}) {
  const user = options.user ?? userWith();
  const users = {
    findById: jest.fn(async () => user),
    findByEmail: jest.fn(async () => options.taken ?? null),
  };
  const queries: { sql: string; params: unknown[] }[] = [];
  const client = {
    query: jest.fn(async (sql: string, params: unknown[]) => {
      queries.push({ sql, params });
      return { rows: [] };
    }),
  };
  const db = {
    query: jest.fn(async (sql: string, params: unknown[]) => {
      queries.push({ sql, params });
      return [];
    }),
    transaction: jest.fn(async (fn: (c: typeof client) => Promise<void>) => fn(client)),
  };
  const tokens = {
    issue: jest.fn(async () => ({ token: 'raw-token', expiresAt: new Date() })),
    redeemEmailChange: jest.fn(
      async (): Promise<{ userId: string; newEmail: string } | null> => ({
        userId: user.id,
        newEmail: 'new@example.com',
      }),
    ),
  };
  const mail = { send: jest.fn(async () => true) };
  const config = { get: jest.fn((_key: string, fallback?: string) => fallback ?? '4') };

  const service = new AccountFlowsService(
    db as unknown as DatabaseService,
    users as unknown as UsersRepository,
    tokens as unknown as AuthTokensService,
    mail as unknown as MailService,
    { appUrl: 'https://web.virgo.ph' } as MailConfig,
    config as unknown as ConfigService,
    {} as PromosService,
  );
  return { service, users, db, tokens, mail, queries };
}

async function refusal(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error('expected a refusal');
}

describe('changePassword', () => {
  it('refuses a wrong current password with a 403, not a 401', async () => {
    const { service, db } = setup();
    const err = await refusal(service.changePassword('user-1', 'wrong', 'a new password'));
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).getResponse()).toMatchObject({ code: 'WRONG_PASSWORD' });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('refuses the password already in use', async () => {
    const { service, db } = setup();
    await expect(service.changePassword('user-1', PASSWORD, PASSWORD)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('stores the new hash, revokes every session, and says so by email', async () => {
    const { service, queries, mail } = setup();
    await service.changePassword('user-1', PASSWORD, 'a brand new password');

    const update = queries.find((q) => q.sql.includes('set password_hash'));
    expect(await bcrypt.compare('a brand new password', update?.params[1] as string)).toBe(true);
    expect(queries.some((q) => q.sql.includes('update refresh_tokens set revoked_at'))).toBe(true);
    expect(mail.send).toHaveBeenCalledWith('mika@example.com', expect.anything());
  });
});

describe('requestEmailChange', () => {
  it('refuses a wrong password with a 403 and sends nothing', async () => {
    const { service, mail, tokens } = setup();
    await expect(
      service.requestEmailChange('user-1', 'wrong', 'new@example.com'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tokens.issue).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('refuses the address already on the account, whatever its case', async () => {
    const { service } = setup();
    await expect(
      service.requestEmailChange('user-1', PASSWORD, '  Mika@Example.com '),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses an address another account holds', async () => {
    const { service, tokens } = setup({ taken: userWith({ id: 'user-2', email: 'new@example.com' }) });
    await expect(
      service.requestEmailChange('user-1', PASSWORD, 'new@example.com'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tokens.issue).not.toHaveBeenCalled();
  });

  it('links the new inbox, warns the old one, and changes nothing yet', async () => {
    const { service, tokens, mail, db } = setup();
    const result = await service.requestEmailChange('user-1', PASSWORD, ' New@Example.com ');

    expect(result).toEqual({ pendingEmail: 'new@example.com' });
    expect(tokens.issue).toHaveBeenCalledWith('user-1', 'change_email', 'new@example.com');
    const recipients = (mail.send.mock.calls as unknown as [string][]).map(([to]) => to);
    expect(recipients).toEqual(['new@example.com', 'mika@example.com']);
    const link = (mail.send.mock.calls[0] as unknown as [string, { text: string }])[1].text;
    expect(link).toContain('https://web.virgo.ph/confirm-email?token=raw-token');
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('confirmEmailChange', () => {
  it('refuses a link that is used, expired or unknown', async () => {
    const { service, tokens, db } = setup();
    tokens.redeemEmailChange.mockResolvedValueOnce(null);
    await expect(service.confirmEmailChange('raw-token')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(db.query).not.toHaveBeenCalled();
  });

  it('moves the account and tells the address it left', async () => {
    const { service, queries, mail } = setup();
    await expect(service.confirmEmailChange('raw-token')).resolves.toEqual({
      email: 'new@example.com',
    });
    const update = queries.find((q) => q.sql.includes('set email ='));
    expect(update?.params).toEqual(['user-1', 'new@example.com']);
    expect(mail.send).toHaveBeenCalledWith('mika@example.com', expect.anything());
  });

  it('says so when the address was taken after the link was sent', async () => {
    const { service, db, mail } = setup();
    db.query.mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: '23505' }));
    await expect(service.confirmEmailChange('raw-token')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(mail.send).not.toHaveBeenCalled();
  });
});
