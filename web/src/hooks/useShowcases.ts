import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  feedApi,
  likesApi,
  queryKeys,
  profileWorkApi,
  shelvesApi,
  showcasesApi,
  type FeedItem,
  type FeedPage,
  type NewShowcase,
  type ShelfSummary,
  type Showcase,
} from '@/api';

/**
 * The feed, showcases, and shelves.
 *
 * Every list hook returns `loadFailed` rather than `isError`: React Query
 * pauses instead of erroring when the device is offline, so `isError` stays
 * false and a failed fetch would otherwise render as an empty feed.
 */

/**
 * The feed, a page at a time.
 *
 * Infinite rather than a plain list because the cursor is a keyset — a feed
 * posted to mid-scroll must not repeat one showcase and skip another, and an
 * offset cannot promise that.
 */
export function useFeed(scope: 'everyone' | 'connections' = 'everyone') {
  const query = useInfiniteQuery({
    queryKey: queryKeys.feed.scope(scope),
    queryFn: ({ pageParam }: { pageParam?: string }) =>
      feedApi.page({ scope, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: FeedPage) => last.nextCursor ?? undefined,
  });

  const items: FeedItem[] = query.data?.pages.flatMap((p) => p.items) ?? [];

  return {
    ...query,
    items,
    loadFailed: query.isError || query.isPaused,
  };
}

/** The owner's own showcases, drafts included. */
export function useMyShowcases() {
  const query = useQuery({
    queryKey: queryKeys.showcases.mine,
    queryFn: () => showcasesApi.mine(),
  });

  return {
    ...query,
    showcases: query.data?.data ?? ([] as Showcase[]),
    loadFailed: query.isError || query.isPaused,
  };
}

export function useShowcase(id: string | undefined) {
  const query = useQuery({
    queryKey: queryKeys.showcases.one(id ?? ''),
    queryFn: () => showcasesApi.one(id!),
    enabled: Boolean(id),
  });

  return {
    ...query,
    showcase: query.data ?? null,
    loadFailed: query.isError || query.isPaused,
  };
}

/**
 * Posting, editing and taking down.
 *
 * Every one of them invalidates the feed as well as the owner's list: a
 * showcase that has just been taken down must not still be scrollable, and one
 * just posted should be there on the next pull.
 */
export function useShowcaseActions() {
  const queryClient = useQueryClient();

  const touched = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.showcases.mine });
    queryClient.invalidateQueries({ queryKey: queryKeys.feed.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.profile.page });
    queryClient.invalidateQueries({ queryKey: queryKeys.publicProfiles.all });
  };

  const create = useMutation({
    mutationFn: (body: NewShowcase) => showcasesApi.create(body),
    onSuccess: touched,
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<NewShowcase> }) =>
      showcasesApi.update(id, body),
    onSuccess: touched,
  });

  const setPublished = useMutation({
    mutationFn: ({ id, published }: { id: string; published: boolean }) =>
      published ? showcasesApi.publish(id) : showcasesApi.unpublish(id),
    onSuccess: touched,
  });

  const remove = useMutation({
    mutationFn: (id: string) => showcasesApi.remove(id),
    onSuccess: touched,
  });

  return { create, update, setPublished, remove };
}

/** The shelves somebody keeps other people's work on. */
export function useShelves() {
  const query = useQuery({
    queryKey: queryKeys.shelves.mine,
    queryFn: () => shelvesApi.mine(),
  });

  return {
    ...query,
    shelves: query.data?.data ?? ([] as ShelfSummary[]),
    loadFailed: query.isError || query.isPaused,
  };
}

export function useShelfEntries(id: string | undefined, opts: { own?: boolean } = {}) {
  const query = useQuery({
    queryKey: queryKeys.shelves.entries(id ?? ''),
    queryFn: () => (opts.own === false ? shelvesApi.publicEntries(id!) : shelvesApi.entries(id!)),
    enabled: Boolean(id),
  });

  return {
    ...query,
    entries: query.data?.data ?? [],
    loadFailed: query.isError || query.isPaused,
  };
}

/**
 * Keeping and unkeeping.
 *
 * The feed is invalidated too, because `keptByMe` and `keptCount` are drawn on
 * every card and a Keep button that stays un-kept after a keep is the thing
 * people press twice.
 */
