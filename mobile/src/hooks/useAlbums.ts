import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  albumsApi,
  queryKeys,
  type Album,
  type CreateAlbumInput,
  type ListAlbumsParams,
  type UpdateAlbumInput,
} from '@/src/api';

import type { QueryOptions } from './useWorkspaces';

export function useAlbums(
  params: ListAlbumsParams = {},
  options: QueryOptions = {},
) {
  const query = useQuery({
    queryKey: queryKeys.albums.list(params),
    queryFn: () => albumsApi.list(params),
    enabled: options.enabled ?? true,
  });

  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    albums: query.data?.data ?? ([] as Album[]),
    total: query.data?.total ?? 0,
  };
}

/** How many albums a page of the list asks for — the API's ceiling. */
const ALBUM_PAGE = 100;

/**
 * Every album, a page at a time.
 *
 * `useAlbums` asks for one page, and the albums screen asked for 100 — so a
 * working photographer's hundred-and-first album simply was not there, with
 * nothing on screen to say the list had stopped.
 */
export function useInfiniteAlbums(
  params: Omit<ListAlbumsParams, 'limit' | 'offset'> = {},
  options: QueryOptions = {},
) {
  const query = useInfiniteQuery({
    queryKey: queryKeys.albums.list({ ...params, paged: true }),
    queryFn: ({ pageParam }) =>
      albumsApi.list({ ...params, limit: ALBUM_PAGE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.data.length, 0);
      return last.data.length > 0 && loaded < last.total ? loaded : undefined;
    },
    enabled: options.enabled ?? true,
  });

  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    albums: query.data?.pages.flatMap((page) => page.data) ?? ([] as Album[]),
    total: query.data?.pages[0]?.total ?? 0,
  };
}

export function useAlbum(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.albums.detail(id ?? ''),
    queryFn: () => albumsApi.get(id as string),
    enabled: !!id,
  });
}

export function useCreateAlbum() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAlbumInput) => albumsApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.albums.all });
      // The workspace list carries a derived media_count, so adding an album
      // changes it — the cached list is stale even though nothing wrote to it.
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
    },
  });
}

export function useUpdateAlbum() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateAlbumInput & { id: string }) =>
      albumsApi.update(id, input),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.albums.detail(updated.id), updated);
      queryClient.invalidateQueries({ queryKey: queryKeys.albums.all });
    },
  });
}

export function useDeleteAlbum() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => albumsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.albums.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
    },
  });
}
