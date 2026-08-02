import { Body, Controller, Delete, Get, HttpCode, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import { USER_ROLES } from '../auth/roles';
import { DiscoverService } from './discover.service';

export class UpdateLocationDto {
  @Type(() => Number)
  @IsLatitude()
  latitude!: number;

  @Type(() => Number)
  @IsLongitude()
  longitude!: number;
}

export class NearbyQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(200)
  radiusKm?: number;

  /**
   * Show only people who do at least one of these.
   *
   * Accepts `?roles=Photographer&roles=Host` and `?roles=Photographer,Host` —
   * a single query value arrives as a string, not an array, and a client that
   * sends the comma form should not get a confusing validation error.
   */
  @IsOptional()
  @Transform(({ value }) => {
    const list = Array.isArray(value) ? value : [value];
    return list
      .flatMap((entry: unknown) => String(entry).split(','))
      .map((entry) => entry.trim())
      .filter(Boolean);
  })
  @IsArray()
  @ArrayMaxSize(USER_ROLES.length)
  @IsIn(USER_ROLES as readonly string[], { each: true, message: 'Unknown role' })
  roles?: string[];
}

@Controller('discover')
export class DiscoverController {
  constructor(private readonly discover: DiscoverService) {}

  /** Whether the caller is discoverable, and when they last updated. */
  @Get('location')
  status(@CurrentUser('id') userId: string) {
    return this.discover.sharingStatus(userId);
  }

  @HttpCode(200)
  @Post('location')
  update(@CurrentUser('id') userId: string, @Body() dto: UpdateLocationDto) {
    return this.discover.updateLocation(userId, dto.latitude, dto.longitude);
  }

  /** Stops sharing and erases the stored position. */
  @HttpCode(200)
  @Delete('location')
  stop(@CurrentUser('id') userId: string) {
    return this.discover.stopSharing(userId);
  }

  /**
   * People nearby. Rate-limited: it reads across accounts, so repeated calls
   * from moving positions should not be cheap.
   */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('nearby')
  nearby(@CurrentUser('id') userId: string, @Query() query: NearbyQueryDto) {
    return this.discover.nearby(userId, query.radiusKm, query.roles);
  }

  /**
   * How many people nearby do each role.
   *
   * Its own endpoint rather than a field on `nearby`, because the counts must
   * not narrow as filters are applied — they are what you choose *from*.
   */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('nearby/roles')
  roleCounts(
    @CurrentUser('id') userId: string,
    @Query() query: NearbyQueryDto,
  ) {
    return this.discover.roleCounts(userId, query.radiusKm);
  }
}
