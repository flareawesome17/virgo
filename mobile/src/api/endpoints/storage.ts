import * as FileSystem from 'expo-file-system/legacy';
import { api } from '../client';
import { ApiError } from '../errors';

export type UploadScope = 'albums' | 'avatars' | 'workspaces' | 'misc';

export interface UploadTicket {
  key: string;
  uploadUrl: string;
  publicUrl: string | null;
  requiredHeaders: Record<string, string>;
  expiresAt: string;
}

export interface StoredFile {
  key: string;
  sizeBytes: number;
  contentType: string | null;
  albumId: string | null;
  createdAt: string;
  /** CDN URL, or null when the bucket is private. */
  url: string | null;
  thumbnailUrl: string | null;
  posterUrl: string | null;
  /**
   * A web-playable H.264 copy on the media host, or null when there is none.
   *
   * Prefer it over `url` for playback. The original may be HEVC, 10-bit or
   * ProRes — none of which a browser decodes — and is served from a bucket
   * on the other side of the Pacific. Null means no proxy yet, so fall back
   * to `url`, which is what every player did before this field existed.
   */
  proxyUrl: string | null;
  /**
   * Intermediate copies of a photograph for viewing, narrowest first.
   *
   * Use these for anything larger than a grid tile. `url` is the original —
   * a 6 MB camera JPEG, or a 40 MB TIFF, fetched from a bucket on the other
   * side of the Pacific. Empty means there are none, so fall back to `url`.
   */
  displaySources: { width: number; url: string }[];
  /**
   * An HLS master playlist, or null when there is no ladder.
   *
   * Prefer it over `proxyUrl` for film: it adapts to the connection instead
   * of committing to one bitrate. Built when an album is shared, so null is
   * the normal state for unshared work — fall through to `proxyUrl`, then
   * `url`.
   *
   * Safari and iOS play it natively. Everywhere else needs hls.js.
   */
  hlsUrl: string | null;
  /**
   * A ~300 byte inline preview, safe to paint immediately.
   *
   * Arrives in the listing rather than being fetched, so a grid can render
   * every tile before requesting a single thumbnail. Null means there is
   * none — show the flat box, which is what shipped before this existed.
   */
  blurDataUrl: string | null;
  downloadUrl: string | null;
  originalName: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  mediaTitle: string | null;
  mediaArtist: string | null;
  processingStatus: 'pending' | 'ready' | 'failed' | 'not_required';
  capabilities: { download: boolean; delete: boolean; manage: boolean };
}

export type StoredMediaKind = 'image' | 'video' | 'audio' | 'other';

export interface StoredFilesPage {
  data: StoredFile[];
  total: number;
  nextCursor: string | null;
  counts: Record<StoredMediaKind, number>;
}

function mediaKind(contentType: string | null): StoredMediaKind {
  if (contentType?.startsWith('image/')) return 'image';
  if (contentType?.startsWith('video/')) return 'video';
  if (contentType?.startsWith('audio/')) return 'audio';
  return 'other';
}

/**
 * Narrows the display-copy list, dropping anything malformed.
 *
 * An older API returns nothing here and a newer one could add a field, so
 * this validates every entry rather than trusting the shape — a bad `width`
 * would otherwise reach `srcset` and take the whole attribute down with it,
 * costing the viewer the photograph rather than one size of it.
 */
function displaySourcesFromUnknown(value: unknown): StoredFile['displaySources'] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is { width: number; url: string } =>
      !!entry &&
      typeof entry === 'object' &&
      typeof (entry as { url?: unknown }).url === 'string' &&
      typeof (entry as { width?: unknown }).width === 'number' &&
      Number.isFinite((entry as { width: number }).width) &&
      (entry as { width: number }).width > 0)
    .map((entry) => ({ width: entry.width, url: entry.url }))
    .sort((a, b) => a.width - b.width);
}

/**
 * Narrows the inline preview, refusing anything that is not an image.
 *
 * This string goes straight into an `src` or a CSS `url()`, so the media type
 * is the whole security question — `data:text/html` in an `src` is a script
 * execution. The API only ever produces `image/webp`, and this is the check
 * that keeps that true at the boundary rather than by assumption.
 */
function blurDataUrlFromUnknown(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (!/^data:image\/(webp|png|jpeg|avif);base64,[A-Za-z0-9+/=]+$/.test(value)) return null;
  // A preview that costs more than the thumbnail it stands in for has stopped
  // being an optimisation, and this one rides in a listing of hundreds.
  return value.length <= 4000 ? value : null;
}
/** The widest copy, or null when there are none. */
export function largestDisplaySource(file: StoredFile): string | null {
  return file.displaySources.at(-1)?.url ?? null;
}

