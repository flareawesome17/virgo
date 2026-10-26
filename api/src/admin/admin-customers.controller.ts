import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsInt,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Public } from '../auth/public.decorator';
import { AccountFlowsService } from '../auth/account-flows.service';
import { AccountService } from '../auth/account.service';
import { UsersRepository } from '../auth/users.repository';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { DownloadAllowanceService } from '../quota/download-allowance.service';
import type { AdminIdentity } from './admin-auth.service';
import { AdminCustomersService, TAG_COLORS } from './admin-customers.service';
import { AdminGuard, CurrentAdmin, RequirePermission } from './admin.guard';
import { AuditService } from './audit.service';

class NoteDto {
  @IsString() @MinLength(1) @MaxLength(4000) body!: string;
  @IsOptional() @IsBoolean() pinned?: boolean;
}
class NotePatchDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(4000) body?: string;
  @IsOptional() @IsBoolean() pinned?: boolean;
}
class TagDto {
  @IsString() @MinLength(1) @MaxLength(32) label!: string;
  @IsOptional() @IsIn(TAG_COLORS as unknown as string[]) color?: string;
}
class TagPatchDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(32) label?: string;
  @IsOptional() @IsIn(TAG_COLORS as unknown as string[]) color?: string;
}
class SetTagsDto {
  @IsArray() @ArrayMaxSize(50) @IsUUID('all', { each: true }) tagIds!: string[];
}
class BulkTagsDto {
  @IsArray() @ArrayMaxSize(500) @IsUUID('all', { each: true }) userIds!: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsUUID('all', { each: true }) add?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsUUID('all', { each: true }) remove?: string[];
}
class ViewDto {
  @IsIn(['users']) scope!: 'users';
  @IsString() @MinLength(1) @MaxLength(60) name!: string;
  @IsObject() query!: Record<string, unknown>;
  @IsOptional() @IsBoolean() shared?: boolean;
}
class DeleteDto {
  @IsString() @MinLength(3) confirmEmail!: string;
}
/** Whole gigabytes, so a slip of the finger cannot grant a terabyte. */
class DownloadExtraDto {
  @IsInt() @Min(0) @Max(1000) gigabytes!: number;
}

/**
 * Customer 360: the tabs of one account beyond its profile, what staff may do
 * to it, and the notes, tags and saved views around it.
 *
 * Every action that sends a customer something or changes their security is
 * audited with the account as its target, so it shows on their timeline too.
 */
