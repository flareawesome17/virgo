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
import { blockedBetween } from '../safety/block-sql';
import { BlocksService } from '../safety/blocks.service';
import { WorkspaceActivityService } from '../workspaces/workspace-activity.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { type MediaAccess } from '../quota/quota.service';
import {
  CollaboratorRow,
  CollaboratorsRepository,
} from './collaborators.repository';

/** One album a collaborator is being given, and how much of it. */
export interface AlbumGrant {
  albumId: string;
  mediaAccess?: MediaAccess;
}

/**
 * The level a role implies when the caller did not name one.
 *
 * A reviewer and a photographer plainly do not want the same thing, and making
 * every unspecified grant 'view' would leave editors unable to do the job they
 * were invited for. These are what the invite screens say each role gets: a
 * photographer uploads; an editor arranges, uploads and deletes; a reviewer
 * views and downloads; a client views.
 *
 * No role at all is the column's default, 'editor' — not 'view'. Reading a
 * missing role as 'view' gave a collaborator an editor's title and a client's
 * access.
 */
export function defaultAccessFor(role: unknown): MediaAccess {
  switch (role ?? 'editor') {
    case 'owner':
    case 'editor':
      return 'manage';
    case 'photographer':
      return 'upload';
    case 'reviewer':
      return 'download';
    default:
      return 'view';
  }
}

/** "a photographer", "an editor": a role as a sentence says it. */
function roleInSentence(role: unknown): string {
  const name = typeof role === 'string' && role ? role : 'editor';
  return `${/^[aeiou]/.test(name) ? 'an' : 'a'} ${name}`;
}

const MEDIA_ACCESS_LEVELS: readonly MediaAccess[] = ['view', 'download', 'upload', 'manage'];

function isMediaAccess(value: unknown): value is MediaAccess {
  return (MEDIA_ACCESS_LEVELS as readonly unknown[]).includes(value);
}

/**
 * Reads the album selection from a request body.
 *
 * Two shapes are accepted: `albums: [{ album_id, media_access }]`, and the
 * older `album_ids: string[]` that bundles already on people's phones still
 * send. Returns null when neither is present, which means "not specified" —
 * distinct from an empty array, which means "share nothing".
 */
function readAlbumGrants(
  data: Record<string, unknown>,
  role: unknown,
): AlbumGrant[] | null {
  if (Array.isArray(data.albums)) {
    return (data.albums as { album_id?: string; media_access?: MediaAccess }[])
      .filter((a) => typeof a?.album_id === 'string')
      .map((a) => ({
        albumId: a.album_id as string,
        mediaAccess: a.media_access ?? defaultAccessFor(role),
      }));
  }
  if (Array.isArray(data.album_ids)) {
    return (data.album_ids as string[]).map((id) => ({
      albumId: id,
      mediaAccess: defaultAccessFor(role),
    }));
  }
  return null;
}

