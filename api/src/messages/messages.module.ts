import { Module } from '@nestjs/common';
import { FriendsModule } from '../friends/friends.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

@Module({
  // Friends provides the "are these two connected?" check that gates every
  // thread; Notifications delivers the new-message push.
  imports: [FriendsModule, NotificationsModule],
  controllers: [MessagesController],
  providers: [MessagesService],
})
export class MessagesModule {}
