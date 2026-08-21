import { ConfigService } from '@nestjs/config';
import { MailService } from '../mail/mail.service';
import { TwoFactorService } from './two-factor.service';
import { UsersRepository, type UserRow } from './users.repository';

describe('TwoFactorService email challenges', () => {
  const user = {
    id: 'user-1',
    email: 'avery@example.com',
    password_hash: 'not-used-in-these-tests',
    two_factor_enabled_at: new Date('2026-01-01T00:00:00Z'),
    two_factor_recovery_codes: [],
  } as unknown as UserRow;

  function createSubject() {
    let storedCodeHash = '';
    let storedPurpose: 'setup' | 'login' = 'login';
    const users = {
      createTwoFactorChallenge: jest.fn(
        async (
          _userId: string,
          _tokenHash: string,
          codeHash: string,
          purpose: 'setup' | 'login',
        ) => {
          storedCodeHash = codeHash;
          storedPurpose = purpose;
        },
      ),
      findActiveTwoFactorChallenge: jest.fn(async () => ({
        user_id: user.id,
        code_hash: storedCodeHash,
        purpose: storedPurpose,
        attempts: 0,
        last_sent_at: new Date(),
      })),
      consumeTwoFactorChallenge: jest.fn(async () => true),
      recordTwoFactorFailure: jest.fn(async () => undefined),
      consumeRecoveryCode: jest.fn(async () => false),
      findById: jest.fn(async () => user),
    } as unknown as jest.Mocked<UsersRepository>;
    const mail = {
      send: jest.fn(async () => true),
    } as unknown as jest.Mocked<MailService>;
    const config = {
      get: jest.fn(() => 'a-dedicated-test-key-with-more-than-32-characters'),
      getOrThrow: jest.fn(() => 'unused-refresh-secret'),
    } as unknown as ConfigService;

    return {
      service: new TwoFactorService(users, mail, config),
      users,
      mail,
    };
  }

  it('emails a six-digit code without storing the plaintext code', async () => {
    const { service, users, mail } = createSubject();

    const challenge = await service.createLoginChallenge(user);
    const email = mail.send.mock.calls[0][1];
    const code = email.subject.match(/^\d{6}/)?.[0];
    const storedHash = users.createTwoFactorChallenge.mock.calls[0][2];

    expect(code).toMatch(/^\d{6}$/);
    expect(storedHash).toMatch(/^[a-f0-9]{64}$/);
    expect(storedHash).not.toBe(code);
    expect(challenge).toMatchObject({
      expiresIn: '10m',
      email: 'av•••@example.com',
    });
  });

  it('accepts the emailed code once and resolves the account', async () => {
    const { service, users, mail } = createSubject();
    const challenge = await service.createLoginChallenge(user);
    const code = mail.send.mock.calls[0][1].subject.slice(0, 6);

    await expect(
      service.completeLoginChallenge(challenge.challengeToken, code),
    ).resolves.toBe(user);
    expect(users.consumeTwoFactorChallenge).toHaveBeenCalledTimes(1);
  });

  it('counts an invalid code without consuming the challenge', async () => {
    const { service, users, mail } = createSubject();
    const challenge = await service.createLoginChallenge(user);
    const sentCode = mail.send.mock.calls[0][1].subject.slice(0, 6);
    const invalidCode = sentCode === '000000' ? '000001' : '000000';

    await expect(
      service.completeLoginChallenge(challenge.challengeToken, invalidCode),
    ).rejects.toThrow('That email or recovery code is not valid');
    expect(users.recordTwoFactorFailure).toHaveBeenCalledTimes(1);
    expect(users.consumeTwoFactorChallenge).not.toHaveBeenCalled();
  });

  it('does not accept a login challenge for a security-setting change', async () => {
    const { service, users, mail } = createSubject();
    const challenge = await service.createLoginChallenge(user);
    const code = mail.send.mock.calls[0][1].subject.slice(0, 6);

    await expect(
      service.disable(user.id, challenge.challengeToken, code),
    ).rejects.toThrow('This code request expired. Start again.');
    expect(users.consumeTwoFactorChallenge).not.toHaveBeenCalled();
  });
});
