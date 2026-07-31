import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { QuotaService } from '../quota/quota.service';
import {
  ALLOWED_CONTENT_TYPES,
  DOWNLOAD_URL_TTL_SECONDS,
  EXTENSION_BY_CONTENT_TYPE,
  MAX_UPLOAD_BYTES,
  StorageConfig,
  UPLOAD_URL_TTL_SECONDS,
  type UploadScope,
} from './storage.config';

export interface UploadTicket {
  key: string;
  uploadUrl: string;
  publicUrl: string | null;
  /** The client MUST send exactly these headers or the signature will not match. */
  requiredHeaders: Record<string, string>;
  expiresAt: string;
}

/**
 * Backblaze B2 via its S3-compatible API.
 *
 * Uploads use presigned URLs: the client PUTs directly to B2 and file bytes
 * never transit this server. Proxying them instead would put every photo and
 * video through the API's memory and bandwidth, which is the fastest way to
 * make a media app fall over.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client | null;

  constructor(
    private readonly config: StorageConfig,
    private readonly quota: QuotaService,
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
        })
      : null;
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
   * Rejects any key that is not inside the caller's own prefix.
   *
   * Called on every read and delete. Without it, `key` is just a string from
   * the request body and one user could delete another's objects.
   */
  private assertOwned(userId: string, key: string): void {
    // Reject traversal and absolute forms before the prefix check, so a key
    // like `users/<me>/../<them>/x.jpg` cannot slip past it.
    if (
      !key ||
      key.includes('..') ||
      key.startsWith('/') ||
      key.includes('//') ||
      key.includes('\\')
    ) {
      throw new BadRequestException('Invalid object key');
    }

    if (!key.startsWith(`users/${userId}/`)) {
      throw new ForbiddenException('You do not have access to that object');
    }
  }

  async createUploadUrl(
    userId: string,
    input: {
      contentType: string;
      scope: UploadScope;
      contentLength: number;
    },
  ): Promise<UploadTicket> {
    const client = this.requireClient();

    if (
      !(ALLOWED_CONTENT_TYPES as readonly string[]).includes(input.contentType)
    ) {
      throw new BadRequestException(
        `Unsupported content type: ${input.contentType}`,
      );
    }

    if (input.contentLength <= 0 || input.contentLength > MAX_UPLOAD_BYTES) {
      throw new BadRequestException(
        `File size must be between 1 byte and ${MAX_UPLOAD_BYTES} bytes`,
      );
    }

    // Last chance to refuse: once the client holds a signed URL the server is
    // out of the loop. The size is pinned into the signature below, so it
    // cannot be understated here and exceeded at upload time.
    await this.quota.assertCanStore(userId, input.contentLength);

    const key = this.buildKey(userId, input.scope, input.contentType);

    // ContentType and ContentLength are part of the signature, so the client
    // cannot upload a different type or a larger file than it declared — the
    // signature simply will not match. This is the only real size enforcement
    // available for a presigned PUT.
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
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

  /** Time-limited read URL, for buckets that are not publicly served. */
  async createDownloadUrl(userId: string, key: string): Promise<string> {
    const client = this.requireClient();
    this.assertOwned(userId, key);

    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
      { expiresIn: DOWNLOAD_URL_TTL_SECONDS },
    );
  }

  async deleteObject(userId: string, key: string): Promise<void> {
    const client = this.requireClient();
    this.assertOwned(userId, key);

    await client.send(
      new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }),
    );
    // Free the space against the quota. Done after the delete succeeds so a
    // failed delete does not silently hand back allowance.
    await this.quota.forgetFile(userId, key);
  }

  /**
   * Deletes every object this user has stored, across all albums.
   *
   * Irreversible, and deliberately not exposed as a DELETE on a collection
   * route — it is a named action so it cannot be reached by accident.
   *
   * Objects are deleted in batches with DeleteObjects (1000 keys per call is
   * the S3 API maximum). Only keys the bucket confirms deleted are forgotten,
   * so a partial failure leaves the rest still counted against the quota
   * rather than silently handing back allowance for objects that still exist.
   */
  async wipeAll(
    userId: string,
  ): Promise<{ deleted: number; failed: number; freedBytes: number }> {
    const client = this.requireClient();

    const keys = await this.quota.allKeys(userId);
    if (keys.length === 0) return { deleted: 0, failed: 0, freedBytes: 0 };

    const before = await this.quota.storageUsed(userId);
    const deletedKeys: string[] = [];
    let failed = 0;

    for (let i = 0; i < keys.length; i += 1000) {
      const batch = keys.slice(i, i + 1000);
      // Defence in depth: every key came from this user's own rows, but the
      // prefix check is what actually guarantees the bucket-level scope.
      for (const key of batch) this.assertOwned(userId, key);

      try {
        const res = await client.send(
          new DeleteObjectsCommand({
            Bucket: this.config.bucket,
            Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: false },
          }),
        );
        for (const d of res.Deleted ?? []) {
          if (d.Key) deletedKeys.push(d.Key);
        }
        failed += (res.Errors ?? []).length;
        if (res.Errors?.length) {
          this.logger.warn(
            `wipeAll: ${res.Errors.length} object(s) failed to delete for ${userId}`,
          );
        }
      } catch (err) {
        // A whole batch failing is not fatal — keep going so one bad batch
        // does not strand the rest of the user's storage.
        failed += batch.length;
        this.logger.error(`wipeAll batch failed for ${userId}: ${String(err)}`);
      }
    }

    await this.quota.forgetFiles(userId, deletedKeys);
    const after = await this.quota.storageUsed(userId);

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
    return rows.map((row) => ({
      key: row.key,
      sizeBytes: Number(row.size_bytes),
      contentType: row.content_type,
      albumId: row.album_id,
      createdAt: row.created_at,
      url: this.config.publicUrl(row.key),
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
    filter: { albumId?: string; limit?: number } = {},
  ) {
    const rows = await this.quota.listFiles(userId, filter);
    return rows.map((row) => ({
      key: row.key,
      sizeBytes: Number(row.size_bytes),
      contentType: row.content_type,
      albumId: row.album_id,
      createdAt: row.created_at,
      url: this.config.publicUrl(row.key),
    }));
  }

  async statObject(
    userId: string,
    key: string,
    albumId?: string,
  ): Promise<{ exists: boolean; size: number; contentType?: string }> {
    const client = this.requireClient();
    this.assertOwned(userId, key);

    try {
      const head = await client.send(
        new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
      const size = head.ContentLength ?? 0;

      // Record against the storage quota using the size B2 actually reports,
      // not a number the client supplied. Idempotent on the key.
      await this.quota.recordFile(userId, {
        key,
        sizeBytes: size,
        contentType: head.ContentType,
        scope: key.split('/')[2],
        albumId,
      });

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
