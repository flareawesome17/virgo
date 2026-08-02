import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { storageApi, type StorageBreakdown } from '@/api';
import { usageQueryKey } from './useUsage';

export const storageBreakdownKey = ['storage', 'breakdown'] as const;
export const unassignedFilesKey = ['storage', 'files', 'unassigned'] as const;

const EMPTY: StorageBreakdown = { byAlbum: [], byType: [] };

/**
 * Real per-album and per-media-type storage totals.
 *
 * The storage screen used to render a hardcoded breakdown — invented workspace
 * names and sizes that never moved regardless of what was actually stored.
 */
export function useStorageBreakdown(options: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: storageBreakdownKey,
    queryFn: () => storageApi.breakdown(),
    enabled: options.enabled ?? true,
  });

  return { ...query, breakdown: query.data ?? EMPTY };
}

/** Files uploaded before an album was chosen, so they can still be filed. */
export function useUnassignedFiles(options: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: unassignedFilesKey,
    queryFn: () => storageApi.listUnassigned(),
    enabled: options.enabled ?? true,
  });

  return { ...query, files: query.data?.data ?? [], total: query.data?.total ?? 0 };
}

/** Points already-uploaded files at an album. */
export function useAttachToAlbum() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ keys, albumId }: { keys: string[]; albumId: string }) =>
      storageApi.attachToAlbum(keys, albumId),
    onSuccess: () => {
      // Both the album's file list and the unassigned list change.
      queryClient.invalidateQueries({ queryKey: ['storage'] });
    },
  });
}

/**
 * Deletes every stored object for the account.
 *
 * Invalidates the whole storage and usage surface afterwards — album galleries,
 * the home-screen storage meter and the breakdown are all now stale.
 */
export function useWipeStorage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => storageApi.wipeAll(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storage'] });
      queryClient.invalidateQueries({ queryKey: usageQueryKey });
      queryClient.invalidateQueries({ queryKey: ['albums'] });
    },
  });
}
