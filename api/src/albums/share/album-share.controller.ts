import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../auth/current-user.decorator';
import { Public } from '../../auth/public.decorator';
import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsOptional } from 'class-validator';
import {
  ALL_MEDIA_KINDS,
  AlbumShareService,
  type MediaKind,
} from './album-share.service';
import { renderClientGallery } from './client-gallery.template';

/**
 * Which media the link should expose. Omitted means everything, so a client
 * calling the old shape still gets the previous behaviour.
 */
export class CreateShareLinkDto {
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(3)
  @IsIn(ALL_MEDIA_KINDS, { each: true })
  kinds?: MediaKind[];
}

/** Owner-facing: create, read and revoke an album's client link. */
@Controller('albums/:albumId/share')
export class AlbumShareController {
  constructor(private readonly share: AlbumShareService) {}

  @Get()
  find(@CurrentUser('id') userId: string, @Param('albumId') albumId: string) {
    return this.share.find(userId, albumId);
  }

  @HttpCode(200)
  @Post()
  create(
    @CurrentUser('id') userId: string,
    @Param('albumId') albumId: string,
    @Body() dto: CreateShareLinkDto,
  ) {
    return this.share.createOrGet(userId, albumId, dto.kinds ?? ALL_MEDIA_KINDS);
  }

  @Delete()
  revoke(@CurrentUser('id') userId: string, @Param('albumId') albumId: string) {
    return this.share.revoke(userId, albumId);
  }
}

/**
 * Public: what the client actually opens.
 *
 * Unauthenticated by design, so it is rate-limited per IP — a share token is a
 * bearer credential and this is the only route that accepts one.
 */
@Controller('s')
export class PublicAlbumController {
  constructor(private readonly share: AlbumShareService) {}

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get(':token')
  @Header('Content-Type', 'text/html; charset=utf-8')
  // Shared links are handed to clients directly; keeping them out of search
  // results and caches matters more than the bandwidth saved.
  @Header('X-Robots-Tag', 'noindex, nofollow')
  @Header('Cache-Control', 'no-store')
  async page(@Param('token') token: string, @Res() res: Response) {
    const view = await this.share.resolve(token);

    // Overrides helmet's global policy, which allows images only from 'self'
    // and has no media-src — that blocked every CDN-hosted photo, video and
    // audio file on this page.
    res.setHeader('Content-Security-Policy', this.share.contentSecurityPolicy());
    // Helmet also sets same-origin CORP globally. The CDN is a different
    // origin, so embedding its responses has to be permitted here.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');

    res.send(renderClientGallery(view));
  }

  /** JSON form of the same view, for anything that wants to render its own UI. */
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get(':token/data')
  data(@Param('token') token: string) {
    return this.share.resolve(token);
  }
}
