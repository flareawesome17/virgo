import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  AttachToAlbumDto,
  ConfirmUploadDto,
  CreateUploadUrlDto,
  ListFilesDto,
  ObjectKeyDto,
  WipeStorageDto,
} from './dto/storage.dto';
import { StorageService } from './storage.service';

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
  constructor(private readonly storage: StorageService) {}

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

  /** Verifies an upload actually landed before a row is pointed at it. */
  @HttpCode(200)
  @Post('confirm')
  confirm(@CurrentUser('id') userId: string, @Body() dto: ConfirmUploadDto) {
    return this.storage.statObject(userId, dto.key, dto.albumId);
  }

  /** Objects this user has stored, optionally narrowed to one album. */
  @Get('files')
  list(@CurrentUser('id') userId: string, @Query() query: ListFilesDto) {
    return this.storage
      .listFiles(userId, { albumId: query.albumId, limit: query.limit })
      .then((data) => ({ data, total: data.length }));
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
}
