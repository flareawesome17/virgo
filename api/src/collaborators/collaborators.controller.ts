import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { CollaboratorsService } from './collaborators.service';
import {
  CreateCollaboratorDto,
  ListCollaboratorsDto,
  UpdateCollaboratorDto, UpdateCollaboratorAlbumsDto } from './dto/collaborator.dto';

@Controller('collaborators')
export class CollaboratorsController {
  constructor(private readonly collaborators: CollaboratorsService) {}

  /**
   * Invitations addressed to the caller.
   *
   * Declared before `:id` so "invitations" is not swallowed as an id.
   */
  @Get('invitations')
  invitations(@CurrentUser('id') userId: string) {
    return this.collaborators
      .invitationsFor(userId)
      .then((data) => ({ data, total: data.length }));
  }

  @HttpCode(200)
  @Post('invitations/:id/accept')
  acceptInvitation(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.collaborators.respondToInvitation(userId, id, true);
  }

  @HttpCode(200)
  @Post('invitations/:id/decline')
  declineInvitation(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.collaborators.respondToInvitation(userId, id, false);
  }

  /**
   * Everyone on the album's workspace, each flagged with whether they have
   * been excluded from this album.
   */
  @Get('album/:albumId')
  forAlbum(
    @CurrentUser('id') userId: string,
    @Param('albumId') albumId: string,
  ) {
    return this.collaborators
      .forAlbum(userId, albumId)
      .then((data) => ({ data, total: data.length }));
  }

  /** The workspace's albums, flagged with this collaborator's current access. */
  @Get(':id/albums')
  albumsFor(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.collaborators
      .albumsFor(userId, id)
      .then((data) => ({ data, total: data.length }));
  }

  /** Replaces which albums this collaborator can see. */
  @HttpCode(200)
  @Post(':id/albums')
  setAlbums(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCollaboratorAlbumsDto,
  ) {
    // Either shape is accepted; the newer one carries an access level per
    // album, the older one is ids only and defaults by role.
    const grants = dto.albums
      ? dto.albums.map((a) => ({ albumId: a.album_id, mediaAccess: a.media_access }))
      : (dto.album_ids ?? []).map((albumId) => ({ albumId }));
    return this.collaborators.updateSharedAlbums(userId, id, grants);
  }

  /** Removes someone from this album only; their workspace access remains. */
  @HttpCode(200)
  @Post('album/:albumId/:collaboratorId/exclude')
  exclude(
    @CurrentUser('id') userId: string,
    @Param('albumId') albumId: string,
    @Param('collaboratorId') collaboratorId: string,
  ) {
    return this.collaborators.excludeFromAlbum(userId, albumId, collaboratorId);
  }

  /** Puts them back. */
  @HttpCode(200)
  @Post('album/:albumId/:collaboratorId/include')
  include(
    @CurrentUser('id') userId: string,
    @Param('albumId') albumId: string,
    @Param('collaboratorId') collaboratorId: string,
  ) {
    return this.collaborators.includeInAlbum(userId, albumId, collaboratorId);
  }

  @Get()
  async list(
    @CurrentUser('id') userId: string,
    @Query() query: ListCollaboratorsDto,
  ) {
    const filters = { workspace_id: query.workspace_id, role: query.role };
    const [data, total] = await Promise.all([
      this.collaborators.list(userId, { ...query, filters }),
      this.collaborators.count(userId, filters),
    ]);
    return { data, total };
  }

  @Get(':id')
  get(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.collaborators.get(userId, id);
  }

  @Post()
  create(@CurrentUser('id') userId: string, @Body() dto: CreateCollaboratorDto) {
    return this.collaborators.create(userId, { ...dto });
  }

  @Patch(':id')
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCollaboratorDto,
  ) {
    return this.collaborators.update(userId, id, { ...dto });
  }

  @HttpCode(204)
  @Delete(':id')
  async remove(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<void> {
    await this.collaborators.remove(userId, id);
  }
}
