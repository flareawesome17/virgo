import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  albumsApi,
  queryKeys,
  type Album,
  type CreateAlbumInput,
  type ListAlbumsParams,
  type UpdateAlbumInput,
} from '@/api';

import type { QueryOptions } from '@/hooks/useWorkspaces';

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
    albums: query.data?.data ?? ([] as Album[]),
    total: query.data?.total ?? 0,
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
      // media_count on the parent workspace is maintained by the app, so the
      // workspace list is stale too.
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
