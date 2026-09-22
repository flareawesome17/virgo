import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Scopes map to folders. Anything not listed is rejected. */
export const UPLOAD_SCOPES = [
  'albums',
  'avatars',
  'covers',
  'workspaces',
  'misc',
] as const;
export type UploadScope = (typeof UPLOAD_SCOPES)[number];

/**
 * Content types clients may upload.
 *
 * An allow-list rather than a block-list: uploading `text/html` to a bucket
 * served from a CDN domain is a stored-XSS vector, and `application/*` covers
 * a lot of things nobody wants executed off your domain.
 */
export const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  // AVIF is what modern export pipelines and Google Photos increasingly
  // produce; without it those uploads were rejected at the presign step.
  'image/avif',
  'image/heic',
  'image/heif',
  'image/gif',
  // TIFF is a working format photographers actually deliver in.
  'image/tiff',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/aac',
  'audio/flac',
  'audio/ogg',
  'application/pdf',
] as const;

export const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/gif': 'gif',
  'image/tiff': 'tif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/wav': 'wav',
  'audio/aac': 'aac',
  'audio/flac': 'flac',
  'audio/ogg': 'ogg',
  'application/pdf': 'pdf',
};

/** 500 MB. Videos are the reason this is not smaller. */
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

/**
 * Avatars and profile covers, by key shape.
 *
 * Keyed off the path rather than a column because it has to give the same
 * answer for an object whose `user_files` row was never written.
 */
const AVATAR_KEY = /^users\/[^/]+\/avatars\//;
const COVER_KEY = /^users\/[^/]+\/covers\//;
/** Objects kept in the public bucket at a permanent CDN URL. */
const PUBLIC_KEY = /^users\/[^/]+\/(avatars|covers)\//;

/**
 * What a cover upload may be: stills the server's sharp can decode.
 *
 * Never GIF, video or PDF, and not HEIC either. The prebuilt sharp in the
 * image reads HEIF only when it is AVIF, so a HEIC cover could only ever end
 * in "that photo couldn't be used", after the bytes had gone up. The phone
 * crops and re-encodes to JPEG before it uploads, so it never sends one.
 */
export const COVER_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
] as const;

/**
 * Headroom, not a target. The phone sends a JPEG of at most 2048 px, which is
 * around a megabyte; this only has to leave room for a web upload of a
 * full-size photo, and keeps a decode on the confirm path small.
 */
export const MAX_COVER_BYTES = 15 * 1024 * 1024;

/**
 * What a profile photo may be.
 *
 * The avatars scope used to take anything the bucket takes, films and PDFs
 * included, up to 500 MB. None of that can be made into an avatar, and one
 * that cannot be re-encoded is refused and deleted at confirm, so the ticket
 * says no first.
 */
export const PROFILE_PHOTO_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/heic',
  'image/heif',
  'image/gif',
  'image/tiff',
] as const;

/** thumbnails.service MAX_SOURCE_BYTES: above it sharp is not asked. */
export const MAX_AVATAR_BYTES = 40 * 1024 * 1024;

/** Presigned URLs are short-lived — long enough to start an upload, not to share. */
export const UPLOAD_URL_TTL_SECONDS = 15 * 60;
export const DOWNLOAD_URL_TTL_SECONDS = 60 * 60;

/**
 * How long a signed media URL stays byte-identical.
 *
 * Signatures are pinned to this window so repeat renders return the same URL
 * and the browser can serve the image from cache instead of refetching it.
 * Shorter means fresher links and worse caching; longer means the opposite.
 */
export const MEDIA_URL_WINDOW_SECONDS = 5 * 60;

/**
 * Longer, for media on pages that are deliberately public — a client gallery
 * or a published profile. Those are rendered once and then looked at for a
 * while, sometimes from a page a crawler cached, so a link that dies in an
 * hour shows up as a broken photograph in somebody's search results.
 */
export const PUBLISHED_URL_TTL_SECONDS = 24 * 60 * 60;

/**
 * For media shown inside the app — thumbnails, posters, the photo in the
 * lightbox. Not downloads, which keep DOWNLOAD_URL_TTL_SECONDS.
 *
 * Twelve hours, so that DISPLAY_URL_WINDOW_SECONDS below can be six and a URL
 * still has at least six hours left on the moment it is handed out.
 */
export const DISPLAY_URL_TTL_SECONDS = 12 * 60 * 60;