export function useShelfActions() {
  const queryClient = useQueryClient();

  const touched = (shelfId?: string) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.shelves.mine });
    queryClient.invalidateQueries({ queryKey: queryKeys.feed.all });
    if (shelfId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.shelves.entries(shelfId) });
    }
  };

  const createShelf = useMutation({
    mutationFn: ({ name, isPublic }: { name: string; isPublic?: boolean }) =>
      shelvesApi.create(name, isPublic),
    onSuccess: () => touched(),
  });

  const updateShelf = useMutation({
    mutationFn: ({ id, name, isPublic }: { id: string; name?: string; isPublic?: boolean }) =>
      shelvesApi.update(id, { name, isPublic }),
    onSuccess: (_r, v) => touched(v.id),
  });

  const removeShelf = useMutation({
    mutationFn: (id: string) => shelvesApi.remove(id),
    onSuccess: () => touched(),
  });

  const keep = useMutation({
    mutationFn: ({
      shelfId,
      showcaseId,
      note,
    }: {
      shelfId: string;
      showcaseId: string;
      note?: string;
    }) => shelvesApi.keep(shelfId, showcaseId, note),
    onSuccess: (_r, v) => touched(v.shelfId),
  });

  const unkeep = useMutation({
    mutationFn: ({ shelfId, showcaseId }: { shelfId: string; showcaseId: string }) =>
      shelvesApi.unkeep(shelfId, showcaseId),
    onSuccess: (_r, v) => touched(v.shelfId),
  });

  return { createShelf, updateShelf, removeShelf, keep, unkeep };
}

/**
 * Somebody's profile, in its two halves.
 *
 * By handle rather than id, because that is what the profile screen already
 * has and it saves resolving one. Your own profile uses the same pair, so the
 * page a visitor sees and the page you see are drawn from the same shape.
 */
export function useProfileWork(handle: string | undefined) {
  const query = useQuery({
    queryKey: queryKeys.showcases.ofHandle(handle ?? ''),
    queryFn: () => profileWorkApi.showcases(handle!),
    enabled: Boolean(handle),
  });

  return {
    ...query,
    showcases: query.data?.data ?? ([] as Showcase[]),
    loadFailed: query.isError || query.isPaused,
  };
}

export function useProfileTaste(handle: string | undefined) {
  const query = useQuery({
    queryKey: queryKeys.shelves.ofHandle(handle ?? ''),
    queryFn: () => profileWorkApi.shelves(handle!),
    enabled: Boolean(handle),
  });

  return {
    ...query,
    shelves: query.data?.data ?? ([] as ShelfSummary[]),
    loadFailed: query.isError || query.isPaused,
  };
}

/**
 * Liking, applied to the cached feed before the request goes.
 *
 * A heart that waits for a round trip before it fills is a heart people tap
 * twice. The pages are rewritten in place rather than invalidated, because
 * refetching the feed would reorder it under somebody mid-scroll.
 */
export function useLike() {
  const queryClient = useQueryClient();

  const write = (showcaseId: string, liked: boolean, delta: number) => {
    for (const scope of ['everyone', 'connections'] as const) {
      queryClient.setQueryData<{ pages: FeedPage[]; pageParams: unknown[] }>(
        queryKeys.feed.scope(scope),
        (old) =>
          old && {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((item) =>
                item.id === showcaseId
                  ? { ...item, likedByMe: liked, likeCount: Math.max(0, item.likeCount + delta) }
                  : item,
              ),
            })),
          },
      );
    }
  };

  return useMutation({
    mutationFn: ({ showcaseId, liked }: { showcaseId: string; liked: boolean }) =>
      liked ? likesApi.like(showcaseId) : likesApi.unlike(showcaseId),
    onMutate: ({ showcaseId, liked }) => {
      write(showcaseId, liked, liked ? 1 : -1);
      return { showcaseId, liked };
    },
    // Put it back on a real failure. Offline the mutation pauses rather than
    // failing, so the heart stays filled and the request goes when the device
    // returns — which is the behaviour somebody expects from a tap.
    onError: (_error, variables) => write(variables.showcaseId, !variables.liked, variables.liked ? -1 : 1),
  });
}
