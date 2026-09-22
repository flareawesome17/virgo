import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OwnedResourceService } from '../common/owned-resource.service';
import { DatabaseService } from '../database/database.service';
import { QuotaService } from '../quota/quota.service';
import { WorkspaceActivityService } from '../workspaces/workspace-activity.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { AlbumRow, AlbumsRepository } from './albums.repository';

@Injectable()
export class AlbumsService extends OwnedResourceService<AlbumRow> {
  constructor(
    private readonly albums: AlbumsRepository,
    private readonly workspaces: WorkspacesService,
    private readonly quota: QuotaService,
    private readonly db: DatabaseService,
    private readonly feed: WorkspaceActivityService,
  ) {
    super(albums, 'Album');
  }

  /**
   * The albums.workspace_id foreign key only guarantees the workspace exists —
   * it says nothing about who owns it. Without this check a caller could create
   * an album pointing at another user's workspace id.
   *
   * 400 rather than 404 or 403: the workspace is invalid *as input to this
   * request*, and neither confirms nor denies that the id exists elsewhere.
   */
  private async assertWorkspace(
    userId: string,
    workspaceId: string | undefined,
  ): Promise<void> {
    if (workspaceId === undefined) return;
    const owned = await this.workspaces.assertOwned(userId, workspaceId);
    if (!owned) throw new BadRequestException('Unknown workspace');
  }

  async create(
    userId: string,
    data: Record<string, unknown>,
  ): Promise<AlbumRow> {
    await this.quota.assertCanCreateAlbum(
      userId,
      data.workspace_id as string | undefined,
    );
    await this.assertWorkspace(userId, data.workspace_id as string | undefined);
    const album = await super.create(userId, data);

    const shared = await this.shareWithMembers(album.id, album.workspace_id);
    await this.feed.record(album.workspace_id, userId, 'album-created', { albumId: album.id });
    // Read again when it was shared, so the card says so from the start.
    return shared > 0 ? ((await this.albums.findOne(userId, album.id)) ?? album) : album;
  }

  async update(
    userId: string,
    id: string,
    data: Record<string, unknown>,
  ): Promise<AlbumRow> {
    // Re-checked on update too: moving an album into a workspace is the same
    // authorization question as creating it there.
    const target = data.workspace_id as string | undefined;
    await this.assertWorkspace(userId, target);

    // A move is also the same *limit* question as creating it there. It was
    // not asked, so a workspace at its plan's limit could be filled past it by
    // making albums elsewhere and moving them in.
    let movedFrom: string | null = null;
    if (target !== undefined) {
      const current = await this.db.queryOne<{ workspace_id: string }>(
        'select workspace_id from albums where id = $1 and user_id = $2',
        [id, userId],
      );
      if (!current) throw new NotFoundException('Album not found');
      if (current.workspace_id !== target) {
        await this.quota.assertCanCreateAlbum(userId, target);
        movedFrom = current.workspace_id;
      }
    }

    // Whichever cover was chosen last wins, so choosing one clears the other.
    // Left alone, an uploaded cover would keep losing to a photograph picked
    // weeks earlier, with nothing on screen to say why.
    if (typeof data.cover_key === 'string') {
      // Ownership first, so a key cannot be probed against someone else's album.
      await this.get(userId, id);
      if (!(await this.albums.isAlbumImage(id, data.cover_key))) {
        throw new BadRequestException('A cover has to be a photograph in this album');
      }
      data = { ...data, cover_url: null };
    } else if (typeof data.cover_url === 'string') {
      data = { ...data, cover_key: null };
    }

    const updated = await super.update(userId, id, data);
    if (movedFrom === null || target === undefined) return updated;

    await this.settleMove(userId, id, movedFrom, target);
    return (await this.albums.findOne(userId, id)) ?? updated;
  }

  /**
   * What moving an album between workspaces means for who can see it.
   *
   * The people in the workspace it left lose it: their access came from being
   * in that workspace, and the grants that were kept left the album in their
   * lists after it had gone. The people in the one it joined get it on the
   * same terms as any album added there. Its history stays behind with nobody
   * left to read it, so it goes, and the old workspace stops using it as its
   * cover.
   */
  private async settleMove(
    userId: string,
    albumId: string,
    from: string,
    to: string,
  ): Promise<void> {
    await this.db.query(
      `delete from collaborator_albums ca
        using collaborators c
        where ca.collaborator_id = c.id
          and ca.album_id = $1
          and c.workspace_id <> $2`,
      [albumId, to],
    );
    await this.db.query(
      'update workspaces set cover_album_id = null where id = $1 and cover_album_id = $2',
      [from, albumId],
    );
    await this.shareWithMembers(albumId, to);
    await this.feed.forgetAlbum(albumId, to);
    await this.feed.record(to, userId, 'album-moved', { albumId });
  }

  /**
   * Gives an album that has just arrived in a workspace to everyone there who
   * asked for albums added later, at the level they asked for.
   *
   * Pending invitations included, so someone who accepts next week does not
   * find the albums made in the meantime missing. Albums still start private
   * for everyone who did not ask — that is the default, and the owner's to
   * change.
   */
  private async shareWithMembers(albumId: string, workspaceId: string): Promise<number> {
    const rows = await this.db.query<{ collaborator_id: string }>(
      `insert into collaborator_albums (collaborator_id, album_id, media_access)
       select c.id, $1, c.new_album_access
         from collaborators c
        where c.workspace_id = $2
          and c.new_album_access is not null
          and c.status in ('accepted', 'pending')
       on conflict (collaborator_id, album_id) do nothing
       returning collaborator_id`,
      [albumId, workspaceId],
    );
    return rows.length;
  }
}
