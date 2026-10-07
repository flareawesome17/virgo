import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { MoneyController } from './money.controller';
import { MoneyService } from './money.service';

@Module({
  imports: [StorageModule],
  controllers: [MoneyController],
  providers: [MoneyService],
})
export class MoneyModule {}
