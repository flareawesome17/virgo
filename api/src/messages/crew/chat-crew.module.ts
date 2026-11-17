import { Module } from '@nestjs/common';
import { MessagesModule } from '../messages.module';
import { ChatCrewController } from './chat-crew.controller';
import { ChatCrewService } from './chat-crew.service';

/**
 * Team and crew chats. A module of its own so the code that changes who is in
 * a workspace or hired on a job (collaborators, workspaces, hiring, bookings)
 * can call in without MessagesModule importing any of them back.
 */
@Module({
  imports: [MessagesModule],
  controllers: [ChatCrewController],
  providers: [ChatCrewService],
  exports: [ChatCrewService],
})
export class ChatCrewModule {}
