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
import { AlbumRetentionService } from './album-retention.service';
import { AlbumsService } from './albums.service';
import { CreateAlbumDto, ListAlbumsDto, UpdateAlbumDto } from './dto/album.dto';

@Controller('albums')
export class AlbumsController {
  constructor(
    private readonly albums: AlbumsService,
    private readonly retention: AlbumRetentionService,
  ) {}

  /**
   * What the retention settings are about to remove, and when.
   *
   * Declared before `:id` so "retention" is not read as an album id.
   *
   * Worth showing rather than only echoing the setting back: automatic
   * deletion that cannot be seen coming is unnerving, and this is the
   * difference between a policy and something you can check.
   */
  @Get('retention')
  async retentionSchedule(@CurrentUser('id') userId: string) {
    const data = await this.retention.upcoming(userId);
    return { data, total: data.length };
  }

  @Get()
  async list(@CurrentUser('id') userId: string, @Query() query: ListAlbumsDto) {
    const filters = {
      workspace_id: query.workspace_id,
      status: query.status,
      search: query.search,
    };
    const [data, total] = await Promise.all([
      this.albums.list(userId, { ...query, filters }),
      this.albums.count(userId, filters),
    ]);
    return { data, total };
  }

  @Get(':id')
  get(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.albums.get(userId, id);
  }

  @Post()
  create(@CurrentUser('id') userId: string, @Body() dto: CreateAlbumDto) {
    return this.albums.create(userId, { ...dto });
  }

  @Patch(':id')
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAlbumDto,
  ) {
    return this.albums.update(userId, id, { ...dto });
  }

  @HttpCode(204)
  @Delete(':id')
  async remove(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<void> {
    await this.albums.remove(userId, id);
  }
}
