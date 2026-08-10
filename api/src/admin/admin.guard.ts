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
import type { AdminPermission } from './rbac';

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

    const required = this.reflector.getAllAndOverride<AdminPermission | undefined>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Fail closed. An unannotated route is a mistake, and the safe reading of
    // a mistake on an admin API is "nobody", not "everybody".
    if (!required) {
      throw new ForbiddenException('This action is not available');
    }

    if (!admin.permissions.includes(required)) {
      throw new ForbiddenException(
        `Your role (${admin.role}) does not allow this`,
      );
    }

    return true;
  }
}
