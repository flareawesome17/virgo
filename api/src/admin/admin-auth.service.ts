import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { DatabaseService } from '../database/database.service';
import { MailService } from '../mail/mail.service';
import { adminPasswordReset } from '../mail/mail.templates';
import { AuditService } from './audit.service';
import { permissionsFor, type AdminPermission, type AdminRole } from './rbac';
import { digestRecoveryCode, openSecret, verifyTotp } from './totp';

/** Short, because a console session is a bigger prize than an app session. */
const ACCESS_TTL = '30m';
const REFRESH_TTL_DAYS = 7;

/**
 * Short. A console reset link sitting in an inbox is a standing key.
 *
 * Five minutes is deliberately tight — it assumes whoever asked for the link
 * is waiting for it. The cost is that a slow mail hop eats into the window,
 * and the recovery is simply to ask again, which is one click.
 *
 * Every place that states this duration reads it from here: the email body,
 * and the page that sends it.
 */
export const RESET_TTL_MINUTES = 5;

/**
 * Wrong passwords or codes in a row before an account is locked, and for how
 * long. Time-limited rather than until an owner steps in: anyone who knows a
 * staff email could otherwise lock that person out indefinitely. An owner can
 * unlock early from the console.
 */
export const LOCK_AFTER_FAILURES = 5;
export const LOCK_MINUTES = 15;

/**
 * The audience claims.
 *
 * Belt and braces alongside the separate secret: even if the two keys were
 * ever misconfigured to match, an app token would still be refused here and a
 * console token refused by the app. The two-factor challenge has its own, so
 * a challenge can never be presented as an access token.
 */
const ADMIN_AUDIENCE = 'virgo-admin';
const CHALLENGE_AUDIENCE = 'virgo-admin-2fa';
const CHALLENGE_TTL = '5m';

/** Where a request came from, for sessions and the sign-in record. */
export interface RequestContext {
  ip?: string;
  userAgent?: string;
}

export interface AdminIdentity {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  roleLabel: string;
  permissions: readonly AdminPermission[];
  /**
   * True while the account still has a password somebody else chose.
   *
   * Carried on the identity rather than only in the login response so it
   * survives a refresh — otherwise reloading the console would step straight
   * past the change screen.
   */
  mustChangePassword: boolean;
  twoFactorEnabled: boolean;
  /** Their role requires two-factor. */
  twoFactorRequired: boolean;
  /** Their role requires two-factor and they have not set it up yet. */
  mustSetUpTwoFactor: boolean;
  /** This request's session. Absent on a token from before sessions existed. */
  sessionId?: string;
}

export interface AdminRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: AdminRole;
  disabled_at: Date | null;
  must_change_password: boolean;
  sessions_valid_from: Date | null;
  totp_secret: string | null;
  totp_enabled_at: Date | null;
  totp_last_step: string | null;
  recovery_codes: string[];
  failed_logins: number;
  locked_until: Date | null;
  role_label: string;
  role_permissions: string[];
  role_system: boolean;
  role_requires_two_factor: boolean;
}

/** An account and the role it holds, which is where its permissions come from. */
const ACCOUNT = `
  select u.*, r.label as role_label, r.permissions as role_permissions,
         r.system as role_system, r.requires_two_factor as role_requires_two_factor
    from admin_users u
    join admin_roles r on r.name = u.role`;