/** A `srcset` value, or null when there is nothing to build one from. */
export function displaySrcSet(file: StoredFile): string | null {
  if (!file.displaySources.length) return null;
  return file.displaySources.map((source) => `${source.url} ${source.width}w`).join(', ');
}

function storedFileFromUnknown(value: unknown): StoredFile | null {
  if (!value || typeof value !== 'object') return null;
  const file = value as Partial<StoredFile> & Record<string, unknown>;
  if (typeof file.key !== 'string') return null;
  const contentType = typeof file.contentType === 'string' ? file.contentType : null;
  const capabilities = file.capabilities && typeof file.capabilities === 'object'
    ? file.capabilities as Partial<StoredFile['capabilities']>
    : {};

  return {
    key: file.key,
    sizeBytes: typeof file.sizeBytes === 'number' ? file.sizeBytes : 0,
    contentType,
    albumId: typeof file.albumId === 'string' ? file.albumId : null,
    createdAt: typeof file.createdAt === 'string' ? file.createdAt : new Date(0).toISOString(),
    url: typeof file.url === 'string' ? file.url : null,
    thumbnailUrl: typeof file.thumbnailUrl === 'string'
      ? file.thumbnailUrl
      : typeof file.thumbUrl === 'string' ? file.thumbUrl : null,
    posterUrl: typeof file.posterUrl === 'string' ? file.posterUrl : null,
    proxyUrl: typeof file.proxyUrl === 'string' ? file.proxyUrl : null,
    displaySources: displaySourcesFromUnknown(file.displaySources),
    hlsUrl: typeof file.hlsUrl === 'string' ? file.hlsUrl : null,
    blurDataUrl: blurDataUrlFromUnknown(file.blurDataUrl),
    downloadUrl: typeof file.downloadUrl === 'string' ? file.downloadUrl : null,
    originalName: typeof file.originalName === 'string' && file.originalName.trim()
      ? file.originalName
      : file.key.split('/').pop() ?? file.key,
    width: typeof file.width === 'number' ? file.width : null,
    height: typeof file.height === 'number' ? file.height : null,
    durationMs: typeof file.durationMs === 'number' ? file.durationMs : null,
    mediaTitle: typeof file.mediaTitle === 'string' ? file.mediaTitle : null,
    mediaArtist: typeof file.mediaArtist === 'string' ? file.mediaArtist : null,
    processingStatus: ['pending', 'ready', 'failed', 'not_required'].includes(String(file.processingStatus))
      ? file.processingStatus as StoredFile['processingStatus']
      : contentType && mediaKind(contentType) !== 'other' ? 'ready' : 'not_required',
    capabilities: {
      download: capabilities.download === true,
      delete: capabilities.delete === true,
      manage: capabilities.manage === true,
    },
  };
}

/**
 * Keeps released apps usable while the paginated API rolls out.
 *
 * Older Virgo API versions return `StoredFile[]` directly and ignore the
 * `kind`/`cursor` query fields. Treating that array as a page made every media
 * room flatten `undefined` and show a false empty state. Normalising at the API
 * boundary also fills metadata defaults that those older rows do not carry.
 */
export function normalizeStoredFilesResponse(
  response: unknown,
  requestedKind?: StoredMediaKind,
): StoredFilesPage {
  const envelope = !Array.isArray(response) && response && typeof response === 'object'
    ? response as Partial<StoredFilesPage>
    : null;
  const source = Array.isArray(response)
    ? response
    : Array.isArray(envelope?.data) ? envelope.data : [];
  const allFiles = source.map(storedFileFromUnknown).filter((file): file is StoredFile => !!file);
  const data = requestedKind
    ? allFiles.filter((file) => mediaKind(file.contentType) === requestedKind)
    : allFiles;
  const derivedCounts = allFiles.reduce<Record<StoredMediaKind, number>>(
    (counts, file) => ({ ...counts, [mediaKind(file.contentType)]: counts[mediaKind(file.contentType)] + 1 }),
    { image: 0, video: 0, audio: 0, other: 0 },
  );
  const hasServerCounts = !!envelope?.counts
    && ['image', 'video', 'audio', 'other'].every((kind) => typeof envelope.counts?.[kind as StoredMediaKind] === 'number');
  const counts = hasServerCounts ? envelope!.counts! : derivedCounts;

  return {
    data,
    total: hasServerCounts && typeof envelope?.total === 'number'
      ? envelope.total
      : requestedKind ? counts[requestedKind] : data.length,
    nextCursor: typeof envelope?.nextCursor === 'string' ? envelope.nextCursor : null,
    counts,
  };
}