@Injectable()
export class CollaboratorsService extends OwnedResourceService<CollaboratorRow> {
  constructor(
    private readonly collaborators: CollaboratorsRepository,
    private readonly workspaces: WorkspacesService,
    private readonly friends: FriendsService,
    private readonly db: DatabaseService,
    private readonly notifier: NotifyService,
    private readonly mailConfig: MailConfig,
    private readonly feed: WorkspaceActivityService,
    private readonly blocks: BlocksService,
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
    const already = await this.db.queryOne<{ id: string; status: string; name: string }>(
      `select id, status, name from collaborators
        where workspace_id = $1 and collaborator_user_id = $2`,
      [workspaceId, collaboratorUserId],
    );
    if (already && already.status !== 'declined') {
      throw new BadRequestException(
        already.status === 'pending'
          ? `${already.name} has already been invited to this workspace`
          : `${already.name} is already on this workspace`,
      );
    }

    // `album_ids` is not a column; it selects which albums to share and is
    // applied as grants below.
    const requested = readAlbumGrants(data, data.role);
    const { album_ids: _ids, albums: _albums, ...columns } = data;
    if (columns.new_album_access !== undefined && !isMediaAccess(columns.new_album_access)) {
      columns.new_album_access = null;
    }

    // An invitation, not a fait accompli: the other person has to accept before
    // the workspace appears in their app. `status` is not passed here and is
    // not writable — the column defaults to 'pending', and only
    // `respondToInvitation` moves it, so neither side can skip the asking.
    //
    // Someone who declined can be asked again. Their row is reused rather than
    // a second one made — one row per person per workspace — and put back to
    // pending, as a new invitation on whatever terms are offered this time.
    const row = already
      ? await this.reopen(userId, already.id, columns)
      : await super.create(userId, columns);

    if (workspaceId) {
      // No selection means "the workspace as it stands today", which is what
      // inviting someone to a workspace has always meant.
      const grants =
        requested ??
        (
          await this.db.query<{ id: string }>(
            'select id from albums where workspace_id = $1 and user_id = $2',
            [workspaceId, userId],
          )
        ).map((a) => ({ albumId: a.id, mediaAccess: defaultAccessFor(data.role) }));
      await this.setSharedAlbums(userId, row.id, workspaceId, grants);
    }

    await this.feed.record(workspaceId, userId, 'invited', {
      subjectId: collaboratorUserId,
      data: { name: row.name, role: row.role },
    });
    await this.notifyInvitee(userId, collaboratorUserId, workspaceId, row);
    return row;
  }

  /** A declined invitation, made again: pending, sent now, on these terms. */
  private async reopen(
    userId: string,
    id: string,
    columns: Record<string, unknown>,
  ): Promise<CollaboratorRow> {
    const row = await this.db.queryOne<CollaboratorRow>(
      `update collaborators
          set status = 'pending',
              responded_at = null,
              created_at = now(),
              role = coalesce($3, role),
              name = coalesce($4, name),
              avatar_url = coalesce($5, avatar_url),
              new_album_access = $6
        where id = $1 and user_id = $2 and status = 'declined'
        returning *`,
      [
        id,
        userId,
        (columns.role as string | undefined) ?? null,
        (columns.name as string | undefined) ?? null,
        (columns.avatar_url as string | undefined) ?? null,
        (columns.new_album_access as string | null | undefined) ?? null,
      ],
    );
    if (!row) throw new BadRequestException('That invitation has already been answered');
    return row;
  }

  /**
   * Sends an unanswered invitation again: the notification and the email.
   *
   * Refused within ten minutes of the last one, so a button pressed twice
   * does not fill somebody's inbox. The invitation's date moves to now, which
   * is what "Invited Mon" should then say.
   *
   * Across a block the invitation is not there: the block declined it, and
   * sending it again would be the inviter reaching someone who asked them not
   * to, or the other way round.
   */
  async resend(userId: string, id: string): Promise<CollaboratorRow> {
    const row = await this.db.queryOne<CollaboratorRow & { recent: boolean }>(
      `select *, created_at > now() - interval '10 minutes' as recent
         from collaborators where id = $1 and user_id = $2`,
      [id, userId],
    );
    if (!row) throw new NotFoundException('Invitation not found');
    if (
      row.collaborator_user_id &&
      (await this.blocks.between(userId, row.collaborator_user_id))
    ) {
      throw new NotFoundException('Invitation not found');
    }
    if (row.status !== 'pending') {
      throw new BadRequestException(`That invitation is already ${row.status}`);
    }
    if (row.recent) {
      throw new BadRequestException(
        `${row.name} was sent this invitation a few minutes ago. Give it a little longer.`,
      );
    }

    // Only while still pending. A block, or the invitee answering, may land
    // between the read above and this; either way there is nothing to resend.
    const updated = await this.db.queryOne<CollaboratorRow>(
      `update collaborators set created_at = now()
        where id = $1 and status = 'pending'
        returning *`,
      [id],
    );
    if (!updated) {
      throw new BadRequestException('That invitation has already been answered');
    }
    if (updated.collaborator_user_id) {
      await this.notifyInvitee(userId, updated.collaborator_user_id, updated.workspace_id, updated);
    }
    return updated;
  }

