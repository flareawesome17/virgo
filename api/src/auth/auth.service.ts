import { createHash, randomBytes } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import {
  PublicUser,
  toPublicUser,
  UsersRepository,
  UserRow,
} from './users.repository';
import { StorageService } from '../storage/storage.service';
import { normalizeRoles } from './roles';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface AuthResult extends AuthTokens {
  user: PublicUser;
}

export interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersRepository,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly storage: StorageService,
  ) {}

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  /**
   * Refresh tokens are high-entropy random strings, so a fast hash is correct
   * here — bcrypt exists to slow down guessing of low-entropy human passwords
   * and would only add latency. Hashing at rest means a database dump does not
   * hand over usable sessions.
   */
  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * jsonwebtoken types expiresIn as a `${number}${unit}` template literal, which
   * a plain env string does not satisfy. parseTtlToMs rejects anything that is
   * not exactly that shape, so validating first makes this cast checked rather
   * than hopeful — a malformed JWT_ACCESS_TTL throws instead of silently
   * producing a token with no expiry.
   */
  private resolveTtl(ttl: string): NonNullable<JwtSignOptions['expiresIn']> {
    this.parseTtlToMs(ttl);
    return ttl as NonNullable<JwtSignOptions['expiresIn']>;
  }

  private parseTtlToMs(ttl: string): number {
    const match = /^(\d+)([smhd])$/.exec(ttl);
    if (!match) throw new Error(`Invalid TTL format: ${ttl}`);
    const value = Number(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };
    return value * multipliers[unit];
  }

  private async issueTokens(user: UserRow): Promise<AuthTokens> {
    const accessTtl = this.config.get<string>('JWT_ACCESS_TTL', '15m');
    const refreshTtl = this.config.get<string>('JWT_REFRESH_TTL', '30d');

    const payload: JwtPayload = { sub: user.id, email: user.email };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.resolveTtl(accessTtl),
    });

    // Opaque random string rather than a JWT: it must be revocable, and a
    // stateless JWT cannot be invalidated before it expires.
    const refreshToken = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + this.parseTtlToMs(refreshTtl));
    await this.users.storeRefreshToken(
      user.id,
      this.hashRefreshToken(refreshToken),
      expiresAt,
    );

    return { accessToken, refreshToken, expiresIn: accessTtl };
  }

  /**
   * Refuses a session to an account that has not confirmed its address.
   *
   * Applied to login *and* refresh. Blocking refresh is what makes this a
   * force-logout rather than a door policy: an existing session dies at the
   * end of its access token — fifteen minutes by default — instead of living
   * on until the user happens to sign out.
   *
   * The code lets clients show "check your inbox, resend?" instead of a
   * generic permission error.
   */
  private assertVerified(user: UserRow): void {
    if (this.config.get<string>('REQUIRE_EMAIL_VERIFICATION') === 'false') return;
    if (user.email_verified_at) return;

    throw new ForbiddenException({
      message:
        'Confirm your email address before signing in. Check your inbox for the link.',
      error: 'EmailNotVerified',
      code: 'EMAIL_NOT_VERIFIED',
      // Echoed so the client can offer to resend without asking for it again.
      email: user.email,
      statusCode: 403,
    });
  }

  /**
   * Refuses a session while the account is paused.
   *
   * Applied to login *and* refresh, for the same reason as assertVerified: a
   * session already open would otherwise outlive the pause by however long its
   * access token has left.
   *
   * The date is returned rather than hidden. Someone who paused their account
   * and forgot needs to be told when it comes back, or their only option is to
   * guess — and a bare "account disabled" reads as a ban.
   */
  private assertNotDisabled(user: UserRow): void {
    if (!user.disabled_until) return;
    const until = new Date(user.disabled_until);
    // Lifts on its own: nothing clears the column, the comparison just stops
    // being true. See migration 027.
    if (until.getTime() <= Date.now()) return;

    throw new ForbiddenException({
      message: `You paused this account. It comes back on ${until.toISOString().slice(0, 10)}.`,
      error: 'AccountDisabled',
      code: 'ACCOUNT_DISABLED',
      disabledUntil: until.toISOString(),
      statusCode: 403,
    });
  }

  async register(
    email: string,
    password: string,
    displayName?: string,
    roles: string[] = [],
  ): Promise<AuthResult> {
    const normalized = this.normalizeEmail(email);

    const existing = await this.users.findByEmail(normalized);
    if (existing) {
      // Registration inherently reveals whether an email is taken — there is no
      // way to both reject duplicates and hide them. Login, where it matters
      // more, does not leak this.
      throw new ConflictException('An account with that email already exists');
    }

    const rounds = Number(this.config.get('BCRYPT_ROUNDS', '12'));
    const passwordHash = await bcrypt.hash(password, rounds);
    // Normalized rather than trusted: the DTO rejects unknown values, this
    // de-duplicates and fixes the order so two people with the same roles
    // always render identically.
    const user = await this.users.create(
      normalized,
      passwordHash,
      displayName,
      normalizeRoles(roles),
    );

    return { user: toPublicUser(user), ...(await this.issueTokens(user)) };
  }

  /**
   * A real hash at the configured cost, computed once on first use. Comparing
   * against this when no user exists keeps login timing constant; a malformed
   * placeholder would be rejected by bcrypt immediately and reintroduce the
   * timing difference it is meant to hide.
   */
  private dummyHash: string | null = null;

  private getDummyHash(): string {
    if (!this.dummyHash) {
      const rounds = Number(this.config.get('BCRYPT_ROUNDS', '12'));
      this.dummyHash = bcrypt.hashSync(randomBytes(16).toString('hex'), rounds);
    }
    return this.dummyHash;
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const normalized = this.normalizeEmail(email);
    const user = await this.users.findByEmail(normalized);

    // Compare against a dummy hash when the user is absent so that a missing
    // account and a wrong password take the same time. Returning early here
    // would make user enumeration possible by measuring response latency.
    const hash = user?.password_hash ?? this.getDummyHash();
    const valid = await bcrypt.compare(password, hash);

    if (!user || !valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // After the password check, never before: answering "verify your email"
    // or "this account is paused" to a wrong password would confirm the
    // account exists.
    this.assertVerified(user);
    this.assertNotDisabled(user);

    return { user: toPublicUser(user), ...(await this.issueTokens(user)) };
  }

  /**
   * Rotating refresh: the presented token is revoked and a new pair issued, so
   * a stolen token is usable at most once and the theft surfaces when the
   * legitimate client's next refresh fails.
   */
  async refresh(refreshToken: string): Promise<AuthResult> {
    const tokenHash = this.hashRefreshToken(refreshToken);
    const stored = await this.users.findActiveRefreshToken(tokenHash);
    if (!stored) throw new UnauthorizedException('Invalid refresh token');

    const user = await this.users.findById(stored.user_id);
    if (!user) throw new UnauthorizedException('Invalid refresh token');

    // Revoke first, so a blocked refresh still consumes the token rather than
    // leaving it replayable.
    await this.users.revokeRefreshToken(tokenHash);
    this.assertVerified(user);
    this.assertNotDisabled(user);

    return { user: toPublicUser(user), ...(await this.issueTokens(user)) };
  }

  async logout(refreshToken: string): Promise<void> {
    // Revoking an already-revoked or unknown token is a no-op, so logout is
    // idempotent and never reveals whether the token was real.
    await this.users.revokeRefreshToken(this.hashRefreshToken(refreshToken));
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException();
    return toPublicUser(user);
  }

  /**
   * Updates the caller's own profile. The id comes from the JWT, never the
   * body, so there is no way to edit another user's record.
   */
  async updateProfile(
    userId: string,
    input: {
      displayName?: string | null;
      avatarUrl?: string | null;
      title?: string | null;
      phone?: string | null;
      website?: string | null;
      location?: string | null;
      bio?: string | null;
      discoverable?: boolean;
      roles?: string[];
    },
  ): Promise<PublicUser> {
    // Read the old avatar before the write, so the object it points at can be
    // removed afterwards. Every replaced picture used to stay in the bucket
    // forever: paid for, unreachable, and impossible to tell apart from a real
    // one — a third of the objects in there had no database row at all.
    const previousAvatar =
      input.avatarUrl !== undefined
        ? (await this.users.findById(userId))?.avatar_url ?? null
        : null;

    const user = await this.users.updateProfile(userId, {
      display_name: input.displayName,
      avatar_url: input.avatarUrl,
      title: input.title,
      phone: input.phone,
      website: input.website,
      location: input.location,
      bio: input.bio,
      discoverable: input.discoverable,
      roles: input.roles ? normalizeRoles(input.roles) : undefined,
    });
    if (!user) throw new UnauthorizedException();

    if (previousAvatar && previousAvatar !== user.avatar_url) {
      await this.discardAvatar(userId, previousAvatar);
    }

    return toPublicUser(user);
  }

  /**
   * Deletes the object a replaced avatar pointed at.
   *
   * Best-effort on purpose: the profile has already been saved, and failing
   * the whole request because a tidy-up did not land would be the wrong trade.
   *
   * The key is checked against the caller's own avatar prefix before anything
   * is deleted. `avatar_url` is client-supplied, so without that check a
   * crafted value would turn this into "delete any object you can name".
   */
  private async discardAvatar(userId: string, url: string): Promise<void> {
    try {
      const key = this.storage.keyFromPublicUrl(url);
      if (!key || !key.startsWith(`users/${userId}/avatars/`)) return;
      await this.storage.deleteObject(userId, key);
    } catch (err) {
      this.logger.warn(
        `Could not remove the previous avatar for ${userId}: ${String(err)}`,
      );
    }
  }
}
