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
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Public } from '../auth/public.decorator';
import type { AdminIdentity } from './admin-auth.service';
import { AdminRolesService } from './admin-roles.service';
import { AdminSecurityService } from './admin-security.service';
import {
  AdminGuard,
  AllowsPendingSetup,
  CurrentAdmin,
  RequirePermission,
  SignedIn,
} from './admin.guard';
import { AuditService } from './audit.service';
import { PresenceService } from './presence.service';

class CodeDto {
  @IsString() @MinLength(6) @MaxLength(20) code!: string;
}
class PasswordDto {
  @IsString() @MinLength(1) password!: string;
}
class RoleBodyDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(40) label?: string;
  @IsOptional() @IsString() @MaxLength(200) description?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(64) @IsString({ each: true }) permissions?: string[];
  @IsOptional() @IsBoolean() requiresTwoFactor?: boolean;
}
class PresenceDto {
  @IsIn(['user', 'ticket']) targetType!: 'user' | 'ticket';
  @IsString() @MinLength(1) @MaxLength(64) targetId!: string;
  @IsOptional() @IsIn(['viewing', 'replying']) state?: 'viewing' | 'replying';
}

/**
 * Staff security in the console: your own two-factor and sessions, and — for
 * those who manage staff — everyone's sign-ins, sessions, lockouts and roles.
 * Plus presence, which is how two people avoid answering the same ticket.
 */