@Public()
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminCustomersController {
  constructor(
    private readonly customers: AdminCustomersService,
    private readonly audit: AuditService,
    private readonly users: UsersRepository,
    private readonly accounts: AccountService,
    private readonly flows: AccountFlowsService,
    private readonly realtime: RealtimeGateway,
    private readonly downloads: DownloadAllowanceService,
  ) {}

  private async account(id: string) {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundException('No such account');
    return user;
  }

  // ------------------------------------------------------------------ tabs

  @RequirePermission('users.read')
  @Get('users/:id/timeline')
  timeline(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    const at = before && !Number.isNaN(Date.parse(before)) ? new Date(before).toISOString() : undefined;
    return this.customers.timeline(id, { before: at, limit: limit ? Number(limit) : undefined });
  }

  @RequirePermission('billing.read')
  @Get('users/:id/billing')
  billing(@Param('id', ParseUUIDPipe) id: string) {
    return this.customers.billing(id);
  }

  @RequirePermission('users.read')
  @Get('users/:id/marketplace')
  marketplace(@Param('id', ParseUUIDPipe) id: string) {
    return this.customers.marketplace(id);
  }

  @RequirePermission('content.read')
  @Get('users/:id/safety')
  safety(@Param('id', ParseUUIDPipe) id: string) {
    return this.customers.safety(id);
  }

  /**
   * This month's client downloads: what the account's links delivered, the
   * allowance with any extra staff gave, and whether downloads are paused.
   */
  @RequirePermission('billing.read')
  @Get('users/:id/downloads')
  async downloadUsage(@Param('id', ParseUUIDPipe) id: string) {
    await this.account(id);
    return this.downloads.usage(id);
  }

  @RequirePermission('users.read')
  @Get('users/:id/devices')
  devices(@Param('id', ParseUUIDPipe) id: string) {
    return this.customers.devices(id);
  }

  // --------------------------------------------------------------- actions

  /**
   * Extra client downloads for this month only: the way out for a paused
   * photographer while no plan can be bought. Replaces what was there, 0
   * takes it away, and it lapses when the month does.
   */
  @RequirePermission('billing.manage')
  @HttpCode(200)
  @Post('users/:id/downloads/extra')
  async setDownloadExtra(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DownloadExtraDto,
    @CurrentAdmin() admin: AdminIdentity,
  ) {
    await this.account(id);
    const usage = await this.downloads.setExtra(id, dto.gigabytes * 1024 ** 3, admin.id);
    await this.audit.record(admin, {
      action: 'user.downloadExtra',
      targetType: 'user',
      targetId: id,
      detail: { gigabytes: dto.gigabytes, month: usage.resetsAt },
    });
    return usage;
  }

  /** The reset email the customer could have asked for themselves. */
  @RequirePermission('users.assist')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('users/:id/password-reset-email')
  async sendPasswordReset(@Param('id', ParseUUIDPipe) id: string, @CurrentAdmin() admin: AdminIdentity) {
    const user = await this.account(id);
    await this.flows.requestPasswordReset(user.email);
    await this.audit.record(admin, { action: 'user.passwordResetEmail', targetType: 'user', targetId: id });
    return { sent: true };
  }

  @RequirePermission('users.assist')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('users/:id/verification-email')
  async sendVerification(@Param('id', ParseUUIDPipe) id: string, @CurrentAdmin() admin: AdminIdentity) {
    const user = await this.account(id);
    if (user.email_verified_at) throw new BadRequestException('That address is already confirmed');
    await this.flows.sendVerificationEmail(id);
    await this.audit.record(admin, { action: 'user.verificationEmail', targetType: 'user', targetId: id });
    return { sent: true };
  }

  @RequirePermission('users.security')
  @HttpCode(200)
  @Post('users/:id/verify')
  async markVerified(@Param('id', ParseUUIDPipe) id: string, @CurrentAdmin() admin: AdminIdentity) {
    await this.account(id);
    const result = await this.flows.markVerified(id);
    if (result.changed) {
      await this.audit.record(admin, { action: 'user.markVerified', targetType: 'user', targetId: id });
    }
    return result;
  }

  /**
   * Removes the account's two-factor — the lost-phone case — and signs it out
   * everywhere, so the next sign-in is with the password alone.
   */
  @RequirePermission('users.security')
  @HttpCode(200)
  @Post('users/:id/2fa/reset')
  async resetTwoFactor(@Param('id', ParseUUIDPipe) id: string, @CurrentAdmin() admin: AdminIdentity) {
    const user = await this.account(id);
    if (!user.two_factor_enabled_at) throw new BadRequestException('Two-factor is not on for this account');
    await this.users.disableTwoFactor(id);
    await this.users.revokeAllForUser(id);
    this.realtime.closeUser(id);
    await this.audit.record(admin, { action: 'user.twoFactorReset', targetType: 'user', targetId: id });
    return { reset: true };
  }

  /** Signs out every device, without suspending — for a lost or shared phone. */
  @RequirePermission('users.security')
  @HttpCode(200)
  @Post('users/:id/sign-out')
  async signOutEverywhere(@Param('id', ParseUUIDPipe) id: string, @CurrentAdmin() admin: AdminIdentity) {
    await this.account(id);
    await this.users.revokeAllForUser(id);
    this.realtime.closeUser(id);
    await this.audit.record(admin, { action: 'user.signOut', targetType: 'user', targetId: id });
    return { signedOut: true };
  }

  @RequirePermission('users.security')
  @HttpCode(200)
  @Post('users/:id/devices/:familyId/sign-out')
  async signOutDevice(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('familyId', ParseUUIDPipe) familyId: string,
    @CurrentAdmin() admin: AdminIdentity,
  ) {
    const result = await this.customers.signOutDevice(id, familyId);
    await this.audit.record(admin, {
      action: 'user.signOutDevice',
      targetType: 'user',
      targetId: id,
      detail: { device: familyId },
    });
    return result;
  }

  /**
   * Deletes the account and everything in it, through the same path as the
   * app's own "Delete account". The address has to be typed back: a mistyped
   * row id must never be enough to erase someone's work.
   */
  @RequirePermission('users.delete')
  @HttpCode(200)
  @Post('users/:id/delete')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeleteDto,
    @CurrentAdmin() admin: AdminIdentity,
  ) {
    const user = await this.account(id);
    if (dto.confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
      throw new BadRequestException('Type the account’s email address exactly to delete it');
    }
    const result = await this.accounts.removeByStaff(id);
    this.realtime.closeUser(id);
    await this.audit.record(admin, {
      action: 'user.delete',
      targetType: 'user',
      targetId: id,
      detail: { email: user.email, filesDeleted: result.filesDeleted },
    });
    return result;
  }

  // ----------------------------------------------------------------- notes

  @RequirePermission('users.read')
  @Get('users/:id/notes')
  notes(@Param('id', ParseUUIDPipe) id: string) {
    return this.customers.notes(id);
  }

  @RequirePermission('users.notes')
  @Post('users/:id/notes')
  async addNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: NoteDto,
    @CurrentAdmin() admin: AdminIdentity,
  ) {
    return this.customers.addNote(id, admin, dto.body, dto.pinned);
  }

  @RequirePermission('users.notes')
  @Patch('users/:id/notes/:noteId')
  updateNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('noteId', ParseUUIDPipe) noteId: string,
    @Body() dto: NotePatchDto,
    @CurrentAdmin() admin: AdminIdentity,
  ) {
    return this.customers.updateNote(id, noteId, admin, dto);
  }

  @RequirePermission('users.notes')
  @Delete('users/:id/notes/:noteId')
  removeNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('noteId', ParseUUIDPipe) noteId: string,
    @CurrentAdmin() admin: AdminIdentity,
  ) {
    return this.customers.removeNote(id, noteId, admin);
  }

  // ------------------------------------------------------------------ tags

  @RequirePermission('users.read')
  @Get('tags')
  tags() {
    return this.customers.tags();
  }

  @RequirePermission('users.notes')
  @Post('tags')
  async createTag(@Body() dto: TagDto, @CurrentAdmin() admin: AdminIdentity) {
    const tag = await this.customers.createTag(admin, dto.label, dto.color);
    await this.audit.record(admin, { action: 'tag.create', targetType: 'tag', targetId: String((tag as { id: string }).id), detail: { label: dto.label } });
    return tag;
  }

  @RequirePermission('users.notes')
  @Patch('tags/:tagId')
  updateTag(@Param('tagId', ParseUUIDPipe) tagId: string, @Body() dto: TagPatchDto) {
    return this.customers.updateTag(tagId, dto);
  }

  /** Removing a tag takes it off everyone, so it needs more than writing notes. */
  @RequirePermission('users.security')
  @Delete('tags/:tagId')
  async removeTag(@Param('tagId', ParseUUIDPipe) tagId: string, @CurrentAdmin() admin: AdminIdentity) {
    const row = await this.customers.removeTag(tagId);
    await this.audit.record(admin, { action: 'tag.delete', targetType: 'tag', targetId: tagId, detail: row });
    return row;
  }

  @RequirePermission('users.notes')
  @Put('users/:id/tags')
  async setTags(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetTagsDto,
    @CurrentAdmin() admin: AdminIdentity,
  ) {
    const tags = await this.customers.setTags(id, dto.tagIds, admin);
    await this.audit.record(admin, {
      action: 'user.tags',
      targetType: 'user',
      targetId: id,
      detail: { tags: (tags as { label: string }[]).map((t) => t.label) },
    });
    return tags;
  }

  @RequirePermission('users.notes')
  @HttpCode(200)
  @Post('users/bulk/tags')
  async bulkTags(@Body() dto: BulkTagsDto, @CurrentAdmin() admin: AdminIdentity) {
    const result = await this.customers.bulkTags(dto.userIds, dto.add ?? [], dto.remove ?? [], admin);
    await this.audit.record(admin, {
      action: 'users.bulkTags',
      targetType: 'users',
      detail: { accounts: dto.userIds.length, add: dto.add ?? [], remove: dto.remove ?? [], changed: result.changed },
    });
    return result;
  }

  // ----------------------------------------------------------- saved views

  @RequirePermission('users.read')
  @Get('views')
  views(@Query('scope') scope: string, @CurrentAdmin() admin: AdminIdentity) {
    return this.customers.views(admin, scope === 'users' ? scope : 'users');
  }

  @RequirePermission('users.read')
  @Post('views')
  saveView(@Body() dto: ViewDto, @CurrentAdmin() admin: AdminIdentity) {
    return this.customers.saveView(admin, dto);
  }

  @RequirePermission('users.read')
  @Delete('views/:viewId')
  removeView(@Param('viewId', ParseUUIDPipe) viewId: string, @CurrentAdmin() admin: AdminIdentity) {
    return this.customers.removeView(admin, viewId);
  }
}