/**
 * How long a long-lived display URL stays byte-identical.
 *
 * Five minutes was right for the one-hour links it was chosen for, and wrong
 * for everything else. The same thumbnail came back under a new URL every five
 * minutes, and every cache between here and the screen — the browser's, the
 * phone's, Cloudflare's — keys on the URL. Reopening the app after a coffee
 * downloaded every picture again. Six hours is a working session.
 *
 * The cost is on the other side of the trade: a display link that leaks keeps
 * working for up to DISPLAY_URL_TTL_SECONDS rather than an hour. Published
 * shares already allow twenty-four.
 */
export const DISPLAY_URL_WINDOW_SECONDS = 6 * 60 * 60;

/**
 * The window a URL with this lifetime is pinned to.
 *
 * Tied to the lifetime rather than chosen per call site, because the two are
 * only safe together: a URL is handed out anywhere within its window, so it
 * has at least `ttl - window` left when it arrives. A six-hour window on a
 * one-hour link would hand out links that had already expired.
 *
 * So downloads, processing sources and anything else short-lived keep the
 * five-minute window they always had, and only links built to last half a day
 * or more move to six hours. Every tier keeps at least half its lifetime.
 */
export function signingWindowFor(ttlSeconds: number): number {
  return ttlSeconds >= DISPLAY_URL_TTL_SECONDS
    ? DISPLAY_URL_WINDOW_SECONDS
    : MEDIA_URL_WINDOW_SECONDS;
}

/**
 * For derived objects, whose bytes are fixed by the time anyone can see them.
 *
 * Every upload gets a fresh key, and a thumbnail or poster is written under a
 * key derived from it. That is what makes `immutable` true, and it is what
 * lets a browser, a phone and Cloudflare keep a picture for good instead of
 * asking again.
 *
 * Two writes do replace bytes under an existing key: avatar and cover
 * normalisation rewrite the uploaded original as a WebP, in place. It is safe
 * only because it happens inside the confirm request, which the client waits
 * on before it saves the new avatar or cover to the profile — so no cache can
 * have fetched the original under that key first. Both are idempotent, so a
 * repeated confirm returns what is stored rather than encoding a displayed
 * key again. Anything that rewrites a displayed key after the fact must not
 * use this.
 *
 * Reprocessing does rewrite thumbnails and posters under their existing keys
 * (migrations 064 and 065 re-queue files to do exactly that). It is only
 * truthful because the same source through the same settings produces the
 * same bytes. **Changing how a derivative is made — its size, quality or the
 * frame a poster is taken from — must change its key as well**, or every cache
 * that holds the old one keeps showing it for a year.
 *
 * Nothing Virgo stored carried a Cache-Control header before this, so every
 * cache fell back to its own guess — which for most of them was not to keep it.
 */
export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

@Injectable()
export class StorageConfig {
  private readonly logger = new Logger(StorageConfig.name);

  readonly provider: string;
  /** The original bucket. Public, and holds nothing but avatars and covers. */
  readonly bucket: string;
  /** Private. Everything that is somebody's work rather than their face. */
  readonly mediaBucket: string;
  readonly endpoint: string;
  readonly region: string;
  readonly keyId: string;
  readonly applicationKey: string;
  readonly cdnBaseUrl: string;
  readonly forcePathStyle: boolean;

  constructor(config: ConfigService) {
    this.provider = config.get<string>('STORAGE_PROVIDER', 'b2');
    this.bucket = config.get<string>('B2_BUCKET_NAME', '');
    // Falls back to the public bucket when unset, so a deployment that has not
    // been given the new name keeps working exactly as before rather than
    // failing every upload with a missing-bucket error.
    this.mediaBucket =
      config.get<string>('B2_MEDIA_BUCKET_NAME', '') || this.bucket;
    // Backblaze shows the endpoint as a bare host (`s3.us-west-004.backblazeb2.com`),
    // but the AWS SDK needs an absolute URL and throws "Invalid URL" without a
    // scheme. Accept either form rather than making the value format load-bearing.
    this.endpoint = StorageConfig.normalizeEndpoint(
      config.get<string>('B2_ENDPOINT', ''),
    );
    this.region = config.get<string>('B2_REGION', '');
    this.keyId = config.get<string>('B2_KEY_ID', '');
    this.applicationKey = config.get<string>('B2_APPLICATION_KEY', '');
    // Trailing slash would produce `//users/...` in every public URL.
    this.cdnBaseUrl = config.get<string>('CDN_BASE_URL', '').replace(/\/+$/, '');
    this.forcePathStyle = config.get<string>('B2_FORCE_PATH_STYLE') === 'true';

    if (!this.isConfigured) {
      this.logger.warn(
        'Storage is not fully configured — upload endpoints will return 503.',
      );
    }
  }

