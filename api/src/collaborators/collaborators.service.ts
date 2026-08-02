import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OwnedResourceService } from '../common/owned-resource.service';
import { DatabaseService } from '../database/database.service';
import { FriendsService } from '../friends/friends.service';
import { MailConfig } from '../mail/mail.config';
import { collaboratorInvite } from '../mail/mail.templates';
import { NotifyService } from '../notifications/notify.service';
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
    private readonly db: DatabaseService,
    private readonly notifier: NotifyService,
    private readonly mailConfig: MailConfig,
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

    // One row per person per workspace. Without this a second invitation
    // produced a duplicate entry with its own role and its own album
    // exclusions, and no clear answer to what access they actually had.
    const already = await this.db.queryOne<{ status: string; name: string }>(
      `select status, name from collaborators
        where workspace_id = $1 and collaborator_user_id = $2`,
      [workspaceId, collaboratorUserId],
    );
    if (already) {
      throw new BadRequestException(
        already.status === 'pending'
          ? `${already.name} has already been invited to this workspace`
          : `${already.name} is already on this workspace`,
      );
    }

    // `album_ids` is not a column; it selects which albums to share and is
    // applied as exclusions below.
    const albumIds = Array.isArray(data.album_ids)
      ? (data.album_ids as string[])
      : null;
    const { album_ids: _ignored, ...columns } = data;

    const row = await super.create(userId, {
      ...columns,
      // An invitation, not a fait accompli: the other person has to accept
      // before the workspace appears in their app.
      status: 'pending',
    });

    if (albumIds && workspaceId) {
      await this.setSharedAlbums(userId, row.id, workspaceId, albumIds);
    }

    await this.notifyInvitee(userId, collaboratorUserId, workspaceId);
    return row;
  }

  /**
   * Sets exactly which albums a collaborator can see.
   *
   * Stored as exclusions for everything *not* chosen, so albums created later
   * are shared by default — the alternative, listing what they can see, would
   * silently withhold every new album until someone remembered to add it.
   */
  async setSharedAlbums(
    userId: string,
    collaboratorId: string,
    workspaceId: string,
    albumIds: string[],
  ): Promise<{ shared: number; excluded: number }> {
    const albums = await this.db.query<{ id: string }>(
      'select id from albums where workspace_id = $1 and user_id = $2',
      [workspaceId, userId],
    );

    const keep = new Set(albumIds);
    const exclude = albums.filter((a) => !keep.has(a.id)).map((a) => a.id);

    await this.db.transaction(async (client) => {
      await client.query(
        'delete from album_collaborator_exclusions where collaborator_id = $1',
        [collaboratorId],
      );
      if (exclude.length > 0) {
        await client.query(
          `insert into album_collaborator_exclusions (album_id, collaborator_id, user_id)
           select unnest($1::text[]), $2, $3
           on conflict (album_id, collaborator_id) do nothing`,
          [exclude, collaboratorId, userId],
        );
      }
    });

    return { shared: albums.length - exclude.length, excluded: exclude.length };
  }

  /**
   * The workspace's albums, each flagged with whether this collaborator can
   * see it — the current state an edit-access screen starts from.
   */
  async albumsFor(
    userId: string,
    collaboratorId: string,
  ): Promise<{ id: string; name: string; item_count: number; shared: boolean }[]> {
    const row = await this.db.queryOne<{ workspace_id: string }>(
      'select workspace_id from collaborators where id = $1 and user_id = $2',
      [collaboratorId, userId],
    );
    if (!row) throw new NotFoundException('Collaborator not found');

    return this.db.query(
      `select a.id, a.name, a.item_count, (x.id is null) as shared
         from albums a
         left join album_collaborator_exclusions x
           on x.album_id = a.id and x.collaborator_id = $2
        where a.workspace_id = $3 and a.user_id = $1
        order by a.created_at desc`,
      [userId, collaboratorId, row.workspace_id],
    );
  }

  /** Replaces an existing collaborator's album access. */
  async updateSharedAlbums(
    userId: string,
    collaboratorId: string,
    albumIds: string[],
  ): Promise<{ shared: number; excluded: number }> {
    const row = await this.db.queryOne<{ workspace_id: string }>(
      'select workspace_id from collaborators where id = $1 and user_id = $2',
      [collaboratorId, userId],
    );
    if (!row) throw new NotFoundException('Collaborator not found');
    return this.setSharedAlbums(userId, collaboratorId, row.workspace_id, albumIds);
  }

  /** Tells the invitee. Best-effort: a failure must not undo the invite. */
  private async notifyInvitee(
    inviterId: string,
    inviteeId: string,
    workspaceId: string | undefined,
  ): Promise<void> {
    try {
      const { who, what, workspaceName } = await this.describe(
        inviterId,
        workspaceId,
      );

      await this.notifier.notify([inviteeId], {
        topic: 'collaborator-invite',
        title: 'Workspace invitation',
        body: `${who} invited you to ${what}`,
        data: { type: 'collaborator_invite', workspaceId },
        // An invitation is worth reaching someone who is not in the app.
        email: collaboratorInvite({
          inviterName: who,
          workspaceName: workspaceName ?? 'a workspace',
          role: 'a collaborator',
          url: `${this.mailConfig.appUrl}/network`,
        }),
      });
    } catch {
      // Swallowed on purpose — see above.
    }
  }

  /** The inviter's name and the workspace's, both safe to interpolate. */
  private async describe(
    userId: string,
    workspaceId: string | undefined | null,
  ): Promise<{ who: string; what: string; workspaceName: string | null }> {
    const [user, workspace] = await Promise.all([
      this.db.queryOne<{ display_name: string | null; email: string }>(
        'select display_name, email from users where id = $1',
        [userId],
      ),
      workspaceId
        ? this.db.queryOne<{ name: string }>(
            'select name from workspaces where id = $1',
            [workspaceId],
          )
        : Promise.resolve(null),
    ]);

    return {
      who: user?.display_name?.trim() || user?.email.split('@')[0] || 'Someone',
      what: workspace?.name ? `“${workspace.name}”` : 'a workspace',
      workspaceName: workspace?.name ?? null,
    };
  }

  /** Invitations addressed to the caller and not yet answered. */
  async invitationsFor(userId: string): Promise<
    (CollaboratorRow & { workspace_name: string | null; inviter_name: string | null })[]
  > {
    return this.db.query(
      `select c.*, w.name as workspace_name,
              coalesce(u.display_name, split_part(u.email, '@', 1)) as inviter_name
         from collaborators c
         left join workspaces w on w.id = c.workspace_id
         left join users u on u.id = c.user_id
        where c.collaborator_user_id = $1 and c.status = 'pending'
        order by c.created_at desc`,
      [userId],
    );
  }

  /**
   * Answers an invitation.
   *
   * Scoped to `collaborator_user_id`, so only the person invited can respond —
   * the row's `user_id` is the inviter and must not be able to self-accept.
   */
  async respondToInvitation(
    userId: string,
    id: string,
    accept: boolean,
  ): Promise<CollaboratorRow> {
    const row = await this.db.queryOne<CollaboratorRow>(
      'select * from collaborators where id = $1 and collaborator_user_id = $2',
      [id, userId],
    );
    if (!row) throw new NotFoundException('Invitation not found');
    if (row.status !== 'pending') {
      throw new BadRequestException(`That invitation is already ${row.status}`);
    }

    const updated = await this.db.queryOne<CollaboratorRow>(
      `update collaborators
          set status = $2, responded_at = now()
        where id = $1
        returning *`,
      [id, accept ? 'accepted' : 'declined'],
    );

    // The inviter was told nothing at all before this, so a workspace could
    // gain — or fail to gain — a collaborator with no sign either way.
    try {
      const { who, what } = await this.describe(userId, row.workspace_id);
      await this.notifier.notify([row.user_id], {
        topic: 'collaborator-response',
        title: accept ? 'Invitation accepted' : 'Invitation declined',
        body: `${who} ${accept ? 'joined' : 'declined'} ${what}`,
        data: {
          type: 'collaborator_response',
          workspaceId: row.workspace_id,
          collaboratorId: row.id,
          accepted: accept,
        },
      });
    } catch {
      // Best-effort, as everywhere else here.
    }

    return updated!;
  }

  /**
   * Who can see one album.
   *
   * Its workspace's collaborators, minus anyone excluded from this album
   * specifically. Inheritance is computed rather than stored, so adding a
   * collaborator to a workspace gives them every album — including ones
   * created later — without a backfill.
   */
  async forAlbum(
    userId: string,
    albumId: string,
  ): Promise<(CollaboratorRow & { excluded: boolean })[]> {
    const album = await this.db.queryOne<{ workspace_id: string }>(
      'select workspace_id from albums where id = $1 and user_id = $2',
      [albumId, userId],
    );
    if (!album) throw new NotFoundException('Album not found');

    // Excluded rows are returned too, flagged, so the screen can offer to put
    // someone back rather than making removal look permanent.
    return this.db.query<CollaboratorRow & { excluded: boolean }>(
      `select c.*, (x.id is not null) as excluded
         from collaborators c
         left join album_collaborator_exclusions x
           on x.collaborator_id = c.id and x.album_id = $2
        where c.user_id = $1 and c.workspace_id = $3
        order by c.created_at desc`,
      [userId, albumId, album.workspace_id],
    );
  }

  private async assertAlbumAndCollaborator(
    userId: string,
    albumId: string,
    collaboratorId: string,
  ): Promise<void> {
    const row = await this.db.queryOne<{ id: string }>(
      `select c.id
         from collaborators c
         join albums a on a.id = $2 and a.user_id = $1
        where c.id = $3 and c.user_id = $1 and c.workspace_id = a.workspace_id`,
      [userId, albumId, collaboratorId],
    );
    if (!row) {
      throw new NotFoundException('That collaborator is not on this album');
    }
  }

  /** Removes a collaborator from one album, leaving the workspace intact. */
  async excludeFromAlbum(
    userId: string,
    albumId: string,
    collaboratorId: string,
  ): Promise<{ excluded: boolean }> {
    await this.assertAlbumAndCollaborator(userId, albumId, collaboratorId);
    await this.db.query(
      `insert into album_collaborator_exclusions (album_id, collaborator_id, user_id)
       values ($1, $2, $3)
       on conflict (album_id, collaborator_id) do nothing`,
      [albumId, collaboratorId, userId],
    );
    return { excluded: true };
  }

  /** Puts a previously removed collaborator back on this album. */
  async includeInAlbum(
    userId: string,
    albumId: string,
    collaboratorId: string,
  ): Promise<{ excluded: boolean }> {
    await this.assertAlbumAndCollaborator(userId, albumId, collaboratorId);
    await this.db.query(
      `delete from album_collaborator_exclusions
        where album_id = $1 and collaborator_id = $2 and user_id = $3`,
      [albumId, collaboratorId, userId],
    );
    return { excluded: false };
  }
}
