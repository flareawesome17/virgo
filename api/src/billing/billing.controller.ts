import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import { PURCHASABLE_PLANS } from '../quota/quota.config';
import { BillingService } from './billing.service';

const PURCHASABLE = PURCHASABLE_PLANS.map((plan) => plan.name);

export class SubscribeDto {
  @IsIn(PURCHASABLE, {
    message: `Choose one of: ${PURCHASABLE.join(', ')}`,
  })
  plan!: string;

  /**
   * Which app is asking, so PayMongo returns the customer to it.
   *
   * A platform name, deliberately not a URL: the server picks the destination
   * from its own configuration. Letting a caller supply where a payment page
   * redirects to is how a phishing flow gets built.
   */
  @IsOptional()
  @IsIn(['web', 'mobile'])
  platform?: 'web' | 'mobile';
}

export class CancelSubscriptionDto {
  /** PayMongo's enum. Anything else is stored as 'other'. */
  @IsOptional()
  @IsString()
  @IsIn([
    'too_expensive',
    'missing_features',
    'switched_service',
    'unused',
    'other',
  ])
  reason?: string;
}

@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  /** The caller's plan and subscription, for the billing screen. */
  @Get()
  status(@CurrentUser('id') userId: string) {
    return this.billing.status(userId);
  }

  /**
   * Starts a subscription and returns where to send the customer to pay.
   *
   * Does not grant anything. The plan changes when PayMongo says the card
   * cleared, which arrives on the webhook.
   */
  @HttpCode(200)
  @Post('subscribe')
  subscribe(@CurrentUser('id') userId: string, @Body() dto: SubscribeDto) {
    return this.billing.subscribe(userId, dto.plan, dto.platform ?? 'web');
  }

  /**
   * Asks PayMongo whether anything this user started has since been paid.
   *
   * Called when they come back from checkout. Throttled because it makes
   * outbound calls per pending session, and nothing is lost by making an
   * impatient client wait.
   */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('reconcile')
  reconcile(@CurrentUser('id') userId: string) {
    return this.billing.reconcile(userId);
  }

  /** Cancels. Access continues to the end of the period already paid for. */
  @HttpCode(200)
  @Post('cancel')
  cancel(
    @CurrentUser('id') userId: string,
    @Body() dto: CancelSubscriptionDto,
  ) {
    return this.billing.cancel(userId, dto.reason);
  }
}
