import { Global, Module } from '@nestjs/common';
import { AppUpdatesController } from './app-updates.controller';
import { AppUpdatesService } from './app-updates.service';
import { NotificationFeedService } from './notification-feed.service';
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
  controllers: [NotificationsController, AppUpdatesController],
  providers: [
    PushService,
    NotifyService,
    ReminderDispatcherService,
    NotificationFeedService,
    // Here rather than in a module of its own: the feed reads it and it pushes
    // through PushService, so a separate module would import this one while
    // this one imported it.
    AppUpdatesService,
  ],
  // The feed is deliberately not exported. Every feature in the app can reach
  // this module, and none of them has any business reading someone's list.
  exports: [PushService, NotifyService],
})
export class NotificationsModule {}
