import { useMutation } from '@tanstack/react-query';
import {
  contentTypeForAsset,
  storageApi,
  type UploadResult,
  type UploadScope,
} from '@/src/api';

export interface UploadInput {
  /** Local file URI, e.g. from expo-image-picker. */
  uri: string;
  scope: UploadScope;
  /** Falls back to sniffing the file extension when the picker omits it. */
  mimeType?: string | null;
  /** Links the upload to an album. */
  albumId?: string;
  originalName?: string;
  /** Real upload progress, 0-1. */
  onProgress?: (fraction: number) => void;
}

/**
 * Uploads a local file to object storage and returns its key and public URL.
 *
 * Storing the result is the caller's job — e.g. writing `publicUrl` into an
 * album's cover_url via useUpdateAlbum.
 */
export function useUpload() {
  return useMutation<UploadResult, Error, UploadInput>({
    mutationFn: ({ uri, scope, mimeType, albumId, originalName, onProgress }) =>
      storageApi.uploadFile(uri, {
        contentType: contentTypeForAsset({ uri, mimeType }),
        scope,
        albumId,
        originalName: originalName ?? uri.split('/').pop(),
        onProgress,
      }),
  });
}

/** Deletes an object from storage. Ownership is enforced server-side. */
export function useDeleteUpload() {
  return useMutation<void, Error, string>({
    mutationFn: (key) => storageApi.remove(key),
  });
}
