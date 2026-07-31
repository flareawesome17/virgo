import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Opts a route out of the globally applied JwtAuthGuard.
 *
 * Authentication is deny-by-default: the guard is registered globally in
 * AppModule, so a newly added endpoint is protected unless someone explicitly
 * marks it public. That ordering matters — an allow-by-default setup leaks the
 * moment a developer forgets a decorator.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
