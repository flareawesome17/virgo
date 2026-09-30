import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { MailService } from '../mail/mail.service';
import { twoFactorCode } from '../mail/mail.templates';
import {
  UsersRepository,
  type TwoFactorPurpose,
  type UserRow,
} from './users.repository';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const OTP_TTL_MS = 10 * 60_000;

function encodeBase32(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z2-7]/g, '');
}

function safeCodeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

@Injectable()
export class TwoFactorService {
  private readonly codeKey: Buffer;

  constructor(
    private readonly users: UsersRepository,
    private readonly mail: MailService,
    config: ConfigService,
  ) {
    const material = config.get<string>('TWO_FACTOR_ENCRYPTION_KEY')
      ?? config.getOrThrow<string>('JWT_REFRESH_SECRET');
    this.codeKey = createHash('sha256')
      .update('virgo:two-factor-email-code:v1\0')
      .update(material)
      .digest();
  }

  status(user: UserRow) {
    return {
      enabled: !!user.two_factor_enabled_at,
      enabledAt: user.two_factor_enabled_at?.toISOString() ?? null,
      recoveryCodesRemaining: user.two_factor_recovery_codes?.length ?? 0,
      email: this.maskEmail(user.email),
    };
  }

  async beginSetup(userId: string, password: string) {
    const user = await this.requireUserAndPassword(userId, password);
    if (user.two_factor_enabled_at) {
      throw new ConflictException('Two-factor authentication is already enabled');
    }
    return this.createAndSendChallenge(user, 'setup');
  }

  async confirmSetup(userId: string, challengeToken: string, code: string) {
    const user = await this.verifyEmailChallenge(challengeToken, code, 'setup', userId);
    if (user.two_factor_enabled_at) {
      throw new ConflictException('Two-factor authentication is already enabled');
    }

    const recoveryCodes = this.generateRecoveryCodes();
    const enabled = await this.users.enableTwoFactor(
      user.id,
      recoveryCodes.map((value) => this.hashRecoveryCode(value)),
    );
    if (!enabled) throw new UnauthorizedException();

    await this.users.revokeAllForUser(user.id);
    return { user: enabled, recoveryCodes };
  }

  createLoginChallenge(user: UserRow) {
    return this.createAndSendChallenge(user, 'login');
  }

  completeLoginChallenge(challengeToken: string, code: string): Promise<UserRow> {
    return this.verifyEmailChallenge(challengeToken, code, 'login');
  }

