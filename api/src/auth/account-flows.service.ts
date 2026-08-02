import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { DatabaseService } from '../database/database.service';
import { MailConfig } from '../mail/mail.config';
import { MailService } from '../mail/mail.service';
import {
  passwordChanged,
  resetPassword,
  verifyEmail,
} from '../mail/mail.templates';
import { AuthTokensService, TOKEN_TTL_MS } from './auth-tokens.service';
import { UsersRepository } from './users.repository';

/**
 * Email verification and password reset.
 *
 * Separate from AuthService, which owns sessions. These are account-lifecycle
 * flows: they issue links, send mail, and change credentials, and none of that
 * belongs next to token signing.
 *
 * The consistent rule throughout: **never reveal whether an address has an
 * account.** Every request-shaped endpoint returns the same response either
 * way. Registration is the one place that inherently leaks it, and it already
 * says so.
 */
@Injectable()
export class AccountFlowsService {
  private readonly logger = new Logger(AccountFlowsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly users: UsersRepository,
    private readonly tokens: AuthTokensService,
    private readonly mail: MailService,
    private readonly mailConfig: MailConfig,
    private readonly config: ConfigService,
  ) {}

  private link(path: string, token: string): string {
    return `${this.mailConfig.appUrl}${path}?token=${encodeURIComponent(token)}`;
  }

  private displayName(row: { display_name: string | null; email: string }): string {
    return row.display_name ?? row.email.split('@')[0];
  }

  /**
   * Sends a verification link.
   *
   * Called on registration and from the resend endpoint. Fire-and-forget from
   * the caller's point of view: a slow SMTP handshake must not hold up the
   * response to a signup.
   */
  async sendVerificationEmail(userId: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) return;
    if (user.email_verified_at) return;

    const { token } = await this.tokens.issue(userId, 'verify_email');
    await this.mail.send(
      user.email,
      verifyEmail({
        name: this.displayName(user),
        url: this.link('/verify-email', token),
        expiresInHours: Math.round(TOKEN_TTL_MS.verify_email / 3_600_000),
      }),
    );
  }

  /** Redeems a verification link. */
  async verifyEmail(token: string): Promise<{ verified: boolean }> {
    const userId = await this.tokens.redeem(token, 'verify_email');
    if (!userId) {
      throw new BadRequestException(
        'That link is no longer valid. Request a new one and try again.',
      );
    }

    await this.db.query(
      'update users set email_verified_at = now() where id = $1 and email_verified_at is null',
      [userId],
    );
    return { verified: true };
  }

  /**
   * Starts a password reset.
   *
   * Always resolves the same way. An attacker enumerating addresses learns
   * nothing from the response, the status code, or the timing — the work when
   * no account exists is a database lookup either way.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    const user = await this.users.findByEmail(normalized);

    if (!user) {
      this.logger.log(`Password reset requested for an unknown address`);
      return;
    }

    const { token } = await this.tokens.issue(user.id, 'reset_password');
    await this.mail.send(
      user.email,
      resetPassword({
        name: this.displayName(user),
        url: this.link('/reset-password', token),
        expiresInMinutes: Math.round(TOKEN_TTL_MS.reset_password / 60_000),
      }),
    );
  }

  /**
   * Completes a reset.
   *
   * Every refresh token is revoked as well: if the reset was prompted by a
   * compromise, leaving the attacker's session alive would defeat the point.
   */
  async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<{ reset: boolean }> {
    const userId = await this.tokens.redeem(token, 'reset_password');
    if (!userId) {
      throw new BadRequestException(
        'That link is no longer valid. Request a new one and try again.',
      );
    }

    const rounds = Number(this.config.get('BCRYPT_ROUNDS', '12'));
    const passwordHash = await bcrypt.hash(newPassword, rounds);

    await this.db.transaction(async (client) => {
      await client.query('update users set password_hash = $2 where id = $1', [
        userId,
        passwordHash,
      ]);
      await client.query(
        `update refresh_tokens set revoked_at = now()
          where user_id = $1 and revoked_at is null`,
        [userId],
      );
      // Reaching a reset link proves control of the inbox, which is the same
      // thing verification proves.
      await client.query(
        'update users set email_verified_at = coalesce(email_verified_at, now()) where id = $1',
        [userId],
      );
    });

    const user = await this.users.findById(userId);
    if (user) {
      await this.mail.send(
        user.email,
        passwordChanged({
          when: new Date().toLocaleString('en-US', {
            dateStyle: 'long',
            timeStyle: 'short',
            timeZone: 'UTC',
          }) + ' UTC',
        }),
      );
    }

    return { reset: true };
  }
}
