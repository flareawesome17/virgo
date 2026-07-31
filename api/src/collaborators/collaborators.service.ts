import { BadRequestException, Injectable } from '@nestjs/common';
import { OwnedResourceService } from '../common/owned-resource.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import {
  CollaboratorRow,
  CollaboratorsRepository,
} from './collaborators.repository';

@Injectable()
export class CollaboratorsService extends OwnedResourceService<CollaboratorRow> {
  constructor(
    private readonly collaborators: CollaboratorsRepository,
    private readonly workspaces: WorkspacesService,
  ) {
    super(collaborators, 'Collaborator');
  }

  async create(
    userId: string,
    data: Record<string, unknown>,
  ): Promise<CollaboratorRow> {
    const workspaceId = data.workspace_id as string | undefined;
    if (workspaceId !== undefined) {
      const owned = await this.workspaces.assertOwned(userId, workspaceId);
      if (!owned) throw new BadRequestException('Unknown workspace');
    }
    return super.create(userId, data);
  }
}
