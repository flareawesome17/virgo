import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BillingService } from './billing.service';

/**
 * Drops accounts whose paid period has run out.
 *
 * A backstop, not the mechanism. PayMongo sends a webhook when a subscription
 * ends, and that is what normally moves an account back to free. But a webhook
 * that never lands — a deploy at the wrong second, an outage at their end, a
 * signature secret rotated without updating ours — would otherwise leave an
 * account on a paid tier that nobody is paying for, forever.
 *
 * Hourly rather than by the minute: the window this closes is measured in
 * hours of goodwill, not seconds of revenue.
 */
@Injectable()
export class BillingSweepService {
  private readonly logger = new Logger(BillingSweepService.name);
  private running = false;

  constructor(private readonly billing: BillingService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async sweep(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.billing.expireLapsed();
    } catch (err) {
      this.logger.error(`Billing sweep failed: ${String(err)}`);
    } finally {
      this.running = false;
    }
  }
}
