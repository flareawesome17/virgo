import { createHash, randomBytes } from 'node:crypto';
import {
  Injectable,
  Logger,
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { DatabaseService } from '../database/database.service';
import { permissionsFor, type AdminPermission, type AdminRole } from './rbac';

/** Short, because a console session is a bigger prize than an app session. */
const ACCESS_TTL = '30m';
const REFRESH_TTL_DAYS = 7;

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
}

interface AdminRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: AdminRole;
  disabled_at: Date | null;
}

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
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
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token, {
        secret: this.secret(),
        audience: ADMIN_AUDIENCE,
      });
      sub = payload.sub;
    } catch {
      throw new UnauthorizedException('Session expired');
    }

    const row = await this.db.queryOne<AdminRow>(
      'select * from admin_users where id = $1',
      [sub],
    );
    if (!row || row.disabled_at) throw new UnauthorizedException('Session expired');
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

  /** Ends every session for one admin — used when disabling or demoting them. */
  async revokeAllFor(adminId: string): Promise<void> {
    await this.db.query(
      `update admin_refresh_tokens set revoked_at = now()
        where admin_id = $1 and revoked_at is null`,
      [adminId],
    );
  }
}
