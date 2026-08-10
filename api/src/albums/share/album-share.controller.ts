import { ZipArchive } from 'archiver';
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Logger,
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
  safeFileStem,
} from './album-share.service';
import { contentDisposition } from '../../storage/storage.service';
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
    // Overrides helmet's global policy, which allows images only from 'self'
    // and has no media-src — that blocked every CDN-hosted photo, video and
    // audio file on this page.
    res.setHeader('Content-Security-Policy', this.share.contentSecurityPolicy());
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

    res.send(renderClientGallery(view, token));
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

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      contentDisposition(`${safeFileStem(albumName)}.zip`),
    );
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');

    // archiver v8 dropped the callable default in favour of the classes.
    // `store` skips deflate: JPEG, H.264 and AAC are already compressed, so
    // it would burn CPU per byte to save approximately none.
    const archive = new ZipArchive({ store: true });

    // A failure mid-stream cannot become a 500: headers are long gone and the
    // client is already receiving zip bytes. Destroying the socket is what
    // makes their download fail visibly as a truncated file rather than
    // completing as a silently incomplete one.
    archive.on('error', (err: Error) => {
      this.logger.error(`Zip failed for album "${albumName}": ${err.message}`);
      res.destroy(err);
    });
    // A client who cancels mid-download leaves us pulling the rest of the
    // album from B2 for nobody.
    res.on('close', () => {
      if (!res.writableEnded) archive.abort();
    });

    archive.pipe(res);

    for (const file of files) {
      try {
        archive.append(await this.share.streamFor(file.key), { name: file.name });
      } catch (err) {
        // One unreadable object should not cost the client the other 199.
        this.logger.warn(`Skipped ${file.key} in zip: ${String(err)}`);
      }
    }

    await archive.finalize();
  }

  /** JSON form of the same view, for anything that wants to render its own UI. */
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get(':token/data')
  data(@Param('token') token: string) {
    return this.share.resolve(token);
  }
}
