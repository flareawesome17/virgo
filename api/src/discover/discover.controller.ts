import { Body, Controller, Delete, Get, HttpCode, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import { USER_ROLES } from '../auth/roles';
import { DiscoverService } from './discover.service';

/**
 * Either coordinates from the device, or the name of a city.
 *
 * One endpoint rather than two, because it is one decision to the person
 * making it — "here is where I am" — and the client picks the form it has.
 * `location` wins when both arrive. The current apps only send coordinates;
 * the city form stays for the installed ones that still offer it.
 */
export class UpdateLocationDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  // Skipped entirely when a place was named. @IsOptional would not do: these
  // are required in the coordinate form, and a body with neither should fail.
  @ValidateIf((dto: UpdateLocationDto) => !dto.location)
  @Type(() => Number)
  @IsLatitude()
  latitude!: number;

  @ValidateIf((dto: UpdateLocationDto) => !dto.location)
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

  /**
   * Look from this city instead of from where the caller is.
   *
   * Changes the centre of the search, not who can see the caller: where they
   * are shown is their own position, or their address's city.
   */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;
}

/** Shown in, or hidden from, everyone else's Nearby. */
export class NearbyVisibilityDto {
  @IsBoolean()
  hidden!: boolean;
}

@Controller('discover')
export class DiscoverController {
  constructor(private readonly discover: DiscoverService) {}

  /**
   * How the caller is placed in Nearby: whether they appear, what places
   * them, and whether they have hidden.
   */
  @Get('location')
  status(@CurrentUser('id') userId: string) {
    return this.discover.sharingStatus(userId);
  }

  /**
   * Throttled to what a person does by hand. Moving your own point and reading
   * the distances is how a position is worked out, so it should not be cheap
   * to do many times over; the app only sends one when a toggle is tapped.
   */
  @Throttle({ default: { limit: 10, ttl: 60 * 60_000 } })
  @HttpCode(200)
  @Post('location')
  update(@CurrentUser('id') userId: string, @Body() dto: UpdateLocationDto) {
    if (dto.location) {
      return this.discover.setLocationPlace(userId, dto.location);
    }
    return this.discover.updateLocation(userId, dto.latitude, dto.longitude);
  }

  /**
   * Stops sharing and erases the stored position. The caller is placed by
   * their address's city again; this does not hide them.
   */
  @HttpCode(200)
  @Delete('location')
  stop(@CurrentUser('id') userId: string) {
    return this.discover.stopSharing(userId);
  }

  /**
   * Shows or hides the caller in everyone else's Nearby.
   *
   * Its own endpoint rather than a profile field: older APIs refuse a profile
   * key they do not know, and this is a Nearby setting, read and written
   * with the rest of Nearby's.
   */
  @HttpCode(200)
  @Post('visibility')
  visibility(
    @CurrentUser('id') userId: string,
    @Body() dto: NearbyVisibilityDto,
  ) {
    return this.discover.setHidden(userId, dto.hidden);
  }

  /**
   * People nearby. Rate-limited: it reads across accounts, so repeated calls
   * from moving positions should not be cheap.
   */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('nearby')
  nearby(@CurrentUser('id') userId: string, @Query() query: NearbyQueryDto) {
    return this.discover.nearby(
      userId,
      query.radiusKm,
      query.roles,
      query.location,
    );
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
    return this.discover.roleCounts(userId, query.radiusKm, query.location);
  }
}
