import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  portfolioApi,
  profilesApi,
  queryKeys,
  type PortfolioItem,
  type ProfileSettings,
} from '@/api';

/** The caller's handle, publish state, and whatever is stopping them. */
export function useProfileSettings() {
  const query = useQuery({
    queryKey: queryKeys.profile.settings,
    queryFn: () => profilesApi.settings(),
  });

  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    settings: query.data as ProfileSettings | undefined,
  };
}

export function useSetHandle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (handle: string) => profilesApi.setHandle(handle),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.settings });
    },
  });
}

export function useSetPublished() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (published: boolean) => profilesApi.setPublished(published),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.profile.settings });
    },
  });
}

export function usePortfolio() {
  const query = useQuery({
    queryKey: queryKeys.portfolio.all,
    queryFn: () => portfolioApi.list(),
  });

  const items = query.data?.data ?? ([] as PortfolioItem[]);

  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    items,
    images: items.filter((i) => i.kind === 'image'),
    albums: items.filter((i) => i.kind === 'album'),
  };
}

/**
 * Every portfolio mutation, sharing one cache write.
 *
 * The server answers each of them with the whole list, so the response is
 * written straight into the cache rather than triggering a refetch — the
 * editor is drag-and-drop and a round trip between drop and redraw shows.
 */
export function usePortfolioActions() {
  const queryClient = useQueryClient();

  const apply = (result: { data: PortfolioItem[] }) => {
    queryClient.setQueryData(queryKeys.portfolio.all, {
      data: result.data,
      total: result.data.length,
    });
  };

  const addImage = useMutation({
    mutationFn: ({ fileKey, caption }: { fileKey: string; caption?: string }) =>
      portfolioApi.addImage(fileKey, caption),
    onSuccess: apply,
  });

  const addAlbum = useMutation({
    mutationFn: ({ albumId, caption }: { albumId: string; caption?: string }) =>
      portfolioApi.addAlbum(albumId, caption),
    onSuccess: apply,
  });

  const remove = useMutation({
    mutationFn: (id: string) => portfolioApi.remove(id),
    onSuccess: apply,
  });

  const reorder = useMutation({
    mutationFn: (ids: string[]) => portfolioApi.reorder(ids),
    onSuccess: apply,
  });

  return { addImage, addAlbum, remove, reorder };
}
