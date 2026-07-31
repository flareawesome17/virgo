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
import { AlbumsService } from './albums.service';
import { CreateAlbumDto, ListAlbumsDto, UpdateAlbumDto } from './dto/album.dto';

@Controller('albums')
export class AlbumsController {
  constructor(private readonly albums: AlbumsService) {}

  @Get()
  async list(@CurrentUser('id') userId: string, @Query() query: ListAlbumsDto) {
    const filters = { workspace_id: query.workspace_id, status: query.status };
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
