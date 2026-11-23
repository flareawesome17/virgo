import { Module } from '@nestjs/common';
import { FriendsModule } from '../friends/friends.module';
import { ChatCrewModule } from '../messages/crew/chat-crew.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { CollaboratorsController } from './collaborators.controller';
import { CollaboratorsRepository } from './collaborators.repository';
import { CollaboratorsService } from './collaborators.service';

@Module({
  // ChatCrew: joining or leaving a workspace moves its team chat too.
  imports: [WorkspacesModule, FriendsModule, NotificationsModule, ChatCrewModule],
  controllers: [CollaboratorsController],
  providers: [CollaboratorsService, CollaboratorsRepository],
})
export class CollaboratorsModule {}
