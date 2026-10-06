import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Public } from '../auth/public.decorator';
import { CLIENT_PLATFORMS, type ClientPlatform } from '../notifications/app-update-targeting';
import { AdminGuard, CurrentAdmin, RequirePermission } from './admin.guard';
import type { AdminIdentity } from './admin-auth.service';
import { AuditService } from './audit.service';
import { OutreachService } from './outreach.service';

const VERSION = /^v?\d{1,6}(\.\d{1,6}){0,3}$/;

class AudienceDto {
  /** The people list's filters; anything the API does not know is dropped. */
  @IsOptional() @IsObject() filters?: Record<string, unknown>;
}

class SegmentDto extends AudienceDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string | null;
}

class BroadcastDto extends AudienceDto {
  @IsString() @MinLength(1) @MaxLength(80) title!: string;
  @IsString() @MinLength(1) @MaxLength(600) body!: string;
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^https:\/\/\S+$/, { message: 'The link must be an https address.' })
  url?: string | null;
  /** A saved segment; without one the filters are used, and without those, everyone. */
  @IsOptional() @IsUUID() segmentId?: string | null;
  /** Push as well as the in-app notification, where people allow it. */
  @IsOptional() @IsBoolean() push?: boolean;
  /** Later, instead of now. */
  @IsOptional() @IsISO8601() sendAt?: string | null;
  /** How many accounts a minute. */
  @IsOptional() @IsInt() @Min(50) @Max(20000) perMinute?: number;
}

class AnnounceDto {
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9.-]{2,79}$/, {
    message: 'The name must be 3–80 lowercase letters, digits, dots or dashes.',
  })
  slug!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CLIENT_PLATFORMS.length)
  @ArrayUnique()
  @IsIn(CLIENT_PLATFORMS, { each: true })
  platforms!: ClientPlatform[];
  @IsOptional() @Matches(VERSION, { message: 'The lowest version must be a version number.' }) minVersion?: string;
  @IsOptional() @Matches(VERSION, { message: 'The highest version must be a version number.' }) maxVersion?: string;
  @IsOptional() @Matches(VERSION, { message: 'The version must be a version number.' }) version?: string;
  @IsString() @MinLength(1) @MaxLength(80) title!: string;
  @IsString() @MinLength(1) @MaxLength(600) body!: string;
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^https:\/\/\S+$/, { message: 'The link must be an https address.' })
  url?: string;
  @IsOptional() @IsBoolean() push?: boolean;
}

/**
 * Outreach. Looking is outreach.read; sending anything, saving a segment and
 * announcing an update is outreach.manage, because a message to everyone
 * cannot be taken back. Every write is audited.
 */
@Public()
@UseGuards(AdminGuard)
@Controller('admin/outreach')
export class AdminOutreachController {
  constructor(
    private readonly outreach: OutreachService,
    private readonly audit: AuditService,
  ) {}

  /** Who a set of filters reaches, before it is saved or sent to. */
  @RequirePermission('outreach.read')
  @Post('audience')
  @HttpCode(200)
  audience(@Body() dto: AudienceDto) {
    return this.outreach.count(dto.filters ?? {});
  }

  @RequirePermission('outreach.read')
  @Get('segments')
  segments() {
    return this.outreach.segments();
  }

  @RequirePermission('outreach.manage')
  @Post('segments')
  async createSegment(@Body() dto: SegmentDto, @CurrentAdmin() admin: AdminIdentity) {
    const row = (await this.outreach.saveSegment(admin, { ...dto, filters: dto.filters ?? {} })) as { id: string };
    await this.audit.record(admin, { action: 'segment.create', targetType: 'segment', targetId: row.id, detail: { name: dto.name } });
    return row;
  }

  @RequirePermission('outreach.manage')
  @Patch('segments/:id')
  async updateSegment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SegmentDto,
    @CurrentAdmin() admin: AdminIdentity,
  ) {
    const row = await this.outreach.saveSegment(admin, { ...dto, filters: dto.filters ?? {} }, id);
    await this.audit.record(admin, { action: 'segment.update', targetType: 'segment', targetId: id, detail: { name: dto.name } });
    return row;
  }

  @RequirePermission('outreach.manage')
  @Delete('segments/:id')
  async removeSegment(@Param('id', ParseUUIDPipe) id: string, @CurrentAdmin() admin: AdminIdentity) {
    const row = await this.outreach.removeSegment(id);
    await this.audit.record(admin, { action: 'segment.delete', targetType: 'segment', targetId: id, detail: { name: row.name } });
    return { removed: true };
  }

  @RequirePermission('outreach.read')
  @Get('broadcasts')
  broadcasts() {
    return this.outreach.broadcasts();
  }

  @RequirePermission('outreach.manage')
  @Post('broadcasts')
  async createBroadcast(@Body() dto: BroadcastDto, @CurrentAdmin() admin: AdminIdentity) {
    const row = (await this.outreach.createBroadcast(admin, dto)) as { id: string; send_at: string };
    await this.audit.record(admin, {
      action: 'broadcast.schedule',
      targetType: 'broadcast',
      targetId: row.id,
      detail: {
        title: dto.title,
        segmentId: dto.segmentId ?? null,
        everyone: !dto.segmentId && !Object.keys(dto.filters ?? {}).length,
        push: dto.push !== false,
        sendAt: row.send_at,
      },
    });
    return row;
  }

  @RequirePermission('outreach.manage')
  @Post('broadcasts/:id/cancel')
  @HttpCode(200)
  async cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentAdmin() admin: AdminIdentity) {
    const row = await this.outreach.cancelBroadcast(id, admin);
    await this.audit.record(admin, { action: 'broadcast.cancel', targetType: 'broadcast', targetId: id, detail: { deliveredBefore: row.delivered } });
    return row;
  }

  @RequirePermission('outreach.manage')
  @Post('broadcasts/:id/send-now')
  @HttpCode(200)
  async sendNow(@Param('id', ParseUUIDPipe) id: string, @CurrentAdmin() admin: AdminIdentity) {
    const row = await this.outreach.sendNow(id);
    await this.audit.record(admin, { action: 'broadcast.send_now', targetType: 'broadcast', targetId: id, detail: {} });
    return row;
  }

  @RequirePermission('outreach.read')
  @Get('app-updates')
  appUpdates() {
    return this.outreach.appUpdates();
  }

  @RequirePermission('outreach.manage')
  @Post('app-updates')
  async announce(@Body() dto: AnnounceDto, @CurrentAdmin() admin: AdminIdentity) {
    const result = await this.outreach.announce(admin, dto);
    await this.audit.record(admin, {
      action: 'appUpdate.announce',
      targetType: 'appUpdate',
      targetId: result.id,
      detail: { slug: dto.slug, platforms: dto.platforms, pushed: result.pushed },
    });
    return result;
  }
}