@Public()
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminSecurityController {
  constructor(
    private readonly security: AdminSecurityService,
    private readonly roles: AdminRolesService,
    private readonly audit: AuditService,
    private readonly presence: PresenceService,
  ) {}

  // --------------------------------------------------------- your account

  /** Your two-factor state, your sessions and your recent sign-ins. */
  @SignedIn()
  @Get('me/security')
  async mySecurity(@CurrentAdmin() admin: AdminIdentity) {
    const [sessions, logins, recoveryCodesLeft] = await Promise.all([
      this.security.sessions(admin.id),
      this.security.loginEvents({ adminId: admin.id, limit: 10 }),
      this.security.recoveryCodesLeft(admin.id),
    ]);
    return {
      twoFactorEnabled: admin.twoFactorEnabled,
      recoveryCodesLeft,
      currentSessionId: admin.sessionId ?? null,
      sessions,
      logins: logins.data,
    };
  }

  @SignedIn()
  @AllowsPendingSetup()
  @HttpCode(200)
  @Post('me/2fa/setup')
  setUpTwoFactor(@CurrentAdmin() admin: AdminIdentity) {
    return this.security.startTwoFactor(admin);
  }

  // Throttled: it checks a six-digit code, and a valid session is no reason
  // to allow guessing one.
  @SignedIn()
  @AllowsPendingSetup()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('me/2fa/enable')
  async enableTwoFactor(@Body() dto: CodeDto, @CurrentAdmin() admin: AdminIdentity) {
    const result = await this.security.enableTwoFactor(admin, dto.code);
    await this.audit.record(admin, {
      action: 'admin.twoFactorEnable',
      targetType: 'admin',
      targetId: admin.id,
    });
    return result;
  }

  @SignedIn()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('me/2fa/disable')
  async disableTwoFactor(@Body() dto: PasswordDto, @CurrentAdmin() admin: AdminIdentity) {
    await this.security.disableTwoFactor(admin, dto.password);
    await this.audit.record(admin, {
      action: 'admin.twoFactorDisable',
      targetType: 'admin',
      targetId: admin.id,
    });
    return { ok: true };
  }

  @SignedIn()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('me/2fa/recovery-codes')
  async regenerateCodes(@Body() dto: CodeDto, @CurrentAdmin() admin: AdminIdentity) {
    const result = await this.security.regenerateRecoveryCodes(admin, dto.code);
    await this.audit.record(admin, {
      action: 'admin.recoveryCodesRegenerate',
      targetType: 'admin',
      targetId: admin.id,
    });
    return result;
  }

  /** Ends one of your own sessions — including this one, which signs you out. */
  @SignedIn()
  @Delete('me/sessions/:id')
  async endMySession(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AdminIdentity,
  ) {
    await this.security.endSession(id, admin.id);
    await this.audit.record(admin, {
      action: 'admin.endSession',
      targetType: 'session',
      targetId: id,
    });
    return { ok: true };
  }

  @SignedIn()
  @HttpCode(200)
  @Post('me/sessions/end-others')
  async endMyOtherSessions(@CurrentAdmin() admin: AdminIdentity) {
    const result = await this.security.endOtherSessions(admin.id, admin.sessionId);
    await this.audit.record(admin, {
      action: 'admin.endOtherSessions',
      targetType: 'admin',
      targetId: admin.id,
      detail: result,
    });
    return result;
  }

  // ------------------------------------------------------------ the team

  @RequirePermission('admins.read')
  @Get('security/logins')
  logins(
    @Query('adminId') adminId?: string,
    @Query('outcome') outcome?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.security.loginEvents({
      adminId: adminId && /^[0-9a-f-]{36}$/i.test(adminId) ? adminId : undefined,
      outcome,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @RequirePermission('admins.read')
  @Get('security/sessions')
  sessions() {
    return this.security.sessions();
  }

  @RequirePermission('admins.manage')
  @Delete('security/sessions/:id')
  async endSession(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AdminIdentity,
  ) {
    const ended = await this.security.endSession(id);
    await this.audit.record(admin, {
      action: 'admin.endSession',
      targetType: 'admin',
      targetId: ended.admin_id,
      detail: { session: id },
    });
    return { ok: true };
  }

  @RequirePermission('admins.manage')
  @HttpCode(200)
  @Post('accounts/:id/unlock')
  async unlock(@Param('id') id: string, @CurrentAdmin() admin: AdminIdentity) {
    const row = await this.security.unlock(id);
    await this.audit.record(admin, {
      action: 'admin.unlock',
      targetType: 'admin',
      targetId: id,
      detail: { email: row.email },
    });
    return row;
  }

  @RequirePermission('admins.manage')
  @HttpCode(200)
  @Post('accounts/:id/2fa/reset')
  async resetTwoFactor(@Param('id') id: string, @CurrentAdmin() admin: AdminIdentity) {
    const row = await this.security.resetTwoFactorFor(id, admin.id);
    await this.audit.record(admin, {
      action: 'admin.twoFactorReset',
      targetType: 'admin',
      targetId: id,
      detail: { email: row.email },
    });
    return row;
  }

  // --------------------------------------------------------------- roles

  @RequirePermission('admins.read')
  @Get('roles')
  listRoles() {
    return this.roles.list();
  }

  @RequirePermission('admins.manage')
  @Post('roles')
  async createRole(@Body() dto: RoleBodyDto, @CurrentAdmin() admin: AdminIdentity) {
    const role = await this.roles.create(dto);
    await this.audit.record(admin, {
      action: 'role.create',
      targetType: 'role',
      targetId: role.name,
      detail: { label: dto.label, permissions: dto.permissions ?? [] },
    });
    return role;
  }

  @RequirePermission('admins.manage')
  @Patch('roles/:name')
  async updateRole(
    @Param('name') name: string,
    @Body() dto: RoleBodyDto,
    @CurrentAdmin() admin: AdminIdentity,
  ) {
    const role = await this.roles.update(name, dto);
    await this.audit.record(admin, {
      action: 'role.update',
      targetType: 'role',
      targetId: name,
      detail: { ...dto },
    });
    return role;
  }

  @RequirePermission('admins.manage')
  @Delete('roles/:name')
  async removeRole(@Param('name') name: string, @CurrentAdmin() admin: AdminIdentity) {
    const role = await this.roles.remove(name);
    await this.audit.record(admin, { action: 'role.delete', targetType: 'role', targetId: name });
    return role;
  }

  // ------------------------------------------------------------ presence

  /** A heartbeat from an open record. Answers with who else is on it. */
  @SignedIn()
  @HttpCode(200)
  @Post('presence')
  beat(@Body() dto: PresenceDto, @CurrentAdmin() admin: AdminIdentity) {
    return {
      others: this.presence.beat(admin, dto.targetType, dto.targetId, dto.state ?? 'viewing'),
    };
  }

  @SignedIn()
  @HttpCode(200)
  @Post('presence/leave')
  leave(@Body() dto: PresenceDto, @CurrentAdmin() admin: AdminIdentity) {
    this.presence.leave(admin.id, dto.targetType, dto.targetId);
    return { ok: true };
  }
}
