import { Module } from '@nestjs/common';
import { ChatCrewModule } from '../messages/crew/chat-crew.module';
import { StorageModule } from '../storage/storage.module';
import { WorkspaceTrashService } from './workspace-trash.service';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesRepository } from './workspaces.repository';
import { WorkspacesService } from './workspaces.service';

@Module({
  // StorageModule for the sweep, which deletes the files of what has been in
  // Recently deleted for 30 days.
  // ChatCrew: leaving a workspace, or renaming it, moves its team chat too.
  imports: [StorageModule, ChatCrewModule],
  controllers: [WorkspacesController],
  providers: [WorkspacesService, WorkspacesRepository, WorkspaceTrashService],
  // Exported so albums / schedule events / collaborators can verify workspace
  // ownership before attaching rows to one.
  exports: [WorkspacesService],
})
export class WorkspacesModule {}
