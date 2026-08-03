import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsBoolean, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
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
 * The public profile page's data.
 *
 * Its own controller, separate from the authenticated settings below, so the
 * `@Public()` blast radius is one route rather than a class. Auth is
 * deny-by-default here (JwtAuthGuard is a global APP_GUARD), and this is the
 * deliberate exception.
 */
@Controller('profiles')
export class PublicProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  /**
   * Handles published in the sitemap.
   *
   * Before `:handle`, or "sitemap" would be read as somebody's handle — which
   * is also why it is on the reserved list.
   */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get('sitemap')
  async sitemap() {
    const data = await this.profiles.publishedHandles();
    return { data, total: data.length };
  }

  /**
   * One public profile.
   *
   * Rate-limited like the public album page: it reads across accounts and is
   * reachable without a token, so repeated calls should not be free.
   */
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get(':handle')
  get(@Param('handle') handle: string) {
    return this.profiles.publicProfile(handle);
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
