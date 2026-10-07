import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { MoneyController } from './money.controller';
import { MoneyService } from './money.service';
import { MoneyBookingsService } from './money-bookings.service';
import { MoneyNudgesService } from './money-nudges.service';

@Module({
  imports: [StorageModule],
  controllers: [MoneyController],
  providers: [MoneyService, MoneyBookingsService, MoneyNudgesService],
})
export class MoneyModule {}
