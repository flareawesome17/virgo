import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from './jwt.strategy';

/**
 * Injects the JWT-derived principal. `@CurrentUser('id')` yields the user id,
 * which is what every owned-resource controller passes into its service.
 *
 * This is the ONLY sanctioned source of a user id for scoping queries. A user
 * id taken from the request body or a query parameter would let any caller read
 * any other user's rows.
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    return data ? request.user?.[data] : request.user;
  },
);
