import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Public } from '../auth/public.decorator';
import { CLIENT_PLATFORMS, type ClientPlatform } from './app-update-targeting';
import { AppUpdatesService } from './app-updates.service';

const VERSION = /^v?\d{1,6}(\.\d{1,6}){0,3}$/;

export class AnnounceUpdateDto {
  /**
   * The announcement's identity. Posting the same slug again is a no-op, so a
   * re-run workflow cannot announce one update twice or buzz a phone twice.
   */
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9.-]{2,79}$/, {
    message: 'slug must be 3–80 lowercase letters, digits, dots or dashes',
  })
  slug!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CLIENT_PLATFORMS.length)
  @ArrayUnique()
  @IsIn(CLIENT_PLATFORMS, { each: true })
  platforms!: ClientPlatform[];

  /** Inclusive. An OTA sets both bounds to the one native version it reaches. */
  @IsOptional()
  @Matches(VERSION, { message: 'minVersion must be a version number' })
  minVersion?: string;

  @IsOptional()
  @Matches(VERSION, { message: 'maxVersion must be a version number' })
  maxVersion?: string;

  /** What this update brings, for display. */
  @IsOptional()
  @Matches(VERSION, { message: 'version must be a version number' })
  version?: string;

  /** Short enough to read as a phone notification's first line. */
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  title!: string;

  /** A sentence or two about what changed, in the reader's terms. */
  @IsString()
  @MinLength(1)
  @MaxLength(600)
  body!: string;

  /** Opened when the announcement is tapped. https only. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^https:\/\/\S+$/, { message: 'url must be an https URL' })
  url?: string;

  /** Push to the phones it concerns. Defaults to true. */
  @IsOptional()
  @IsBoolean()
  push?: boolean;
}

/**
 * Where an update gets announced.
 *
 * Called by the "Announce an update" workflow, which holds the only copy of
 * APP_UPDATES_TOKEN outside this server. Public, because the workflow has no
 * account to sign in as; the token is the authentication. The body is
 * validated before the handler runs, so a malformed request is told what shape
 * is expected — that shape is in the repository anyway — but nothing is
 * written and nothing is sent until the token has been checked.
 */
@Controller('internal/app-updates')
export class AppUpdatesController {
  private readonly token: string;

  constructor(
    private readonly updates: AppUpdatesService,
    config: ConfigService,
  ) {
    this.token = config.get<string>('APP_UPDATES_TOKEN', '').trim();
  }

  /**
   * Compared as hashes, so the comparison takes the same time whatever the
   * lengths — timingSafeEqual refuses unequal lengths by throwing, and a
   * length that can be probed is a length an attacker no longer has to guess.
   */
  private authorise(header: string | undefined): void {
    if (!this.token) {
      throw new ServiceUnavailableException('APP_UPDATES_TOKEN is not set on this server');
    }
    const presented = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const a = createHash('sha256').update(presented).digest();
    const b = createHash('sha256').update(this.token).digest();
    if (!presented || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Bad token');
    }
  }

  @Public()
  @HttpCode(200)
  @Post()
  async announce(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: AnnounceUpdateDto,
  ) {
    this.authorise(authorization);
    return this.updates.announce({
      slug: dto.slug,
      platforms: dto.platforms,
      minVersion: dto.minVersion ?? null,
      maxVersion: dto.maxVersion ?? null,
      version: dto.version ?? null,
      title: dto.title.trim(),
      body: dto.body.trim(),
      url: dto.url ?? null,
      push: dto.push ?? true,
    });
  }
}
