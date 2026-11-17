import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
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
import { MoneyTaxService } from './money-tax.service';
import { MoneySavingsController } from './money-savings.controller';
import { MoneySavingsService } from './money-savings.service';

@Module({
  // AuthModule for ReauthService: changing how clients pay asks for the password.
  imports: [StorageModule, AuthModule],
  controllers: [
    MoneyController,
    MoneyPackagesController,
    PublicStatementController,
    MoneyInsightsController,
    MoneySavingsController,
  ],
  providers: [
    MoneyService,
    MoneyBookingsService,
    MoneyNudgesService,
    MoneyPackagesService,
    MoneyPayMethodsService,
    MoneyInsightsService,
    MoneyRecurringService,
    MoneyTaxService,
    MoneySavingsService,
  ],
  // Chat sends a way to pay as a card, and a booking shows the creative's to
  // the poster who owes them; a card can name the package it is for.
  exports: [MoneyPayMethodsService, MoneyPackagesService],
})
export class MoneyModule {}
