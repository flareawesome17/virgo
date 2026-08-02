import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotifyService } from './notify.service';
import { PushService } from './push.service';
import { ReminderDispatcherService } from './reminder-dispatcher.service';

/**
 * Global, like RealtimeModule and MailModule.
 *
 * Notifying is cross-cutting — friends, collaborators, events and reminders all
 * do it — and making each of those import this module would be ceremony with no
 * decision behind it.
 */
@Global()
@Module({
  controllers: [NotificationsController],
  providers: [PushService, NotifyService, ReminderDispatcherService],
  exports: [PushService, NotifyService],
})
export class NotificationsModule {}
