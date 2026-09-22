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
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { Request } from 'express';
import { Public } from '../auth/public.decorator';
import { AdminAuthService, RESET_TTL_MINUTES } from './admin-auth.service';
import { AdminAccountsService } from './admin-accounts.service';
import { AdminService } from './admin.service';
import { AuditService } from './audit.service';
import { AdminGuard, CurrentAdmin, RequirePermission } from './admin.guard';
import type { AdminIdentity } from './admin-auth.service';
import { ADMIN_ROLES, ROLE_DESCRIPTION, ROLE_LABEL } from './rbac';

class LoginDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(1) password!: string;
}
class TokenDto {
  @IsString() refreshToken!: string;
}
class ForgotPasswordDto {
  @IsEmail() email!: string;
}
class ResetPasswordDto {
  @IsString() @MinLength(1) token!: string;
  @IsString() @MinLength(12) newPassword!: string;
}
class CreateAdminDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsString() @MinLength(12) password!: string;
  @IsIn(ADMIN_ROLES as unknown as string[]) role!: string;
}
class RoleDto {
  @IsIn(ADMIN_ROLES as unknown as string[]) role!: string;
}
class DisabledDto {
  @IsBoolean() disabled!: boolean;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
class PasswordDto {
  @IsString() @MinLength(12) password!: string;
}
class ChangePasswordDto {
  @IsString() @MinLength(1) currentPassword!: string;
  @IsString() @MinLength(12) newPassword!: string;
}
class PlanDto {
  @IsString() plan!: string;
}
class HiddenDto {
  @IsBoolean() hidden!: boolean;
}

/**
 * Console sign-in.
 *
 * `@Public()` opts these out of the app's global JwtAuthGuard — they are not
 * app routes and must not accept an app token. Authentication happens against
 * admin_users with its own secret and audience.
 */
@Public()
@Controller('admin/auth')
export class AdminAuthController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly config: ConfigService,
  ) {}

  // Tight: this is the front door to everyone's data, and the one endpoint
  // worth making expensive to guess against.
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto.email, dto.password, req.headers['user-agent']);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @Post('refresh')
  refresh(@Body() dto: TokenDto, @Req() req: Request) {
    return this.auth.refresh(dto.refreshToken, req.headers['user-agent']);
  }

  @HttpCode(200)
  @Post('logout')
  async logout(@Body() dto: TokenDto) {
    await this.auth.logout(dto.refreshToken);
    return { ok: true };
  }

  /**
   * Starts a reset, and admits nothing.
   *
   * Always 200 with the same body whether or not the address has an account.
   * Anything else turns this endpoint into a list of who holds console access,
   * which is worth more to an attacker than most passwords.
   *
   * Throttled harder than login: there is no password to get wrong here, so
   * the only thing to rate-limit is somebody using it to probe addresses or to
   * bury a real reset under a flood of emails.
   */
  @Throttle({ default: { limit: 4, ttl: 900_000 } })
  @HttpCode(200)
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    // The link has to point at the console, not the API. Taken from the
    // request's own Origin when it is one we allow, so this works in
    // development without another environment variable — and falls back to
    // configuration rather than trusting an arbitrary header, which is how a
    // reset link gets sent pointing at somebody else's site.
    const origin = this.consoleOrigin(req.headers.origin);
    await this.auth.requestPasswordReset(
      dto.email,
      origin,
      (req.headers['cf-connecting-ip'] as string) || req.ip,
    );
    return {
      ok: true,
      // The duration is stated here, from the constant, so the page does not
      // keep its own copy to go stale the next time it changes.
      message:
        'If that address has a console account, a reset link is on its way. ' +
        `It expires in ${RESET_TTL_MINUTES} minutes.`,
    };
  }

  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  @HttpCode(200)
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto.token, dto.newPassword);
    return { ok: true };
  }

  /**
   * Where a reset link should point.
   *
   * An `Origin` header is attacker-controlled, so it is only used when it is
   * already an allowed CORS origin — otherwise a forged request would email a
   * real user a link to a site that harvests the token.
   */
  private consoleOrigin(origin: string | undefined): string {
    const configured =
      this.config.get<string>('CONSOLE_URL') ?? 'https://console.virgo.ph';
    if (!origin) return configured;

    const allowed = (this.config.get<string>('CORS_ORIGINS') ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    return allowed.includes(origin) ? origin : configured;
  }
}

