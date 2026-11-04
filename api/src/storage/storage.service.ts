import { randomBytes, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Agent as HttpsAgent } from 'node:https';
import type { Readable } from 'node:stream';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { MediaLinkService } from './media-link.service';
import {
  classifyUploadMatches,
  normaliseEtag,
  sourceModifiedAt,
  type UploadMatch,
} from './upload-dedup';
import { sendContentMd5OnBulkDelete } from './bulk-delete-md5';
import { WorkspaceActivityService } from '../workspaces/workspace-activity.service';
import { contentDisposition, safeFileStem, uniqueNames } from './download-names';
import {
  accessAllows,
  QuotaService,
  type FileOrder,
  type MediaAccess,
  type ResolvedAccess,
  type StoredMediaKind,
} from '../quota/quota.service';
import {
  ALLOWED_CONTENT_TYPES,
  COVER_CONTENT_TYPES,
  DISPLAY_URL_TTL_SECONDS,
  DOWNLOAD_URL_TTL_SECONDS,
  EXTENSION_BY_CONTENT_TYPE,
  IMMUTABLE_CACHE_CONTROL,
  MAX_AVATAR_BYTES,
  MAX_COVER_BYTES,
  MAX_UPLOAD_BYTES,
  MULTIPART_MAX_BYTES,
  MULTIPART_MAX_PARTS,
  MULTIPART_PART_BYTES,
  PROFILE_PHOTO_CONTENT_TYPES,
  signingWindowFor,
  StorageConfig,
  UPLOAD_URL_TTL_SECONDS,
  type UploadScope,
} from './storage.config';

/** Long enough to click the link, short enough to be useless if it leaks. */
const ZIP_TICKET_TTL_SECONDS = 10 * 60;

export interface UploadTicket {
  key: string;
  uploadUrl: string;
  publicUrl: string | null;
  /** The client MUST send exactly these headers or the signature will not match. */
  requiredHeaders: Record<string, string>;
  expiresAt: string;
}

export interface MultipartStart {
  key: string;
  uploadId: string;
  /** Every part is this many bytes except the last. */
  partSize: number;
  partCount: number;
}

export interface PartTicket {
  uploadUrl: string;
  /** The client MUST send exactly these headers or the signature will not match. */
  requiredHeaders: Record<string, string>;
  expiresAt: string;
}

// Lives beside the zip streamer, which needs it and must not import this file
// back; re-exported so it resolves where it always has.
export { contentDisposition } from './download-names';

/**
 * Backblaze B2 via its S3-compatible API.
 *
 * Uploads use presigned URLs: the client PUTs directly to B2 and file bytes
 * never transit this server. Proxying them instead would put every photo and
 * video through the API's memory and bandwidth, which is the fastest way to
 * make a media app fall over.
 */
/**
 * How many single deletes are in flight at once when DeleteObjects cannot be
 * used. A pool rather than rounds: in rounds of eight, each round waited on
 * its slowest request, and one slow handshake held up seven finished ones.
 */
const SINGLE_DELETE_CONCURRENCY = 16;

/**
 * Files per step of a selection's delete. Each step's files are forgotten as
 * soon as their objects are gone, so a long delete that outlives the app's
 * wait has still removed what it got through, rather than nothing until the
 * very end.
 */
const DELETE_CHUNK_FILES = 100;

