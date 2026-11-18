import { Module } from '@nestjs/common';
import { FriendsModule } from '../friends/friends.module';
import { MoneyModule } from '../money/money.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../storage/storage.module';
import { ChatFilesController } from './files/chat-files.controller';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { SavedRepliesController } from './saved-replies.controller';
import { SavedRepliesService } from './saved-replies.service';

@Module({
  // Friends provides the "are these two connected?" check that gates every
  // thread; Notifications delivers the new-message push; Money fills in the
  // ways to pay a pay card names; Storage checks a group photo is the
  // uploader's own, and tidies away the one it replaces, and holds the photos
  // and files sent from people's devices (ChatFilesService).
  imports: [FriendsModule, NotificationsModule, MoneyModule, StorageModule],
  // ChatFilesController first, so its fixed paths (files/usage) are matched
  // before anything shaped like :id.
  controllers: [ChatFilesController, MessagesController, SavedRepliesController],
  providers: [MessagesService, SavedRepliesService],
  // Accepting a hire enquiry opens the direct chat as part of the same action.
  exports: [MessagesService],
})
export class MessagesModule {}
