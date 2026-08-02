import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BillingWebhookController } from './billing-webhook.controller';
import { BillingSweepService } from './billing-sweep.service';
import { PayMongoClient } from './paymongo.client';

@Module({
  controllers: [BillingController, BillingWebhookController],
  providers: [BillingService, PayMongoClient, BillingSweepService],
  // Exported so the health endpoint can report whether the PayMongo account
  // can actually take a subscription.
  exports: [BillingService],
})
export class BillingModule {}
