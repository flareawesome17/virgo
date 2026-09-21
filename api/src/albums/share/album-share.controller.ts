import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Logger,
  Param,
  Req,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Transform, Type } from 'class-transformer';
import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../auth/current-user.decorator';
import { Public } from '../../auth/public.decorator';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  ALL_MEDIA_KINDS,
  AlbumShareService,
  type MediaKind,
  safeFileStem,
} from './album-share.service';
import { streamZip } from '../../storage/zip';
import { VisitsService } from '../../visits/visits.service';
import {
  renderClientGallery,
  renderLinkUnavailable,
} from './client-gallery.template';

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

export class PublicGalleryQueryDto {
  @IsOptional()
  @IsIn(ALL_MEDIA_KINDS)
  kind?: MediaKind;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  /** One chapter: a section id. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  section?: string;

  /** `true` for only the client's picks. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  picked?: boolean;
}

export class SetPickDto {
  /** The file's id from the page — never its object key, which names the owner. */
  @IsUUID()
  id!: string;

  @IsBoolean()
  picked!: boolean;
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
  private readonly logger = new Logger(PublicAlbumController.name);

  constructor(
    private readonly share: AlbumShareService,
    private readonly visits: VisitsService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get(':token')
  @Header('Content-Type', 'text/html; charset=utf-8')
  // Shared links are handed to clients directly; keeping them out of search
  // results and caches matters more than the bandwidth saved.
  @Header('X-Robots-Tag', 'noindex, nofollow')
  @Header('Cache-Control', 'no-store')
  async page(
    @Param('token') token: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const nonce = randomBytes(16).toString('base64url');
    // Overrides helmet's global policy, which allows images only from 'self'
    // and has no media-src — that blocked every CDN-hosted photo, video and
    // audio file on this page.
    res.setHeader(
      'Content-Security-Policy',
      this.share.contentSecurityPolicy(nonce),
    );
    // Helmet also sets same-origin CORP globally. The CDN is a different
    // origin, so embedding its responses has to be permitted here.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');

    let view: Awaited<ReturnType<typeof this.share.resolve>>;
    try {
      view = await this.share.resolve(token);
    } catch {
      // Caught here rather than left to Nest's exception filter: this route
      // declares Content-Type: text/html, so the filter's JSON body reached
      // the browser as a raw {"message":...,"statusCode":403} blob. The status
      // is still 403 — only the body changes.
      res.status(403).send(renderLinkUnavailable());
      return;
    }

    // Counted here rather than by a beacon in the page. This route's CSP is
    // `script-src 'none'` — the gallery runs no JavaScript at all — and
    // loosening that so the page could report on itself would be trading a
    // real security property for a number. The server already knows the
    // request happened.
    //
    // `/s` is what lands in the table; VisitsService strips the token, which
    // is the credential to this gallery and must never be stored.
    void this.visits
      .record({
        host: req.headers.host ?? 'client.virgo.ph',
        path: '/s',
        referrer: req.headers.referer,
        ip:
          (req.headers['cf-connecting-ip'] as string) ||
          (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
          req.ip ||
          'unknown',
        userAgent: req.headers['user-agent'] ?? '',
      })
      // A counter must never cost somebody their delivery.
      .catch((err: unknown) =>
        this.logger.warn(`Visit not recorded: ${String(err)}`),
      );

    res.send(renderClientGallery(view, token, nonce));
  }

  /**
   * Every file the link covers, as one streamed zip.
   *
   * Streamed, never assembled. A wedding delivery is routinely several
   * gigabytes; building that in memory or on disk first would hold the whole
   * album in the container for the length of the download and fall over on
   * the second client who clicked at the same time. Objects are pulled from
   * B2 one at a time and piped straight out, so memory stays flat regardless
   * of album size.
   *
   * Stored, not deflated. JPEG, H.264 and AAC are already compressed —
   * deflate would spend real CPU per byte to save approximately none.
   *
   * No Content-Length is possible for a stream like this, so the browser
   * shows an indeterminate progress bar. That is the accepted cost of not
   * buffering; the alternative is making the client wait with no feedback at
   * all while the server assembles gigabytes.
   */
  @Public()
  // Far tighter than the page: this one moves the whole album per call.
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Get(':token/download.zip')
  async downloadAll(@Param('token') token: string, @Res() res: Response) {
    const { albumName, files } = await this.share.filesForDownload(token);

    if (files.length === 0) {
      res.status(404).json({ message: 'Nothing to download' });
      return;
    }

    await streamZip(
      res,
      `${safeFileStem(albumName)}.zip`,
      files,
      (key) => this.share.streamFor(key),
      this.logger,
    );
  }

  /**
   * Only what the client picked, as one zip — the whole album is often tens
   * of gigabytes on mobile data, and the picks are the part they came for.
   */
  @Public()
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Get(':token/picks.zip')
  async downloadPicks(@Param('token') token: string, @Res() res: Response) {
    const { albumName, files } = await this.share.picksForDownload(token);

    if (files.length === 0) {
      res.status(404).json({ message: 'Nothing picked yet' });
      return;
    }

    await streamZip(
      res,
      `${safeFileStem(albumName)}.zip`,
      files,
      (key) => this.share.streamFor(key),
      this.logger,
    );
  }

  /**
   * Marks or unmarks one file. Generous, because it is a tap per photograph
   * and somebody working through a wedding taps quickly.
   */
  @Public()
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  @HttpCode(200)
  @Post(':token/picks')
  setPick(@Param('token') token: string, @Body() dto: SetPickDto) {
    return this.share.setPick(token, dto.id, dto.picked);
  }

  /**
   * Tells the photographer the selection is done. Tight: it sends a
   * notification, and a button held down should not send twenty.
   */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @HttpCode(200)
  @Post(':token/picks/send')
  sendPicks(@Param('token') token: string) {
    return this.share.sendPicks(token);
  }

  /** JSON form of the same view, for anything that wants to render its own UI. */
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get(':token/data')
  data(
    @Param('token') token: string,
    @Query() query: PublicGalleryQueryDto,
  ) {
    return this.share.resolve(token, query);
  }
}