  /**
   * Takes someone off a workspace, or withdraws an invitation.
   *
   * Their grants go with the row. Only a removal is recorded in the feed; a
   * withdrawn invitation was never anyone arriving.
   */
  async remove(userId: string, id: string): Promise<void> {
    const row = await this.collaborators.findOne(userId, id);
    if (!row) throw new NotFoundException('Collaborator not found');
    await super.remove(userId, id);
    if (row.status === 'accepted') {
      await this.feed.record(row.workspace_id, userId, 'removed', {
        subjectId: row.collaborator_user_id,
        data: { name: row.name, role: row.role },
      });
    }
  }

  /**
   * Sets exactly which albums a collaborator can see.
   *
   * Stored as grants for what *is* chosen. The albums not listed simply have
   * no row, which is also what a newly created album has — so a new album
   * starts private to its owner and is shared on purpose rather than by
   * default. That is the whole point of the change: a workspace holds more
   * than one client's work.
   *
   * The whole set is replaced rather than diffed, because the caller sends the
   * complete selection and a partial update would leave stale grants behind.
   */
  async setSharedAlbums(
    userId: string,
    collaboratorId: string,
    workspaceId: string,
    grants: AlbumGrant[],
  ): Promise<{
    shared: number;
    excluded: number;
    /** Albums they did not have before, and the level each was given. */
    added: { name: string; level: MediaAccess }[];
    /** Albums they had and no longer do. */
    removed: number;
    /** Albums they kept at a different level. */
    changed: number;
  }> {
    // Only albums the caller actually owns in this workspace, so a forged id
    // cannot grant access to somebody else's album. Read with the current
    // grants, so the result can say what changed.
    const albums = await this.db.query<{
      id: string;
      name: string;
      media_access: MediaAccess | null;
    }>(
      `select a.id, a.name, ca.media_access
         from albums a
         left join collaborator_albums ca
           on ca.album_id = a.id and ca.collaborator_id = $3
        where a.workspace_id = $1 and a.user_id = $2
        order by a.created_at`,
      [workspaceId, userId, collaboratorId],
    );

    const owned = new Set(albums.map((a) => a.id));
    // One grant per album. The last one sent wins, as it would have on the
    // insert's conflict clause, which a repeated id in one statement trips.
    const wanted = [
      ...new Map(
        grants.filter((g) => owned.has(g.albumId)).map((g) => [g.albumId, g]),
      ).values(),
    ];

    await this.db.transaction(async (client) => {
      await client.query(
        'delete from collaborator_albums where collaborator_id = $1',
        [collaboratorId],
      );
      if (wanted.length > 0) {
        await client.query(
          `insert into collaborator_albums (collaborator_id, album_id, media_access)
           select $1, unnest($2::text[]), unnest($3::text[])
           on conflict (collaborator_id, album_id)
             do update set media_access = excluded.media_access`,
          [
            collaboratorId,
            wanted.map((g) => g.albumId),
            wanted.map((g) => g.mediaAccess ?? 'view'),
          ],
        );
      }
    });

    const before = new Map(albums.map((a) => [a.id, a.media_access]));
    const after = new Map(wanted.map((g) => [g.albumId, g.mediaAccess ?? 'view']));
    const nameOf = new Map(albums.map((a) => [a.id, a.name]));

    // `excluded` is kept in the response shape because both clients read it.
    // Under an allow-list it means "in this workspace but not granted".
    return {
      shared: wanted.length,
      excluded: albums.length - wanted.length,
      added: [...after]
        .filter(([id]) => !before.get(id))
        .map(([id, level]) => ({ name: nameOf.get(id) ?? '', level })),
      removed: [...before].filter(([id, level]) => level && !after.has(id)).length,
      changed: [...after].filter(([id, level]) => {
        const was = before.get(id);
        return was && was !== level;
      }).length,
    };
  }

