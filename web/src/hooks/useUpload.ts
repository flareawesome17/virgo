import { useCallback, useMemo } from 'react';
import {
  useUploadQueue,
  type UploadItem,
  type UploadTarget,
} from '@/components/upload/upload-provider';

export type { UploadItem };

/**
 * Uploads into one destination, through the app-wide queue.
 *
 * The queue used to live here, as component state — which is why leaving an
 * album page mid-upload lost the upload. It now lives in UploadProvider above
 * every page; this is the view of it that one screen needs: its own files,
 * and a way to add more.
 */
export function useUpload(target: UploadTarget) {
  const queue = useUploadQueue();
  const { scope, albumId, albumName } = target;

  const upload = useCallback(
    (files: File[]) => queue.enqueue(files, { scope, albumId, albumName }),
    [queue, scope, albumId, albumName],
  );

  const items = useMemo(
    () => queue.items.filter((item) => item.albumId === albumId),
    [queue.items, albumId],
  );

  return {
    items,
    isUploading: items.some((item) => item.status === 'queued' || item.status === 'uploading'),
    upload,
    cancel: queue.cancel,
    clearFinished: queue.clearFinished,
  };
}
