import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/current-user.decorator';
import { DeleteProofDto } from '../auth/dto/delete-proof.dto';
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

  /**
   * The owner's Recently deleted: what they deleted in the last 30 days, with
   * when each one goes for good. Declared before ':id', which would otherwise
   * take 'deleted' for an id.
   */
  @Get('deleted')
  deleted(@CurrentUser('id') userId: string) {
    return this.workspaces.deleted(userId).then((data) => ({ data, total: data.length }));
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

  /**
   * Owner-only, and only with the password or the emailed code in the body.
   * Moves it to Recently deleted, recorded with the session that asked; see
   * WorkspacesService.remove. Throttled like the other places a password is
   * checked, so a stolen session cannot guess its way through.
   */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(204)
  @Delete(':id')
  async remove(
    @CurrentUser('id') userId: string,
    @CurrentUser('sessionId') sessionId: string | undefined,
    @Param('id') id: string,
    @Body() proof: DeleteProofDto,
    @Headers('user-agent') userAgent?: string,
  ): Promise<void> {
    await this.workspaces.remove(userId, id, { ...proof }, { sessionId, userAgent });
  }

  /** Brings one back from Recently deleted, with everything that was in it. */
  @Post(':id/restore')
  restore(
    @CurrentUser('id') userId: string,
    @CurrentUser('sessionId') sessionId: string | undefined,
    @Param('id') id: string,
  ) {
    return this.workspaces.restore(userId, id, { sessionId });
  }
}
