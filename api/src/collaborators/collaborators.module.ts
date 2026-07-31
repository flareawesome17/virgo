import { Module } from '@nestjs/common';
import { FriendsModule } from '../friends/friends.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { CollaboratorsController } from './collaborators.controller';
import { CollaboratorsRepository } from './collaborators.repository';
import { CollaboratorsService } from './collaborators.service';

@Module({
  imports: [WorkspacesModule, FriendsModule],
  controllers: [CollaboratorsController],
  providers: [CollaboratorsService, CollaboratorsRepository],
})
export class CollaboratorsModule {}
