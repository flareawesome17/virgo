import { Module } from '@nestjs/common';
import { FriendsModule } from '../friends/friends.module';
import { MailModule } from '../mail/mail.module';
import { MessagesModule } from '../messages/messages.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { HireController } from './hire.controller';
import { HireService } from './hire.service';

@Module({
  // Accepting an enquiry is three things at once: a friendship, a conversation,
  // and a notification. All three modules are needed for one endpoint.
  imports: [FriendsModule, MessagesModule, NotificationsModule, MailModule],
  controllers: [HireController],
  providers: [HireService],
})
export class HireModule {}
