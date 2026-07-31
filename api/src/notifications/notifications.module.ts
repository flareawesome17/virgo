import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { PushService } from './push.service';
import { ReminderDispatcherService } from './reminder-dispatcher.service';

@Module({
  controllers: [NotificationsController],
  providers: [PushService, ReminderDispatcherService],
  exports: [PushService],
})
export class NotificationsModule {}