  /**
   * The workspace's albums, each flagged with whether this collaborator can
   * see it — the current state an edit-access screen starts from.
   */
  async albumsFor(
    userId: string,
    collaboratorId: string,
  ): Promise<
    {
      id: string;
      name: string;
      /** Every file in the album, counted. */
      item_count: number;
      shared: boolean;
      media_access: MediaAccess | null;
    }[]
  > {
    const row = await this.db.queryOne<{ workspace_id: string }>(
      'select workspace_id from collaborators where id = $1 and user_id = $2',
      [collaboratorId, userId],
    );
    if (!row) throw new NotFoundException('Collaborator not found');

    // Every file in the album, because a grant covers every file in it. It
    // read `albums.item_count`, a counter nothing maintains, so the picker
    // showed 0 beside every album made since August 2026. By album alone:
    // these are the owner's albums, and an album's files are billed to its
    // owner, whoever uploaded them.
    return this.db.query(
      `select a.id, a.name,
              (select count(*) from user_files f where f.album_id = a.id)::int
                as item_count,
              (ca.album_id is not null) as shared,
              ca.media_access
         from albums a
         left join collaborator_albums ca
           on ca.album_id = a.id and ca.collaborator_id = $2
        where a.workspace_id = $3 and a.user_id = $1
        order by a.created_at desc`,
      [userId, collaboratorId, row.workspace_id],
    );
  }

  /**
   * Replaces an existing collaborator's album access, and — when sent — what
   * albums added later give them.
   *
   * The feed hears about it only when something actually changed, and in one
   * line: saving the same selection twice is not news.
   */
  async updateSharedAlbums(
    userId: string,
    collaboratorId: string,
    grants: AlbumGrant[],
    newAlbumAccess?: MediaAccess | null,
  ): Promise<{ shared: number; excluded: number }> {
    const row = await this.db.queryOne<{
      workspace_id: string;
      collaborator_user_id: string | null;
      name: string;
      role: string;
    }>(
      `select workspace_id, collaborator_user_id, name, role
         from collaborators where id = $1 and user_id = $2`,
      [collaboratorId, userId],
    );
    if (!row) throw new NotFoundException('Collaborator not found');

    if (newAlbumAccess !== undefined) {
      await this.db.query(
        'update collaborators set new_album_access = $2 where id = $1',
        [collaboratorId, isMediaAccess(newAlbumAccess) ? newAlbumAccess : null],
      );
    }

    const result = await this.setSharedAlbums(userId, collaboratorId, row.workspace_id, grants);
    if (result.added.length || result.removed || result.changed) {
      // What the newly shared albums allow, when that is one thing: "Carlo
      // can upload" about albums given at two levels would be half untrue.
      const levels = new Set(result.added.map((a) => a.level));
      await this.feed.record(row.workspace_id, userId, 'shared', {
        subjectId: row.collaborator_user_id,
        data: {
          name: row.name,
          role: row.role,
          added: result.added.slice(0, 3).map((a) => a.name),
          added_count: result.added.length,
          removed_count: result.removed,
          changed_count: result.changed,
          access: levels.size === 1 ? [...levels][0] : null,
        },
      });
    }
    return { shared: result.shared, excluded: result.excluded };
  }

