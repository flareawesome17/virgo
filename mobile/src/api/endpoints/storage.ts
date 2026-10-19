import { Directory, File, Paths } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import {
  CopyCancelled,
  copyRange,
  FileRange,
  SourceShrank,
} from '@/src/lib/file-range';
import {
  type MultipartSession,
  partRetryDelayMs,
  resumable,
} from '@/src/lib/multipart-resume';
import { api } from '../client';
import { API_BASE_URL } from '../config';
import { withConfirmRetry, withUploadRetry } from '../confirm-retry';
import { ApiError } from '../errors';
import {
  type MultipartDeps,
  type PartTicket,
  UploadCancelled,
  uploadInParts,
} from '../multipart-upload';

/** How long a confirm may take; see storageApi.confirm. */
const CONFIRM_TIMEOUT_MS = 120_000;

/**
 * How long a delete may take to answer. Deleting goes object by object on the
 * server when the store refuses bulk deletes, and the default wait gave up
 * while the server was still working, so the files stayed on screen behind a
 * "timed out". Under the 100 s Cloudflare allows a request.
 */
const DELETE_TIMEOUT_MS = 90_000;

/**
 * Where an upload goes. 'avatars' and 'covers' land in the public bucket and
 * are re-encoded on confirm; an older API refuses 'covers' at upload-url, so
 * nothing is sent to one that could not handle it.
 */
export type UploadScope = 'albums' | 'avatars' | 'covers' | 'workspaces' | 'misc';

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

/**
 * The long edge the API makes thumbnails at, in pixels. THUMB_EDGE in
 * api/src/storage/thumbnails.service.ts.
 */
export const THUMBNAIL_EDGE = 640;

/**
 * How long a picture's long edge must be, in pixels, to fill a box of that
 * many pixels cropped the way `cover` crops.
 *
 * Display copies are named by their long edge, and a cropped box is filled by
 * the short one: a square tile 600 px across needs a 4:3 copy whose short
 * edge is 600, which is a long edge of 800. A picture of unknown shape is
 * taken to be square. That only happens without copies to choose from — the
 * API records a photograph's size in the statement that records its copies.
 */
export function longEdgeToCover(
  size: { width?: number | null; height?: number | null },
  boxWidth: number,
  boxHeight: number,
): number {
  const { width, height } = size;
  if (!width || !height) return Math.max(boxWidth, boxHeight);
  return Math.max(width, height) * Math.max(boxWidth / width, boxHeight / height);
}

/**
 * The smallest display copy whose long edge is at least `longEdge` pixels, the
 * widest when none is that long, or null when there are none.
 */
export function displaySourceAtLeast(
  file: Pick<StoredFile, 'displaySources'>,
  longEdge: number,
): string | null {
  const sources = file.displaySources;
  return (sources.find((source) => source.width >= longEdge) ?? sources.at(-1))?.url ?? null;
}

/**
 * A display copy's width in pixels.
 *
 * Copies are named by their long edge, which on a portrait photograph is its
 * height. A `srcset` descriptor is a width, and handing the browser the long
 * edge there made it think every portrait copy a third wider than it is — so
 * it settled for one a size too small.
 */
function displayWidthOf(file: Pick<StoredFile, 'width' | 'height'>, longEdge: number): number {
  if (!file.width || !file.height || file.width >= file.height) return longEdge;
  return Math.round((longEdge * file.width) / file.height);
}

/** A `srcset` value, or null when there is nothing to build one from. */
export function displaySrcSet(file: StoredFile): string | null {
  if (!file.displaySources.length) return null;
  return file.displaySources
    .map((source) => `${source.url} ${displayWidthOf(file, source.width)}w`)
    .join(', ');
}

/**
 * Types every client draws straight from the file, whatever the platform.
 * HEIC is not one — only Apple's decoders read it — and a TIFF is not drawn
 * by a browser at all.
 */
const DRAWABLE_ORIGINALS = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * The original, when magnifying a photograph would show more of it than its
 * widest display copy can — or null when it would not.
 *
 * Only for a type the client can draw (`alsoDraws` adds any this platform
 * reads beyond the common ones), and only when the original is meaningfully
 * larger than that copy: the copies go up to 3072 px, and to a photograph's
 * own size below that, so for most photographs the copy already is all of it.
 */
