import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { Public } from '../auth/public.decorator';
import { AdminGuard, CurrentAdmin, RequirePermission } from './admin.guard';
import type { AdminIdentity } from './admin-auth.service';
import { AuditService } from './audit.service';
import { CASE_ACTIONS, CASE_KINDS, ModerationService, type CaseAction, type CaseKind } from './moderation.service';

class ResolveDto {
  @IsIn(CASE_ACTIONS as unknown as string[]) action!: CaseAction;
  /** What the person is told. Required to warn; warns as well on hide or suspend. */
  @IsOptional() @IsString() @MaxLength(2000) message?: string;
  /** For staff only, on the reports and in the history. */
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
  /** Suspending emails the suspension notice unless this is false. */
  @IsOptional() @IsBoolean() notify?: boolean;
}

class RemoveCommentDto {
  @IsOptional() @IsString() @MaxLength(2000) message?: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

/** A case is addressed by what kind of thing was reported, then its id. */
function kindOf(kind: string): CaseKind {
  if (!(CASE_KINDS as readonly string[]).includes(kind)) {
    throw new NotFoundException('No such kind of report');
  }
  return kind as CaseKind;
}

/**
 * The moderation queue. Reading it is content.read, deciding is
 * content.moderate, suspending also needs users.disable, and reading the
 * messages a chat report carried needs content.evidence — each look at those
 * is audited.
 */
@Public()
@UseGuards(AdminGuard)
@Controller('admin/moderation')
export class AdminModerationController {
  constructor(
    private readonly moderation: ModerationService,
    private readonly audit: AuditService,
  ) {}

  @RequirePermission('content.read')
  @Get('cases')
  cases(
    @Query('state') state?: string,
    @Query('kind') kind?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.moderation.cases({
      state,
      kind,
      q,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @RequirePermission('content.read')
  @Get('cases/:kind/:targetId')
  case(@Param('kind') kind: string, @Param('targetId', ParseUUIDPipe) targetId: string) {
    return this.moderation.case(kindOf(kind), targetId);
  }

  /** Private messages, so every look is written down. */
  @RequirePermission('content.evidence')
  @Get('reports/:reportId/evidence')
  async evidence(
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @CurrentAdmin() admin: AdminIdentity,
  ) {
    const result = await this.moderation.evidence(reportId);
    await this.audit.recordView(admin, 'reportEvidence', reportId);
    return result;
  }

  @RequirePermission('content.moderate')
  @Post('cases/:kind/:targetId/resolve')
  @HttpCode(200)
  async resolve(
    @Param('kind') kind: string,
    @Param('targetId', ParseUUIDPipe) targetId: string,
    @Body() dto: ResolveDto,
    @CurrentAdmin() admin: AdminIdentity,
  ) {
    const checked = kindOf(kind);
    if (dto.action === 'suspend' && !admin.permissions.includes('users.disable')) {
      throw new ForbiddenException('Suspending an account needs the users.disable permission');
    }
    const result = await this.moderation.resolve(checked, targetId, admin, dto);
    await this.audit.record(admin, {
      action: `moderation.${dto.action}`,
      targetType: checked,
      targetId,
      detail: {
        closed: result.closed,
        warned: !!result.ticketId,
        ...(result.ticketId ? { ticketId: result.ticketId } : {}),
        ...(dto.action === 'suspend' ? { emailed: result.emailed } : {}),
      },
    });
    return result;
  }

  @RequirePermission('content.read')
  @Get('comments')
  comments(
    @Query('q') q?: string,
    @Query('userId') userId?: string,
    @Query('showcaseId') showcaseId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const uuid = /^[0-9a-f-]{36}$/i;
    return this.moderation.comments({
      q,
      userId: userId && uuid.test(userId) ? userId : undefined,
      showcaseId: showcaseId && uuid.test(showcaseId) ? showcaseId : undefined,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @RequirePermission('content.moderate')
  @Post('comments/:id/remove')
  @HttpCode(200)
  async removeComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RemoveCommentDto,
    @CurrentAdmin() admin: AdminIdentity,
  ) {
    const result = await this.moderation.removeComment(id, admin, dto);
    await this.audit.record(admin, {
      action: 'moderation.remove_comment',
      targetType: 'comment',
      targetId: id,
      detail: { authorId: result.subjectId, warned: !!result.ticketId },
    });
    return result;
  }
}