  /**
   * Tells the invitee. Best-effort: a failure must not undo the invite.
   *
   * The notification and the email both lead to Workspaces, where the
   * invitation is answered and what is on offer is shown. They led to Network,
   * which had no invitations on it.
   */
  private async notifyInvitee(
    inviterId: string,
    inviteeId: string,
    workspaceId: string | undefined,
    invitation: Pick<CollaboratorRow, 'id' | 'role'>,
  ): Promise<void> {
    try {
      const { who, what, workspaceName } = await this.describe(
        inviterId,
        workspaceId,
      );
      const role = roleInSentence(invitation.role);

      await this.notifier.notify([inviteeId], {
        topic: 'collaborator-invite',
        title: 'Workspace invitation',
        body: `${who} invited you to ${what} as ${role}`,
        data: { type: 'collaborator_invite', workspaceId, collaboratorId: invitation.id },
        // An invitation is worth reaching someone who is not in the app.
        email: collaboratorInvite({
          inviterName: who,
          workspaceName: workspaceName ?? 'a workspace',
          role,
          url: `${this.mailConfig.appUrl}/workspaces`,
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

  /**
   * Invitations addressed to the caller and not yet answered, each with what
   * accepting would give them: the albums on offer and what they could do in
   * each. Deciding whether to join a workspace without that was deciding
   * blind.
   *
   * Never one from across a block. A block declines them, but the release
   * before this one does not, and anything it wrote during a rollback must not
   * be offered once this one is back.
   */
  async invitationsFor(userId: string): Promise<
    (CollaboratorRow & {
      workspace_name: string | null;
      workspace_color: string | null;
      inviter_name: string | null;
      inviter_avatar_url: string | null;
      albums: { id: string; name: string; media_access: MediaAccess }[];
    })[]
  > {
    return this.db.query(
      `select c.*, w.name as workspace_name, w.accent_color as workspace_color,
              coalesce(nullif(trim(u.display_name), ''), split_part(u.email, '@', 1))
                as inviter_name,
              u.avatar_url as inviter_avatar_url,
              coalesce((
                select json_agg(json_build_object(
                         'id', a.id, 'name', a.name, 'media_access', ca.media_access
                       ) order by a.created_at)
                  from collaborator_albums ca
                  join albums a on a.id = ca.album_id
                 where ca.collaborator_id = c.id
              ), '[]'::json) as albums
         from collaborators c
         left join workspaces w on w.id = c.workspace_id
         left join users u on u.id = c.user_id
        where c.collaborator_user_id = $1 and c.status = 'pending'
          and not ${blockedBetween('$1', 'c.user_id')}
        order by c.created_at desc`,
      [userId],
    );
  }

  /**
   * Answers an invitation.
   *
   * Scoped to `collaborator_user_id`, so only the person invited can respond —
   * the row's `user_id` is the inviter and must not be able to self-accept.
   *
   * Across a block the invitation is not there, whichever way the answer
   * would go: the block has already declined it, and telling the inviter
   * either way would be a message across it.
   *
   * No pair lock, unlike the other accepts. This connects nobody and writes
   * one row, and only while it is still pending. A block declining that same
   * row makes this update wait on the row and then re-check `pending`, so
   * whichever lands first, the other finds nothing to do.
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
    if (await this.blocks.between(userId, row.user_id)) {
      throw new NotFoundException('Invitation not found');
    }
    if (row.status !== 'pending') {
      throw new BadRequestException(`That invitation is already ${row.status}`);
    }

    const updated = await this.db.queryOne<CollaboratorRow>(
      `update collaborators
          set status = $2, responded_at = now()
        where id = $1 and collaborator_user_id = $3 and status = 'pending'
        returning *`,
      [id, accept ? 'accepted' : 'declined', userId],
    );
    if (!updated) {
      throw new BadRequestException('That invitation has already been answered');
    }
    await this.feed.record(row.workspace_id, userId, accept ? 'joined' : 'declined');

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

    return updated;
  }

  /**
   * Who can see one album.
   *
   * Its workspace's collaborators, each flagged with whether this particular
   * album has been granted to them. Everyone in the workspace is still
   * returned, not only those with access, so the screen can offer to add
   * someone rather than making them disappear.
   *
   * `excluded` is kept as the field name because both clients read it. It now
   * means "no grant for this album" rather than "an exclusion row exists" —
   * the same question, answered from the other side.
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

    return this.db.query<CollaboratorRow & { excluded: boolean }>(
      `select c.*, (ca.album_id is null) as excluded
         from collaborators c
         left join collaborator_albums ca
           on ca.collaborator_id = c.id and ca.album_id = $2
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

  /**
   * Removes a collaborator from one album, leaving the workspace intact.
   *
   * Now a deleted grant rather than an added exclusion. The route and its
   * response are unchanged so bundles already on people's phones keep working.
   */
  async excludeFromAlbum(
    userId: string,
    albumId: string,
    collaboratorId: string,
  ): Promise<{ excluded: boolean }> {
    await this.assertAlbumAndCollaborator(userId, albumId, collaboratorId);
    await this.db.query(
      'delete from collaborator_albums where album_id = $1 and collaborator_id = $2',
      [albumId, collaboratorId],
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
      `insert into collaborator_albums (collaborator_id, album_id)
       values ($1, $2)
       on conflict (collaborator_id, album_id) do nothing`,
      [collaboratorId, albumId],
    );
    return { excluded: false };
  }
}
