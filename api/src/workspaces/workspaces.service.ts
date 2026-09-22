import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { type ListOptions } from '../common/owned.repository';
import { OwnedResourceService } from '../common/owned-resource.service';
import { NotifyService } from '../notifications/notify.service';
import { QuotaService } from '../quota/quota.service';
import {
  type WorkspaceActivityItem,
  WorkspaceActivityService,
} from './workspace-activity.service';
import {
  type ArchivedFilter,
  type WorkspaceMemberRow,
  WorkspaceRow,
  WorkspacesRepository,
} from './workspaces.repository';

@Injectable()
export class WorkspacesService extends OwnedResourceService<WorkspaceRow> {
  constructor(
    private readonly workspaces: WorkspacesRepository,
    private readonly quota: QuotaService,
    private readonly feed: WorkspaceActivityService,
    private readonly notifier: NotifyService,
  ) {
    super(workspaces, 'Workspace');
  }

  /**
   * One page of the list, its total, and how many are archived — which the
   * list shows as a way in to them.
   */
  async page(
    userId: string,
    options: ListOptions & { archived?: ArchivedFilter },
  ): Promise<{ data: WorkspaceRow[]; total: number; archived: number }> {
    const archived = options.archived ?? 'exclude';
    const [data, total, archivedCount] = await Promise.all([
      this.workspaces.findAll(userId, { ...options, archived }),
      this.workspaces.count(userId, { archived }),
      archived === 'only' ? null : this.workspaces.count(userId, { archived: 'only' }),
    ]);
    return { data, total, archived: archivedCount ?? total };
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
   * Owner-only, as every write here is: the repository scopes the update to
   * `user_id`, so a member's attempt finds nothing and reads as not found.
   *
   * `archived` is a switch rather than a date, so a client cannot backdate
   * it. A cover has to be one of the owner's albums in this workspace;
   * anything else would put an album on the card that the workspace does not
   * hold.
   */
  async update(
    userId: string,
    id: string,
    data: Record<string, unknown>,
  ): Promise<WorkspaceRow> {
    const { archived, ...changes } = data;
    if (typeof archived === 'boolean') {
      changes.archived_at = archived ? new Date() : null;
    }
    if (typeof changes.cover_album_id === 'string') {
      if (!(await this.workspaces.isOwnAlbumIn(userId, id, changes.cover_album_id))) {
        throw new BadRequestException('Choose an album from this workspace for its cover');
      }
    }
    return super.update(userId, id, changes);
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

  /** Who is on a workspace. The owner also sees invitations and access. */
  async members(userId: string, id: string): Promise<WorkspaceMemberRow[]> {
    const workspace = await this.get(userId, id);
    return this.workspaces.members(userId, id, workspace.is_owner);
  }

  /** What has been happening, as far as this viewer may see. */
  async activity(userId: string, id: string, limit?: number): Promise<WorkspaceActivityItem[]> {
    const workspace = await this.get(userId, id);
    return this.feed.list(userId, id, workspace.is_owner, limit);
  }

  /**
   * Leaves a workspace someone else owns.
   *
   * The owner hears about it: a member vanishing from the list without a word
   * is the kind of thing that gets noticed a week later, mid-job.
   */
  async leave(userId: string, id: string): Promise<void> {
    const left = await this.workspaces.leave(userId, id);
    if (!left) throw new NotFoundException('You are not a member of that workspace');

    await this.feed.record(id, userId, 'left');
    try {
      await this.notifier.notify([left.owner_id], {
        topic: 'collaborator-response',
        title: 'Left your workspace',
        body: `${left.member_name} left “${left.workspace_name}”`,
        // The same type as an answered invitation, so apps already installed
        // open the workspace for it rather than nothing.
        data: { type: 'collaborator_response', workspaceId: id, left: true },
      });
    } catch {
      // Best-effort: they have left either way.
    }
  }
}
