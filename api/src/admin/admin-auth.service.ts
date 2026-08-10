import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
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
import { permissionsFor, type AdminPermission, type AdminRole } from './rbac';

/** Short, because a console session is a bigger prize than an app session. */
const ACCESS_TTL = '30m';
const REFRESH_TTL_DAYS = 7;

/** Short. A console reset link sitting in an inbox is a standing key. */
const RESET_TTL_MINUTES = 30;

/**
 * The audience claim.
 *
 * Belt and braces alongside the separate secret: even if the two keys were
 * ever misconfigured to match, an app token would still be refused here and a
 * console token refused by the app.
 */
const ADMIN_AUDIENCE = 'virgo-admin';

export interface AdminIdentity {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  permissions: readonly AdminPermission[];
  /**
   * True while the account still has the password the server generated for it.
   *
   * Carried on the identity rather than only in the login response so it
   * survives a refresh — otherwise reloading the console would step straight
   * past the change screen.
   */
  mustChangePassword: boolean;
}

interface AdminRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: AdminRole;
  disabled_at: Date | null;
  must_change_password: boolean;
  sessions_valid_from: Date | null;
}

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  /**
   * The console's own signing key.
   *
   * Required, with no fallback to JWT_SECRET. Deriving it from the app's key
   * would mean one leak compromises both, which is exactly the coupling this
   * whole module exists to avoid — so the console fails closed and says so
   * rather than quietly running with shared trust.
   */
  private secret(): string {
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

  private identity(row: AdminRow): AdminIdentity {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      permissions: permissionsFor(row.role),
      mustChangePassword: row.must_change_password,
    };
  }

  /**
   * Verifies an access token and returns who it belongs to.
   *
   * The role is re-read from the database on every request rather than trusted
   * from the token. Demoting someone has to take effect immediately — a token
   * minted while they were an owner must not keep owner powers for its
   * remaining 30 minutes.
   */
  async verify(token: string): Promise<AdminIdentity> {
    let sub: string;
    let issuedAt: number | undefined;
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; iat?: number }>(
        token,
        { secret: this.secret(), audience: ADMIN_AUDIENCE },
      );
      sub = payload.sub;
      issuedAt = payload.iat;
    } catch {
      throw new UnauthorizedException('Session expired');
    }

    const row = await this.db.queryOne<AdminRow>(
      'select * from admin_users where id = $1',
      [sub],
    );
    if (!row || row.disabled_at) throw new UnauthorizedException('Session expired');

    /*
     * Refuse a token minted before the account's sessions were invalidated.
     *
     * Revoking refresh tokens alone left the previous holder with a working
     * access token for the rest of its 30 minutes — the exact window that
     * matters when the password was changed because somebody else saw it.
     *
     * `iat` is in seconds and floors, so a token issued in the same second as
     * the change can read as older than it. One second of slack, which is
     * shorter than any real attack and long enough to avoid logging out the
     * person who just typed the new password.
     */
    if (row.sessions_valid_from && issuedAt !== undefined) {
      const cutoff = Math.floor(row.sessions_valid_from.getTime() / 1000);
      if (issuedAt < cutoff - 1) {
        throw new UnauthorizedException('Session expired');
      }
    }

    return this.identity(row);
  }

  private async issue(row: AdminRow, userAgent?: string) {
    const accessToken = await this.jwt.signAsync(
      { sub: row.id, email: row.email },
      { secret: this.secret(), audience: ADMIN_AUDIENCE, expiresIn: ACCESS_TTL },
    );

    const refreshToken = randomBytes(32).toString('base64url');
    const expires = new Date(Date.now() + REFRESH_TTL_DAYS * 86_400_000);
    await this.db.query(
      `insert into admin_refresh_tokens (admin_id, token_hash, expires_at, user_agent)
       values ($1, $2, $3, $4)`,
      [row.id, this.hashToken(refreshToken), expires, userAgent?.slice(0, 300) ?? null],
    );

    return { accessToken, refreshToken, admin: this.identity(row) };
  }

  async login(email: string, password: string, userAgent?: string) {
    const row = await this.db.queryOne<AdminRow>(
      'select * from admin_users where lower(email) = lower($1)',
      [email],
    );

    // One message and one timing profile for every failure. Distinguishing
    // "no such account" from "wrong password" tells an attacker which console
    // emails are real, and this is the one login worth that effort.
    const hash = row?.password_hash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva';
    const ok = await bcrypt.compare(password, hash);
    if (!row || !ok || row.disabled_at) {
      this.logger.warn(`Failed console login for ${email}`);
      throw new UnauthorizedException('Email or password is incorrect');
    }

    await this.db.query(
      'update admin_users set last_login_at = now() where id = $1',
      [row.id],
    );
    return this.issue(row, userAgent);
  }

  /**
   * Trades a refresh token for a new pair, and burns the old one.
   *
   * Rotating rather than reusing: a stolen refresh token is then good for at
   * most one use, and the theft shows up as the real admin being logged out.
   */
  async refresh(token: string, userAgent?: string) {
    const found = await this.db.queryOne<{ id: string; admin_id: string }>(
      `select id, admin_id from admin_refresh_tokens
        where token_hash = $1 and revoked_at is null and expires_at > now()`,
      [this.hashToken(token)],
    );
    if (!found) throw new UnauthorizedException('Session expired');

    await this.db.query(
      'update admin_refresh_tokens set revoked_at = now() where id = $1',
      [found.id],
    );

    const row = await this.db.queryOne<AdminRow>(
      'select * from admin_users where id = $1',
      [found.admin_id],
    );
    if (!row || row.disabled_at) throw new UnauthorizedException('Session expired');
    return this.issue(row, userAgent);
  }

  async logout(token: string): Promise<void> {
    await this.db.query(
      'update admin_refresh_tokens set revoked_at = now() where token_hash = $1',
      [this.hashToken(token)],
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

    const row = await this.db.queryOne<AdminRow>(
      'select * from admin_users where id = $1',
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
   * reason the request side says nothing.
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
    await this.db.query(
      `update admin_users
          set password_hash = $2,
              -- They just chose it, so there is nothing left to force.
              must_change_password = false,
              sessions_valid_from = now(),
              updated_at = now()
        where id = $1`,
      [found.admin_id, await this.hashPassword(newPassword)],
    );
    // Whoever was signed in before is signed out. If the reason for the reset
    // was a compromise, leaving their session alive would defeat it.
    await this.revokeAllFor(found.admin_id);
  }

  /**
   * Ends every session for one admin — used when disabling or demoting them.
   *
   * Both halves: the stored refresh tokens, and the stateless access tokens,
   * which are cut off by moving `sessions_valid_from` forward. Revoking only
   * the first leaves a usable token behind for up to ACCESS_TTL.
   */
  async revokeAllFor(adminId: string): Promise<void> {
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
