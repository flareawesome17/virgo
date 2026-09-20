import { randomUUID } from 'node:crypto';
import { Agent as HttpsAgent } from 'node:https';
import type { Readable } from 'node:stream';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { MediaLinkService } from './media-link.service';
import {
  accessAllows,
  QuotaService,
  type MediaAccess,
  type StoredMediaKind,
} from '../quota/quota.service';
import {
  ALLOWED_CONTENT_TYPES,
  DOWNLOAD_URL_TTL_SECONDS,
  EXTENSION_BY_CONTENT_TYPE,
  MAX_UPLOAD_BYTES,
  MEDIA_URL_WINDOW_SECONDS,
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
 * `Content-Disposition` for a download, safe for any filename.
 *
 * Two forms on purpose: a stripped ASCII `filename` that every client can
 * read, and RFC 5987 `filename*` carrying the real one. Album names are
 * user-supplied and Filipino ones routinely contain accents — sending those
 * raw produces a header a browser either mangles or rejects outright.
 */
export function contentDisposition(name: string): string {
  // Printable ASCII only for the plain form, and neither of the two
  // characters that would end the quoted string early.
  const ascii = name.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
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
    private readonly mediaLink: MediaLinkService,
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
    if (
      !key ||
      key.includes('..') ||
      key.startsWith('/') ||
      key.includes('//') ||
      key.includes('\\')
    ) {
      throw new BadRequestException('Invalid object key');
    }
  }

  /**
   * Rejects any key that is not inside the caller's own prefix.
   *
   * Still the right check for operations that only ever touch the caller's own
   * rows — wiping their library, retention sweeps, filing their own uploads.
   * Anything reachable through a *shared* album must use `assertCanAccess`
   * instead, because there the prefix answers the wrong question: it says who
   * uploaded the object, not who is allowed to read it.
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

    const windowMs = MEDIA_URL_WINDOW_SECONDS * 1000;
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
  async readStream(key: string): Promise<Readable> {
    const client = this.requireClient();
    this.assertSafeKey(key);
    const res = await client.send(
      new GetObjectCommand({ Bucket: this.config.bucketForKey(key), Key: key }),
    );
    return res.Body as Readable;
  }

  /**
   * Writes a derived object — today only thumbnails.
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
      }),
    );
  }

  /** The object key a stored public URL points at, or null if it is not ours. */
  keyFromPublicUrl(url: string | null | undefined): string | null {
    return this.config.keyFromPublicUrl(url);
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
    const client = this.requireClient();
    // Destroying someone else's media is the highest bar there is.
    await this.assertCanAccess(userId, key, 'manage');

    const targets = await this.quota.objectAndDerivedKeys([key]);
    const deleted = new Set<string>();
    const byBucket = new Map<string, string[]>();
    for (const target of targets.length > 0 ? targets : [key]) {
      const bucket = this.config.bucketForKey(target);
      byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), target]);
    }
    const results = await Promise.all(
      [...byBucket].map(([Bucket, keys]) =>
        client.send(
          new DeleteObjectsCommand({
            Bucket,
            Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: false },
          }),
        ),
      ),
    );
    for (const result of results) {
      for (const item of result.Deleted ?? []) if (item.Key) deleted.add(item.Key);
    }
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
        // A batch can straddle both buckets — avatars live in the public one,
        // everything else in the private one — and DeleteObjects takes exactly
        // one bucket, so the batch is split by where each key actually is.
        const byBucket = new Map<string, string[]>();
        for (const key of batch) {
          const b = this.config.bucketForKey(key);
          const list = byBucket.get(b) ?? [];
          list.push(key);
          byBucket.set(b, list);
        }

        const results = await Promise.all(
          [...byBucket].map(([Bucket, keys]) =>
            client.send(
              new DeleteObjectsCommand({
                Bucket,
                Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: false },
              }),
            ),
          ),
        );
        const res = {
          Deleted: results.flatMap((r) => r.Deleted ?? []),
          Errors: results.flatMap((r) => r.Errors ?? []),
        };
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

    // The user's whole media tree is going, so take the rendition subtree
    // rather than deriving a name per key: it is one call instead of several
    // thousand, and it also collects renditions whose row was never written.
    await this.mediaLink.removeTree(`users/${userId}`);

    return { deleted: deletedKeys.length, failed, freedBytes: before - after };
  }

  /**
   * Deletes a specific set of the user's objects.
   *
   * The shared engine behind wipeAll and the retention sweep. Only keys the
   * bucket confirms deleted are forgotten, so a partial failure leaves the
   * rest still counted against the quota rather than handing back allowance
   * for objects that are still sitting there.
   */
  async deleteKeys(
    userId: string,
    keys: readonly string[],
  ): Promise<{ deleted: number; failed: number }> {
    if (keys.length === 0) return { deleted: 0, failed: 0 };
    const client = this.requireClient();
    const targetKeys = await this.quota.objectAndDerivedKeys(keys);

    const deletedKeys: string[] = [];
    let failed = 0;

    // 1000 is the DeleteObjects maximum.
    for (let i = 0; i < targetKeys.length; i += 1000) {
      const batch = targetKeys.slice(i, i + 1000);
      // Defence in depth: these came from the user's own rows, but the prefix
      // check is what actually guarantees bucket-level scope.
      for (const key of batch) this.assertOwned(userId, key);

      try {
        // A batch can straddle both buckets — avatars live in the public one,
        // everything else in the private one — and DeleteObjects takes exactly
        // one bucket, so the batch is split by where each key actually is.
        const byBucket = new Map<string, string[]>();
        for (const key of batch) {
          const b = this.config.bucketForKey(key);
          const list = byBucket.get(b) ?? [];
          list.push(key);
          byBucket.set(b, list);
        }

        const results = await Promise.all(
          [...byBucket].map(([Bucket, keys]) =>
            client.send(
              new DeleteObjectsCommand({
                Bucket,
                Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: false },
              }),
            ),
          ),
        );
        const res = {
          Deleted: results.flatMap((r) => r.Deleted ?? []),
          Errors: results.flatMap((r) => r.Errors ?? []),
        };
        for (const d of res.Deleted ?? []) {
          if (d.Key) deletedKeys.push(d.Key);
        }
        failed += (res.Errors ?? []).length;
      } catch (err) {
        // One bad batch must not strand the rest.
        failed += batch.length;
        this.logger.error(`deleteKeys batch failed for ${userId}: ${String(err)}`);
      }
    }

    await this.quota.forgetFiles(userId, deletedKeys);
    // Renditions live on the media volume rather than in a bucket, so nothing
    // above touches them. Derived from the originals that were asked for, not
    // from what came back deleted: a rendition whose source is already gone is
    // the case that most needs collecting.
    await this.mediaLink.removeFor(keys);
    return { deleted: deletedKeys.length, failed };
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
    const [urls, thumbnailUrls, posterUrls, downloadUrls] = await Promise.all([
      this.mediaUrls(page.rows.map((row) => row.key)),
      this.mediaUrls(page.rows.map((row) => row.thumb_key)),
      this.mediaUrls(page.rows.map((row) => row.poster_key)),
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

  async statObject(
    userId: string,
    key: string,
    albumId?: string,
    originalName?: string,
  ): Promise<{ exists: boolean; size: number; contentType?: string }> {
    const client = this.requireClient();
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
      await this.quota.recordFile(attributeTo, {
        key,
        sizeBytes: size,
        contentType: head.ContentType,
        scope: key.split('/')[2],
        albumId,
        originalName: cleanOriginalName(originalName),
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
