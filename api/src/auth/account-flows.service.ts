import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { DatabaseService } from '../database/database.service';
import { MailConfig } from '../mail/mail.config';
import { MailService } from '../mail/mail.service';
import {
  confirmEmailChange,
  emailChangeNotice,
  passwordChanged,
  resetPassword,
  verifyEmail,
} from '../mail/mail.templates';
import { PromosService } from '../promos/promos.service';
import { AuthTokensService, TOKEN_TTL_MS } from './auth-tokens.service';
import { UsersRepository, type UserRow } from './users.repository';

/** Postgres unique_violation. */
const UNIQUE_VIOLATION = '23505';

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
    private readonly promos: PromosService,
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

  /**
   * Re-sends the verification link to an address, without a session.
   *
   * Needed because verification now blocks sign-in: a user who never received
   * the first email has no way to authenticate, so the authenticated resend is
   * unreachable to exactly the people who need it.
   *
   * Silent about whether the address exists or is already verified, for the
   * same reason forgot-password is.
   */
  async requestVerificationEmail(email: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    const user = await this.users.findByEmail(normalized);
    if (!user || user.email_verified_at) {
      this.logger.log('Verification resend requested for an unknown or already-verified address');
      return;
    }
    await this.sendVerificationEmail(user.id);
  }

  /** Redeems a verification link. */
  async verifyEmail(token: string): Promise<{ verified: boolean }> {
    const userId = await this.tokens.redeem(token, 'verify_email');
    if (!userId) {
      throw new BadRequestException(
        'That link is no longer valid. Request a new one and try again.',
      );
    }

    const flipped = await this.db.query<{ id: string }>(
      `update users set email_verified_at = now()
        where id = $1 and email_verified_at is null
        returning id`,
      [userId],
    );

    // Referrals pay out here and nowhere else.
    //
    // Guarded on the update having actually changed a row, so this is the
    // moment an address is first proven — not every time somebody revisits a
    // link. `payReferral` is idempotent as well, but the cheapest defence
    // against paying twice is not calling it twice.
    //
    // Failing to pay must not fail the verification: the user did their part,
    // and an account stuck unverified because a promo lookup threw would be a
    // far worse bug than a missed reward.
    if (flipped.length > 0) {
      try {
        await this.promos.payReferral(userId);
      } catch (err) {
        this.logger.error(`Referral payout failed for ${userId}: ${String(err)}`);
      }
    }

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
    if (user) await this.mail.send(user.email, passwordChanged({ when: this.now() }));

    return { reset: true };
  }

  private now(): string {
    return (
      new Date().toLocaleString('en-US', {
        dateStyle: 'long',
        timeStyle: 'short',
        timeZone: 'UTC',
      }) + ' UTC'
    );
  }

  /**
   * The signed-in user, provided the password they typed is theirs.
   *
   * A wrong password is a 403, never a 401. A 401 tells the client its session
   * is dead, so it refreshes and resends the same wrong password — spending
   * two of the throttle's tries on one typo.
   */
  private async withPassword(userId: string, password: string): Promise<UserRow> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException();
    if (!(await bcrypt.compare(password, user.password_hash))) {
      throw new ForbiddenException({
        message: 'That password is not correct.',
        code: 'WRONG_PASSWORD',
        statusCode: 403,
      });
    }
    return user;
  }

  /**
   * Changes the password of a signed-in account.
   *
   * Every refresh token is revoked, as on a reset: someone changing a password
   * they think was seen wants every other device out. The caller issues this
   * device a fresh pair, so the person who asked stays signed in.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<UserRow> {
    const user = await this.withPassword(userId, currentPassword);
    if (await bcrypt.compare(newPassword, user.password_hash)) {
      throw new BadRequestException('Choose a password you are not already using.');
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
    });

    // Best-effort: the password has changed whether or not the notice lands.
    void this.mail.send(user.email, passwordChanged({ when: this.now() }));
    return user;
  }

  /**
   * Starts moving an account to a new address.
   *
   * Nothing on the account changes here. The new address gets a link, and the
   * old one is told — if somebody else is signed in as you, that email is how
   * you find out before they can finish.
   *
   * Saying an address is taken does reveal that it has an account, but only to
   * somebody who already holds a session and its password, and registration
   * says the same thing to anyone.
   */
  async requestEmailChange(
    userId: string,
    password: string,
    newEmail: string,
  ): Promise<{ pendingEmail: string }> {
    const user = await this.withPassword(userId, password);
    const normalized = newEmail.trim().toLowerCase();

    if (normalized === user.email) {
      throw new BadRequestException('That is already the address on your account.');
    }
    if (await this.users.findByEmail(normalized)) {
      throw new ConflictException('An account with that email already exists.');
    }

    const { token } = await this.tokens.issue(userId, 'change_email', normalized);
    await this.mail.send(
      normalized,
      confirmEmailChange({
        name: this.displayName(user),
        url: this.link('/confirm-email', token),
        expiresInHours: Math.round(TOKEN_TTL_MS.change_email / 3_600_000),
      }),
    );
    void this.mail.send(
      user.email,
      emailChangeNotice({ newEmail: normalized, stage: 'requested' }),
    );

    return { pendingEmail: normalized };
  }

  /**
   * Redeems an email-change link: the new inbox has answered, so the account
   * moves to it.
   *
   * Sessions are left alone. The email in an access token is only a label —
   * every lookup goes by id — and the next refresh carries the new one.
   */
  async confirmEmailChange(token: string): Promise<{ email: string }> {
    const redeemed = await this.tokens.redeemEmailChange(token);
    if (!redeemed) {
      throw new BadRequestException(
        'That link is no longer valid. Ask for a new one from your account settings.',
      );
    }

    const before = await this.users.findById(redeemed.userId);
    if (!before) {
      throw new BadRequestException('That account no longer exists.');
    }

    try {
      // Reaching the link proves the inbox, which is what verification proves.
      await this.db.query(
        `update users set email = $2, email_verified_at = now() where id = $1`,
        [redeemed.userId, redeemed.newEmail],
      );
    } catch (err) {
      // Free when asked for, taken since by a new signup.
      if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
        throw new ConflictException(
          'Another account started using that address in the meantime.',
        );
      }
      throw err;
    }

    void this.mail.send(
      before.email,
      emailChangeNotice({ newEmail: redeemed.newEmail, stage: 'changed' }),
    );
    this.logger.log(`Account ${redeemed.userId} moved to a new address`);
    return { email: redeemed.newEmail };
  }
}
