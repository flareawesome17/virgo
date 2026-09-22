import { Global, Module } from '@nestjs/common';
import { WorkspaceActivityService } from './workspace-activity.service';

/**
 * Global, because what a workspace's feed records happens all over: albums,
 * storage, sections, share links and collaborators all write to it. Importing
 * it module by module would tie storage to workspaces for one insert.
 *
 * It depends on the database and nothing else, so it cannot close a cycle.
 */
@Global()
@Module({
  providers: [WorkspaceActivityService],
  exports: [WorkspaceActivityService],
})
export class WorkspaceActivityModule {}
