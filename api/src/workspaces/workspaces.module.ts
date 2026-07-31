import { Module } from '@nestjs/common';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesRepository } from './workspaces.repository';
import { WorkspacesService } from './workspaces.service';

@Module({
  controllers: [WorkspacesController],
  providers: [WorkspacesService, WorkspacesRepository],
  // Exported so albums / schedule events / collaborators can verify workspace
  // ownership before attaching rows to one.
  exports: [WorkspacesService],
})
export class WorkspacesModule {}
