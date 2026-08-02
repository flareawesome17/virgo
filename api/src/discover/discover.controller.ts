import { Body, Controller, Delete, Get, HttpCode, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
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
    return this.discover.nearby(userId, query.radiusKm);
  }
}
