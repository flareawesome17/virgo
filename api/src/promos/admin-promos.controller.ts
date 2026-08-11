import {
  Body,
  Controller,
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
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Public } from '../auth/public.decorator';
import { AdminGuard, CurrentAdmin, RequirePermission } from '../admin/admin.guard';
import type { AdminIdentity } from '../admin/admin-auth.service';
import { AuditService } from '../admin/audit.service';
import { PromosService } from './promos.service';

class CreatePromoDto {
  @IsString() @MinLength(2) @MaxLength(80) name!: string;

  @IsOptional() @IsString() @MaxLength(500) description?: string;

  @IsIn(['targeted', 'referral']) kind!: 'targeted' | 'referral';

  /**
   * Bytes, not gigabytes. The console does the multiplication so the API has
   * one unit and PlanLimits can add these straight on.
   */
  @IsOptional() @IsInt() @Min(0) storageBytes?: number;

  @IsOptional() @IsInt() @Min(0) extraWorkspaces?: number;

  @IsOptional() @IsInt() @Min(0) extraAlbumsPerWorkspace?: number;

  /**
   * Null is "never expires", and has to be distinguishable from omitted — so
   * @IsOptional is not enough on its own here.
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  claimWindowDays?: number | null;
}

class ActiveDto {
  @IsBoolean() active!: boolean;
}

class GrantDto {
  @IsArray()
  @ArrayNotEmpty()
  // A selection this large is a slip in the console, not an intention. The
  // insert is one statement either way; the cap is about the notification
  // fan-out that follows it.
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  userIds!: string[];
}

/**
 * Promos, from the console.
 *
 * Registered in AdminModule rather than PromosModule so it is covered by the
 * same guard, signing key and audit log as every other console route — the
 * admin surface is deliberately not reachable from an app module.
 */
// @Public() opts these routes out of the app's global JwtAuthGuard, exactly as
// AdminController does. They are not public: AdminGuard below authenticates
// them against the console's own table, secret and audience. Without this the
// app guard rejects a console token before AdminGuard ever sees it.
@Public()
@UseGuards(AdminGuard)
@Controller('admin/promos')
export class AdminPromosController {
  constructor(
    private readonly promos: PromosService,
    private readonly audit: AuditService,
  ) {}

  @RequirePermission('promos.read')
  @Get()
  list() {
    return this.promos.list();
  }

  /** Who was offered a promo, and who took it. */
  @RequirePermission('promos.read')
  @Get(':id/grants')
  grants(@Param('id', ParseUUIDPipe) id: string) {
    return this.promos.grants(id);
  }

  @RequirePermission('promos.manage')
  @Post()
  async create(@Body() dto: CreatePromoDto, @CurrentAdmin() admin: AdminIdentity) {
    const promo = await this.promos.create(admin.id, dto);
    await this.audit.record(admin, {
      action: 'promo.create',
      targetType: 'promo',
      targetId: promo.id,
      detail: {
        name: promo.name,
        kind: promo.kind,
        storageBytes: promo.storageBytes,
        extraWorkspaces: promo.extraWorkspaces,
        extraAlbumsPerWorkspace: promo.extraAlbumsPerWorkspace,
        claimWindowDays: promo.claimWindowDays,
      },
    });
    return promo;
  }

  @RequirePermission('promos.manage')
  @HttpCode(200)
  @Patch(':id/active')
  async setActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActiveDto,
    @CurrentAdmin() admin: AdminIdentity,
  ) {
    const promo = await this.promos.setActive(id, dto.active);
    await this.audit.record(admin, {
      action: dto.active ? 'promo.activate' : 'promo.deactivate',
      targetType: 'promo',
      targetId: id,
      detail: { name: promo.name },
    });
    return promo;
  }

  /** Offers a targeted promo to the selected accounts. */
  @RequirePermission('promos.manage')
  @HttpCode(200)
  @Post(':id/grants')
  async grantTo(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GrantDto,
    @CurrentAdmin() admin: AdminIdentity,
  ) {
    const result = await this.promos.grantTo(id, dto.userIds);
    await this.audit.record(admin, {
      action: 'promo.grant',
      targetType: 'promo',
      targetId: id,
      // Both numbers: "granted 12" alone hides that 30 were selected and 18
      // already had it, which is the question anyone reading this log has.
      detail: { selected: dto.userIds.length, granted: result.granted },
    });
    return result;
  }
}
