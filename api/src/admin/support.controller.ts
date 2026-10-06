import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { AdminGuard, CurrentAdmin, RequirePermission, SignedIn } from './admin.guard';
import type { AdminIdentity } from './admin-auth.service';
import { AuditService } from './audit.service';
import {
  MAX_FILES_PER_MESSAGE,
  MAX_SUPPORT_FILE_BYTES,
  SUPPORT_FILE_TYPES,
  SupportFilesService,
} from '../storage/support-files.service';
import { SUPPORT_CATEGORIES, SupportService } from './support.service';

const STATUSES = ['open', 'pending', 'resolved', 'closed'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

/** Uploads signed by POST attachments, sent with the message. */
class WithFilesDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_FILES_PER_MESSAGE)
  @IsUUID('all', { each: true })
  attachments?: string[];
}
class OpenTicketDto extends WithFilesDto {
  @IsString() @MinLength(3) @MaxLength(200) subject!: string;
  @IsString() @MinLength(10) @MaxLength(5000) body!: string;
}
class ReplyDto extends WithFilesDto {
  @IsString() @MinLength(1) @MaxLength(5000) body!: string;
}
class UploadDto {
  @IsIn(SUPPORT_FILE_TYPES as unknown as string[]) contentType!: string;
  @IsInt() @Min(1) @Max(MAX_SUPPORT_FILE_BYTES) contentLength!: number;
  @IsOptional() @IsString() @MaxLength(255) name?: string;
}
class RateDto {
  @IsInt() @Min(1) @Max(5) rating!: number;
  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
}
class AdminReplyDto extends ReplyDto {
  /** What sending does to the ticket — a canned reply's "and resolve it". */
  @IsOptional() @IsIn(['pending', 'resolved', 'closed']) setStatus?: string;
  @IsOptional() @IsUUID() macroId?: string;
  /** A note for colleagues. Never sent to the customer, never notified. */
  @IsOptional() @IsBoolean() internal?: boolean;
}
class UpdateTicketDto {
  @IsOptional() @IsIn(STATUSES) status?: string;
  @IsOptional() @IsIn(PRIORITIES) priority?: string;
  @IsOptional() @IsUUID() assignedTo?: string | null;
  @IsOptional() @IsIn(SUPPORT_CATEGORIES as unknown as string[]) category?: string | null;
}

class MacroDto {
  @IsString() @MinLength(1) @MaxLength(80) title!: string;
  @IsString() @MinLength(1) @MaxLength(4000) body!: string;
  @IsOptional() @IsIn(['pending', 'resolved', 'closed']) setStatus?: string | null;
}
class SettingsDto {
  @IsBoolean() autoAssign!: boolean;
}
class ReadDto {
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsUUID('all', { each: true }) ids?: string[];
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
  constructor(
    private readonly support: SupportService,
    private readonly files: SupportFilesService,
  ) {}

  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @Post('tickets')
  open(@CurrentUser('id') userId: string, @Body() dto: OpenTicketDto) {
    return this.support.open(userId, dto.subject, dto.body, dto.attachments);
  }

  /**
   * Signs one file's upload, ahead of the message it goes with. The id that
   * comes back is what the message sends; the file is not part of anything
   * until then, and is swept a day on if it never is.
   */
  @Throttle({ default: { limit: 30, ttl: 3_600_000 } })
  @Post('attachments')
  @HttpCode(200)
  upload(@CurrentUser('id') userId: string, @Body() dto: UploadDto) {
    return this.files.createUpload({ userId }, dto);
  }

  /** How it went, once a ticket is resolved or closed. */
  @Throttle({ default: { limit: 20, ttl: 3_600_000 } })
  @Post('tickets/:id/rating')
  @HttpCode(200)
  rate(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RateDto,
  ) {
    return this.support.rate(userId, id, dto.rating, dto.comment);
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
    return this.support.replyAsUser(userId, id, dto.body, dto.attachments);
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
    private readonly files: SupportFilesService,
  ) {}

  @RequirePermission('support.read')
  @Get('tickets')
  list(
    @CurrentAdmin() admin: AdminIdentity,
    @Query('queue') queue?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.support.list(
      {
        queue,
        status,
        q,
        category,
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
      },
      admin.id,
    );
  }

  @RequirePermission('support.read')
  @Get('tickets/:id')
  thread(@Param('id', ParseUUIDPipe) id: string) {
    return this.support.thread(id);
  }

