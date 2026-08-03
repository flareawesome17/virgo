import { Module } from '@nestjs/common';
import { FriendsModule } from '../friends/friends.module';
import { MailModule } from '../mail/mail.module';
import { MessagesModule } from '../messages/messages.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { HiringSweepService } from './hiring-sweep.service';
import {
  JobActionsController,
  MyJobsController,
  PublicJobsController,
} from './hiring.controller';
import { HiringService } from './hiring.service';

@Module({
  // Accepting an application is a friendship, a conversation and a
  // notification at once — the same three the hire enquiry flow needs.
  imports: [FriendsModule, MessagesModule, NotificationsModule, MailModule],
  controllers: [PublicJobsController, MyJobsController, JobActionsController],
  providers: [HiringService, HiringSweepService],
  exports: [HiringService],
})
export class HiringModule {}
