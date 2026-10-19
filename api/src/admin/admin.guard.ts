import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AdminAuthService, type AdminIdentity } from './admin-auth.service';
import { SIGNED_IN, type AdminPermission } from './rbac';

export const PERMISSION_KEY = 'admin:permission';

/**
 * Declares what a route needs.
 *
 * Every admin route must carry one. `AdminGuard` refuses a route with no
 * permission declared rather than allowing it — a new endpoint someone forgot
 * to annotate should fail loudly in development, not quietly grant a viewer
 * the ability to disable accounts.
 */
export const RequirePermission = (permission: AdminPermission) =>
  SetMetadata(PERMISSION_KEY, permission);

/**
 * A route for any signed-in console account, whatever its role: reading
 * itself, its own password, two-factor and sessions. See SIGNED_IN in rbac.ts.
 */
export const SignedIn = () => SetMetadata(PERMISSION_KEY, SIGNED_IN);

export const PENDING_SETUP_KEY = 'admin:allowsPendingSetup';

/**
 * Marks the routes an account may still use while it has setup to finish —
 * a password somebody else chose, or two-factor its role requires.
 *
 * Only reading who you are and finishing that setup. Everything else is
 * refused until then, here rather than only in the console's layout — a
 * password someone else chose must not be usable against the API directly,
 * and a role that requires two-factor means nothing if the API serves the
 * account before it has any.
 */
export const AllowsPendingSetup = () => SetMetadata(PENDING_SETUP_KEY, true);

export interface AdminRequest extends Request {
  admin?: AdminIdentity;
}

/** The signed-in console account, for handlers that need to record who acted. */
export const CurrentAdmin = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AdminIdentity => {
    const req = ctx.switchToHttp().getRequest<AdminRequest>();
    if (!req.admin) throw new UnauthorizedException();
    return req.admin;
  },
);

/**
 * Guards every console route.
 *
 * Applied per-controller rather than globally: the app's own JwtAuthGuard is
 * the global one, and these routes opt out of it with `@Public()` and then
 * authenticate themselves against a different table, a different secret and a
 * different audience.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AdminRequest>();

    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Sign in to the console');
    }

    const admin = await this.auth.verify(header.slice(7));
    req.admin = admin;

    const required = this.reflector.getAllAndOverride<AdminPermission | typeof SIGNED_IN | undefined>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Fail closed. An unannotated route is a mistake, and the safe reading of
    // a mistake on an admin API is "nobody", not "everybody".
    if (!required) {
      throw new ForbiddenException('This action is not available');
    }

    const pendingAllowed = this.reflector.getAllAndOverride<boolean>(PENDING_SETUP_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (admin.mustChangePassword && !pendingAllowed) {
      throw new ForbiddenException('Choose a new password before continuing');
    }
    if (admin.mustSetUpTwoFactor && !pendingAllowed) {
      throw new ForbiddenException('Set up two-factor sign-in before continuing');
    }

    if (required === SIGNED_IN) return true;

    if (!admin.permissions.includes(required)) {
      throw new ForbiddenException(
        `Your role (${admin.role}) does not allow this`,
      );
    }

    return true;
  }
}
