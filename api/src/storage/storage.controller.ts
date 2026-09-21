import {
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import {
  AttachToAlbumDto,
  ConfirmUploadDto,
  CreateUploadUrlDto,
  ListFilesDto,
  ObjectKeyDto,
  ObjectKeysDto,
  WipeStorageDto,
  ZipSelectionDto,
} from './dto/storage.dto';
import { StorageConfig } from './storage.config';
import { StorageService } from './storage.service';
import { ThumbnailsService } from './thumbnails.service';
import { streamZip } from './zip';

/**
 * Object storage (Backblaze B2).
 *
 * Every route is authenticated by the global guard, and every object key is
 * scoped to `users/<callerId>/`. Keys are issued by the server on upload and
 * re-validated on read and delete.
 *
 * POST throughout rather than REST-shaped paths because object keys contain
 * slashes and do not survive being a path segment.
 */
@Controller('storage')
export class StorageController {
  private readonly logger = new Logger(StorageController.name);

  constructor(
    private readonly storage: StorageService,
    private readonly thumbs: ThumbnailsService,
    private readonly config: StorageConfig,
  ) {}

  // Issuing signed URLs is cheap but not free, and each one is a write
  // capability against the bucket. Tighter than the global limit.
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(200)
  @Post('upload-url')
  createUploadUrl(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateUploadUrlDto,
  ) {
    return this.storage.createUploadUrl(userId, {
      contentType: dto.contentType,
      scope: dto.scope,
      contentLength: dto.contentLength,
    });
  }

  @HttpCode(200)
  @Post('download-url')
  async createDownloadUrl(
    @CurrentUser('id') userId: string,
    @Body() dto: ObjectKeyDto,
  ) {
    const url = await this.storage.createDownloadUrl(userId, dto.key);
    return { url };
  }

  /**
   * Verifies an upload actually landed before a row is pointed at it, and
   * makes the thumbnail the client gallery renders from.
   *
   * Awaited rather than fired and forgotten. It does cost the uploader the
   * round trip, but "confirm returned" then means the thumbnail exists or was
   * declined for a reason — where a background job leaves a gallery whose
   * tiles silently fall back to full-size originals, and loses the work
   * entirely if the container restarts mid-flight. `generate` never throws, so
   * a failure here still returns a successful confirm.
   *
   * Avatars take the other branch. They used to get a thumbnail like anything
   * else, and it was never read once — `avatar_url` points at the original —
   * so every avatar wrote a second object nothing loaded, and replacing one
   * orphaned that object forever. Resizing the original in place is what the
   * thumbnail was pretending to do, and it makes the stored file the size it
   * is actually displayed at.
   */
  @HttpCode(200)
  @Post('confirm')
  async confirm(
    @CurrentUser('id') userId: string,
    @Body() dto: ConfirmUploadDto,
  ) {
    const result = await this.storage.statObject(
      userId,
      dto.key,
      dto.albumId,
      dto.originalName,
    );
    if (!result.exists) return result;

    if (this.config.isAvatarKey(dto.key)) {
      const resized = await this.thumbs.normaliseAvatar(
        dto.key,
        result.contentType ?? null,
        result.size,
      );
      // Report what is actually stored, so the client's `size` is not the
      // number of bytes it sent a moment ago.
      return resized ? { ...result, ...resized } : result;
    }

    await this.thumbs.generate(dto.key, result.contentType ?? null, result.size);
    return result;
  }

  /** Objects this user has stored, optionally narrowed to one album. */
  @Get('files')
  list(@CurrentUser('id') userId: string, @Query() query: ListFilesDto) {
    return this.storage.listFiles(userId, {
      albumId: query.albumId,
      limit: query.limit,
      cursor: query.cursor,
      kind: query.kind,
      order: query.order,
      section: query.section,
      picked: query.picked,
    });
  }

  /** Objects uploaded before an album was chosen. */
  @Get('files/unassigned')
  listUnassigned(
    @CurrentUser('id') userId: string,
    @Query() query: ListFilesDto,
  ) {
    return this.storage
      .listUnassigned(userId, query.limit)
      .then((data) => ({ data, total: data.length }));
  }

  /** Storage split by album and media type. */
  @Get('breakdown')
  breakdown(@CurrentUser('id') userId: string) {
    return this.storage.breakdown(userId);
  }

  /** Files an already-uploaded object into one of the caller's albums. */
  @HttpCode(200)
  @Post('attach')
  attach(
    @CurrentUser('id') userId: string,
    @Body() dto: AttachToAlbumDto,
  ) {
    return this.storage.attachToAlbum(userId, dto.keys, dto.albumId);
  }

  /**
   * Deletes every object this user has stored. Irreversible.
   *
   * Rate-limited hard: there is no legitimate reason to call this repeatedly,
   * and it is the most destructive route in the API.
   */
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
  @HttpCode(200)
  @Post('wipe')
  wipe(@CurrentUser('id') userId: string, @Body() _dto: WipeStorageDto) {
    return this.storage.wipeAll(userId);
  }

  @HttpCode(204)
  @Post('delete')
  async remove(
    @CurrentUser('id') userId: string,
    @Body() dto: ObjectKeyDto,
  ): Promise<void> {
    await this.storage.deleteObject(userId, dto.key);
  }

  /**
   * Deletes a selection. One request and one answer, rather than a client
   * firing two hundred deletes and reconciling two hundred results.
   */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @Post('delete-many')
  removeMany(
    @CurrentUser('id') userId: string,
    @Body() dto: ObjectKeysDto,
  ) {
    return this.storage.deleteMany(userId, dto.keys);
  }

  /** Issues a ticket for downloading a selection as one zip. */
  @HttpCode(200)
  @Post('zip')
  zipTicket(
    @CurrentUser('id') userId: string,
    @Body() dto: ZipSelectionDto,
  ) {
    return this.storage.issueZipTicket(userId, dto.albumId, dto.keys);
  }

  /**
   * The zip a ticket names. Public because it is reached by navigation, which
   * carries no bearer header — the ticket is the credential, and it is short
   * lived, bound to its keys, and re-authorised against the album here.
   */
  @Public()
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Get('zip/:token')
  async zip(@Param('token') token: string, @Res() res: Response): Promise<void> {
    let download: Awaited<ReturnType<StorageService['redeemZipTicket']>>;
    try {
      download = await this.storage.redeemZipTicket(token);
    } catch {
      // A navigation, so a sentence rather than a JSON error body.
      res.status(404).type('text/plain').send('This download has expired. Start it again from the album.');
      return;
    }
    await streamZip(
      res,
      download.zipName,
      download.files,
      (key) => this.storage.readStream(key),
      this.logger,
    );
  }
}
