import { BadRequestException, Injectable } from '@nestjs/common';
import { OwnedResourceService } from '../common/owned-resource.service';
import { QuotaService } from '../quota/quota.service';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { AlbumRow, AlbumsRepository } from './albums.repository';

@Injectable()
export class AlbumsService extends OwnedResourceService<AlbumRow> {
  constructor(
    private readonly albums: AlbumsRepository,
    private readonly workspaces: WorkspacesService,
    private readonly quota: QuotaService,
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
    return super.create(userId, data);
  }

  async update(
    userId: string,
    id: string,
    data: Record<string, unknown>,
  ): Promise<AlbumRow> {
    // Re-checked on update too: moving an album into a workspace is the same
    // authorization question as creating it there.
    await this.assertWorkspace(userId, data.workspace_id as string | undefined);

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

    return super.update(userId, id, data);
  }
}
