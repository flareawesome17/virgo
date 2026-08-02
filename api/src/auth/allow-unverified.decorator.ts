import { SetMetadata } from '@nestjs/common';

export const ALLOW_UNVERIFIED_KEY = 'allowUnverified';

/**
 * Opts a write endpoint out of EmailVerifiedGuard.
 *
 * For the handful an unverified user must still be able to reach *because*
 * they are unverified — resending the link, signing out, confirming the
 * address. Everything else stays gated, so a new endpoint is protected unless
 * someone explicitly says otherwise.
 */
export const AllowUnverified = () => SetMetadata(ALLOW_UNVERIFIED_KEY, true);
