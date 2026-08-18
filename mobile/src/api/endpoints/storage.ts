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
  confirm(key: string, albumId?: string): Promise<{
    exists: boolean;
    size: number;
    contentType?: string;
  }> {
    return api.post('/storage/confirm', { body: { key, albumId } });
  },

  /** Objects the user has stored, optionally narrowed to one album. */
  listFiles(params: { albumId?: string; limit?: number } = {}): Promise<{
    data: StoredFile[];
    total: number;
  }> {
    return api.get('/storage/files', { query: params });
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
      /** Called with 0-1 as bytes reach B2. Real progress, not simulated. */
      onProgress?: (fraction: number) => void;
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

    const ticket = await this.createUploadUrl({
      contentType: options.contentType,
      scope: options.scope,
      contentLength,
    });

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

    if (!response) {
      throw new ApiError(0, 'Upload was cancelled.');
    }

    if (response.status < 200 || response.status >= 300) {
      throw new ApiError(response.status, 'Upload failed. Please try again.');
    }

    // A 2xx from B2 is good evidence, but confirming via the API is what
    // guarantees a row never ends up pointing at a missing object.
    const stat = await this.confirm(ticket.key, options.albumId);
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