  /**
   * Which bucket an object lives in, decided by its key.
   *
   * Avatars stay in the public bucket because they are stored as whole URLs —
   * `users.avatar_url`, and denormalised copies in `friends` and
   * `collaborators` — and a URL in a database has to keep resolving. Covers
   * are stored the same way, in `users.cover_url`. Nothing else is referenced
   * that way, so everything else lives in the private bucket and is reached
   * through a signed URL.
   *
   * Keyed off the path rather than a column so it gives the same answer for an
   * object whose row was never written, of which there are more than you would
   * hope: the bucket had 30 objects with no `user_files` row at all.
   */
  bucketForKey(key: string): string {
    return PUBLIC_KEY.test(key) ? this.bucket : this.mediaBucket;
  }

  /**
   * Is this an avatar?
   *
   * The same test `bucketForKey` uses, named because two things now turn on
   * it: which bucket the object lives in, and whether it gets resized on
   * confirm.
   */
  isAvatarKey(key: string): boolean {
    return AVATAR_KEY.test(key);
  }

  /**
   * Is this a profile cover?
   *
   * Covers share the public bucket with avatars but not their handling: a
   * cover is re-encoded at a different size on confirm and set through its
   * own endpoint, so the two tests are kept apart.
   */
  isCoverKey(key: string): boolean {
    return COVER_KEY.test(key);
  }

  /**
   * Is this an avatar or a cover — an object at a permanent public URL?
   *
   * Those are never filed into an album. An album can be deleted or swept by
   * retention, and a profile photo filed into one would go with it and leave
   * the profile pointing at nothing.
   */
  isPublicKey(key: string): boolean {
    return PUBLIC_KEY.test(key);
  }

  /**
   * The object key a stored public URL points at, or null if it is not ours.
   *
   * `avatar_url` holds a whole URL rather than a key, so removing the previous
   * avatar means working backwards from the string that was saved.
   */
  keyFromPublicUrl(url: string | null | undefined): string | null {
    if (!url || !this.cdnBaseUrl || !url.startsWith(`${this.cdnBaseUrl}/`)) {
      return null;
    }
    try {
      const path = decodeURIComponent(new URL(url).pathname).replace(/^\/+/, '');
      return path || null;
    } catch {
      return null;
    }
  }

  /** Which bucket a new upload of this scope should be written to. */
  /**
   * Every distinct bucket in play, de-duplicated.
   *
   * De-duplicated because `mediaBucket` falls back to `bucket` when the split
   * is not configured — a health probe would otherwise check the same bucket
   * twice and report two results for one thing.
   */
  buckets(): string[] {
    return [...new Set([this.bucket, this.mediaBucket].filter(Boolean))];
  }

  bucketForScope(scope: string): string {
    return scope === 'avatars' || scope === 'covers' ? this.bucket : this.mediaBucket;
  }

  private static normalizeEndpoint(raw: string): string {
    const trimmed = raw.trim().replace(/\/+$/, '');
    if (!trimmed) return '';
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  }

  get isConfigured(): boolean {
    return Boolean(
      this.bucket &&
        this.endpoint &&
        this.region &&
        this.keyId &&
        this.applicationKey,
    );
  }

  /** Public URL for an object, when the bucket is served through a CDN. */
  publicUrl(key: string): string | null {
    return this.cdnBaseUrl ? `${this.cdnBaseUrl}/${key}` : null;
  }

  /**
   * Scheme + host of the CDN, for Content-Security-Policy source lists.
   *
   * CSP matches on origin, so the path portion of CDN_BASE_URL has to be
   * dropped — a directive carrying a path would never match.
   */
  /**
   * Origin(s) that media URLs actually resolve to, for CSP source lists.
   *
   * Signed URLs point at the storage endpoint, not at the CDN, so listing the
   * CDN here stopped being right the moment the bucket went private — the
   * gallery would render with every photograph blocked. Both forms are
   * emitted because the URL style depends on `forcePathStyle`: path-style puts
   * the bucket in the path and keeps the endpoint host, virtual-host style
   * makes it a subdomain.
   */
  mediaOrigins(): string[] {
    if (!this.endpoint) return [];
    try {
      const { protocol, host } = new URL(this.endpoint);
      return [`${protocol}//${host}`, `${protocol}//*.${host}`];
    } catch {
      return [];
    }
  }

  cdnOrigin(): string {
    if (!this.cdnBaseUrl) return '';
    try {
      return new URL(this.cdnBaseUrl).origin;
    } catch {
      return '';
    }
  }
}
