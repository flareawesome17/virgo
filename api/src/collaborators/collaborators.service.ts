import { BadRequestException, Injectable } from '@nestjs/common';
import { OwnedResourceService } from '../common/owned-resource.service';
import { FriendsService } from '../friends/friends.service';
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
    private readonly friends: FriendsService,
  ) {
    super(collaborators, 'Collaborator');
  }

  /**
   * Adds a collaborator, who must be an accepted friend.
   *
   * Enforced here rather than only in the invite screen: hiding non-friends
   * from a picker is presentation, and this endpoint is reachable directly.
   * A collaborator also has to be a real account now — the old shape took a
   * free-text name, so "inviting" someone created a label nobody could act on.
   */
  async create(
    userId: string,
    data: Record<string, unknown>,
  ): Promise<CollaboratorRow> {
    const workspaceId = data.workspace_id as string | undefined;
    if (workspaceId !== undefined) {
      const owned = await this.workspaces.assertOwned(userId, workspaceId);
      if (!owned) throw new BadRequestException('Unknown workspace');
    }

    const collaboratorUserId = data.collaborator_user_id as string | undefined;
    if (!collaboratorUserId) {
      throw new BadRequestException(
        'Choose someone from your friends to add as a collaborator',
      );
    }
    if (collaboratorUserId === userId) {
      throw new BadRequestException('You are already on this workspace');
    }
    if (!(await this.friends.areFriends(userId, collaboratorUserId))) {
      throw new BadRequestException(
        'You can only add people you are friends with. Send them a friend request first.',
      );
    }

    return super.create(userId, data);
  }
}