/** Keys the server mints for itself, outside any user's prefix. */
const SERVER_KEY = /^(support|receipts)\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/;

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client | null;
  /**
   * Used only for the HEAD that confirms an upload. On its own small pool of
   * connections it never queues behind a burst of full-size reads (the
   * thumbnail work), which starved confirms into "Could not reach storage"
   * on large batches.
   */
  private readonly metaClient: S3Client | null;

  constructor(
    private readonly config: StorageConfig,
    private readonly quota: QuotaService,
    private readonly mediaLink: MediaLinkService,
    private readonly feed: WorkspaceActivityService,
  ) {
    this.client = config.isConfigured
      ? new S3Client({
          endpoint: config.endpoint,
          region: config.region,
          credentials: {
            accessKeyId: config.keyId,
            secretAccessKey: config.applicationKey,
          },
          forcePathStyle: config.forcePathStyle,
          /**
           * The SDK's defaults assume a fast, close network. On a home
           * connection behind Docker's NAT the TLS handshake to B2 measures
           * 8+ seconds, which blew the default connection timeout and
           * surfaced to users as "Could not reach storage" on a file that had
           * in fact uploaded perfectly.
           *
           * A NodeHttpHandler instance rather than the plain-object form: the
           * object form was silently ignored here, leaving the ~1s default in
           * place.
           *
           * These calls carry metadata only — a HEAD or a DELETE, never the
           * bytes, which go straight from the device to the bucket — so
           * waiting longer costs nothing but a slower failure in the
           * genuinely-broken case. The keep-alive agent means the expensive
           * handshake is paid once rather than per request.
           */
          requestHandler: new NodeHttpHandler({
            connectionTimeout: 20_000,
            requestTimeout: 30_000,
            httpsAgent: new HttpsAgent({ keepAlive: true, maxSockets: 50 }),
          }),
          // Three attempts with the SDK's own backoff, so one slow handshake
          // does not fail a confirm that would have worked on a retry.
          maxAttempts: 3,
        })
      : null;
    this.metaClient = config.isConfigured
      ? new S3Client({
          endpoint: config.endpoint,
          region: config.region,
          credentials: {
            accessKeyId: config.keyId,
            secretAccessKey: config.applicationKey,
          },
          forcePathStyle: config.forcePathStyle,
          requestHandler: new NodeHttpHandler({
            connectionTimeout: 20_000,
            requestTimeout: 30_000,
            httpsAgent: new HttpsAgent({ keepAlive: true, maxSockets: 12 }),
          }),
          maxAttempts: 4,
        })
      : null;
    if (this.client) sendContentMd5OnBulkDelete(this.client);
  }

  /**
   * Set once DeleteObjects has been refused as a request, so later deletes
   * go straight to deleting one object at a time. Per process: a deploy that
   * fixes the store, or a new store, gets asked again.
   */
  private bulkDeleteRefused = false;

  /**
   * Deletes objects, and returns the keys confirmed gone. Never throws.
   *
   * DeleteObjects first: a thousand at a time, one request per bucket, sent
   * with the Content-MD5 B2 wants (see bulk-delete-md5). Whatever it did not
   * confirm gone, because the request was refused or the key came back in its
   * Errors, is tried again on its own with DeleteObject, which carries no
   * checksum — the path every delete took while B2 refused the SDK's own
   * checksum, and still the one taken if a store refuses DeleteObjects.
   *
   * Logs counts and codes, never keys: a log line naming a client's files
   * outlives the files.
   */
  private async deleteFromBuckets(
    keys: readonly string[],
    context: string,
  ): Promise<Set<string>> {
    const client = this.requireClient();
    const gone = new Set<string>();
    const retry: string[] = [];
    const describe = (err: unknown) => {
      const e = err as { name?: string; Code?: string; message?: string; $metadata?: { httpStatusCode?: number } };
      return `${e.$metadata?.httpStatusCode ?? '?'} ${e.Code ?? e.name ?? 'Error'}: ${String(e.message ?? err).slice(0, 160)}`;
    };

    for (let i = 0; i < keys.length; i += 1000) {
      const batch = keys.slice(i, i + 1000);
      if (this.bulkDeleteRefused) {
        retry.push(...batch);
        continue;
      }
      const byBucket = new Map<string, string[]>();
      for (const key of batch) {
        const bucket = this.config.bucketForKey(key);
        byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), key]);
      }
      await Promise.all(
        [...byBucket].map(async ([Bucket, list]) => {
          try {
            const result = await client.send(
              new DeleteObjectsCommand({
                Bucket,
                Delete: { Objects: list.map((Key) => ({ Key })), Quiet: false },
              }),
            );
            for (const item of result.Deleted ?? []) if (item.Key) gone.add(item.Key);
            const errors = result.Errors ?? [];
            if (errors.length > 0) {
              this.logger.warn(
                `${context}: ${errors.length} object(s) refused by DeleteObjects (${errors[0].Code ?? 'unknown'}); trying them one at a time`,
              );
            }
            for (const key of list) if (!gone.has(key)) retry.push(key);
          } catch (err) {
            // Refused as a request, rather than lost on the way: it will be
            // refused the same way next time.
            const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
            if (status === 400 || status === 501) this.bulkDeleteRefused = true;
            this.logger.warn(`${context}: DeleteObjects failed (${describe(err)}); deleting one at a time`);
            retry.push(...list);
          }
        }),
      );
    }

    // A pool of a few: hundreds at once would trip the store's rate limits.
    let next = 0;
    let failed = 0;
    let reason = '';
    const worker = async () => {
      while (next < retry.length) {
        const Key = retry[next];
        next += 1;
        try {
          await client.send(new DeleteObjectCommand({ Bucket: this.config.bucketForKey(Key), Key }));
          gone.add(Key);
        } catch (err) {
          failed += 1;
          reason ||= describe(err);
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(SINGLE_DELETE_CONCURRENCY, retry.length) }, worker),
    );
    if (failed > 0) this.logger.warn(`${context}: ${failed} object(s) could not be deleted (${reason})`);
    return gone;
  }

  private requireClient(): S3Client {
    if (!this.client) {
      throw new ServiceUnavailableException('Storage is not configured');
    }
    return this.client;
  }

  /**
   * Every object lives under `users/<userId>/`. The prefix is the ownership
   * boundary — it is what makes assertOwned meaningful, and it is why keys are
   * generated here rather than accepted from the client. A client-supplied key
   * would let anyone write to `users/<someone-else>/avatars/...` and overwrite
   * another user's files.
   */
  private buildKey(
    userId: string,
    scope: UploadScope,
    contentType: string,
  ): string {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const ext = EXTENSION_BY_CONTENT_TYPE[contentType] ?? 'bin';
    return `users/${userId}/${scope}/${year}/${month}/${randomUUID()}.${ext}`;
  }

  /**
   * Rejects a key that is malformed before it is used for anything.
   *
   * Traversal and absolute forms are refused first, so `users/<me>/../<them>/x.jpg`
   * cannot slip past a prefix comparison further down.
   */
  private assertSafeKey(key: string): void {
    if (!this.isSafeKey(key)) {
      throw new BadRequestException('Invalid object key');
    }
  }

  /** `assertSafeKey` as a test, for a caller that skips a bad key rather than failing. */
  private isSafeKey(key: string): boolean {
    return (
      !!key &&
      !key.includes('..') &&
      !key.startsWith('/') &&
      !key.includes('//') &&
      !key.includes('\\')
    );
  }

  /**
   * Rejects any key that is not inside the caller's own prefix.
   *
   * Still the right check for keys the caller minted themselves — confirming
   * and filing their own uploads. Not for rows merely billed to them: a
   * collaborator's upload into their album is billed to the owner but keeps
   * the collaborator's prefix. Anything reachable through a *shared* album
   * must use `assertCanAccess` instead, because there the prefix answers the
   * wrong question: it says who uploaded the object, not who is allowed to
   * read it.
   */
  private assertOwned(userId: string, key: string): void {
    this.assertSafeKey(key);
    if (!key.startsWith(`users/${userId}/`)) {
      throw new ForbiddenException('You do not have access to that object');
    }
  }

  /**
   * Rejects a caller who lacks at least `required` access to an object.
   *
   * The owner always passes. Everyone else needs a grant on the album the file
   * sits in, from an invitation they accepted, at or above the level asked
   * for — so a client given `view` can browse a gallery and still not pull the
   * originals down.
   */
  private async assertCanAccess(
    userId: string,
    key: string,
    required: MediaAccess,
  ): Promise<void> {
    this.assertSafeKey(key);
    const access = await this.quota.accessForKey(userId, key);
    if (!accessAllows(access, required)) {
      throw new ForbiddenException('You do not have access to that object');
    }
  }

  /**
   * Everything that has to be true before a client is handed any signed URL:
   * a type we accept, a size within `maxBytes`, the profile-photo limits, access
   * to the album and room in whoever it will be billed to.
   *
   * Shared by the single PUT and the multipart start, so a file cannot be
   * refused one way and let through the other.
   */
  private async authoriseUpload(
    userId: string,
    input: {
      contentType: string;
      scope: UploadScope;
      contentLength: number;
      albumId?: string;
    },
    maxBytes: number,
  ): Promise<void> {
    if (
      !(ALLOWED_CONTENT_TYPES as readonly string[]).includes(input.contentType)
    ) {
      throw new BadRequestException(
        `Unsupported content type: ${input.contentType}`,
      );
    }

    if (input.contentLength <= 0 || input.contentLength > maxBytes) {
      throw new BadRequestException(
        `File size must be between 1 byte and ${maxBytes} bytes`,
      );
    }

    // A profile photo is re-encoded in place on confirm, and one that cannot
    // be is deleted and refused there. Saying no here instead spares the
    // person the upload, and keeps anything sharp would refuse — a film, a
    // PDF, a file too big to decode — out of the public bucket altogether.
    if (input.scope === 'covers') {
      if (!(COVER_CONTENT_TYPES as readonly string[]).includes(input.contentType)) {
        throw new BadRequestException('A cover has to be a JPEG, PNG, WebP or AVIF photo.');
      }
      if (input.contentLength > MAX_COVER_BYTES) {
        throw new BadRequestException('That photo is too large for a cover. Choose one under 15 MB.');
      }
      // Before signing, not at PATCH /me/profile/cover: without a CDN there is
      // no URL a cover could be stored as, and finding that out after the
      // bytes are up leaves a public object nothing can ever point at.
      if (!this.config.cdnBaseUrl) {
        throw new ServiceUnavailableException('Covers are not available right now.');
      }
    }
    if (input.scope === 'avatars') {
      if (!(PROFILE_PHOTO_CONTENT_TYPES as readonly string[]).includes(input.contentType)) {
        throw new BadRequestException('A profile photo has to be an image file.');
      }
      if (input.contentLength > MAX_AVATAR_BYTES) {
        throw new BadRequestException(
          'That photo is too large for a profile photo. Choose one under 40 MB.',
        );
      }
    }

    // A profile photo is the caller's own, billed to the caller, whatever
    // album the client happened to name. confirm files it under no album for
    // the same reason (StorageController.confirm).
    const albumId =
      input.scope === 'avatars' || input.scope === 'covers' ? undefined : input.albumId;

    // Last chance to refuse: once the client holds a signed URL the server is
    // out of the loop. The size is pinned into the signature below, so it
    // cannot be understated here and exceeded at upload time.
    //
    // Against whoever the file will be billed to. Into someone else's album
    // that is the album's owner (see `statObject`), so their storage is the
    // one that has to have room — and not being allowed to add to the album
    // at all is worth saying now rather than after the bytes have gone up.
    if (albumId) {
      const access = await this.quota.accessForAlbum(userId, albumId);
      if (!accessAllows(access, 'upload')) {
        throw new ForbiddenException('You cannot add media to that album');
      }
      const billedTo =
        access === 'owner' ? userId : ((await this.quota.albumOwner(albumId)) ?? userId);
      await this.quota.assertCanStore(
        billedTo,
        input.contentLength,
        billedTo === userId ? 'yours' : 'album-owner',
      );
    } else {
      await this.quota.assertCanStore(userId, input.contentLength);
    }
  }

  async createUploadUrl(
    userId: string,
    input: {
      contentType: string;
      scope: UploadScope;
      contentLength: number;
      /** The album it is for, whose owner's storage it will count toward. */
      albumId?: string;
    },
  ): Promise<UploadTicket> {
    const client = this.requireClient();
    await this.authoriseUpload(userId, input, MAX_UPLOAD_BYTES);

    const key = this.buildKey(userId, input.scope, input.contentType);

    // ContentType and ContentLength are part of the signature, so the client
    // cannot upload a different type or a larger file than it declared — the
    // signature simply will not match. This is the only real size enforcement
    // available for a presigned PUT.
    const command = new PutObjectCommand({
      Bucket: this.config.bucketForScope(input.scope),
      Key: key,
      ContentType: input.contentType,
      ContentLength: input.contentLength,
    });

    const uploadUrl = await getSignedUrl(client, command, {
      expiresIn: UPLOAD_URL_TTL_SECONDS,
    });

    return {
      key,
      uploadUrl,
      // Deliberately the durable CDN form, not a signed one. Callers *store*
      // this — `avatarUrl` is written straight from it — and a signed URL put
      // in a database is a URL that stops working in an hour. Album media does
      // not use this field; it is re-read from the file list, which signs.
      publicUrl: this.config.publicUrl(key),
      requiredHeaders: {
        'Content-Type': input.contentType,
        'Content-Length': String(input.contentLength),
      },
      expiresAt: new Date(
        Date.now() + UPLOAD_URL_TTL_SECONDS * 1000,
      ).toISOString(),
    };
  }

  /**
   * Begins a multipart upload (docs/LARGE_UPLOADS.md).
   *
   * The same refusals as a single PUT, applied to the whole file before a part
   * is signed, but against the multipart ceiling. The client then asks for one
   * URL per part, so no transfer has to fit in a single presigned window and
   * a failed part is retried on its own.
   */
  async startMultipart(
    userId: string,
    input: {
      contentType: string;
      scope: UploadScope;
      contentLength: number;
      albumId?: string;
    },
  ): Promise<MultipartStart> {
    const client = this.requireClient();

    // Profile photos are re-encoded in place on confirm and are held to a few
    // megabytes; there is nothing to gain from sending one in parts.
    if (input.scope === 'avatars' || input.scope === 'covers') {
      throw new BadRequestException('A profile photo is not sent in parts.');
    }
    await this.authoriseUpload(userId, input, MULTIPART_MAX_BYTES);

    const partCount = Math.ceil(input.contentLength / MULTIPART_PART_BYTES);
    if (partCount > MULTIPART_MAX_PARTS) {
      throw new BadRequestException('That file is too large to upload.');
    }

    const key = this.buildKey(userId, input.scope, input.contentType);
    let uploadId: string | undefined;
    try {
      const created = await client.send(
        new CreateMultipartUploadCommand({
          Bucket: this.config.bucketForScope(input.scope),
          Key: key,
          ContentType: input.contentType,
        }),
      );
      uploadId = created.UploadId;
    } catch (err) {
      this.logger.error(`CreateMultipartUpload failed for ${key}: ${String(err)}`);
    }
    if (!uploadId) {
      throw new ServiceUnavailableException('Could not reach storage');
    }

    return { key, uploadId, partSize: MULTIPART_PART_BYTES, partCount };
  }

  /**
   * A presigned URL for one part, minted when that part is about to be sent.
   *
   * The part's length is signed, so a part cannot be larger than the client
   * said, and a single part can never be more than `MULTIPART_PART_BYTES`.
   */
  async createPartUrl(
    userId: string,
    input: { key: string; uploadId: string; partNumber: number; contentLength: number },
  ): Promise<PartTicket> {
    const client = this.requireClient();
    this.assertOwned(userId, input.key);

    if (
      !Number.isInteger(input.partNumber) ||
      input.partNumber < 1 ||
      input.partNumber > MULTIPART_MAX_PARTS
    ) {
      throw new BadRequestException('Invalid part number');
    }
    if (
      !Number.isInteger(input.contentLength) ||
      input.contentLength < 1 ||
      input.contentLength > MULTIPART_PART_BYTES
    ) {
      throw new BadRequestException('Invalid part size');
    }

    const uploadUrl = await getSignedUrl(
      client,
      new UploadPartCommand({
        Bucket: this.config.bucketForKey(input.key),
        Key: input.key,
        UploadId: input.uploadId,
        PartNumber: input.partNumber,
        ContentLength: input.contentLength,
      }),
      { expiresIn: UPLOAD_URL_TTL_SECONDS },
    );

    return {
      uploadUrl,
      requiredHeaders: { 'Content-Length': String(input.contentLength) },
      expiresAt: new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1000).toISOString(),
    };
  }

  /**
   * Assembles the parts into the object, then checks what was actually stored.
   *
   * The size declared at the start is not pinned anywhere B2 can see, so a
   * client could say 1 MB and send 10 GB. The real size is read back here and
   * held to the same ceiling and the same quota; an object that fails either
   * is deleted rather than left behind, unbilled.
   *
   * Does not record the file: the client calls `confirm` next, exactly as
   * after a single PUT, which does the quota row, the feed and the thumbnail.
   */
  async completeMultipart(
    userId: string,
    input: {
      key: string;
      uploadId: string;
      parts: { partNumber: number; etag: string }[];
      albumId?: string;
    },
  ): Promise<{ key: string; size: number }> {
    const client = this.requireClient();
    this.assertOwned(userId, input.key);

    const parts = [...input.parts].sort((a, b) => a.partNumber - b.partNumber);
    const consecutive = parts.every((p, i) => p.partNumber === i + 1);
    if (parts.length === 0 || parts.length > MULTIPART_MAX_PARTS || !consecutive) {
      throw new BadRequestException('The parts are incomplete');
    }

    const bucket = this.config.bucketForKey(input.key);
    try {
      await client.send(
        new CompleteMultipartUploadCommand({
          Bucket: bucket,
          Key: input.key,
          UploadId: input.uploadId,
          MultipartUpload: {
            Parts: parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
          },
        }),
      );
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode;
      this.logger.error(`CompleteMultipartUpload failed for ${input.key}: ${String(err)}`);
      if (status && status >= 400 && status < 500) {
        throw new BadRequestException('The upload could not be assembled. Please try again.');
      }
      throw new ServiceUnavailableException('Could not reach storage');
    }

    let size: number;
    try {
      const head = await client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: input.key }),
      );
      size = head.ContentLength ?? 0;
    } catch (err) {
      this.logger.error(`HEAD failed after multipart for ${input.key}: ${String(err)}`);
      throw new ServiceUnavailableException('Could not reach storage');
    }

    try {
      if (size > MULTIPART_MAX_BYTES) {
        throw new BadRequestException('That file is too large to upload.');
      }
      let billedTo = userId;
      if (input.albumId) {
        const access = await this.quota.accessForAlbum(userId, input.albumId);
        if (!accessAllows(access, 'upload')) {
          throw new ForbiddenException('You cannot add media to that album');
        }
        if (access !== 'owner') {
          billedTo = (await this.quota.albumOwner(input.albumId)) ?? userId;
        }
      }
      await this.quota.assertCanStore(
        billedTo,
        size,
        billedTo === userId ? 'yours' : 'album-owner',
      );
    } catch (err) {
      // Through deleteFromBuckets, so a store that refuses DeleteObjects
      // still has the object removed one at a time. It never throws.
      const gone = await this.deleteFromBuckets([input.key], 'completeMultipart refusal');
      if (!gone.has(input.key)) {
        this.logger.error('Could not remove a refused multipart upload');
      }
      throw err;
    }

    return { key: input.key, size };
  }

  /**
   * Gives up on a multipart upload and releases its parts.
   *
   * B2 bills for the parts of an unfinished upload until something removes
   * them. A upload that is already gone counts as aborted.
   */
  async abortMultipart(
    userId: string,
    input: { key: string; uploadId: string },
  ): Promise<void> {
    const client = this.requireClient();
    this.assertOwned(userId, input.key);
    try {
      await client.send(
        new AbortMultipartUploadCommand({
          Bucket: this.config.bucketForKey(input.key),
          Key: input.key,
          UploadId: input.uploadId,
        }),
      );
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode;
      if (status === 404) return;
      this.logger.error(`AbortMultipartUpload failed for ${input.key}: ${String(err)}`);
      throw new ServiceUnavailableException('Could not reach storage');
    }
  }

  /**
   * Refuses any key outside the prefixes the server mints for itself.
   *
   * The three methods below skip the `users/<id>/` ownership check, because
   * what they handle belongs to no one's library: support attachments and
   * receipts, whose owners are rows in `support_attachments` and
   * `money_receipts`. Holding them to their own prefixes is what stops them
   * being a way round that check.
   */
  private assertServerKey(key: string): void {
    this.assertSafeKey(key);
    if (!SERVER_KEY.test(key)) {
      throw new BadRequestException('Invalid object key');
    }
  }

  /**
   * A presigned PUT for a key the server minted — see assertServerKey.
   *
   * Type and size are signed in, as for every upload, so the bytes that
   * arrive are the ones declared. Nothing is recorded against storage: the
   * caller keeps its own row.
   */
  async signServerUpload(
    key: string,
    contentType: string,
    contentLength: number,
  ): Promise<Omit<UploadTicket, 'key' | 'publicUrl'>> {
    const client = this.requireClient();
    this.assertServerKey(key);
    const uploadUrl = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: this.config.bucketForKey(key),
        Key: key,
        ContentType: contentType,
        ContentLength: contentLength,
      }),
      { expiresIn: UPLOAD_URL_TTL_SECONDS },
    );
    return {
      uploadUrl,
      requiredHeaders: {
        'Content-Type': contentType,
        'Content-Length': String(contentLength),
      },
      expiresAt: new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1000).toISOString(),
    };
  }

  /** What landed under a server-minted key; null when nothing did. */
  async headServerObject(
    key: string,
  ): Promise<{ size: number; contentType?: string } | null> {
    const client = this.requireClient();
    this.assertServerKey(key);
    try {
      const head = await client.send(
        new HeadObjectCommand({ Bucket: this.config.bucketForKey(key), Key: key }),
      );
      return { size: head.ContentLength ?? 0, contentType: head.ContentType };
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404) return null;
      this.logger.error(`HEAD failed for a server object: ${String(err)}`);
      throw new ServiceUnavailableException('Could not reach storage');
    }
  }

  /** Deletes server-minted objects; the keys confirmed gone come back. */
  async deleteServerObjects(keys: readonly string[], context: string): Promise<Set<string>> {
    for (const key of keys) this.assertServerKey(key);
    if (keys.length === 0) return new Set();
    return this.deleteFromBuckets(keys, context);
  }

  /** Whether objects can be signed at all here. */
  get configured(): boolean {
    return this.client !== null;
  }

  /**
   * A URL that renders this object, for a bucket that is not world-readable.
   *
   * Every media URL the API hands out goes through here. The bucket used to be
   * public behind a CDN, which meant the URL *was* the permission: anyone who
   * came by a link — a forwarded client gallery, a cached page, a log — could
   * fetch the original indefinitely, and none of the access levels enforced on
   * the API applied to it.
   *
   * **The signature is pinned to a window rather than to `now`.** Presigning
   * afresh on every render would return a different URL each time, so nothing
   * would ever be served from cache and a gallery of a few hundred photographs
   * would re-download in full on each visit. Rounding the signing time down to
   * a window makes the URL byte-identical for every request inside it, which
   * is what lets a browser reuse the image it already has. The cost is that
   * real validity is somewhere between `ttl - window` and `ttl`.
   */
  async mediaUrl(
    key: string | null | undefined,
    ttlSeconds: number = DOWNLOAD_URL_TTL_SECONDS,
    /**
     * Filename to save as, which also turns the response into a download.
     *
     * This is the only way to make a share-page download actually save. The
     * HTML `download` attribute is ignored for cross-origin URLs, and media
     * is served from B2, so `<a download>` on a signed URL just opens the
     * photo in a tab and leaves the client to long-press it. Signing
     * `response-content-disposition` moves the decision to the response
     * itself, and costs no bytes through this server.
     *
     * Note it changes the URL, so a download link and a display link for the
     * same object are different strings and cache separately. That is why it
     * is opt-in rather than always on.
     */
    downloadAs?: string,
  ): Promise<string | null> {
    if (!key || !this.client) return null;

    // The public bucket needs no signature, and a plain CDN address caches
    // for good where a signed one changes every six hours.
    if (!downloadAs && this.config.isPublicKey(key)) {
      const url = this.config.publicUrl(key);
      if (url) return url;
    }

    // Pinned to a window sized for this URL's lifetime: five minutes for a
    // one-hour download, six hours for a display link. See signingWindowFor.
    const windowMs = signingWindowFor(ttlSeconds) * 1000;
    const signingDate = new Date(Math.floor(Date.now() / windowMs) * windowMs);

    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.config.bucketForKey(key),
        Key: key,
        ...(downloadAs
          ? { ResponseContentDisposition: contentDisposition(downloadAs) }
          : {}),
      }),
      { expiresIn: ttlSeconds, signingDate },
    );
  }

  /**
   * The object's bytes, for the server to read.
   *
   * Deliberately takes no userId: the only caller is the share-link zip, where
   * the token has already been resolved to this album's files. Adding a user
   * check here would mean inventing a user for an anonymous client.
   */
  async readStream(key: string, from = 0): Promise<Readable> {
    return (await this.readStreamWithSize(key, from)).stream;
  }

  /**
   * As `readStream`, plus how many bytes the stream will deliver when storage
   * reports it. `from` skips that many bytes, so a zip whose read of an
   * object broke part way can carry on from there.
   */
  async readStreamWithSize(
    key: string,
    from = 0,
  ): Promise<{ stream: Readable; size?: number }> {
    const client = this.requireClient();
    this.assertSafeKey(key);
    const res = await client.send(
      new GetObjectCommand({
        Bucket: this.config.bucketForKey(key),
        Key: key,
        ...(from > 0 ? { Range: `bytes=${from}-` } : {}),
      }),
    );
    return { stream: res.Body as Readable, size: res.ContentLength };
  }

  /**
   * The first `bytes` of an object, for reading its header without the rest.
   *
   * A ranged GET, so an original too large to decode still gives up its EXIF
   * for the cost of a quarter of a megabyte rather than all of it.
   */
  async readHead(key: string, bytes: number): Promise<Buffer> {
    const client = this.requireClient();
    this.assertSafeKey(key);
    const res = await client.send(
      new GetObjectCommand({
        Bucket: this.config.bucketForKey(key),
        Key: key,
        Range: `bytes=0-${Math.max(0, bytes - 1)}`,
      }),
    );
    const chunks: Buffer[] = [];
    for await (const chunk of res.Body as Readable) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
    }
    return Buffer.concat(chunks);
  }

  /**
   * Writes a derived object — a thumbnail, or a normalised avatar or cover.
   *
   * Goes to the same bucket as its source so it inherits the same lifecycle:
   * deleting an album's media by prefix takes the thumbnails with it, rather
   * than orphaning them somewhere the retention sweep never looks.
   */
  async putDerived(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    const client = this.requireClient();
    this.assertSafeKey(key);
    await client.send(
      new PutObjectCommand({
        Bucket: this.config.bucketForKey(key),
        Key: key,
        Body: body,
        ContentType: contentType,
        // Thumbnails, posters and normalised avatars. Without this B2 sends
        // no caching instruction at all, and every client falls back to its
        // own guess — which for React Native's Image and most browsers was
        // to fetch the picture again next time.
        CacheControl: IMMUTABLE_CACHE_CONTROL,
      }),
    );
  }

  /**
   * putDerived for something too big to hold in memory: a film, streamed from
   * the file ffmpeg wrote. The length is sent up front, which a stream body
   * needs for the upload to be signed at all.
   */
  async putDerivedFile(key: string, file: string, contentType: string): Promise<void> {
    const client = this.requireClient();
    this.assertSafeKey(key);
    const { size } = await stat(file);
    await client.send(
      new PutObjectCommand({
        Bucket: this.config.bucketForKey(key),
        Key: key,
        Body: createReadStream(file),
        ContentLength: size,
        ContentType: contentType,
        CacheControl: IMMUTABLE_CACHE_CONTROL,
      }),
    );
  }

  /**
   * Deletes server-made objects by key, and returns the keys confirmed gone.
   * Never throws: for tidying up after something that has already happened.
   */
  async deleteKeys(keys: readonly string[], context: string): Promise<Set<string>> {
    const safe = keys.filter((key) => this.isSafeKey(key));
    if (safe.length === 0 || !this.client) return new Set();
    return this.deleteFromBuckets(safe, context);
  }

  /**
   * The permanent address of a public-bucket object, or null when no CDN is
   * configured to serve one.
   */
  publicUrl(key: string | null | undefined): string | null {
    return key ? this.config.publicUrl(key) : null;
  }

  /**
   * Deletes every object under a prefix, in the bucket that prefix lives in.
   *
   * For server-made objects with no user_files row to find them by — a
   * showcase's web copies. Returns how many went and how many did not.
   */
  async deletePrefix(prefix: string): Promise<{ deleted: number; failed: number }> {
    const client = this.requireClient();
    this.assertSafeKey(prefix);
    if (!prefix.endsWith('/')) throw new BadRequestException('Invalid prefix');
    const Bucket = this.config.bucketForKey(prefix);
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const page = await client.send(
        new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken: token }),
      );
      for (const item of page.Contents ?? []) if (item.Key) keys.push(item.Key);
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    if (keys.length === 0) return { deleted: 0, failed: 0 };
    const gone = await this.deleteFromBuckets(keys, 'deletePrefix');
    return { deleted: gone.size, failed: keys.length - gone.size };
  }

  /** The object key a stored public URL points at, or null if it is not ours. */
  keyFromPublicUrl(url: string | null | undefined): string | null {
    return this.config.keyFromPublicUrl(url);
  }

  /**
   * The object this user's profile cover is, or null when there is none.
   *
   * Worked back from `users.cover_url`, the whole CDN URL setCover stored, in
   * the same way the cover code does it (ProfilesService.discardCover).
   */
  async coverKeyOf(userId: string): Promise<string | null> {
    return this.ownCoverKey(userId, await this.quota.coverUrl(userId));
  }

  /**
   * The key behind a stored cover URL, when it is one of this user's covers.
   *
   * Nothing outside their own covers prefix is: setCover only ever stores a
   * key it minted there, so anything else is a URL from another host or from
   * before that rule, and is never theirs to delete.
   */
  private ownCoverKey(userId: string, url: string | null): string | null {
    const key = this.config.keyFromPublicUrl(url);
    return key && this.isSafeKey(key) && key.startsWith(`users/${userId}/covers/`)
      ? key
      : null;
  }

  /**
   * Whether the buckets are actually reachable right now.
   *
   * ListObjectsV2 with MaxKeys:1, not HeadBucket. HeadBucket is refused to a
   * bucket-restricted application key even when every object operation on that
   * bucket works, so it reported the storage as broken while uploads were
   * running perfectly — the probe has to be an operation the real credentials
   * are actually granted.
   */
  async healthCheck(): Promise<{ ok: boolean; detail: string }> {
    if (!this.client) return { ok: false, detail: 'not configured' };
    const started = Date.now();
    try {
      for (const bucket of this.config.buckets()) {
        await this.client.send(
          new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }),
        );
      }
      return { ok: true, detail: `reachable in ${Date.now() - started}ms` };
    } catch (err) {
      return {
        ok: false,
        detail: err instanceof Error ? err.message.slice(0, 160) : String(err),
      };
    }
  }

  /** Origins media is served from, for a Content-Security-Policy. */
  mediaOrigins(): string[] {
    return this.config.mediaOrigins();
  }

  /** `mediaUrl` for a batch, preserving order. */
  async mediaUrls(
    keys: (string | null | undefined)[],
    ttlSeconds: number = DOWNLOAD_URL_TTL_SECONDS,
    /** Per-key save-as names, positional. Omit for plain display URLs. */
    downloadAs?: (string | undefined)[],
  ): Promise<(string | null)[]> {
    // Signing is an HMAC, not a network call, so a few hundred at once is
    // cheap — this is concurrency for tidiness, not for throughput.
    return Promise.all(
      keys.map((k, i) => this.mediaUrl(k, ttlSeconds, downloadAs?.[i])),
    );
  }

  /** Time-limited read URL, for buckets that are not publicly served. */
  async createDownloadUrl(userId: string, key: string): Promise<string> {
    const client = this.requireClient();
    // 'download' rather than 'view': this hands over the original file, which
    // is exactly the line a client-role collaborator should not cross.
    await this.assertCanAccess(userId, key, 'download');

    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: this.config.bucketForKey(key), Key: key }),
      { expiresIn: DOWNLOAD_URL_TTL_SECONDS },
    );
  }

  async deleteObject(userId: string, key: string): Promise<void> {
    this.requireClient();
    // Destroying someone else's media is the highest bar there is.
    await this.assertCanAccess(userId, key, 'manage');

    const targets = await this.quota.objectAndDerivedKeys([key]);
    const deleted = await this.deleteFromBuckets(
      targets.length > 0 ? targets : [key],
      'delete',
    );
    if (!deleted.has(key)) {
      throw new ServiceUnavailableException('Could not delete media');
    }
    // Free the space against the quota. Done after the delete succeeds so a
    // failed delete does not silently hand back allowance.
    await this.quota.forgetFile(userId, key);
    // Renditions are not bucket objects, so the sweep above does not reach
    // them. Last, and never fatal: a rendition left behind is wasted disk on
    // one machine, and failing someone's delete over it would be a much worse
    // trade than leaving it for the sweep.
    await this.mediaLink.removeFor([key]);
  }

  /**
   * Deletes a selection in one request.
   *
   * Authorised exactly as a single delete is — 'manage' on each file's album,
   * or the row being the caller's own — and all-or-nothing on that check: a
   * selection holding one file the caller may not delete is refused whole
   * rather than half done. Past the check it is best effort per object, and
   * only what the bucket confirms gone is forgotten, so a partial failure
   * leaves the rest counted rather than handing back allowance for files that
   * still exist.
   *
   * Never by key prefix: a collaborator's upload into your album carries
   * THEIR prefix, so an owner culling their own album would be refused on the
   * second shooter's frames. The retention sweep comes through here for the
   * same reason, acting as each album's owner.
   */
  async deleteMany(
    userId: string,
    keys: readonly string[],
  ): Promise<{ deleted: number; failed: number }> {
    if (keys.length === 0) return { deleted: 0, failed: 0 };
    this.requireClient();
    for (const key of keys) this.assertSafeKey(key);

    const rows = await this.quota.fileOwnership(keys);
    const albumAccess = new Map<string, ResolvedAccess>();
    for (const row of rows) {
      if (row.user_id === userId) continue;
      if (!row.album_id) {
        throw new ForbiddenException('You cannot delete some of these files');
      }
      if (!albumAccess.has(row.album_id)) {
        albumAccess.set(row.album_id, await this.quota.accessForAlbum(userId, row.album_id));
      }
      if (!accessAllows(albumAccess.get(row.album_id) ?? null, 'manage')) {
        throw new ForbiddenException('You cannot delete some of these files');
      }
    }

    const known = rows.map((row) => row.key);
    let deletedCount = 0;
    for (let i = 0; i < known.length; i += DELETE_CHUNK_FILES) {
      const chunk = known.slice(i, i + DELETE_CHUNK_FILES);
      deletedCount += await this.deleteFiles(chunk, `deleteMany for ${userId}`);
    }
    return { deleted: deletedCount, failed: keys.length - deletedCount };
  }

  /**
   * Deletes every file in these albums for good, as emptying Recently deleted
   * does (WorkspaceTrashService), and says how many went and how many the
   * bucket held on to.
   *
   * No access check: nobody is asking but the sweep, 30 days after the owner
   * did. Only what the bucket confirms gone is forgotten, as in deleteMany,
   * so a file it held on to keeps its row and its album, for the next run.
   * Paged by key rather than by offset, since every page deletes the rows
   * the next one would have counted past.
   */
  async purgeAlbumFiles(albumIds: readonly string[]): Promise<{ deleted: number; failed: number }> {
    if (albumIds.length === 0 || !this.client) return { deleted: 0, failed: 0 };
    let deleted = 0;
    let failed = 0;
    let after = '';
    for (;;) {
      const chunk = await this.quota.albumFileKeys(albumIds, after, DELETE_CHUNK_FILES);
      if (chunk.length === 0) break;
      after = chunk[chunk.length - 1];
      const went = await this.deleteFiles(chunk, `purge of ${albumIds.length} album(s)`);
      deleted += went;
      failed += chunk.length - went;
    }
    if (failed > 0) {
      this.logger.warn(`purge: the bucket held on to ${failed} file(s); they wait for the next run`);
    }
    return { deleted, failed };
  }

  /**
   * One chunk of a delete whose access was settled already: the originals
   * and what is stored beside them, then the rows of what went, then their
   * renditions. Returns how many originals went.
   */
  private async deleteFiles(chunk: readonly string[], context: string): Promise<number> {
    const targets = await this.quota.objectAndDerivedKeys(chunk);
    const gone = await this.deleteFromBuckets(targets, context);

    const deleted = chunk.filter((key) => gone.has(key));
    await this.quota.forgetKeys(deleted);
    // Renditions are not bucket objects; see deleteObject. Only for what
    // went: a file still in the bucket keeps its display copies.
    await this.mediaLink.removeFor(deleted);
    return deleted.length;
  }

  /**
   * A short-lived ticket for downloading a selection as one zip.
   *
   * The app authenticates with a bearer header that a browser does not send
   * on a navigation, and a navigation is the only way to put a multi-gigabyte
   * zip in the browser's download manager instead of in JavaScript memory. So
   * the ticket is asked for over the authenticated channel and carried by the
   * navigation. See migration 065.
   */
  async issueZipTicket(
    userId: string,
    albumId: string,
    keys: readonly string[],
  ): Promise<{ path: string; expiresAt: Date; files: number }> {
    const access = await this.quota.accessForAlbum(userId, albumId);
    // 'download', the same line a single original is held to.
    if (!accessAllows(access, 'download')) {
      throw new ForbiddenException('You cannot download from this album');
    }
    const files = await this.quota.albumFilesByKey(albumId, keys);
    if (files.length === 0) throw new BadRequestException('Nothing to download');

    const token = randomBytes(24).toString('base64url');
    const expiresAt = await this.quota.createZipTicket({
      token,
      userId,
      albumId,
      keys: files.map((file) => file.key),
      ttlSeconds: ZIP_TICKET_TTL_SECONDS,
    });
    return { path: `/storage/zip/${token}`, expiresAt, files: files.length };
  }

  /**
   * What a ticket downloads, re-authorised at the moment it is used.
   *
   * Access is checked again rather than trusted from issue time: ten minutes
   * is long enough for a collaborator to be removed, and a ticket must not
   * outlive the permission it was issued on.
   */
  async redeemZipTicket(
    token: string,
  ): Promise<{ zipName: string; files: { key: string; name: string }[] }> {
    const ticket = await this.quota.zipTicket(token);
    if (!ticket) throw new NotFoundException('This download has expired');
    const access = await this.quota.accessForAlbum(ticket.user_id, ticket.album_id);
    if (!accessAllows(access, 'download')) {
      throw new NotFoundException('This download has expired');
    }
    const rows = await this.quota.albumFilesByKey(ticket.album_id, ticket.keys);
    const names = uniqueNames(rows.map((row) => storedDisplayName(row.original_name, row.key)));
    const count = `${rows.length} file${rows.length === 1 ? '' : 's'}`;
    return {
      zipName: `${safeFileStem(ticket.album_name)} - ${count}.zip`,
      files: rows.map((row, i) => ({ key: row.key, name: names[i] })),
    };
  }

  /**
   * Deletes every object this user has stored, across all albums.
   *
   * "Stored" as the quota counts it: every file billed to this user, which
   * includes what collaborators uploaded into their albums. Those keep the
   * collaborator's key prefix, so here the rows are the authority and the
   * prefix is deliberately not checked — see `assertOwned`.
   *
   * Irreversible, and deliberately not exposed as a DELETE on a collection
   * route — it is a named action so it cannot be reached by accident.
   *
   * Objects are deleted in batches with DeleteObjects (1000 keys per call is
   * the S3 API maximum). Only keys the bucket confirms deleted are forgotten,
   * so a partial failure leaves the rest still counted against the quota
   * rather than silently handing back allowance for objects that still exist.
   *
   * The profile cover goes too, found by the URL the profile holds rather
   * than by a row. The two can part: an API image from before covers sends a
   * cover's delete to the private bucket, where it reports success, and the
   * row is forgotten while the public object stays. Nothing but
   * `users.cover_url` still names that object, and account deletion is about
   * to remove the column. The profile stops pointing at the cover once its
   * object is gone, and only then. Account deletion comes through here too,
   * and a cover the bucket refused is a failure there like any other object.
   */
  async wipeAll(
    userId: string,
  ): Promise<{ deleted: number; failed: number; freedBytes: number }> {
    this.requireClient();

    const files = await this.quota.allFiles(userId);
    const coverUrl = await this.quota.coverUrl(userId);
    const coverKey = this.ownCoverKey(userId, coverUrl);
    if (files.length === 0 && !coverKey) {
      // A URL that names none of their covers names nothing a wipe could
      // delete, and the profile does not keep it either.
      if (coverUrl) await this.quota.forgetCover(userId, coverUrl);
      return { deleted: 0, failed: 0, freedBytes: 0 };
    }

    const before = await this.quota.storageUsed(userId);
    // For the renditions at the end. Asked now so that if it fails, it fails
    // before anything has been deleted.
    const keepTree = await this.quota.hasUploadsBilledToOthers(userId);

    // No prefix check. Every key came from a row billed to this user, and a
    // collaborator's upload into their album is one of those rows while
    // carrying the collaborator's prefix. The prefix check that used to run
    // here refused it — and it ran between batches, outside the error
    // handling, so it threw after earlier batches were already gone from the
    // bucket and before a single row had been forgotten.
    //
    // Malformed keys are still refused, as defence in depth, but counted and
    // skipped rather than thrown: one bad row must not end the wipe halfway.
    const objects = [
      ...new Set(
        [...files.flatMap((file) => [file.key, file.thumb_key, file.poster_key]), coverKey]
          .filter((key): key is string => !!key),
      ),
    ];
    const keys = objects.filter((key) => this.isSafeKey(key));
    let failed = objects.length - keys.length;
    if (failed > 0) {
      this.logger.warn(`wipeAll: skipped ${failed} malformed key(s) for ${userId}`);
    }
    // Split by bucket inside: avatars and covers live in the public one and
    // everything else in the private one. Never throws, so one bad batch does
    // not strand the rest of the user's storage.
    const gone = await this.deleteFromBuckets(keys, `wipeAll for ${userId}`);
    const deletedKeys = keys.filter((key) => gone.has(key));
    failed += keys.length - deletedKeys.length;

    await this.quota.forgetFiles(userId, deletedKeys);
    const after = await this.quota.storageUsed(userId);

    // Off the profile once the bucket confirms the object gone. One it refused
    // stays named, and the next wipe tries it again.
    if (coverUrl && (!coverKey || deletedKeys.includes(coverKey))) {
      await this.quota.forgetCover(userId, coverUrl);
    }

    // Renditions are not bucket objects, so nothing above touched them. Each
    // sits beside its original, under the prefix of whoever UPLOADED it, and
    // that is not always this user — in either direction. Every original the
    // wipe covered loses its renditions, not only those the bucket confirmed
    // gone, which is what taking the tree has always meant. The cover is one
    // of those originals whether or not a row still tracks it.
    const originals = [
      ...new Set(
        [...files.map((file) => file.key), coverKey]
          .filter((key): key is string => !!key && this.isSafeKey(key)),
      ),
    ];
    if (keepTree) {
      // Some of this user's own uploads went into somebody else's album. They
      // are billed to that album's owner, so they outlive this wipe, and their
      // renditions share this user's tree: removing the tree would break
      // playback in an album this user does not own. File by file instead.
      await this.mediaLink.removeFor(originals);
    } else {
      // Nothing under this user's prefix outlives the wipe, so take the
      // rendition subtree rather than deriving names per key: one call instead
      // of several thousand, and it also collects renditions whose row was
      // never written. It cannot reach a collaborator's upload into this
      // user's albums, whose renditions sit under the collaborator's prefix.
      await this.mediaLink.removeTree(`users/${userId}`);
      await this.mediaLink.removeFor(
        originals.filter((key) => !key.startsWith(`users/${userId}/`)),
      );
    }

    return { deleted: deletedKeys.length, failed, freedBytes: before - after };
  }

  /** Points already-stored objects at one of the caller's albums. */
  async attachToAlbum(
    userId: string,
    keys: string[],
    albumId: string,
  ): Promise<{ attached: number }> {
    for (const key of keys) this.assertOwned(userId, key);
    const attached = await this.quota.attachToAlbum(userId, keys, albumId);
    return { attached };
  }

  /** Storage split by album and by media type. */
  breakdown(userId: string) {
    return this.quota.breakdown(userId);
  }

  /** Files not yet filed into an album. */
  async listUnassigned(userId: string, limit?: number) {
    const rows = await this.quota.listUnassigned(userId, limit);
    const urls = await this.mediaUrls(rows.map((r) => r.key));
    return rows.map((row, i) => ({
      key: row.key,
      sizeBytes: Number(row.size_bytes),
      contentType: row.content_type,
      albumId: row.album_id,
      createdAt: row.created_at,
      url: urls[i],
    }));
  }

  /**
   * Confirms an upload actually landed, and returns its real size.
   *
   * Worth calling before writing a cover_url into the database: a presigned URL
   * only proves the client *could* upload, not that it did. Otherwise a failed
   * or abandoned upload leaves a row pointing at a 404.
   */
  /**
   * Objects this user has stored, optionally scoped to one album, each with a
   * URL the app can render.
   */
  async listFiles(
    userId: string,
    filter: {
      albumId?: string;
      limit?: number;
      cursor?: string;
      kind?: StoredMediaKind;
      order?: FileOrder;
      section?: string;
      picked?: boolean;
    } = {},
  ) {
    // `QuotaService.listFiles` returns an album's contents without checking
    // who is asking, because within an album the uploader is not the question.
    // That makes this the place the question has to be asked — album ids are
    // guessable, so an unauthorised caller must be stopped here or not at all.
    let access: Awaited<ReturnType<QuotaService['accessForAlbum']>> = 'owner';
    if (filter.albumId) {
      access = await this.quota.accessForAlbum(userId, filter.albumId);
      if (!accessAllows(access, 'view')) {
        throw new ForbiddenException('You do not have access to that album');
      }
    }

    const page = await this.quota.listFiles(userId, filter);
    const mayDownload = accessAllows(access, 'download');
    const mayManage = accessAllows(access, 'manage');
    const names = page.rows.map((row) => storedDisplayName(row.original_name, row.key));
    // What is shown gets display-length links, which hold one URL for six
    // hours so the browser and the phone can keep the picture; the download
    // link keeps its one hour, since that is the one that hands over the file.
    const [urls, thumbnailUrls, posterUrls, downloadUrls] = await Promise.all([
      this.mediaUrls(page.rows.map((row) => row.key), DISPLAY_URL_TTL_SECONDS),
      this.mediaUrls(page.rows.map((row) => row.thumb_key), DISPLAY_URL_TTL_SECONDS),
      this.mediaUrls(page.rows.map((row) => row.poster_key), DISPLAY_URL_TTL_SECONDS),
      mayDownload
        ? this.mediaUrls(
            page.rows.map((row) => row.key),
            DOWNLOAD_URL_TTL_SECONDS,
            names,
          )
        : Promise.resolve(page.rows.map(() => null)),
    ]);
    return {
      data: page.rows.map((row, i) => ({
        key: row.key,
        sizeBytes: Number(row.size_bytes),
        contentType: row.content_type,
        albumId: row.album_id,
        createdAt: row.created_at,
        // The camera's wall clock with no zone, or null when unknown. Group
        // by its date as written; fall back to `createdAt` in local time.
        takenAt: row.taken_at,
        sectionId: row.section_id,
        picked: row.picked,
        originalName: names[i],
        url: urls[i],
        thumbnailUrl: thumbnailUrls[i],
        posterUrl: posterUrls[i],
        // The web-playable copy on the media host, or null when there is not
        // one yet — a film still encoding, an audio file, or a deployment
        // with no media host configured. Players treat null as "use `url`",
        // which is what they did before this existed.
        proxyUrl: this.mediaLink.url(row.proxy_key),
        // Intermediate copies for viewing, narrowest first. Empty for videos,
        // for images small enough not to need one, and for a deployment with
        // no media host — in every case the client falls back to `url`.
        displaySources: this.mediaLink.displaySources(row.key, row.display_widths),
        // The adaptive ladder, built when the album was shared. Null until
        // then — and for a film too small to be worth rungs — so players fall
        // through to `proxyUrl` and then to `url`.
        hlsUrl: this.mediaLink.hlsUrl(row.hls_prefix),
        // Inline, so the grid paints before it fetches anything.
        blurDataUrl: row.blur_data_url,
        downloadUrl: downloadUrls[i],
        width: row.width_px,
        height: row.height_px,
        durationMs: row.duration_ms ? Number(row.duration_ms) : null,
        mediaTitle: row.media_title,
        mediaArtist: row.media_artist,
        processingStatus: row.processing_status,
        capabilities: {
          download: mayDownload,
          delete: mayManage,
          manage: mayManage,
        },
      })),
      total: page.total,
      nextCursor: page.nextCursor,
      counts: page.counts,
    };
  }

  /**
   * Which of a batch about to be uploaded the album already holds
   * (upload-dedup.ts). One query for the batch, however large.
   *
   * Asked of the album, so it needs what uploading into it needs: 'upload'
   * access. Album ids are guessable, and without the check this would tell a
   * stranger what an album holds, file name by file name.
   */
  async checkUploads(
    userId: string,
    albumId: string,
    files: readonly { name: string; size: number; lastModified?: number }[],
  ): Promise<{ matches: UploadMatch[] }> {
    const access = await this.quota.accessForAlbum(userId, albumId);
    if (!accessAllows(access, 'upload')) {
      throw new ForbiddenException('You cannot add media to that album');
    }

    // Compared as confirm stored them, or a name with a stray space or a
    // folder in it would never match its own earlier upload.
    const wanted = files
      .map((file, index) => ({ index, name: cleanOriginalName(file.name), size: file.size }))
      .filter((file): file is { index: number; name: string; size: number } => !!file.name);
    if (wanted.length === 0) return { matches: [] };

    const rows = await this.quota.findUploadMatches(albumId, wanted);
    return {
      matches: classifyUploadMatches(
        files.map((file) => ({ lastModified: sourceModifiedAt(file.lastModified)?.getTime() ?? null })),
        rows.map((row) => ({
          index: Number(row.idx),
          sourceModifiedMs: row.source_modified_ms === null ? null : Number(row.source_modified_ms),
        })),
      ),
    };
  }

  async statObject(
    userId: string,
    key: string,
    albumId?: string,
    originalName?: string,
    /** The file's modified time as the device reported it, epoch ms. */
    lastModified?: number,
  ): Promise<{ exists: boolean; size: number; contentType?: string }> {
    this.requireClient();
    const client = this.metaClient ?? this.requireClient();
    // The key was minted for this caller, so the prefix is the right check for
    // the object itself. Whether they may put it in `albumId` is a separate
    // question, answered next.
    this.assertOwned(userId, key);

    // Filing an upload into somebody else's album needs 'upload' on it, and
    // the resulting row belongs to that album's owner — otherwise the
    // collaborator pays for storage in a library they do not control, and the
    // owner cannot see what landed in their own album.
    let attributeTo = userId;
    if (albumId) {
      const access = await this.quota.accessForAlbum(userId, albumId);
      if (!accessAllows(access, 'upload')) {
        throw new ForbiddenException('You cannot add media to that album');
      }
      if (access !== 'owner') {
        attributeTo = (await this.quota.albumOwner(albumId)) ?? userId;
      }
    }

    try {
      const head = await client.send(
        new HeadObjectCommand({ Bucket: this.config.bucketForKey(key), Key: key }),
      );
      const size = head.ContentLength ?? 0;

      // Record against the storage quota using the size B2 actually reports,
      // not a number the client supplied. Idempotent on the key.
      const arrived = await this.quota.recordFile(attributeTo, {
        key,
        sizeBytes: size,
        contentType: head.ContentType,
        scope: key.split('/')[2],
        albumId,
        originalName: cleanOriginalName(originalName),
        // What a later re-upload of this file is recognised by. The ETag
        // comes with the HEAD already made, so it costs nothing.
        etag: normaliseEtag(head.ETag),
        sourceModifiedAt: sourceModifiedAt(lastModified),
      });

      // Into the workspace's feed as the person who uploaded it, whoever it
      // is billed to. Once per file: a second confirmation is not a second
      // upload.
      if (albumId && arrived) {
        await this.feed.recordInAlbum(albumId, userId, 'upload');
      }

      return { exists: true, size, contentType: head.ContentType };
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } })
        .$metadata?.httpStatusCode;
      if (status === 404) return { exists: false, size: 0 };
      this.logger.error(`HEAD failed for ${key}: ${String(err)}`);
      throw new ServiceUnavailableException('Could not reach storage');
    }
  }
}

function storedDisplayName(originalName: string | null, key: string): string {
  return cleanOriginalName(originalName) ?? key.split('/').pop() ?? key;
}

function cleanOriginalName(value: string | null | undefined): string | null {
  if (!value) return null;
  const leaf = value.split(/[\\/]/).pop() ?? value;
  const cleaned = leaf
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 255);
  return cleaned || null;
}
