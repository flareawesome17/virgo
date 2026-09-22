import {
  BadRequestException,
  Body,
  ConflictException,
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
      albumId: dto.albumId,
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
   *
   * Covers take a third branch and never reach `generate` either. They are
   * re-encoded in place like an avatar, as a 2048 px WebP.
   *
   * For both, the re-encode is what strips the camera's EXIF and GPS from an
   * image at a permanent public URL, so a profile photo it fails on is
   * deleted and the confirm refused. An album upload that cannot be
   * thumbnailed is still a photograph somebody delivered; an original in the
   * public bucket that could not be cleaned is a leak.
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
      // A profile photo is never filed into an album, which could be deleted
      // or swept by retention and take it along. Ignored rather than refused,
      // so no installed client that sends one breaks.
      this.config.isPublicKey(dto.key) ? undefined : dto.albumId,
      dto.originalName,
    );
    if (!result.exists) return result;

    if (this.config.isCoverKey(dto.key)) {
      const cover = await this.thumbs.normaliseCover(
        dto.key,
        result.contentType ?? null,
        result.size,
      );
      if (!cover) {
        await this.discardUnusable(userId, dto.key);
        throw new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          code: 'COVER_UNUSABLE',
          message: "That photo couldn't be used as a cover. Try a different one.",
        });
      }
      return { ...result, size: cover.size, contentType: cover.contentType };
    }

    if (this.config.isAvatarKey(dto.key)) {
      const resized = await this.thumbs.normaliseAvatar(
        dto.key,
        result.contentType ?? null,
        result.size,
      );
      if (!resized) {
        await this.discardUnusable(userId, dto.key);
        throw new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          code: 'AVATAR_UNUSABLE',
          message: "That photo couldn't be used. Try a different one.",
        });
      }
      // Report what is actually stored, so the client's `size` is not the
      // number of bytes it sent a moment ago.
      return { ...result, ...resized };
    }

    // Once per file. A client that stopped waiting sends the same confirm
    // again, and the photograph it names is finished already, or is being
    // made right now by the first request.
    await this.thumbs.generateOnce(dto.key, result.contentType ?? null, result.size);
    return result;
  }

  /**
   * Deletes a profile photo that could not be re-encoded.
   *
   * Best effort: the confirm is refused either way, and a delete that did not
   * land is logged rather than put in front of the person, who can do nothing
   * about it. Nothing points at the object yet — the client sets an avatar or
   * cover only after this request succeeds.
   */
  private async discardUnusable(userId: string, key: string): Promise<void> {
    try {
      await this.storage.deleteObject(userId, key);
    } catch (err) {
      this.logger.error(`Could not remove unusable profile photo ${key}: ${String(err)}`);
    }
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
    // The profile cover goes with everything else, and comes off the profile
    // once its object is really gone. wipeAll does both, so account deletion
    // gets the same.
    return this.storage.wipeAll(userId);
  }

  @HttpCode(204)
  @Post('delete')
  async remove(
    @CurrentUser('id') userId: string,
    @Body() dto: ObjectKeyDto,
  ): Promise<void> {
    await this.assertNotCover(userId, [dto.key]);
    await this.storage.deleteObject(userId, dto.key);
  }

  /**
   * Deletes a selection. One request and one answer, rather than a client
   * firing two hundred deletes and reconciling two hundred results.
   *
   * Refused whole when the selection holds the profile cover, as it is when
   * it holds a file the caller may not delete: all or nothing, never half.
   */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @Post('delete-many')
  async removeMany(
    @CurrentUser('id') userId: string,
    @Body() dto: ObjectKeysDto,
  ) {
    await this.assertNotCover(userId, dto.keys);
    return this.storage.deleteMany(userId, dto.keys);
  }

  /**
   * Refuses to delete the photo the caller's profile is using as its cover.
   *
   * The app deletes a cover it uploaded when saving it is refused, and a
   * save whose answer was lost on the way back looks refused while having
   * landed. Deleting then leaves the profile pointing at an object that is
   * gone, on a page strangers see. Whatever users.cover_url names at this
   * moment is not the file list's to delete: taking a cover off is DELETE
   * /me/profile/cover, which deletes its object as well.
   *
   * Here, on the routes a client calls, and not in StorageService. The
   * server's own deletes each know which cover they mean — the one a save
   * replaced, a stray, an upload confirm could not use — and none of them is
   * the one in use.
   */
  private async assertNotCover(userId: string, keys: readonly string[]): Promise<void> {
    const cover = await this.storage.coverKeyOf(userId);
    if (cover && keys.includes(cover)) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: 'COVER_IN_USE',
        message: 'That photo is your profile cover. Change or remove your cover first.',
      });
    }
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