  @RequirePermission('support.reply')
  @Post('tickets/:id/reply')
  @HttpCode(200)
  async reply(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminReplyDto,
    @CurrentAdmin() admin: AdminIdentity,
  ) {
    const result = await this.support.reply(
      id,
      { id: admin.id, name: admin.name },
      dto.body,
      dto.internal ?? false,
      { setStatus: dto.setStatus, macroId: dto.macroId, attachments: dto.attachments },
    );
    await this.audit.record(admin, {
      action: dto.internal ? 'support.note' : 'support.reply',
      targetType: 'ticket',
      targetId: id,
      detail: {
        ...(dto.setStatus ? { setStatus: dto.setStatus } : {}),
        ...(dto.macroId ? { macro: dto.macroId } : {}),
        ...(dto.attachments?.length ? { files: dto.attachments.length } : {}),
      },
    });
    return result;
  }

  /** Signs a file for a staff reply or note — the console's half of attachments. */
  @RequirePermission('support.reply')
  @Post('attachments')
  @HttpCode(200)
  upload(@CurrentAdmin() admin: AdminIdentity, @Body() dto: UploadDto) {
    return this.files.createUpload({ adminId: admin.id }, dto);
  }

  /**
   * Claims an unclaimed ticket. Anyone who can reply can take one; moving a
   * ticket between people is triage, and needs support.manage below.
   */
  @RequirePermission('support.reply')
  @Post('tickets/:id/take')
  @HttpCode(200)
  async take(@Param('id', ParseUUIDPipe) id: string, @CurrentAdmin() admin: AdminIdentity) {
    const thread = await this.support.thread(id);
    if ((thread.ticket as { assigned_to: string | null }).assigned_to) {
      throw new BadRequestException('Someone already has this ticket');
    }
    const result = await this.support.update(id, { assignedTo: admin.id }, admin);
    await this.audit.record(admin, {
      action: 'support.update',
      targetType: 'ticket',
      targetId: id,
      detail: { assignedTo: admin.id, took: true },
    });
    return result;
  }

  @RequirePermission('support.manage')
  @Patch('tickets/:id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTicketDto,
    @CurrentAdmin() admin: AdminIdentity,
  ) {
    const result = await this.support.update(id, dto, admin);
    await this.audit.record(admin, {
      action: 'support.update',
      targetType: 'ticket',
      targetId: id,
      detail: { ...dto },
    });
    return result;
  }

  /** Who a ticket can be given to, with how many each already holds. */
  @RequirePermission('support.read')
  @Get('agents')
  agents() {
    return this.support.agents();
  }

  @RequirePermission('support.read')
  @Get('insights')
  insights(@Query('days') days?: string) {
    return this.support.insights(days ? Number(days) : 30);
  }

  // ------------------------------------------------------- canned replies

  @RequirePermission('support.read')
  @Get('macros')
  macros() {
    return this.support.macros();
  }

  @RequirePermission('support.manage')
  @Post('macros')
  async createMacro(@Body() dto: MacroDto, @CurrentAdmin() admin: AdminIdentity) {
    const row = await this.support.saveMacro(dto, admin);
    await this.audit.record(admin, { action: 'support.macro', targetType: 'macro', targetId: String((row as { id: string }).id), detail: { title: dto.title } });
    return row;
  }

  @RequirePermission('support.manage')
  @Patch('macros/:macroId')
  async updateMacro(
    @Param('macroId', ParseUUIDPipe) macroId: string,
    @Body() dto: MacroDto,
    @CurrentAdmin() admin: AdminIdentity,
  ) {
    const row = await this.support.saveMacro(dto, admin, macroId);
    await this.audit.record(admin, { action: 'support.macro', targetType: 'macro', targetId: macroId, detail: { title: dto.title } });
    return row;
  }

  @RequirePermission('support.manage')
  @Delete('macros/:macroId')
  async removeMacro(@Param('macroId', ParseUUIDPipe) macroId: string, @CurrentAdmin() admin: AdminIdentity) {
    const row = await this.support.removeMacro(macroId);
    await this.audit.record(admin, { action: 'support.macroDelete', targetType: 'macro', targetId: macroId });
    return row;
  }

  // ------------------------------------------------------------- settings

  @RequirePermission('support.read')
  @Get('settings')
  settings() {
    return this.support.settings();
  }

  @RequirePermission('support.manage')
  @Patch('settings')
  async setSettings(@Body() dto: SettingsDto, @CurrentAdmin() admin: AdminIdentity) {
    const result = await this.support.setAutoAssign(dto.autoAssign, admin.id);
    await this.audit.record(admin, { action: 'support.settings', targetType: 'settings', targetId: 'support', detail: { ...dto } });
    return result;
  }

  // ----------------------------------------------------------------- bell

  /** Your own bell: new tickets, tickets handed to you, customers writing back. */
  @SignedIn()
  @Get('notifications')
  notifications(@CurrentAdmin() admin: AdminIdentity) {
    return this.support.notifications(admin.id);
  }

  @SignedIn()
  @HttpCode(200)
  @Post('notifications/read')
  markRead(@Body() dto: ReadDto, @CurrentAdmin() admin: AdminIdentity) {
    return this.support.markRead(admin.id, dto.ids);
  }
}