export interface StorageBreakdown {
  byAlbum: {
    albumId: string | null;
    /** null for files not filed into an album. */
    name: string | null;
    bytes: number;
    files: number;
  }[];
  byType: { kind: string; bytes: number; files: number }[];
}

export interface WipeResult {
  deleted: number;
  /** Objects the bucket refused to delete; their quota is still counted. */
  failed: number;
  freedBytes: number;
}

export interface UploadResult {
  key: string;
  /** CDN URL, when the bucket is publicly served. Store this on the row. */
  publicUrl: string | null;
  size: number;
}

/**
 * Object storage (Backblaze B2), via presigned URLs.
 *
 * The file goes from the device straight to B2 — it never passes through the
 * API server. The server only issues and validates the signature.
 */
/**
 * The signed headers, minus the one that cannot be sent by hand.
 *
 * Matched case-insensitively: the server sends `Content-Length`, but a header
 * map is not case-sensitive and a future change to `content-length` must not
 * quietly restore the hang.
 */
function withoutContentLength(
  headers: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(
      ([name]) => name.toLowerCase() !== 'content-length',
    ),
  );
}

/**
 * The largest single file the API will issue a ticket for.
 *
 * Mirrors MAX_UPLOAD_BYTES in api/src/storage/storage.config.ts. Duplicated
 * rather than fetched because it is needed the moment a file is picked, before
 * any request — and a picker that has to ask the server how big a file may be
 * is a picker that cannot answer while offline.
 *
 * Checked here as well as there so the answer is "that file is too large",
 * named and in megabytes, rather than a 400 carrying `contentLength must not
 * be greater than 524288000` after the file has been chosen and queued.
 */
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