export function originalForDetail(
  file: StoredFile,
  { alsoDraws = [] }: { alsoDraws?: readonly string[] } = {},
): string | null {
  if (!file.url || !file.contentType) return null;
  if (!DRAWABLE_ORIGINALS.includes(file.contentType) && !alsoDraws.includes(file.contentType)) {
    return null;
  }
  const widest = file.displaySources.at(-1)?.width ?? 0;
  const longest = Math.max(file.width ?? 0, file.height ?? 0);
  // A tenth larger at least, so a copy a few pixels short of its original
  // does not cost a camera file for a difference nobody could see.
  return longest > widest * 1.1 ? file.url : null;
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

/** What `confirm` says about an object that was meant to have landed. */
export interface ConfirmResult {
  exists: boolean;
  size: number;
  contentType?: string;
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
 * Streams a file on this device to a signed PUT, reporting progress — the
 * transfer half of uploadFile, for tickets minted elsewhere (support
 * attachments). Content-Length is dropped for the reason given in uploadFile.
 */
export async function putFileToBucket(
  fileUri: string,
  ticket: { uploadUrl: string; requiredHeaders: Record<string, string> },
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const task = FileSystem.createUploadTask(
    ticket.uploadUrl,
    fileUri,
    {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: withoutContentLength(ticket.requiredHeaders),
    },
    (data) => {
      if (data.totalBytesExpectedToSend > 0) {
        onProgress?.(Math.min(data.totalBytesSent / data.totalBytesExpectedToSend, 1));
      }
    },
  );
  const response = await task.uploadAsync();
  if (!response) throw new ApiError(0, 'Upload was cancelled.');
  if (response.status < 200 || response.status >= 300) {
    throw new ApiError(response.status, 'Upload failed. Please try again.');
  }
  onProgress?.(1);
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

/**
 * From this size a file goes up in parts. Mirrors MULTIPART_MIN_BYTES in
 * api/src/storage/storage.config.ts, and web's copy.
 */
export const MULTIPART_MIN_BYTES = 100 * 1024 * 1024;

/** Parts of one file in flight at once. The same as web. */
const MULTIPART_CONCURRENCY = 4;

/** Tries per part, the first included. Each try gets a fresh URL. */
const MULTIPART_PART_ATTEMPTS = 5;

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
  confirm(key: string, albumId?: string, originalName?: string): Promise<ConfirmResult> {
    // Two minutes, not the usual twenty seconds. The server now answers once
    // the object is verified and makes an album thumbnail afterwards, but a
    // profile photo or cover is still re-encoded before it answers, and an
    // older API made every thumbnail first — a large photograph or a film's
    // poster took longer than twenty seconds, so an upload that had worked was
    // marked failed, and its retry sent every byte again.
    return api.post('/storage/confirm', {
      body: { key, albumId, originalName },
      timeoutMs: CONFIRM_TIMEOUT_MS,
    });
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
    return api.post('/storage/wipe', {
      body: { confirm: 'DELETE' },
      timeoutMs: DELETE_TIMEOUT_MS,
    });
  },

  /** Time-limited read URL, for buckets that are not publicly served. */
  async downloadUrl(key: string): Promise<string> {
    const { url } = await api.post<{ url: string }>('/storage/download-url', {
      body: { key },
    });
    return url;
  },

  remove(key: string): Promise<void> {
    return api.post<void>('/storage/delete', { body: { key }, timeoutMs: DELETE_TIMEOUT_MS });
  },

  /**
   * Deletes a selection in one request. All-or-nothing on permission: if any
   * file may not be deleted by this account, nothing is.
   */
  removeMany(keys: string[]): Promise<{ deleted: number; failed: number }> {
    return api.post('/storage/delete-many', { body: { keys }, timeoutMs: DELETE_TIMEOUT_MS });
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
   * Releases the parts of a multipart upload that will not be finished.
   *
   * B2 bills for them until something does. Used by the upload queue when a
   * file whose upload was kept for a resume is removed instead.
   */
  async abortMultipart(ref: { key: string; uploadId: string }): Promise<void> {
    await api.post('/storage/multipart/abort', {
      body: { key: ref.key, uploadId: ref.uploadId },
    });
  },

  /**
   * Full upload flow: ticket -> PUT -> confirm, or, from MULTIPART_MIN_BYTES,
   * start -> parts -> complete -> confirm (docs/LARGE_UPLOADS.md).
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
      /**
       * Stops the transfer — before it starts, mid-part, or between the 403
       * retry's two attempts. The upload then rejects with ApiError status 0,
       * "Upload was cancelled".
       */
      signal?: AbortSignal;
      /**
       * A multipart session saved by an earlier attempt at this same file.
       * Parts it already has are not sent again.
       */
      resume?: MultipartSession;
      /**
       * Receives the multipart session as parts are acknowledged, and
       * undefined once it is finished or released. Passing this is what opts
       * in to keeping the parts after a connection failure, for `resume` to
       * pick up; without it a failed multipart upload is always aborted.
       */
      onSession?: (session: MultipartSession | undefined) => void;
    },
  ): Promise<UploadResult> {
    // `size` is returned on FileInfo whenever the file exists; it is not an
    // option to request (InfoOptions only carries `md5`).
    //
    // Both refusals below are about the file, not the network, so they carry a
    // 4xx rather than 0: the upload queue waits out a status 0 and asks again,
    // and asking again will not put a file back on the phone.
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists) {
      throw new ApiError(404, 'That file no longer exists on this device.');
    }

    const contentLength = info.size ?? 0;
    if (contentLength <= 0) {
      throw new ApiError(422, 'That file appears to be empty.');
    }

    if (options.signal?.aborted) {
      throw new ApiError(0, 'Upload was cancelled.');
    }

    // A big file goes up as independent parts instead of one PUT: no part has
    // to finish inside a single presigned window, a dropped connection costs
    // one 16 MB part rather than the whole film, and a resume carries on from
    // the part it reached. Small files keep the single PUT, where multipart's
    // three extra round trips would only slow them down. Profile photos never:
    // the API refuses them in parts.
    if (
      contentLength >= MULTIPART_MIN_BYTES &&
      options.scope !== 'avatars' &&
      options.scope !== 'covers'
    ) {
      const { signal } = options;
      const session = resumable(nativeMultipartDeps(options.onTicket), {
        resume: options.resume,
        keepForResume: Boolean(options.onSession),
        onSession: options.onSession,
      });

      let done: { key: string; size: number };
      activeMultipartUploads++;
      try {
        if (activeMultipartUploads === 1) clearStalePartFiles();
        done = await uploadInParts(
          // The shared uploader only reads `size` and calls `slice`; the
          // ranges it cuts come back to putPartFromDevice, which streams them.
          // See FileRange in src/lib/file-range.ts.
          new FileRange(fileUri, 0, contentLength) as unknown as Blob,
          {
            contentType: options.contentType,
            scope: options.scope,
            albumId: options.albumId,
            onProgress: options.onProgress,
            signal,
            concurrency: MULTIPART_CONCURRENCY,
            maxAttempts: MULTIPART_PART_ATTEMPTS,
            backoff: (attempt) => sleep(partRetryDelayMs(attempt), signal),
            // A 429 or a 5xx on start, a part URL or complete is waited out
            // and asked again, with every other upload held back while it is.
            retry: (call, stop) => withUploadRetry(call, { signal: stop }),
          },
          session.deps,
        );
      } catch (error) {
        const cancelled = error instanceof UploadCancelled || Boolean(signal?.aborted);
        // Keeps the parts for a resume after a dropped connection, releases
        // them otherwise. Never rejects, so the real error is the one thrown.
        await session.settle(error, cancelled);
        // Callers recognise a cancelled upload by ApiError status 0.
        if (cancelled) throw new ApiError(0, 'Upload was cancelled.');
        throw error;
      } finally {
        activeMultipartUploads--;
      }

      const stat = await withConfirmRetry<ConfirmResult>(
        () => this.confirm(done.key, options.albumId, options.originalName),
        { signal },
      );
      if (!stat.exists) {
        throw new ApiError(0, 'Upload could not be verified. Please try again.');
      }
      return { key: done.key, publicUrl: null, size: stat.size };
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
      // A rate limit here is pace, not a verdict on the file: a run of small
      // photos on a fast line can outrun the account's ticket allowance.
      // Waited out and asked again, honouring Retry-After (confirm-retry.ts)
      // — it used to fail the file outright.
      const ticket = await withUploadRetry<UploadTicket>(
        () =>
          this.createUploadUrl({
            contentType: options.contentType,
            scope: options.scope,
            contentLength,
            albumId: options.albumId,
          }),
        { signal: options.signal },
      );

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

      // createUploadTask reports real bytes-sent and can be cancelled;
      // uploadAsync can do neither, so it is only used when nothing needs to.
      if (!options.onProgress && !options.signal) {
        const response = await FileSystem.uploadAsync(
          ticket.uploadUrl,
          fileUri,
          uploadOptions,
        ).catch(unreachableStorage);
        return { ticket, response };
      }

      const task = FileSystem.createUploadTask(
        ticket.uploadUrl,
        fileUri,
        uploadOptions,
        (data) => {
          const total = data.totalBytesExpectedToSend || contentLength;
          if (total > 0) {
            options.onProgress?.(Math.min(data.totalBytesSent / total, 1));
          }
        },
      );
      const cancel = () => {
        void task.cancelAsync().catch(() => undefined);
      };
      options.signal?.addEventListener('abort', cancel);
      try {
        // A cancelled task resolves with nothing, which is handled below.
        const response = options.signal?.aborted
          ? null
          : await task.uploadAsync().catch((error: unknown) => {
              if (options.signal?.aborted) return null;
              return unreachableStorage(error);
            });
        return { ticket, response };
      } finally {
        options.signal?.removeEventListener('abort', cancel);
      }
    };

    let { ticket, response } = await attempt();

    // 403 and nothing else. An expired signature and a signature that never
    // matched are indistinguishable from here — both are 403 — so this retries
    // once with a fresh ticket and lets a genuine rejection fail the second
    // time, which costs one request rather than a silent loop.
    if (response && response.status === 403 && !options.signal?.aborted) {
      ({ ticket, response } = await attempt());
    }

    if (!response || options.signal?.aborted) {
      throw new ApiError(0, 'Upload was cancelled.');
    }

    if (response.status < 200 || response.status >= 300) {
      throw new ApiError(response.status, 'Upload failed. Please try again.');
    }

    // A 2xx from B2 is good evidence, but confirming via the API is what
    // guarantees a row never ends up pointing at a missing object. The bytes
    // are already stored, so a 5xx or a dropped connection here is asked
    // again rather than failing a file that arrived (confirm-retry.ts).
    const ticketKey = ticket.key;
    const stat = await withConfirmRetry<ConfirmResult>(
      () => this.confirm(ticketKey, options.albumId, options.originalName),
      { signal: options.signal },
    );
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
 * The native uploader's rejection, as the status-0 ApiError everything else
 * here uses for "nothing answered".
 *
 * Its own message is a platform string ("Unable to resolve host…", an
 * NSURLErrorDomain code), which is not something to show anyone; and without a
 * status the upload queue could not tell a dead zone from a real failure.
 */
function unreachableStorage(_error: unknown): never {
  throw new ApiError(0, 'Could not reach storage. Check your connection.');
}

/** Waits, waking early when `signal` aborts. Never rejects. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done);
  });
}

/** Where a part waits, as its own file, while the native uploader sends it. */
const PART_DIR = 'multipart-parts';

/** Bytes copied per read. Each read blocks the JS thread for its duration. */
const PART_COPY_CHUNK_BYTES = 2 * 1024 * 1024;

/** Multipart uploads running in this process; part files are swept at zero. */
let activeMultipartUploads = 0;

/**
 * Removes part files a previous process left behind.
 *
 * Each one is deleted after its PUT, but a process killed mid-part leaves its
 * copy in the cache, 16 MB at a time. Only run when no multipart upload is
 * going, so a file another upload is sending is never pulled out from under it.
 */
function clearStalePartFiles(): void {
  try {
    const dir = new Directory(Paths.cache, PART_DIR);
    if (dir.exists) dir.delete();
  } catch {
    // The cache is the system's to clear as well; nothing here depends on it.
  }
}

/**
 * Copies one range of the source file into a part file of its own.
 *
 * The native uploader sends a whole file from disk, so a part has to be one.
 * The copy goes through a FileHandle in 2 MB reads, so at most one chunk per
 * part in flight is ever in memory, never the part and never the file.
 */
async function writePartFile(range: FileRange, signal?: AbortSignal): Promise<File> {
  const dir = new Directory(Paths.cache, PART_DIR);
  dir.create({ idempotent: true, intermediates: true });
  const out = new File(dir, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.part`);
  out.create({ overwrite: true });

  let source: ReturnType<File['open']> | undefined;
  let sink: ReturnType<File['open']> | undefined;
  try {
    source = new File(range.uri).open();
    sink = out.open();

    await copyRange(source, sink, range.start, range.end, {
      chunkBytes: PART_COPY_CHUNK_BYTES,
      isCancelled: () => Boolean(signal?.aborted),
      // Reads are synchronous. Between chunks, let a frame draw.
      pause: () => sleep(0),
    });
    return out;
  } catch (error) {
    try {
      out.delete();
    } catch {
      // Swept by clearStalePartFiles next time.
    }
    if (error instanceof CopyCancelled) throw new ApiError(0, 'Upload was cancelled.');
    if (error instanceof SourceShrank) {
      // Shorter than when it was measured: it changed under the upload.
      throw new ApiError(409, 'That file changed while it was uploading.');
    }
    throw error;
  } finally {
    source?.close();
    sink?.close();
  }
}

/** A response header by name, whatever case the platform delivered it in. */
function headerValue(headers: Record<string, string>, name: string): string | undefined {
  const wanted = name.toLowerCase();
  for (const [header, value] of Object.entries(headers ?? {})) {
    if (header.toLowerCase() === wanted && value) return value;
  }
  return undefined;
}

/**
 * Sends one part of a multipart upload and resolves with its ETag, which the
 * server needs to assemble the parts.
 *
 * The part is copied to its own file and sent by the same native uploader as
 * the single PUT, so it streams from disk and reports real progress. Errors
 * are ApiErrors with the status the shared uploader's retry rule reads: 0 for
 * no response, the HTTP status for a refusal, a 4xx for a file that cannot be
 * read (which no retry fixes).
 */
async function putPartFromDevice(
  part: Blob,
  ticket: PartTicket,
  onLoaded: (loaded: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  if (!(part instanceof FileRange)) {
    throw new ApiError(400, 'Could not read that file on this device.');
  }
  if (signal?.aborted) throw new ApiError(0, 'Upload was cancelled.');

  let partFile: File;
  try {
    partFile = await writePartFile(part, signal);
  } catch (error) {
    if (signal?.aborted) throw new ApiError(0, 'Upload was cancelled.');
    if (error instanceof ApiError) throw error;
    // Out of space for the part file, most likely. 507 rather than 0: it is
    // not the network, so the queue marks the file failed instead of waiting
    // for a connection, but the parts already sent are kept (5xx), so "try
    // again" after freeing space carries on from where it stopped.
    throw new ApiError(
      507,
      'Could not prepare that file for upload. Check that your phone has free space.',
    );
  }

  try {
    const task = FileSystem.createUploadTask(
      ticket.uploadUrl,
      partFile.uri,
      {
        httpMethod: 'PUT',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        // Content-Length is set by the native uploader from the part file,
        // which is exactly the length the part URL was signed for. See the
        // single PUT above for why passing it as well hangs on Android.
        headers: withoutContentLength(ticket.requiredHeaders),
      },
      (data) => onLoaded(Math.min(data.totalBytesSent, part.size)),
    );
    const cancel = () => {
      void task.cancelAsync().catch(() => undefined);
    };
    signal?.addEventListener('abort', cancel);

    let response: Awaited<ReturnType<typeof task.uploadAsync>>;
    try {
      response = signal?.aborted ? null : await task.uploadAsync();
    } catch {
      if (signal?.aborted) throw new ApiError(0, 'Upload was cancelled.');
      throw new ApiError(0, 'Could not reach storage. Check your connection.');
    } finally {
      signal?.removeEventListener('abort', cancel);
    }

    if (!response || signal?.aborted) throw new ApiError(0, 'Upload was cancelled.');
    if (response.status < 200 || response.status >= 300) {
      throw new ApiError(response.status, 'Upload failed. Please try again.');
    }

    const etag = headerValue(response.headers, 'etag');
    if (!etag) {
      // There is no CORS between the phone and B2 to hide it, as there can be
      // in a browser, so a missing receipt is the response gone wrong, and
      // sending the part again is the way to get one.
      throw new ApiError(502, 'Storage did not acknowledge part of the upload.');
    }
    return etag;
  } finally {
    try {
      partFile.delete();
    } catch {
      // Swept by clearStalePartFiles next time.
    }
  }
}

/**
 * The server half of a multipart upload (api/src/storage/storage.controller.ts)
 * and the device half above.
 *
 * `onTicket` hears the key as soon as the upload is started, before any part
 * is sent, for the same reason as the single PUT: it is the only handle a
 * relaunch has on what this process was doing.
 */
function nativeMultipartDeps(onTicket?: (key: string) => void): MultipartDeps {
  return {
    start: async (body) => {
      const started = await api.post<Awaited<ReturnType<MultipartDeps['start']>>>(
        '/storage/multipart/start',
        { body },
      );
      onTicket?.(started.key);
      return started;
    },
    partUrl: (body) => api.post<PartTicket>('/storage/multipart/part-url', { body }),
    putPart: putPartFromDevice,
    complete: (body) =>
      api.post<{ key: string; size: number }>('/storage/multipart/complete', { body }),
    abort: async (body) => {
      await api.post('/storage/multipart/abort', { body });
    },
  };
}

/**
 * What the API accepts. Mirrors ALLOWED_CONTENT_TYPES in
 * api/src/storage/storage.config.ts — change both together.
 */
export const UPLOADABLE_CONTENT_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/heic',
  'image/heif',
  'image/gif',
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
]);

/**
 * Names the pickers use for types the API knows by another.
 *
 * iOS reports an m4a as audio/x-m4a, Android's file browser a wav as
 * audio/x-wav or audio/vnd.wave, and so on. Passed through as they came, the
 * API's allow-list refused them at the ticket, after they were queued, and the
 * person was never told why.
 */
const CONTENT_TYPE_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/x-png': 'image/png',
  'image/heic-sequence': 'image/heic',
  'image/heif-sequence': 'image/heif',
  'image/x-tiff': 'image/tiff',
  'video/x-m4v': 'video/mp4',
  'audio/x-m4a': 'audio/mp4',
  'audio/m4a': 'audio/mp4',
  'audio/x-mp4': 'audio/mp4',
  'audio/mp3': 'audio/mpeg',
  'audio/x-mp3': 'audio/mpeg',
  'audio/mpeg3': 'audio/mpeg',
  'audio/x-mpeg': 'audio/mpeg',
  'audio/x-wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/vnd.wave': 'audio/wav',
  'audio/x-aac': 'audio/aac',
  'audio/aacp': 'audio/aac',
  'audio/x-flac': 'audio/flac',
  'audio/vorbis': 'audio/ogg',
  'application/ogg': 'audio/ogg',
  'application/x-pdf': 'application/pdf',
};

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
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
  m4v: 'video/mp4',
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

/**
 * Maps a picked asset to a content type the API accepts, when it has one.
 *
 * The picker's own type first, with aliases folded to the API's name and any
 * parameters (`; codecs=…`) dropped. When the picker gave nothing usable —
 * nothing at all, or the generic octet-stream a file browser falls back to —
 * the extension of the file name, then of the uri, decides.
 */
export function contentTypeForAsset(asset: {
  mimeType?: string | null;
  uri: string;
  /** The file's own name, which keeps its extension when the uri does not. */
  name?: string | null;
}): string {
  const reported = asset.mimeType?.split(';')[0].trim().toLowerCase() ?? '';
  const folded = CONTENT_TYPE_ALIASES[reported] ?? reported;
  if (UPLOADABLE_CONTENT_TYPES.has(folded)) return folded;

  for (const source of [asset.name, asset.uri]) {
    const ext = source?.split(/[?#]/)[0].split('.').pop()?.toLowerCase() ?? '';
    const byExt = CONTENT_TYPE_BY_EXTENSION[ext];
    if (byExt) return byExt;
  }
  // Something the API will refuse; returned as it was so it can be named.
  return folded || 'application/octet-stream';
}

/** Whether the API will take a file of this type. */
export function isUploadable(contentType: string): boolean {
  return UPLOADABLE_CONTENT_TYPES.has(contentType);
}
