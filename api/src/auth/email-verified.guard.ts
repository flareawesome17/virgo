import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { DatabaseService } from '../database/database.service';
import { IS_PUBLIC_KEY } from './public.decorator';
import { ALLOW_UNVERIFIED_KEY } from './allow-unverified.decorator';
import type { AuthenticatedUser } from './jwt.strategy';

/**
 * Blocks writes from accounts whose email has not been confirmed.
 *
 * Reads are deliberately left alone, and so is signing in. Someone who has not
 * clicked the link can still get in and look around — they simply cannot
 * create, change or send anything. Locking them out of the account entirely
 * would mean a mail outage locks out every new user with no way back, and the
 * point of verification is to establish that the address is real, not to
 * punish people for a slow inbox.
 *
 * GET is allowed by method rather than by an allowlist so a new read endpoint
 * cannot accidentally arrive gated.
 */
@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  /** Cached per user for a short while; verifying is a one-way transition. */
  private readonly verified = new Map<string, number>();
  private static readonly CACHE_MS = 60_000;

  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
    private readonly db: DatabaseService,
  ) {}

  private get enforced(): boolean {
    // Defaults to on. Set REQUIRE_EMAIL_VERIFICATION=false to disable — worth
    // doing while the sending domain is still unverified with the mail
    // provider, or nobody can complete a signup.
    return this.config.get<string>('REQUIRE_EMAIL_VERIFICATION') !== 'false';
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.enforced) return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // Endpoints a user must be able to reach *because* they are unverified:
    // reading their own profile, resending the link, signing out.
    const allowUnverified = this.reflector.getAllAndOverride<boolean>(
      ALLOW_UNVERIFIED_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (allowUnverified) return true;

    const request = context.switchToHttp().getRequest<{
      method: string;
      user?: AuthenticatedUser;
    }>();

    if (request.method === 'GET' || request.method === 'OPTIONS') return true;

    const user = request.user;
    if (!user) return true; // Not authenticated; the JWT guard owns that call.

    if (await this.isVerified(user.id)) return true;

    throw new ForbiddenException({
      // Names the scope of what is blocked, because the old wording — "finish
      // setting up" — read like an onboarding nag next to an action the user
      // had just deliberately taken, and did not explain why it failed.
      message:
        'Confirm your email address before sending or changing anything. The link is in your inbox.',
      error: 'EmailNotVerified',
      // A machine-readable marker so clients can show the resend prompt rather
      // than a generic permission error.
      code: 'EMAIL_NOT_VERIFIED',
      statusCode: 403,
    });
  }

  private async isVerified(userId: string): Promise<boolean> {
    const cached = this.verified.get(userId);
    if (cached && Date.now() - cached < EmailVerifiedGuard.CACHE_MS) return true;

    const row = await this.db.queryOne<{ verified: boolean }>(
      'select email_verified_at is not null as verified from users where id = $1',
      [userId],
    );

    // An unknown id is not this guard's problem — let the request through and
    // let the owning repository return its own 404.
    if (!row) return true;

    if (row.verified) {
      this.verified.set(userId, Date.now());
      // Unbounded growth would be a slow leak on a long-lived process.
      if (this.verified.size > 10_000) this.verified.clear();
    }
    return row.verified;
  }
}
