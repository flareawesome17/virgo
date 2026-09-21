import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { albumSectionsApi, queryKeys, type AlbumSectionList } from '@/api';

/**
 * An album's sections, with the counts every album screen draws from.
 *
 * One request carries the section chips, the album's totals by kind and the
 * number of client picks, so the header and the chip row agree with each
 * other rather than each counting from whatever page of files had loaded.
 */
export function useAlbumSections(albumId: string | undefined) {
  const query = useQuery({
    queryKey: queryKeys.albums.sections(albumId ?? ''),
    queryFn: () => albumSectionsApi.list(albumId as string),
    enabled: !!albumId,
  });

  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    sections: query.data?.data ?? ([] as AlbumSectionList['data']),
    unsorted: query.data?.unsorted ?? 0,
    total: query.data?.total ?? 0,
    counts: query.data?.counts ?? { image: 0, video: 0, audio: 0 },
    picked: query.data?.picked ?? 0,
  };
}

/**
 * What any change to sections can make stale.
 *
 * The file listings as well as the sections: a file's `sectionId` is on its
 * row, so a grid filtered to "Ceremony" is wrong the moment one leaves it.
 */
function refreshAlbumMedia(queryClient: QueryClient, albumId: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.albums.sections(albumId) }),
    queryClient.invalidateQueries({ queryKey: ['storage', 'files', albumId] }),
  ]);
}

export function useCreateSection(albumId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => albumSectionsApi.create(albumId, name),
    onSuccess: () => refreshAlbumMedia(queryClient, albumId),
  });
}

export function useRenameSection(albumId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      albumSectionsApi.rename(albumId, id, name),
    onSuccess: () => refreshAlbumMedia(queryClient, albumId),
  });
}

/**
 * Reorders, showing the new order before the server confirms it.
 *
 * Optimistic because the chips are dragged or nudged one step at a time, and
 * waiting a round trip for each step makes arranging five sections feel like
 * filling in a form. A refusal puts the old order back.
 */
export function useReorderSections(albumId: string) {
  const queryClient = useQueryClient();
  const key = queryKeys.albums.sections(albumId);
  return useMutation({
    mutationFn: (ids: string[]) => albumSectionsApi.reorder(albumId, ids),
    onMutate: async (ids: string[]) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<AlbumSectionList>(key);
      if (previous) {
        const byId = new Map(previous.data.map((section) => [section.id, section]));
        queryClient.setQueryData<AlbumSectionList>(key, {
          ...previous,
          data: ids
            .map((id, position) => {
              const section = byId.get(id);
              return section ? { ...section, position } : null;
            })
            .filter((section): section is AlbumSectionList['data'][number] => !!section),
        });
      }
      return { previous };
    },
    onError: (_error, _ids, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

/** Deletes a section. Its files stay in the album, unsorted. */
export function useDeleteSection(albumId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sectionId: string) => albumSectionsApi.remove(albumId, sectionId),
    onSuccess: () => refreshAlbumMedia(queryClient, albumId),
  });
}

/** Files a selection under a section, or out of one with null. */
export function useAssignSection(albumId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ keys, sectionId }: { keys: string[]; sectionId: string | null }) =>
      albumSectionsApi.assign(albumId, keys, sectionId),
    onSuccess: () => refreshAlbumMedia(queryClient, albumId),
  });
}
