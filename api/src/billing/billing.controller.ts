import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
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
    return this.billing.subscribe(userId, dto.plan);
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