export type LoginResult =
  | { accessToken: string; refreshToken: string; admin: AdminIdentity }
  | { twoFactorRequired: true; challenge: string };

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The console's own signing key.
   *
   * Required, with no fallback to JWT_SECRET. Deriving it from the app's key
   * would mean one leak compromises both, which is exactly the coupling this
   * whole module exists to avoid — so the console fails closed and says so
   * rather than quietly running with shared trust.
   */
  secret(): string {
    const secret = this.config.get<string>('ADMIN_JWT_SECRET');
    if (!secret || secret.length < 32) {
      throw new ServiceUnavailableException(
        'The management console is not configured on this server.',
      );
    }
    return secret;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async hashPassword(password: string): Promise<string> {
    const rounds = Number(this.config.get('BCRYPT_ROUNDS') ?? 12);
    return bcrypt.hash(password, rounds);
  }

  async checkPassword(adminId: string, password: string): Promise<boolean> {
    const row = await this.db.queryOne<{ password_hash: string }>(
      'select password_hash from admin_users where id = $1',
      [adminId],
    );
    return !!row && (await bcrypt.compare(password, row.password_hash));
  }

  async findById(id: string): Promise<AdminRow | null> {
    return this.db.queryOne<AdminRow>(`${ACCOUNT} where u.id = $1`, [id]);
  }

  identity(row: AdminRow, sessionId?: string): AdminIdentity {
    const twoFactorEnabled = !!row.totp_enabled_at;
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      roleLabel: row.role_label,
      permissions: permissionsFor(row.role, row.role_permissions, row.role_system),
      mustChangePassword: row.must_change_password,
      twoFactorEnabled,
      twoFactorRequired: row.role_requires_two_factor,
      mustSetUpTwoFactor: row.role_requires_two_factor && !twoFactorEnabled,
      sessionId,
    };
  }

  /**
   * Verifies an access token and returns who it belongs to.
   *
   * The role and its permissions are re-read from the database on every
   * request rather than trusted from the token. Demoting someone, or taking a
   * permission off their role, has to take effect immediately — a token
   * minted before must not keep the old powers for its remaining 30 minutes.
   * The same read refuses a token whose session has been ended.
   */
  async verify(token: string): Promise<AdminIdentity> {
    let payload: { sub: string; iat?: number; sid?: string };
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: this.secret(),
        audience: ADMIN_AUDIENCE,
      });
    } catch {
      throw new UnauthorizedException('Session expired');
    }

    const row = await this.db.queryOne<
      AdminRow & { session_found: boolean; session_revoked_at: Date | null }
    >(
      `select a.*, s.id is not null as session_found, s.revoked_at as session_revoked_at
         from (${ACCOUNT} where u.id = $1) a
         left join admin_sessions s on s.id = $2::uuid and s.admin_id = a.id`,
      [payload.sub, payload.sid ?? null],
    );
    if (!row || row.disabled_at) throw new UnauthorizedException('Session expired');

    // A session that was ended — by its owner from another browser, by an
    // owner, by a password change — stops here rather than when the token runs
    // out.
    if (payload.sid && (!row.session_found || row.session_revoked_at)) {
      throw new UnauthorizedException('Session expired');
    }

    /*
     * Refuse a token minted before the account's sessions were invalidated.
     *
     * `iat` is in seconds and floors, so a token issued in the same second as
     * the change can read as older than it. One second of slack, which is
     * shorter than any real attack and long enough to avoid logging out the
     * person who just typed the new password.
     */
    if (row.sessions_valid_from && payload.iat !== undefined) {
      const cutoff = Math.floor(row.sessions_valid_from.getTime() / 1000);
      if (payload.iat < cutoff - 1) {
        throw new UnauthorizedException('Session expired');
      }
    }

    return this.identity(row, payload.sid);
  }

  /** Starts a session, or continues one on refresh, and mints its tokens. */
  private async issue(row: AdminRow, ctx: RequestContext, sessionId?: string) {
    let sid = sessionId;
    if (sid) {
      await this.db.query(
        `update admin_sessions
            set last_seen_at = now(), ip = coalesce($2, ip), user_agent = coalesce($3, user_agent),
                expires_at = now() + make_interval(days => $4)
          where id = $1`,
        [sid, ctx.ip ?? null, ctx.userAgent?.slice(0, 300) ?? null, REFRESH_TTL_DAYS],
      );
    } else {
      const session = await this.db.queryOne<{ id: string }>(
        `insert into admin_sessions (admin_id, ip, user_agent, expires_at)
         values ($1, $2, $3, now() + make_interval(days => $4))
         returning id`,
        [row.id, ctx.ip ?? null, ctx.userAgent?.slice(0, 300) ?? null, REFRESH_TTL_DAYS],
      );
      sid = session!.id;
    }

    const accessToken = await this.jwt.signAsync(
      { sub: row.id, email: row.email, sid },
      { secret: this.secret(), audience: ADMIN_AUDIENCE, expiresIn: ACCESS_TTL },
    );

    const refreshToken = randomBytes(32).toString('base64url');
    const expires = new Date(Date.now() + REFRESH_TTL_DAYS * 86_400_000);
    await this.db.query(
      `insert into admin_refresh_tokens (admin_id, token_hash, expires_at, user_agent, session_id)
       values ($1, $2, $3, $4, $5)`,
      [row.id, this.hashToken(refreshToken), expires, ctx.userAgent?.slice(0, 300) ?? null, sid],
    );

    return { accessToken, refreshToken, admin: this.identity(row, sid) };
  }

  /** Writes the sign-in record. Never throws: it must not decide a sign-in. */
  private async record(
    adminId: string | null,
    email: string,
    outcome: 'success' | 'bad_password' | 'bad_code' | 'locked' | 'disabled' | 'unknown',
    ctx: RequestContext,
  ): Promise<void> {
    try {
      await this.db.query(
        `insert into admin_login_events (admin_id, email, outcome, ip, user_agent)
         values ($1, $2, $3, $4, $5)`,
        [
          adminId,
          email.trim().toLowerCase().slice(0, 254),
          outcome,
          ctx.ip?.slice(0, 60) ?? null,
          ctx.userAgent?.slice(0, 300) ?? null,
        ],
      );
    } catch (err) {
      this.logger.error(`Could not record a console sign-in: ${String(err)}`);
    }
  }

  private lockedMessage(until: Date): HttpException {
    const minutes = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60_000));
    // An object, not a string: DatabaseExceptionFilter sends getResponse() as
    // it is, and a bare string body has no `message` for the console to show.
    return new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}, or ask an owner to unlock the account.`,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  /**
   * Counts a wrong password or code, and locks the account on the fifth in a
   * row. One statement, so two wrong guesses at once cannot both read the old
   * count and leave the account unlocked.
   */
  private async fail(
    row: AdminRow,
    email: string,
    outcome: 'bad_password' | 'bad_code',
    ctx: RequestContext,
  ): Promise<void> {
    const after = await this.db.queryOne<{ locked_until: Date | null }>(
      `update admin_users
          set locked_until = case when failed_logins + 1 >= $2
                                  then now() + make_interval(mins => $3)
                                  else locked_until end,
              failed_logins = case when failed_logins + 1 >= $2 then 0 else failed_logins + 1 end
        where id = $1
        returning locked_until`,
      [row.id, LOCK_AFTER_FAILURES, LOCK_MINUTES],
    );
    await this.record(row.id, email, outcome, ctx);
    if (after?.locked_until && after.locked_until > new Date()) {
      this.logger.warn(`Console account ${row.email} locked after repeated failures`);
    }
  }

  private async succeed(row: AdminRow, email: string, ctx: RequestContext) {
    await this.db.query(
      `update admin_users
          set failed_logins = 0, locked_until = null, last_login_at = now()
        where id = $1`,
      [row.id],
    );
    await this.record(row.id, email, 'success', ctx);
    return this.issue(row, ctx);
  }

  async login(email: string, password: string, ctx: RequestContext): Promise<LoginResult> {
    const row = await this.db.queryOne<AdminRow>(
      `${ACCOUNT} where lower(u.email) = lower($1)`,
      [email],
    );

    if (row?.locked_until && row.locked_until > new Date()) {
      await this.record(row.id, email, 'locked', ctx);
      throw this.lockedMessage(row.locked_until);
    }

    // One message and one timing profile for every failure. Distinguishing
    // "no such account" from "wrong password" tells an attacker which console
    // emails are real, and this is the one login worth that effort.
    const hash = row?.password_hash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva';
    const ok = await bcrypt.compare(password, hash);
    const refused = new UnauthorizedException('Email or password is incorrect');
    if (!row) {
      await this.record(null, email, 'unknown', ctx);
      throw refused;
    }
    if (!ok) {
      await this.fail(row, email, 'bad_password', ctx);
      throw refused;
    }
    if (row.disabled_at) {
      await this.record(row.id, email, 'disabled', ctx);
      throw refused;
    }

    // The password was right; the account is not signed in until the second
    // factor is. Wrong codes count toward the same lockout as wrong passwords.
    if (row.totp_enabled_at) {
      const challenge = await this.jwt.signAsync(
        { sub: row.id },
        { secret: this.secret(), audience: CHALLENGE_AUDIENCE, expiresIn: CHALLENGE_TTL },
      );
      return { twoFactorRequired: true, challenge };
    }

    return this.succeed(row, email, ctx);
  }

  /**
   * The second step: a code from the authenticator app, or a recovery code.
   *
   * A recovery code is removed in the same statement that checks it, so one
   * cannot be spent twice by two requests racing.
   */
  async completeTwoFactor(challenge: string, code: string, ctx: RequestContext) {
    let sub: string;
    try {
      ({ sub } = await this.jwt.verifyAsync<{ sub: string }>(challenge, {
        secret: this.secret(),
        audience: CHALLENGE_AUDIENCE,
      }));
    } catch {
      throw new UnauthorizedException('That sign-in took too long. Start again.');
    }

    const row = await this.findById(sub);
    if (!row || row.disabled_at || !row.totp_enabled_at || !row.totp_secret) {
      throw new UnauthorizedException('Start the sign-in again.');
    }
    if (row.locked_until && row.locked_until > new Date()) {
      await this.record(row.id, row.email, 'locked', ctx);
      throw this.lockedMessage(row.locked_until);
    }

    const secret = openSecret(row.totp_secret, this.secret());
    const lastStep = row.totp_last_step === null ? null : Number(row.totp_last_step);
    const step = secret ? verifyTotp(secret, code, { lastStep }) : null;
    if (step !== null) {
      // Conditional, so the same code presented twice at once is accepted once.
      const claimed = await this.db.queryOne(
        `update admin_users set totp_last_step = $2
          where id = $1 and (totp_last_step is null or totp_last_step < $2)
          returning id`,
        [row.id, step],
      );
      if (claimed) return this.succeed(row, row.email, ctx);
    } else {
      const spent = await this.db.queryOne<{ remaining: number }>(
        `update admin_users
            set recovery_codes = array_remove(recovery_codes, $2)
          where id = $1 and $2 = any(recovery_codes)
          returning cardinality(recovery_codes) as remaining`,
        [row.id, digestRecoveryCode(code)],
      );
      if (spent) {
        await this.audit.record(row, {
          action: 'admin.recoveryCodeUsed',
          targetType: 'admin',
          targetId: row.id,
          detail: { remaining: spent.remaining },
        });
        return this.succeed(row, row.email, ctx);
      }
    }

    await this.fail(row, row.email, 'bad_code', ctx);
    throw new UnauthorizedException(
      secret
        ? 'That code did not work. Codes change every 30 seconds — try the current one.'
        : 'The authenticator key on this account cannot be read. Use a recovery code.',
    );
  }

  /**
   * Trades a refresh token for a new pair, and burns the old one.
   *
   * Rotating rather than reusing: a stolen refresh token is then good for at
   * most one use, and the theft shows up as the real admin being logged out.
   * The session carries over, so "Chrome on the office laptop" stays one row.
   */
  async refresh(token: string, ctx: RequestContext) {
    const found = await this.db.queryOne<{
      id: string;
      admin_id: string;
      session_id: string | null;
      session_revoked_at: Date | null;
    }>(
      `select t.id, t.admin_id, t.session_id, s.revoked_at as session_revoked_at
         from admin_refresh_tokens t
         left join admin_sessions s on s.id = t.session_id
        where t.token_hash = $1 and t.revoked_at is null and t.expires_at > now()`,
      [this.hashToken(token)],
    );
    if (!found || found.session_revoked_at) throw new UnauthorizedException('Session expired');

    await this.db.query(
      'update admin_refresh_tokens set revoked_at = now() where id = $1',
      [found.id],
    );

    const row = await this.findById(found.admin_id);
    if (!row || row.disabled_at) throw new UnauthorizedException('Session expired');
    // A token from before sessions existed starts one now.
    return this.issue(row, ctx, found.session_id ?? undefined);
  }

  async logout(token: string): Promise<void> {
    const row = await this.db.queryOne<{ session_id: string | null }>(
      `update admin_refresh_tokens set revoked_at = now()
        where token_hash = $1 returning session_id`,
      [this.hashToken(token)],
    );
    if (row?.session_id) await this.endSession(row.session_id);
  }

  /** Ends one session: its refresh tokens now, its access token on next use. */
  async endSession(sessionId: string): Promise<void> {
    await this.db.query(
      'update admin_sessions set revoked_at = now() where id = $1 and revoked_at is null',
      [sessionId],
    );
    await this.db.query(
      `update admin_refresh_tokens set revoked_at = now()
        where session_id = $1 and revoked_at is null`,
      [sessionId],
    );
  }

  /**
   * Changes the caller's own password and clears the forced-change flag.
   *
   * The current password is required even though the caller already holds a
   * valid token: a token left behind on a shared machine should not be enough
   * to lock the real owner out of their own console.
   *
   * Every other session is ended. Somebody changing their password after
   * suspecting it was seen expects exactly that.
   */
  async changeOwnPassword(
    adminId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    if (newPassword.length < 12) {
      throw new BadRequestException(
        'Console passwords must be at least 12 characters',
      );
    }

    const row = await this.db.queryOne<{ password_hash: string }>(
      'select password_hash from admin_users where id = $1',
      [adminId],
    );
    if (!row) throw new UnauthorizedException('Session expired');

    if (!(await bcrypt.compare(currentPassword, row.password_hash))) {
      throw new BadRequestException('Current password is incorrect');
    }
    if (await bcrypt.compare(newPassword, row.password_hash)) {
      throw new BadRequestException('That is the password you already have');
    }

    await this.db.query(
      `update admin_users
          set password_hash = $2,
              must_change_password = false,
              sessions_valid_from = now(),
              updated_at = now()
        where id = $1`,
      [adminId, await this.hashPassword(newPassword)],
    );
    await this.revokeAllFor(adminId);
  }

  /**
   * Starts a password reset, and says nothing about whether it worked.
   *
   * Always resolves the same way. Telling a caller "no such account" turns
   * this into a directory of who has console access, which is a more useful
   * thing to learn than most passwords.
   *
   * A disabled account is treated as absent for the same reason — and because
   * letting someone who has been locked out reset their way back in defeats
   * disabling them.
   */
  async requestPasswordReset(
    email: string,
    origin: string,
    ip?: string,
  ): Promise<void> {
    const row = await this.db.queryOne<AdminRow>(
      'select * from admin_users where lower(email) = lower($1)',
      [email],
    );
    if (!row || row.disabled_at) {
      this.logger.warn(`Console reset requested for unknown/disabled ${email}`);
      return;
    }

    // Any earlier link stops working the moment a new one is asked for, so a
    // forwarded old email cannot be redeemed later.
    await this.db.query(
      `update admin_password_resets set used_at = now()
        where admin_id = $1 and used_at is null and expires_at > now()`,
      [row.id],
    );

    const token = randomBytes(32).toString('base64url');
    const expires = new Date(Date.now() + RESET_TTL_MINUTES * 60_000);
    await this.db.query(
      `insert into admin_password_resets (admin_id, token_hash, expires_at, requested_ip)
       values ($1, $2, $3, $4)`,
      [row.id, this.hashToken(token), expires, ip?.slice(0, 60) ?? null],
    );

    const url = `${origin.replace(/\/+$/, '')}/reset-password?token=${token}`;
    await this.mail.send(
      row.email,
      adminPasswordReset({
        name: row.name,
        url,
        minutes: RESET_TTL_MINUTES,
      }),
    );
  }

  /**
   * Redeems a reset token.
   *
   * One message for expired, already-used and never-existed, for the same
   * reason the request side says nothing. It does not touch two-factor: the
   * next sign-in still asks for a code, so a reset link alone — an inbox — is
   * not a way in.
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    if (newPassword.length < 12) {
      throw new BadRequestException(
        'Console passwords must be at least 12 characters',
      );
    }

    const found = await this.db.queryOne<{ id: string; admin_id: string }>(
      `select id, admin_id from admin_password_resets
        where token_hash = $1 and used_at is null and expires_at > now()`,
      [this.hashToken(token)],
    );
    if (!found) {
      throw new BadRequestException(
        'That link has expired or has already been used. Ask for a new one.',
      );
    }

    await this.db.query(
      'update admin_password_resets set used_at = now() where id = $1',
      [found.id],
    );
    const row = await this.db.queryOne<{ id: string; email: string }>(
      `update admin_users
          set password_hash = $2,
              -- They just chose it, so there is nothing left to force.
              must_change_password = false,
              -- Proving the inbox is theirs is enough to clear a lockout.
              failed_logins = 0,
              locked_until = null,
              sessions_valid_from = now(),
              updated_at = now()
        where id = $1
        returning id, email`,
      [found.admin_id, await this.hashPassword(newPassword)],
    );
    // Whoever was signed in before is signed out. If the reason for the reset
    // was a compromise, leaving their session alive would defeat it.
    await this.revokeAllFor(found.admin_id);
    if (row) {
      await this.audit.record(row, {
        action: 'admin.passwordReset',
        targetType: 'admin',
        targetId: row.id,
      });
    }
  }

  /**
   * Ends every session for one admin — used when disabling or demoting them,
   * and on a password change.
   *
   * All three halves: the sessions, their refresh tokens, and any access token
   * minted before now, cut off by moving `sessions_valid_from` forward.
   */
  async revokeAllFor(adminId: string): Promise<void> {
    await this.db.query(
      `update admin_sessions set revoked_at = now()
        where admin_id = $1 and revoked_at is null`,
      [adminId],
    );
    await this.db.query(
      `update admin_refresh_tokens set revoked_at = now()
        where admin_id = $1 and revoked_at is null`,
      [adminId],
    );
    await this.db.query(
      'update admin_users set sessions_valid_from = now() where id = $1',
      [adminId],
    );
  }
}
