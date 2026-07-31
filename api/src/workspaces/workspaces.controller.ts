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
import { ListQueryDto } from '../common/dto/list-query.dto';
import { CreateWorkspaceDto, UpdateWorkspaceDto } from './dto/workspace.dto';
import { WorkspacesService } from './workspaces.service';

@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Get()
  async list(@CurrentUser('id') userId: string, @Query() query: ListQueryDto) {
    const [data, total] = await Promise.all([
      this.workspaces.list(userId, query),
      this.workspaces.count(userId),
    ]);
    return { data, total };
  }

  @Get(':id')
  get(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.workspaces.get(userId, id);
  }

  @Post()
  create(@CurrentUser('id') userId: string, @Body() dto: CreateWorkspaceDto) {
    return this.workspaces.create(userId, { ...dto });
  }

  @Patch(':id')
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateWorkspaceDto,
  ) {
    return this.workspaces.update(userId, id, { ...dto });
  }

  @HttpCode(204)
  @Delete(':id')
  async remove(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<void> {
    await this.workspaces.remove(userId, id);
  }
}
