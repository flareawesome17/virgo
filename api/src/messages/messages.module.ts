import { Module } from '@nestjs/common';
import { FriendsModule } from '../friends/friends.module';
import { MoneyModule } from '../money/money.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

@Module({
  // Friends provides the "are these two connected?" check that gates every
  // thread; Notifications delivers the new-message push; Money fills in the
  // ways to pay a pay card names.
  imports: [FriendsModule, NotificationsModule, MoneyModule],
  controllers: [MessagesController],
  providers: [MessagesService],
  // Accepting a hire enquiry opens the direct chat as part of the same action.
  exports: [MessagesService],
})
export class MessagesModule {}