@Public()
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly accounts: AdminAccountsService,
    private readonly audit: AuditService,
    private readonly auth: AdminAuthService,
  ) {}

  /** Who am I and what may I do — the console renders its nav from this. */
  @RequirePermission('overview.read')
  @Get('me')
  me(@CurrentAdmin() admin: AdminIdentity) {
    return {
      ...admin,
      roleLabel: ROLE_LABEL[admin.role],
      roles: ADMIN_ROLES.map((role) => ({
        name: role,
        label: ROLE_LABEL[role],
        description: ROLE_DESCRIPTION[role],
      })),
    };
  }

  /**
   * Changes your own password.
   *
   * Guarded by AdminGuard like everything else, but gated on `overview.read`
   * — the one permission every role has — because a viewer forced to change a
   * seeded password must be able to, and requiring anything higher would lock
   * them out of the console entirely.
   */
  @RequirePermission('overview.read')
  @HttpCode(200)
  @Post('me/password')
  async changeOwnPassword(
    @Body() dto: ChangePasswordDto,
    @CurrentAdmin() admin: AdminIdentity,
  ) {
    await this.auth.changeOwnPassword(
      admin.id,
      dto.currentPassword,
      dto.newPassword,
    );
    await this.audit.record(admin, {
      action: 'admin.changeOwnPassword',
      targetType: 'admin',
      targetId: admin.id,
      detail: {},
    });
    // Every session was just revoked, this one included — the console signs
    // back in with the new password rather than carrying a dead token.
    return { ok: true, reauthenticate: true };
  }

  @RequirePermission('overview.read')
  @Get('overview')
  overview(@Query('days') days?: string) {
    return this.admin.overview(Math.min(Number(days) || 30, 365));
  }

  // ------------------------------------------------------------------- users

  @RequirePermission('users.read')
  @Get('users')
  users(
    @Query('q') q?: string,
    @Query('plan') plan?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.admin.users({
      q,
      plan,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @RequirePermission('users.read')
  @Get('users/:id')
  user(@Param('id') id: string) {
    return this.admin.user(id);
  }

  @RequirePermission('users.disable')
  @Patch('users/:id/disabled')
  async setUserDisabled(
    @Param('id') id: string,
    @Body() dto: DisabledDto,
    @CurrentAdmin() admin: AdminIdentity,
  ) {
    const result = await this.admin.setUserDisabled(id, dto.disabled, dto.reason);
    await this.audit.record(admin, {
      action: dto.disabled ? 'user.disable' : 'user.enable',
      targetType: 'user',
      targetId: id,
      detail: { email: result.email, reason: dto.reason ?? null },
    });
    return result;
  }

  @RequirePermission('users.setPlan')
  @Patch('users/:id/plan')
  async setUserPlan(
    @Param('id') id: string,
    @Body() dto: PlanDto,
    @CurrentAdmin() admin: AdminIdentity,
  ) {
    const result = await this.admin.setUserPlan(id, dto.plan);
    await this.audit.record(admin, {
      action: 'user.setPlan',
      targetType: 'user',
      targetId: id,
      detail: { email: result.email, plan: dto.plan },
    });
    return result;
  }

  // ----------------------------------------------------------------- content

  @RequirePermission('content.read')
  @Get('albums')
  albums(
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.admin.albums({
      q,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @RequirePermission('content.read')
  @Get('share-links')
  shareLinks(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.admin.shareLinks({
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @RequirePermission('content.moderate')
  @Post('share-links/:id/revoke')
  @HttpCode(200)
  async revokeShareLink(
    @Param('id') id: string,
    @CurrentAdmin() admin: AdminIdentity,
  ) {
    const result = await this.admin.revokeShareLink(id);
    await this.audit.record(admin, {
      action: 'shareLink.revoke',
      targetType: 'shareLink',
      targetId: id,
      detail: { albumId: result.album_id },
    });
    return result;
  }

  @RequirePermission('content.read')
  @Get('job-reports')
  jobReports(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.admin.jobReports({
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  /**
   * Reports about people. The same permission as job reports: reading a
   * report is triage, and suspending still needs users.disable.
   */
  @RequirePermission('content.read')
  @Get('user-reports')
  userReports(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.admin.userReports({
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @RequirePermission('content.moderate')
  @Patch('jobs/:id/hidden')
  async setJobHidden(
    @Param('id') id: string,
    @Body() dto: HiddenDto,
    @CurrentAdmin() admin: AdminIdentity,
  ) {
    const result = await this.admin.setJobHidden(id, dto.hidden);
    await this.audit.record(admin, {
      action: dto.hidden ? 'job.hide' : 'job.unhide',
      targetType: 'job',
      targetId: id,
      detail: { title: result.title },
    });
    return result;
  }

  // ----------------------------------------------------------------- billing

  @RequirePermission('billing.read')
  @Get('subscriptions')
  subscriptions(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.admin.subscriptions({
      status,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  // ------------------------------------------------------------------ system

  @RequirePermission('system.read')
  @Get('system/health')
  health() {
    return this.admin.health();
  }

  // ------------------------------------------------- the console's own users

  @RequirePermission('admins.read')
  @Get('accounts')
  listAdmins() {
    return this.accounts.list();
  }

  @RequirePermission('admins.manage')
  @Post('accounts')
  async createAdmin(
    @Body() dto: CreateAdminDto,
    @CurrentAdmin() admin: AdminIdentity,
  ) {
    const created = await this.accounts.create(dto);
    await this.audit.record(admin, {
      action: 'admin.create',
      targetType: 'admin',
      targetId: String((created as { id: string }).id),
      detail: { email: dto.email, role: dto.role },
    });
    return created;
  }

  @RequirePermission('admins.manage')
  @Patch('accounts/:id/role')
  async setAdminRole(
    @Param('id') id: string,
    @Body() dto: RoleDto,
    @CurrentAdmin() admin: AdminIdentity,
  ) {
    const result = await this.accounts.setRole(id, dto.role, admin.id);
    await this.audit.record(admin, {
      action: 'admin.setRole',
      targetType: 'admin',
      targetId: id,
      detail: { role: dto.role },
    });
    return result;
  }

  @RequirePermission('admins.manage')
  @Patch('accounts/:id/disabled')
  async setAdminDisabled(
    @Param('id') id: string,
    @Body() dto: DisabledDto,
    @CurrentAdmin() admin: AdminIdentity,
  ) {
    const result = await this.accounts.setDisabled(id, dto.disabled, admin.id);
    await this.audit.record(admin, {
      action: dto.disabled ? 'admin.disable' : 'admin.enable',
      targetType: 'admin',
      targetId: id,
      detail: {},
    });
    return result;
  }

  @RequirePermission('admins.manage')
  @Patch('accounts/:id/password')
  async setAdminPassword(
    @Param('id') id: string,
    @Body() dto: PasswordDto,
    @CurrentAdmin() admin: AdminIdentity,
  ) {
    const result = await this.accounts.setPassword(id, dto.password);
    await this.audit.record(admin, {
      action: 'admin.setPassword',
      targetType: 'admin',
      targetId: id,
      detail: {},
    });
    return result;
  }

  @RequirePermission('admins.manage')
  @Delete('accounts/:id')
  async removeAdmin(
    @Param('id') id: string,
    @CurrentAdmin() admin: AdminIdentity,
  ) {
    const result = await this.accounts.remove(id, admin.id);
    await this.audit.record(admin, {
      action: 'admin.delete',
      targetType: 'admin',
      targetId: id,
      detail: { email: (result as { email: string }).email },
    });
    return result;
  }

  // ------------------------------------------------------------------- audit

  @RequirePermission('audit.read')
  @Get('audit')
  auditLog(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('targetId') targetId?: string,
  ) {
    return this.audit.list({
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      targetId,
    });
  }
}
