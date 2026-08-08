import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { albumShareApi, type ShareMediaKind } from '@/api';

export const albumShareKey = (albumId: string) => ['albums', albumId, 'share'] as const;

export function useAlbumShare(albumId: string | undefined) {
  const query = useQuery({
    queryKey: albumShareKey(albumId ?? ''),
    queryFn: () => albumShareApi.get(albumId!),
    enabled: !!albumId,
  });
  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    link: query.data ?? null,
  };
}

/**
 * Issues or re-scopes the album's client link.
 *
 * Idempotent on the server: asking twice returns the link already issued
 * rather than invalidating a URL a client may already be holding.
 */
export function useCreateShareLink(albumId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (kinds: ShareMediaKind[]) => albumShareApi.create(albumId, kinds),
    onSuccess: (link) => {
      queryClient.setQueryData(albumShareKey(albumId), link);
    },
  });
}

export function useRevokeShareLink(albumId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => albumShareApi.revoke(albumId),
    onSuccess: () => {
      queryClient.setQueryData(albumShareKey(albumId), null);
    },
  });
}
