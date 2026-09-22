import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsBoolean, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import { HANDLE_MAX, HANDLE_MIN } from './handles';
import { ProfilesService } from './profiles.service';

export class SetHandleDto {
  @IsString()
  @MinLength(HANDLE_MIN)
  @MaxLength(HANDLE_MAX)
  handle!: string;
}

export class PublishDto {
  @IsBoolean()
  published!: boolean;
}

/**
 * A cover, named by the object key its upload was given. Never a URL: the
 * server builds that itself from an object it re-encoded.
 */
export class SetCoverDto {
  @IsString()
  @MaxLength(1024)
  key!: string;
}

/**
 * Reading somebody else's profile.
 *
 * Signed-in only. `public_profile` still means "other people may see this"
 * rather than "nobody may" — it is the opt-in that decides whether a profile
 * is listed at all — but "other people" now means other accounts, not the open
 * web. A profile carries a face, a city and a portfolio, and an unauthenticated
 * reader of that is a scraper as often as a client.
 *
 * Still rate-limited: it reads across accounts, so repeated calls from one
 * account should not be free either.
 */
@Controller('profiles')
export class PublicProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get(':handle')
  get(@CurrentUser('id') viewerId: string, @Param('handle') handle: string) {
    // The viewer, so a block between the two reads as the profile not being
    // there.
    return this.profiles.publicProfile(handle, viewerId);
  }
}

/** The owner's own controls. Authenticated, like everything else under /me. */
@Controller('me/profile')
export class MyProfileController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get()
  settings(@CurrentUser('id') userId: string) {
    return this.profiles.settings(userId);
  }

  /**
   * The owner's own page, published or not. A GET, so an account that has
   * not verified its email can still see what it is building.
   */
  @Get('page')
  page(@CurrentUser('id') userId: string) {
    return this.profiles.ownerPage(userId);
  }

  // A write per call and a delete behind it, so tighter than the global limit.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(200)
  @Patch('cover')
  setCover(@CurrentUser('id') userId: string, @Body() dto: SetCoverDto) {
    return this.profiles.setCover(userId, dto.key);
  }

  @HttpCode(200)
  @Delete('cover')
  removeCover(@CurrentUser('id') userId: string) {
    return this.profiles.removeCover(userId);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('handle-available')
  check(@CurrentUser('id') userId: string, @Query('handle') handle = '') {
    return this.profiles.checkHandle(userId, handle);
  }

  @HttpCode(200)
  @Patch('handle')
  setHandle(@CurrentUser('id') userId: string, @Body() dto: SetHandleDto) {
    return this.profiles.setHandle(userId, dto.handle);
  }

  @HttpCode(200)
  @Patch('publish')
  publish(@CurrentUser('id') userId: string, @Body() dto: PublishDto) {
    return this.profiles.setPublished(userId, dto.published);
  }
}
