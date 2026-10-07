import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { MoneyController } from './money.controller';
import { MoneyService } from './money.service';
import { MoneyBookingsService } from './money-bookings.service';
import { MoneyNudgesService } from './money-nudges.service';
import { MoneyPackagesService } from './money-packages.service';
import { MoneyPayMethodsService } from './money-pay-methods.service';
import { MoneyPackagesController, PublicStatementController } from './money-packages.controller';

@Module({
  imports: [StorageModule],
  controllers: [MoneyController, MoneyPackagesController, PublicStatementController],
  providers: [
    MoneyService,
    MoneyBookingsService,
    MoneyNudgesService,
    MoneyPackagesService,
    MoneyPayMethodsService,
  ],
})
export class MoneyModule {}
