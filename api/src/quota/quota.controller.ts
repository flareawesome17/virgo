import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { QuotaService } from './quota.service';
import { PLAN_CATALOGUE, toJsonLimit } from './quota.config';

@Controller('me')
export class QuotaController {
  constructor(private readonly quota: QuotaService) {}

  /** Plan, storage consumption and how much of each limit is used. */
  @Get('usage')
  usage(@CurrentUser('id') userId: string) {
    return this.quota.summary(userId);
  }
}

/**
 * The plans on offer.
 *
 * Served rather than hardcoded in the app so the tiers the screen advertises
 * and the limits the server enforces cannot drift apart.
 */
@Controller('plans')
export class PlansController {
  /**
   * Public. Every route is guarded by default, which is the right default —
   * but a price list is the one thing that has to be readable by someone who
   * has not signed up yet. The marketing site renders it server-side, and
   * behind the guard it got a 401 and fell back to "see plans in the app".
   *
   * Nothing here is account-specific: it is the same catalogue for everyone.
   */
  @Public()
  @Get()
  list() {
    return {
      data: PLAN_CATALOGUE.map((plan) => ({
        ...plan,
        /**
         * The old name for priceMinor, still served.
         *
         * Renaming it broke every installed app at once: a bundle reading
         * `priceCents` got undefined, divided it by 100, and rendered "NaN"
         * on the pricing screen. Web redeploys with the API; a phone does not,
         * so the field stays until old builds are gone.
         *
         * Same number either way — both are minor units.
         */
        priceCents: plan.priceMinor,
        // Infinity is not representable in JSON; null means unlimited.
        workspaces: toJsonLimit(plan.workspaces),
        albumsPerWorkspace: toJsonLimit(plan.albumsPerWorkspace),
      })),
      total: PLAN_CATALOGUE.length,
    };
  }
}
