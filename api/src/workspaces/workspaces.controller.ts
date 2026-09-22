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
import {
  CreateWorkspaceDto,
  ListWorkspacesDto,
  UpdateWorkspaceDto,
  WorkspaceActivityQueryDto,
} from './dto/workspace.dto';
import { WorkspacesService } from './workspaces.service';

@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  /**
   * The caller's workspaces and the ones shared with them. `archived` counts
   * the archive, which the list links to; clients that predate it ignore it.
   */
  @Get()
  list(@CurrentUser('id') userId: string, @Query() query: ListWorkspacesDto) {
    return this.workspaces.page(userId, query);
  }

  @Get(':id')
  get(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.workspaces.get(userId, id);
  }

  /** Everyone on it; the owner also sees invitations and what each was given. */
  @Get(':id/members')
  members(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.workspaces
      .members(userId, id)
      .then((data) => ({ data, total: data.length }));
  }

  /** What has been happening in it, newest first. */
  @Get(':id/activity')
  activity(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Query() query: WorkspaceActivityQueryDto,
  ) {
    return this.workspaces
      .activity(userId, id, query.limit)
      .then((data) => ({ data, total: data.length }));
  }

  /** Leaves a workspace someone else owns. */
  @HttpCode(204)
  @Post(':id/leave')
  async leave(@CurrentUser('id') userId: string, @Param('id') id: string): Promise<void> {
    await this.workspaces.leave(userId, id);
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
