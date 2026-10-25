import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WorkspaceTrashService } from './workspace-trash.service';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesRepository } from './workspaces.repository';
import { WorkspacesService } from './workspaces.service';

@Module({
  // For ReauthService: deleting a workspace asks for the password again.
  imports: [AuthModule],
  controllers: [WorkspacesController],
  providers: [WorkspacesService, WorkspacesRepository, WorkspaceTrashService],
  // Exported so albums / schedule events / collaborators can verify workspace
  // ownership before attaching rows to one.
  exports: [WorkspacesService],
})
export class WorkspacesModule {}
