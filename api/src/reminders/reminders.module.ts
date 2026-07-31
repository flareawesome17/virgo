import { Module } from '@nestjs/common';
import { ScheduleEventsModule } from '../schedule-events/schedule-events.module';
import { RemindersController } from './reminders.controller';
import { RemindersRepository } from './reminders.repository';
import { RemindersService } from './reminders.service';

@Module({
  imports: [ScheduleEventsModule],
  controllers: [RemindersController],
  providers: [RemindersService, RemindersRepository],
})
export class RemindersModule {}
