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
import { DownloadCacheService } from '../../storage/download-cache.service';
import { ZipCacheService } from '../../storage/zip-cache.service';
import { contentDisposition } from '../../storage/download-names';
import { VisitsService } from '../../visits/visits.service';
import {
  DownloadAllowanceService,
  isResumedRange,
} from '../../quota/download-allowance.service';
import {
  renderClientGallery,
  renderDownloadsPaused,
  renderLinkUnavailable,
  renderZipFailed,
  renderZipPreparing,
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
    private readonly cache: DownloadCacheService,
    private readonly zips: ZipCacheService,
    private readonly allowance: DownloadAllowanceService,
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

    // Messenger, Facebook, Instagram, Line and Viber open links in their own
    // web view, which cannot save a download. Clients get this link from chat.
    const inAppBrowser = /FBAN|FBAV|FB_IAB|Messenger|Instagram|Line\/|Viber|MicroMessenger|TikTok/i.test(
      req.headers['user-agent'] ?? '',
    );
    res.send(renderClientGallery(view, token, nonce, inAppBrowser));
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
  // The page refreshes every few seconds while a zip builds, and a download
  // manager opens several connections; the expensive part is queued, not this.
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get(':token/download.zip')
  async downloadAll(
    @Param('token') token: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const { albumName, files, ownerId } = await this.share.filesForDownload(token);

    if (files.length === 0) {
      res.status(404).json({ message: 'Nothing to download' });
      return;
    }
    await this.serveZip(req, res, ownerId, `${safeFileStem(albumName)}.zip`, files);
  }

  /**
   * One zip, built on this host's disk first and then sent as an ordinary
   * file, so it has a length and honours Range: Chrome's Resume and download
   * managers work, and a storage hiccup costs a retry instead of the whole
   * download. While it is being built the address answers with a page that
   * refreshes itself (or a 503 with Retry-After to a client that is not a
   * browser), and the same address answers with the file once it is ready.
   */
  private async serveZip(
    req: Request,
    res: Response,
    ownerId: string,
    zipName: string,
    files: { key: string; name: string }[],
  ): Promise<void> {
    // A resume of a download already under way is never refused.
    if (!isResumedRange(req.headers.range) && !(await this.allowance.allows(ownerId))) {
      this.downloadsPaused(res);
      return;
    }
    if (!this.zips.enabled) {
      this.allowance.meter(ownerId, res);
      await streamZip(res, zipName, files, (key) => this.cacheStream(key), this.logger);
      return;
    }

    const entry = this.zips.request(ownerId, zipName, files, (key) => this.cacheStream(key));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');

    if (entry.state === 'ready') {
      const release = this.zips.hold(entry);
      res.on('close', release);
      this.allowance.meter(ownerId, res);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', contentDisposition(zipName));
      await new Promise<void>((resolve) =>
        res.sendFile(entry.path, { dotfiles: 'allow', headers: {} }, (err) => {
          if (err && !res.headersSent) {
            this.logger.warn(`Zip send failed: ${String(err)}`);
            res.status(503).type('text/plain').send('Please try again in a moment.');
          }
          resolve();
        }),
      );
      return;
    }

    const wantsPage = String(req.headers.accept ?? '').includes('text/html');
    if (entry.state === 'failed') {
      res.status(503).setHeader('Retry-After', '60');
      if (wantsPage) res.type('html').send(renderZipFailed());
      else res.type('text/plain').send('Could not prepare this download. Try again in a minute.');
      return;
    }
    res.status(wantsPage ? 200 : 503).setHeader('Retry-After', '3');
    if (wantsPage) {
      const position = entry.state === 'queued' ? this.zips.queuePosition(entry) : 0;
      res
        .type('html')
        .send(renderZipPreparing(entry.done, entry.total, position, this.zips.etaSeconds(entry)));
    } else {
      res.type('text/plain').send(`Preparing ${entry.done}/${entry.total}. Retry shortly.`);
    }
  }

  /**
   * One file, saved under its delivery name.
   *
   * A permanent address that redirects to a storage link signed at click time,
   * so the button never carries an expired or malformed signature. The 302 is
   * never cached: the target changes every hour.
   */
  @Public()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Get(':token/files/:fileId/download')
  async downloadOne(
    @Param('token') token: string,
    @Param('fileId') fileId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    let url: string;
    try {
      const target = await this.share.downloadTarget(token, fileId);
      // A resume of a download already under way is never refused; see
      // isResumedRange. It is still metered below.
      if (
        !isResumedRange(req.headers.range) &&
        !(await this.allowance.allows(target.ownerId))
      ) {
        this.downloadsPaused(res);
        return;
      }
      const ranged = typeof req.headers.range === 'string';
      if (
        await this.serveFromHost(target.key, target.name, target.ownerId, res, ranged)
      ) {
        return;
      }
      // Cache off or failed before any byte: B2's own signed link still works.
      url = await this.share.downloadLocation(token, fileId);
      // Storage serves those bytes, so nothing passes through to be measured;
      // the whole file is charged when the link is handed out.
      // A segment that starts past byte 0 is the same download continuing (a
      // resume, or one of a download manager's parallel pieces), so only the
      // first piece is charged for the file.
      if (!isResumedRange(req.headers.range)) {
        void this.allowance.record(target.ownerId, target.sizeBytes);
      }
    } catch (err) {
      this.logger.warn(`Single download refused: ${String(err)}`);
      res
        .status(404)
        .setHeader('Cache-Control', 'no-store')
        .type('html')
        .send(renderLinkUnavailable());
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.redirect(302, url);
  }

  /**
   * The answer to a new download while the gallery's owner has used their
   * month. A page rather than JSON: the client got here by following a link,
   * so this is what their browser shows. 429 because it is a limit that lifts
   * on its own, not a link that has stopped working.
   */
  private downloadsPaused(res: Response): void {
    res
      .status(429)
      .setHeader('Cache-Control', 'no-store')
      .setHeader('X-Robots-Tag', 'noindex, nofollow')
      .type('html')
      .send(renderDownloadsPaused());
  }

  /** Zip entries come through the host's disk cache, falling back to B2 itself. */
  private async cacheStream(key: string) {
    try {
      return (await this.cache.open(key)).stream;
    } catch {
      return this.share.streamFor(key);
    }
  }

  /**
   * Sends one file from this host's disk (filling the cache from B2 on the
   * first request). Returns false, with nothing written, if it could not.
   * A cache hit is a plain file send, so Range and resume work for free.
   */
  private async serveFromHost(
    key: string,
    name: string,
    ownerId: string,
    res: Response,
    ranged = false,
  ): Promise<boolean> {
    if (!this.cache.enabled) return false;
    const headers = {
      'Content-Disposition': contentDisposition(name),
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    };
    try {
      const hit = await this.cache.lookup(key);
      if (hit) {
        this.allowance.meter(ownerId, res);
        await new Promise<void>((resolve) =>
          res.sendFile(hit.path, { headers, dotfiles: 'allow' }, () => resolve()),
        );
        return true;
      }
      // A first, uncached download is piped from storage and cannot honour a
      // Range. Storage's own signed link can, so hand ranged requests to it
      // rather than answer 200 with the whole file to a resume.
      if (ranged) return false;
      const { stream, size } = await this.cache.open(key);
      this.allowance.meter(ownerId, res);
      res.set(headers);
      res.type('application/octet-stream');
      if (size !== undefined) res.setHeader('Content-Length', String(size));
      stream.on('error', () => res.destroy());
      stream.pipe(res);
      await new Promise<void>((resolve) => res.on('close', () => resolve()));
      return true;
    } catch (err) {
      if (res.headersSent) return true;
      this.logger.warn(`Host download failed, falling back to storage link: ${String(err)}`);
      return false;
    }
  }

  /**
   * Only what the client picked, as one zip — the whole album is often tens
   * of gigabytes on mobile data, and the picks are the part they came for.
   */
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get(':token/picks.zip')
  async downloadPicks(
    @Param('token') token: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const { albumName, files, ownerId } = await this.share.picksForDownload(token);

    if (files.length === 0) {
      res.status(404).json({ message: 'Nothing picked yet' });
      return;
    }
    await this.serveZip(req, res, ownerId, `${safeFileStem(albumName)}.zip`, files);
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