export const storageApi = {
  /** Step 1: ask the server for a signed PUT URL. Keys are server-generated. */
  createUploadUrl(input: {
    contentType: string;
    scope: UploadScope;
    contentLength: number;
  }): Promise<UploadTicket> {
    return api.post<UploadTicket>('/storage/upload-url', { body: input });
  },

  /** Step 3: confirm the object actually landed before saving its URL. */
  confirm(key: string, albumId?: string, originalName?: string): Promise<{
    exists: boolean;
    size: number;
    contentType?: string;
  }> {
    return api.post('/storage/confirm', { body: { key, albumId, originalName } });
  },

  /** Objects the user has stored, optionally narrowed to one album. */
  async listFiles(params: {
    albumId?: string;
    limit?: number;
    cursor?: string;
    kind?: StoredMediaKind;
  } = {}): Promise<StoredFilesPage> {
    const response = await api.get<unknown>('/storage/files', { query: params });
    return normalizeStoredFilesResponse(response, params.kind);
  },

  /** Objects uploaded before an album was chosen. */
  listUnassigned(limit = 200): Promise<{ data: StoredFile[]; total: number }> {
    return api.get('/storage/files/unassigned', { query: { limit } });
  },

  /** Files already-stored objects into one of the caller's albums. */
  attachToAlbum(keys: string[], albumId: string): Promise<{ attached: number }> {
    return api.post('/storage/attach', { body: { keys, albumId } });
  },

  /** Storage split by album and by media type. */
  breakdown(): Promise<StorageBreakdown> {
    return api.get('/storage/breakdown');
  },

  /**
   * Deletes every stored object for this account. Irreversible.
   *
   * The literal 'DELETE' is required by the server, so this cannot be
   * triggered by an empty or accidental request body.
   */
  wipeAll(): Promise<WipeResult> {
    return api.post('/storage/wipe', { body: { confirm: 'DELETE' } });
  },

  /** Time-limited read URL, for buckets that are not publicly served. */
  async downloadUrl(key: string): Promise<string> {
    const { url } = await api.post<{ url: string }>('/storage/download-url', {
      body: { key },
    });
    return url;
  },

  remove(key: string): Promise<void> {
    return api.post<void>('/storage/delete', { body: { key } });
  },

  /**
   * Full upload flow: ticket -> PUT -> confirm.
   *
   * Uses expo-file-system's uploadAsync rather than fetch(blob): it streams
   * from disk, so a large video does not have to be read into memory first.
   */
  async uploadFile(
    fileUri: string,
    options: {
      contentType: string;
      scope: UploadScope;
      /** Links the upload to an album so album screens can list it. */
      albumId?: string;
      originalName?: string;
      /** Called with 0-1 as bytes reach B2. Real progress, not simulated. */
      onProgress?: (fraction: number) => void;
      /**
       * The object key, the moment it exists — before any bytes are sent.
       *
       * The upload survives this process: the transfer runs in a native
       * background session, so it can finish after the app is gone and the
       * `confirm` below never runs. Something that persists the queue needs
       * the key to ask the server, on the next launch, whether the object
       * landed. Without it an interrupted upload is unfindable: the bytes are
       * in the bucket under a key only the dead process knew.
       */
      onTicket?: (key: string) => void;
    },
  ): Promise<UploadResult> {
    // `size` is returned on FileInfo whenever the file exists; it is not an
    // option to request (InfoOptions only carries `md5`).
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists) {
      throw new ApiError(0, 'That file no longer exists on this device.');
    }

    const contentLength = info.size ?? 0;
    if (contentLength <= 0) {
      throw new ApiError(0, 'That file appears to be empty.');
    }

    /**
     * One ticket and one attempt at sending it.
     *
     * Separated so it can be run twice. A presigned URL is good for fifteen
     * minutes (UPLOAD_URL_TTL_SECONDS), and a queue of large videos on a slow
     * connection takes longer than that — so the ticket for the last file in a
     * batch can expire while the first is still going. B2 answers an expired
     * signature with 403, which surfaced as "Upload failed. Please try again"
     * on a file that had done nothing wrong and would fail the same way on
     * every retry, because the dead ticket was minted once and kept.
     */
    const attempt = async () => {
      const ticket = await this.createUploadUrl({
        contentType: options.contentType,
        scope: options.scope,
        contentLength,
      });

      // Before the bytes, not after: an upload that outlives this process has
      // to be findable, and the key is the only handle on it.
      options.onTicket?.(ticket.key);

      const uploadOptions = {
      httpMethod: 'PUT' as const,
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      // The signed headers must go out exactly as issued — except
      // Content-Length, which no HTTP client lets you set by hand.
      //
      // The native uploader sets it itself from the file it streams, and that
      // is the same number the ticket was signed for, so the signature still
      // matches. Passing it through as well left OkHttp holding two lengths for
      // one body: the request never went out, no error was raised, and the
      // upload sat at 0% for as long as anyone was willing to watch it.
      //
      // web/src/api/endpoints/storage.ts drops it for the same reason — there
      // the browser refuses the assignment outright, which is why uploads work
      // on web and hung on Android.
        headers: withoutContentLength(ticket.requiredHeaders),
      };

      // createUploadTask reports real bytes-sent; uploadAsync gives no progress.
      const response = options.onProgress
        ? await FileSystem.createUploadTask(
            ticket.uploadUrl,
            fileUri,
            uploadOptions,
            (data) => {
              const total = data.totalBytesExpectedToSend || contentLength;
              if (total > 0) {
                options.onProgress?.(Math.min(data.totalBytesSent / total, 1));
              }
            },
          ).uploadAsync()
        : await FileSystem.uploadAsync(ticket.uploadUrl, fileUri, uploadOptions);

      return { ticket, response };
    };

    let { ticket, response } = await attempt();

    // 403 and nothing else. An expired signature and a signature that never
    // matched are indistinguishable from here — both are 403 — so this retries
    // once with a fresh ticket and lets a genuine rejection fail the second
    // time, which costs one request rather than a silent loop.
    if (response && response.status === 403) {
      ({ ticket, response } = await attempt());
    }

    if (!response) {
      throw new ApiError(0, 'Upload was cancelled.');
    }

    if (response.status < 200 || response.status >= 300) {
      throw new ApiError(response.status, 'Upload failed. Please try again.');
    }

    // A 2xx from B2 is good evidence, but confirming via the API is what
    // guarantees a row never ends up pointing at a missing object.
    const stat = await this.confirm(ticket.key, options.albumId, options.originalName);
    if (!stat.exists) {
      throw new ApiError(0, 'Upload could not be verified. Please try again.');
    }

    return {
      key: ticket.key,
      publicUrl: ticket.publicUrl,
      size: stat.size,
    };
  },
};

/** Maps an expo-image-picker asset to a content type the API accepts. */
export function contentTypeForAsset(asset: {
  mimeType?: string | null;
  uri: string;
}): string {
  if (asset.mimeType) return asset.mimeType;

  const ext = asset.uri.split('.').pop()?.toLowerCase() ?? '';
  const byExt: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    avif: 'image/avif',
    heic: 'image/heic',
    heif: 'image/heif',
    gif: 'image/gif',
    tif: 'image/tiff',
    tiff: 'image/tiff',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    wav: 'audio/wav',
    aac: 'audio/aac',
    flac: 'audio/flac',
    ogg: 'audio/ogg',
    pdf: 'application/pdf',
  };
  return byExt[ext] ?? 'application/octet-stream';
}
