import { Controller, Get, Logger } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { QuotaService, type UsageSummary } from './quota.service';
import { PLAN_CATALOGUE, toJsonLimit } from './quota.config';
import { DownloadAllowanceService, type DownloadUsage } from './download-allowance.service';

@Controller('me')
export class QuotaController {
  private readonly logger = new Logger(QuotaController.name);

  constructor(
    private readonly quota: QuotaService,
    private readonly downloads: DownloadAllowanceService,
  ) {}

  /**
   * Plan, storage consumption and how much of each limit is used, plus this
   * month's client downloads against the plan's allowance.
   */
  @Get('usage')
  async usage(
    @CurrentUser('id') userId: string,
  ): Promise<UsageSummary & { downloads: DownloadUsage | null }> {
    const [summary, downloads] = await Promise.all([
      this.quota.summary(userId),
      // null rather than a failed request: the storage screen is built on this
      // response, and a counter it cannot read must not take that down too.
      this.downloads.usage(userId).catch((err: unknown) => {
        this.logger.warn(`Download usage unavailable: ${String(err)}`);
        return null;
      }),
    ]);
    return { ...summary, downloads };
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
        downloadBytesPerMonth: toJsonLimit(plan.downloadBytesPerMonth),
      })),
      total: PLAN_CATALOGUE.length,
    };
  }
}
