import { api } from '../client';
import { API_BASE_URL } from '../config';
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
  /**
   * When it was taken, as the camera's wall clock — `2026-03-14T16:42:05`,
   * no zone. Group by its date exactly as written; do not parse it into a
   * Date and back, which moves late-night frames to the next day for anyone
   * outside the zone it was shot in. Null means unknown: use `createdAt`.
   */
  takenAt: string | null;
  /** The album section it is filed under, or null for unsorted. */
  sectionId: string | null;
  /** The client picked it from the delivery link. */
  picked: boolean;
  capabilities: { download: boolean; delete: boolean; manage: boolean };
}

/** Which end of an album a listing starts from, by capture time. */
export type FileOrder = 'newest' | 'oldest';

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
    takenAt: typeof file.takenAt === 'string'
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(file.takenAt)
      ? file.takenAt
      : null,
    sectionId: typeof file.sectionId === 'string' ? file.sectionId : null,
    picked: file.picked === true,
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

/** Accepts both the legacy raw array and the paginated gallery response. */
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
 * The largest single file the API will issue a ticket for.
 *
 * Mirrors MAX_UPLOAD_BYTES in api/src/storage/storage.config.ts. Duplicated
 * rather than fetched because it is needed the moment a file is chosen, before
 * any request is made.
 */
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

export const storageApi = {
  /** Step 1: ask the server for a signed PUT URL. Keys are server-generated. */
  createUploadUrl(input: {
    contentType: string;
    scope: UploadScope;
    contentLength: number;
    /**
     * The album it is for. Into someone else's album the file counts toward
     * their storage, so that is the storage the ticket is checked against.
     */
    albumId?: string;
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
  async listFiles(
    params: {
      albumId?: string;
      limit?: number;
      cursor?: string;
      kind?: StoredMediaKind;
      /** By capture time. Newest first when omitted. */
      order?: FileOrder;
      /** A section id, or 'none' for unsorted. Needs `albumId`. */
      section?: string;
      /** Only what the client picked. Needs `albumId`. */
      picked?: boolean;
    } = {},
  ): Promise<StoredFilesPage> {
    const response = await api.get<unknown>('/storage/files', {
      query: { ...params, picked: params.picked ? 'true' : undefined },
    });
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
   * Deletes a selection in one request. All-or-nothing on permission: if any
   * file may not be deleted by this account, nothing is.
   */
  removeMany(keys: string[]): Promise<{ deleted: number; failed: number }> {
    return api.post('/storage/delete-many', { body: { keys } });
  },

  /**
   * A short-lived URL that downloads the selection as one zip.
   *
   * Open it by navigation, not fetch: the point is that the browser's own
   * download manager takes the stream, however large, instead of memory.
   */
  async zipUrl(albumId: string, keys: string[]): Promise<string> {
    const { path } = await api.post<{ path: string }>('/storage/zip', {
      body: { albumId, keys },
    });
    return `${API_BASE_URL}${path}`;
  },

  /**
   * Full upload flow: ticket -> PUT -> confirm.
   *
   * XMLHttpRequest rather than fetch: fetch still cannot report upload
   * progress in any browser, and a photographer pushing a 2 GB video needs to
   * see that something is happening. The browser streams the File from disk,
   * so it is not read into memory first.
   */
  async uploadFile(
    file: File,
    options: {
      contentType?: string;
      scope: UploadScope;
      /** Links the upload to an album so album routes can list it. */
      albumId?: string;
      /** Called with 0-1 as bytes reach B2. Real progress, not simulated. */
      onProgress?: (fraction: number) => void;
      /** Lets the caller cancel an upload in flight. */
      signal?: AbortSignal;
    },
  ): Promise<UploadResult> {
    const contentLength = file.size;
    if (contentLength <= 0) {
      throw new ApiError(0, 'That file appears to be empty.');
    }

    const contentType =
      options.contentType || file.type || contentTypeForName(file.name);

    /**
     * One ticket and one attempt at sending it.
     *
     * Separated so it can be run twice. A presigned URL is good for fifteen
     * minutes (UPLOAD_URL_TTL_SECONDS on the API), and a queue of large videos
     * on a slow connection takes longer than that — so the ticket for the last
     * file in a batch can expire while the first is still uploading. B2
     * answers an expired signature with 403, which surfaced as "Upload failed.
     * Please try again" on a file that had done nothing wrong and would fail
     * the same way however many times it was retried, because the dead ticket
     * was minted once and kept.
     */
    const attempt = async () => {
      const ticket = await this.createUploadUrl({
        contentType,
        scope: options.scope,
        contentLength,
        albumId: options.albumId,
      });

      await putToBucket(file, ticket, options.onProgress, options.signal);
      return ticket;
    };

    let ticket: UploadTicket;
    try {
      ticket = await attempt();
    } catch (error) {
      // 403 and nothing else, once. An expired signature and one that never
      // matched are indistinguishable from here, so a genuine rejection fails
      // on the second attempt rather than looping. A cancelled upload rejects
      // with status 0 and so is rethrown untouched — retrying something the
      // user stopped would be worse than the bug.
      if (!(error instanceof ApiError) || error.status !== 403) throw error;

      // The bar jumps back to zero here, which is honest: the bytes from the
      // first attempt were refused and are being sent again.
      options.onProgress?.(0);
      ticket = await attempt();
    }

    // A 2xx from B2 is good evidence, but confirming via the API is what
    // guarantees a row never ends up pointing at a missing object.
    const stat = await this.confirm(ticket.key, options.albumId, file.name);
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

/**
 * Sends the bytes to B2 and resolves once the bucket has them.
 *
 * The signed headers must go out exactly as issued: B2 signs Content-Type and
 * Content-Length, and rejects the PUT if either differs.
 */
function putToBucket(
  file: File,
  ticket: UploadTicket,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', ticket.uploadUrl, true);

    for (const [header, value] of Object.entries(ticket.requiredHeaders)) {
      // Content-Length is set by the browser from the body and cannot be
      // assigned; assigning it throws in some browsers and is ignored in others.
      if (header.toLowerCase() === 'content-length') continue;
      xhr.setRequestHeader(header, value);
    }

    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        const total = event.lengthComputable ? event.total : file.size;
        if (total > 0) onProgress(Math.min(event.loaded / total, 1));
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve();
        return;
      }
      reject(new ApiError(xhr.status, 'Upload failed. Please try again.'));
    };
    xhr.onerror = () =>
      reject(new ApiError(0, 'Could not reach storage. Check your connection.'));
    xhr.onabort = () => reject(new ApiError(0, 'Upload was cancelled.'));

    signal?.addEventListener('abort', () => xhr.abort());
    if (signal?.aborted) {
      xhr.abort();
      return;
    }

    xhr.send(file);
  });
}

/** Falls back to the extension when a browser reports no type for a file. */
export function contentTypeForName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
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

/** The three kinds the app treats as media, from a content type. */
export function kindOf(contentType: string | null): 'image' | 'video' | 'audio' | 'other' {
  if (!contentType) return 'other';
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('video/')) return 'video';
  if (contentType.startsWith('audio/')) return 'audio';
  return 'other';
}
