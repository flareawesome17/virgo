import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { HealthController } from './health.controller';

@Module({
  // DatabaseModule and MailModule are global; BillingModule is not, because
  // only this controller and the billing routes need it.
  imports: [BillingModule],
  controllers: [HealthController],
})
export class HealthModule {}
