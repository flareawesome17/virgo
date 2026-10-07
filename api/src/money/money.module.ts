import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { MoneyController } from './money.controller';
import { MoneyService } from './money.service';
import { MoneyBookingsService } from './money-bookings.service';
import { MoneyNudgesService } from './money-nudges.service';
import { MoneyPackagesService } from './money-packages.service';
import { MoneyPayMethodsService } from './money-pay-methods.service';
import { MoneyPackagesController, PublicStatementController } from './money-packages.controller';
import { MoneyInsightsController } from './money-insights.controller';
import { MoneyInsightsService } from './money-insights.service';
import { MoneyRecurringService } from './money-recurring.service';

@Module({
  imports: [StorageModule],
  controllers: [
    MoneyController,
    MoneyPackagesController,
    PublicStatementController,
    MoneyInsightsController,
  ],
  providers: [
    MoneyService,
    MoneyBookingsService,
    MoneyNudgesService,
    MoneyPackagesService,
    MoneyPayMethodsService,
    MoneyInsightsService,
    MoneyRecurringService,
  ],
})
export class MoneyModule {}
