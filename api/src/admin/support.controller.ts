import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { AdminGuard, CurrentAdmin, RequirePermission } from './admin.guard';
import type { AdminIdentity } from './admin-auth.service';
import { AuditService } from './audit.service';
import { SupportService } from './support.service';

const STATUSES = ['open', 'pending', 'resolved', 'closed'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

class OpenTicketDto {
  @IsString() @MinLength(3) @MaxLength(200) subject!: string;
  @IsString() @MinLength(10) @MaxLength(5000) body!: string;
}
class ReplyDto {
  @IsString() @MinLength(1) @MaxLength(5000) body!: string;
}
class AdminReplyDto extends ReplyDto {
  /** A note for colleagues. Never sent to the customer, never notified. */
  @IsOptional() @IsBoolean() internal?: boolean;
}
class UpdateTicketDto {
  @IsOptional() @IsIn(STATUSES) status?: string;
  @IsOptional() @IsIn(PRIORITIES) priority?: string;
  @IsOptional() @IsUUID() assignedTo?: string | null;
}

/**
 * The customer's side, under their own app session.
 *
 * Every route is scoped by the authenticated user id, never by an id in the
 * path alone — otherwise a ticket number would be enough to read somebody
 * else's conversation with support.
 */
@Controller('support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @Post('tickets')
  open(@CurrentUser('id') userId: string, @Body() dto: OpenTicketDto) {
    return this.support.open(userId, dto.subject, dto.body);
  }

  @Get('tickets')
  mine(@CurrentUser('id') userId: string) {
    return this.support.mine(userId);
  }

  @Get('tickets/:id')
  thread(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.support.threadForUser(userId, id);
  }

  @Throttle({ default: { limit: 30, ttl: 3_600_000 } })
  @Post('tickets/:id/reply')
  @HttpCode(200)
  reply(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: ReplyDto,
  ) {
    return this.support.replyAsUser(userId, id, dto.body);
  }
}

/** The console's side. */
@Public()
@UseGuards(AdminGuard)
@Controller('admin/support')
export class AdminSupportController {
  constructor(
    private readonly support: SupportService,
    private readonly audit: AuditService,
  ) {}

  @RequirePermission('support.read')
  @Get('tickets')
  list(
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.support.list({
      status,
      q,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @RequirePermission('support.read')
  @Get('tickets/:id')
  thread(@Param('id') id: string) {
    return this.support.thread(id);
  }

  @RequirePermission('support.reply')
  @Post('tickets/:id/reply')
  @HttpCode(200)
  async reply(
    @Param('id') id: string,
    @Body() dto: AdminReplyDto,
    @CurrentAdmin() admin: AdminIdentity,
  ) {
    const result = await this.support.reply(
      id,
      { id: admin.id, name: admin.name },
      dto.body,
      dto.internal ?? false,
    );
    await this.audit.record(admin, {
      action: dto.internal ? 'support.note' : 'support.reply',
      targetType: 'ticket',
      targetId: id,
      detail: {},
    });
    return result;
  }

  @RequirePermission('support.manage')
  @Patch('tickets/:id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTicketDto,
    @CurrentAdmin() admin: AdminIdentity,
  ) {
    const result = await this.support.update(id, dto);
    await this.audit.record(admin, {
      action: 'support.update',
      targetType: 'ticket',
      targetId: id,
      detail: { ...dto },
    });
    return result;
  }
}
