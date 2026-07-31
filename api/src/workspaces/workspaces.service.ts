import { Injectable } from '@nestjs/common';
import { OwnedResourceService } from '../common/owned-resource.service';
import { QuotaService } from '../quota/quota.service';
import { WorkspaceRow, WorkspacesRepository } from './workspaces.repository';

@Injectable()
export class WorkspacesService extends OwnedResourceService<WorkspaceRow> {
  constructor(
    private readonly workspaces: WorkspacesRepository,
    private readonly quota: QuotaService,
  ) {
    super(workspaces, 'Workspace');
  }

  /** Plan limits are enforced here, not in the UI — a hidden button is not a limit. */
  async create(
    userId: string,
    data: Record<string, unknown>,
  ): Promise<WorkspaceRow> {
    await this.quota.assertCanCreateWorkspace(userId);
    return super.create(userId, data);
  }

  /**
   * Used by albums, schedule events and collaborators before they attach a row
   * to a workspace. Without this check a caller could pass someone else's
   * workspace_id and graft their own rows onto another user's workspace — the
   * foreign key only proves the workspace exists, not that they own it.
   */
  async assertOwned(userId: string, workspaceId: string): Promise<boolean> {
    return this.workspaces.existsForUser(userId, workspaceId);
  }
}
