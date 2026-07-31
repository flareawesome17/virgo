import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Scopes map to folders. Anything not listed is rejected. */
export const UPLOAD_SCOPES = [
  'albums',
  'avatars',
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

/** Presigned URLs are short-lived — long enough to start an upload, not to share. */
export const UPLOAD_URL_TTL_SECONDS = 15 * 60;
export const DOWNLOAD_URL_TTL_SECONDS = 60 * 60;

@Injectable()
export class StorageConfig {
  private readonly logger = new Logger(StorageConfig.name);

  readonly provider: string;
  readonly bucket: string;
  readonly endpoint: string;
  readonly region: string;
  readonly keyId: string;
  readonly applicationKey: string;
  readonly cdnBaseUrl: string;
  readonly forcePathStyle: boolean;

  constructor(config: ConfigService) {
    this.provider = config.get<string>('STORAGE_PROVIDER', 'b2');
    this.bucket = config.get<string>('B2_BUCKET_NAME', '');
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
  cdnOrigin(): string {
    if (!this.cdnBaseUrl) return '';
    try {
      return new URL(this.cdnBaseUrl).origin;
    } catch {
      return '';
    }
  }
}
