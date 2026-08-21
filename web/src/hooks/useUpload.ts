import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { storageApi, type UploadScope } from '@/api';
import { usageQueryKey } from '@/hooks/useUsage';
import { queryKeys } from '@/api';

export interface UploadItem {
  id: string;
  name: string;
  sizeBytes: number;
  /** 0-1, from real bytes sent. */
  progress: number;
  status: 'queued' | 'uploading' | 'done' | 'failed' | 'cancelled';
  error?: string;
}

/**
 * How many files go up at once.
 *
 * Browsers cap concurrent connections per host at around six, and B2 is a
 * different host from the API — but a wedding drop can be hundreds of files,
 * and firing them all at once means the browser queues them opaquely with no
 * useful progress. Three at a time keeps the bar moving and leaves headroom
 * for the app's own polling.
 */
const CONCURRENCY = 3;

/**
 * Uploads files straight to B2 through presigned URLs.
 *
 * The queue is component state rather than a mutation: an upload set is a
 * long-lived thing with per-file progress and per-file failure, which is not
 * what a single mutation models.
 */
export function useUpload(options: { scope: UploadScope; albumId?: string }) {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const controllers = useRef(new Map<string, AbortController>());
  const nextId = useRef(0);

  const patch = useCallback((id: string, changes: Partial<UploadItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...changes } : i)));
  }, []);

  const upload = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      const queued: { item: UploadItem; file: File }[] = files.map((file) => ({
        item: {
          id: `upload-${(nextId.current += 1)}`,
          name: file.name,
          sizeBytes: file.size,
          progress: 0,
          status: 'queued' as const,
        },
        file,
      }));

      setItems((prev) => [...prev, ...queued.map((q) => q.item)]);
      setIsUploading(true);

      let cursor = 0;
      const runNext = async (): Promise<void> => {
        const index = cursor++;
        if (index >= queued.length) return;

        const { item, file } = queued[index];
        const controller = new AbortController();
        controllers.current.set(item.id, controller);
        patch(item.id, { status: 'uploading' });

        try {
          await storageApi.uploadFile(file, {
            scope: options.scope,
            albumId: options.albumId,
            signal: controller.signal,
            onProgress: (fraction) => patch(item.id, { progress: fraction }),
          });
          patch(item.id, { status: 'done', progress: 1 });
        } catch (err) {
          patch(item.id, {
            status: controller.signal.aborted ? 'cancelled' : 'failed',
            error: err instanceof Error ? err.message : 'Upload failed.',
          });
        } finally {
          controllers.current.delete(item.id);
        }

        return runNext();
      };

      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, queued.length) }, runNext),
      );

      setIsUploading(false);
      // Storage and the album's file list both changed; the album row's
      // derived counts and cover come from the albums query.
      queryClient.invalidateQueries({
        queryKey: ['storage', 'files', options.albumId ?? 'all'],
      });
      queryClient.invalidateQueries({ queryKey: usageQueryKey });
      queryClient.invalidateQueries({ queryKey: queryKeys.albums.all });
      queryClient.invalidateQueries({ queryKey: ['storage'] });
    },
    [options.scope, options.albumId, patch, queryClient],
  );

  const cancel = useCallback((id: string) => {
    controllers.current.get(id)?.abort();
  }, []);

  /** Drops finished rows, leaving anything still in flight or failed. */
  const clearFinished = useCallback(() => {
    setItems((prev) => prev.filter((i) => i.status === 'uploading' || i.status === 'queued'));
  }, []);

  return { items, isUploading, upload, cancel, clearFinished };
}