  async resend(challengeToken: string) {
    const tokenHash = this.hashToken(challengeToken);
    const challenge = await this.users.findActiveTwoFactorChallenge(tokenHash);
    if (!challenge) {
      throw new UnauthorizedException('This code request expired. Start again.');
    }
    const user = await this.requireUser(challenge.user_id);
    const code = this.generateEmailCode();
    const updated = await this.users.replaceTwoFactorChallengeCode(
      tokenHash,
      this.hashEmailCode(challengeToken, code),
      new Date(Date.now() + OTP_TTL_MS),
    );
    if (!updated) {
      throw new HttpException(
        'Wait one minute before requesting another code.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    await this.sendCode(user, code, challenge.purpose);
    return { sent: true as const, expiresIn: '10m' as const, email: this.maskEmail(user.email) };
  }

  async beginSecurityAction(
    userId: string,
    password: string,
    purpose: 'disable' | 'recovery',
  ) {
    const user = await this.requireUserAndPassword(userId, password);
    if (!user.two_factor_enabled_at) {
      throw new ConflictException('Two-factor authentication is not enabled');
    }
    return this.createAndSendChallenge(user, purpose);
  }

  async disable(userId: string, challengeToken: string, code: string) {
    const user = await this.verifyEmailChallenge(
      challengeToken,
      code,
      'disable',
      userId,
    );
    const updated = await this.users.disableTwoFactor(user.id);
    await this.users.revokeAllForUser(user.id);
    return updated;
  }

  async regenerateRecoveryCodes(
    userId: string,
    challengeToken: string,
    code: string,
  ) {
    const user = await this.verifyEmailChallenge(
      challengeToken,
      code,
      'recovery',
      userId,
    );
    const recoveryCodes = this.generateRecoveryCodes();
    await this.users.replaceRecoveryCodes(
      user.id,
      recoveryCodes.map((value) => this.hashRecoveryCode(value)),
    );
    return { recoveryCodes };
  }

  private async createAndSendChallenge(
    user: UserRow,
    purpose: TwoFactorPurpose,
  ) {
    const challengeToken = randomBytes(32).toString('base64url');
    const code = this.generateEmailCode();
    await this.users.createTwoFactorChallenge(
      user.id,
      this.hashToken(challengeToken),
      this.hashEmailCode(challengeToken, code),
      purpose,
      new Date(Date.now() + OTP_TTL_MS),
    );
    await this.sendCode(user, code, purpose);
    return {
      challengeToken,
      expiresIn: '10m' as const,
      email: this.maskEmail(user.email),
    };
  }

  /**
   * A refusal about the code, not the session.
   *
   * Sign-in has no session yet, so a 401 there is honest. With a session (`expectedUserId`,
   * setting up, turning off, new recovery codes), a 401 told the client the session had
   * lapsed: it refreshed and sent the same wrong code again, so every typo counted twice
   * against the attempt limit. A 403 is "you are signed in, and this is wrong".
   */
  private codeRefusal(message: string, code: string, signedIn: boolean): Error {
    return signedIn
      ? new ForbiddenException({ message, code, statusCode: 403 })
      : new UnauthorizedException(message);
  }

  private async verifyEmailChallenge(
    challengeToken: string,
    code: string,
    purpose: TwoFactorPurpose,
    expectedUserId?: string,
  ): Promise<UserRow> {
    const signedIn = expectedUserId !== undefined;
    const tokenHash = this.hashToken(challengeToken);
    const challenge = await this.users.findActiveTwoFactorChallenge(tokenHash);
    if (!challenge || challenge.purpose !== purpose || (expectedUserId && challenge.user_id !== expectedUserId)) {
      throw this.codeRefusal('This code request expired. Start again.', 'CODE_EXPIRED', signedIn);
    }

    const supplied = this.hashEmailCode(challengeToken, code.trim());
    if (!safeCodeEqual(supplied, challenge.code_hash)) {
      if (
        purpose === 'setup' ||
        !(await this.consumeRecoveryCode(await this.requireUser(challenge.user_id), code))
      ) {
        await this.users.recordTwoFactorFailure(tokenHash);
        throw this.codeRefusal('That email or recovery code is not valid', 'WRONG_CODE', signedIn);
      }
    }

    if (!(await this.users.consumeTwoFactorChallenge(tokenHash))) {
      throw this.codeRefusal('This code has already been used', 'CODE_USED', signedIn);
    }
    return this.requireUser(challenge.user_id);
  }

  private async sendCode(
    user: UserRow,
    code: string,
    purpose: TwoFactorPurpose,
  ) {
    const sent = await this.mail.send(
      user.email,
      twoFactorCode({ code, purpose, expiresInMinutes: 10 }),
    );
    if (!sent) {
      throw new ServiceUnavailableException(
        'We could not send the verification email. Please try again in a moment.',
      );
    }
  }

  private async consumeRecoveryCode(user: UserRow, rawCode: string): Promise<boolean> {
    const normalized = normalizeRecoveryCode(rawCode);
    if (normalized.length < 10) return false;
    return this.users.consumeRecoveryCode(user.id, this.hashRecoveryCode(normalized));
  }

  private async requireUser(userId: string): Promise<UserRow> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException();
    return user;
  }

  private async requireUserAndPassword(userId: string, password: string): Promise<UserRow> {
    const user = await this.requireUser(userId);
    // 403, not 401: see codeRefusal. Same shape as AccountFlowsService's.
    if (!(await bcrypt.compare(password, user.password_hash))) {
      throw new ForbiddenException({
        message: 'That password is not correct.',
        code: 'WRONG_PASSWORD',
        statusCode: 403,
      });
    }
    return user;
  }

  private generateEmailCode(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
  }

  private generateRecoveryCodes(): string[] {
    return Array.from({ length: 10 }, () => {
      const raw = encodeBase32(randomBytes(8)).slice(0, 12);
      return raw.match(/.{1,4}/g)!.join('-');
    });
  }

  private hashEmailCode(challengeToken: string, code: string): string {
    return createHmac('sha256', this.codeKey)
      .update(challengeToken)
      .update('\0')
      .update(code)
      .digest('hex');
  }

  private hashRecoveryCode(code: string): string {
    return createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    const visible = local.slice(0, Math.min(2, local.length));
    return `${visible}${'•'.repeat(Math.max(3, local.length - visible.length))}@${domain}`;
  }
}
