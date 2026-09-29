import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  ApiError,
  commentsApi,
  feedApi,
  likesApi,
  queryKeys,
  profileWorkApi,
  shelvesApi,
  showcasesApi,
  type FeedItem,
  type FeedPage,
  type NewShowcase,
  type Comment,
  type ShelfSummary,
  type Showcase,
  type ShowcaseDetail,
} from '@/api';

/**
 * Retries, but not for an answer. A 404 or 403 on a post or a shelf means it
 * was taken down, deleted or made private; asking twice more only kept the
 * screen spinning for several seconds before it could say so.
 */
const retryUnlessGone = (failures: number, error: unknown) =>
  failures < 2 && !(error instanceof ApiError && (error.status === 404 || error.status === 403));

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

/**
 * The owner's own showcases, drafts and take-downs included.
 *
 * Your own profile reads this rather than the by-handle list: it needs no
 * handle, and it still shows a post you took down — the only place left to
 * put it back up from.
 */
export function useMyShowcases(opts: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: queryKeys.showcases.mine,
    queryFn: () => showcasesApi.mine(),
    enabled: opts.enabled ?? true,
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
    retry: retryUnlessGone,
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

  // Every showcase query, not just the owner's list: the post that is open,
  // and the profile tabs it came from, were left showing what it used to be.
  const touched = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.showcases.all });
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
/**
 * Your shelves. With `holding`, each also says whether it holds that showcase —
 * which is what lets the Keep sheet take something off a shelf again.
 */
export function useShelves(opts: { enabled?: boolean; holding?: string } = {}) {
  const query = useQuery({
    queryKey: opts.holding ? queryKeys.shelves.holding(opts.holding) : queryKeys.shelves.mine,
    queryFn: () => shelvesApi.mine(opts.holding),
    enabled: opts.enabled ?? true,
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
    retry: retryUnlessGone,
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
 * The feed and the showcases are invalidated too, because `keptByMe` and
 * `keptCount` are drawn on every card and on the post itself, and a Keep
 * button that stays un-kept after a keep is the thing people press twice.
 * Every shelf query goes, so the Taste tab on a profile is current as well.
 */
export function useShelfActions() {
  const queryClient = useQueryClient();

  const touched = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.shelves.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.showcases.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.feed.all });
  };

  const createShelf = useMutation({
    mutationFn: ({ name, isPublic }: { name: string; isPublic?: boolean }) =>
      shelvesApi.create(name, isPublic),
    onSuccess: () => touched(),
  });

  const updateShelf = useMutation({
    mutationFn: ({ id, name, isPublic }: { id: string; name?: string; isPublic?: boolean }) =>
      shelvesApi.update(id, { name, isPublic }),
    onSuccess: () => touched(),
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
    onSuccess: () => touched(),
  });

  const unkeep = useMutation({
    mutationFn: ({ shelfId, showcaseId }: { shelfId: string; showcaseId: string }) =>
      shelvesApi.unkeep(shelfId, showcaseId),
    onSuccess: () => touched(),
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
 * Liking, applied to the cached feed and the open post before the request goes.
 *
 * A heart that waits for a round trip before it fills is a heart people tap
 * twice. The pages are rewritten in place rather than invalidated, because
 * refetching the feed would reorder it under somebody mid-scroll. The post's
 * own screen reads a different query, and was left unchanged — so its second
 * tap liked again instead of unliking.
 */
export function useLike() {
  const queryClient = useQueryClient();

  const write = (showcaseId: string, liked: boolean, delta: number) => {
    queryClient.setQueryData<ShowcaseDetail>(
      queryKeys.showcases.one(showcaseId),
      (old) =>
        old && { ...old, likedByMe: liked, likeCount: Math.max(0, old.likeCount + delta) },
    );
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

/** The thread on a post. */
export function useComments(showcaseId: string | undefined) {
  const query = useQuery({
    queryKey: queryKeys.showcases.comments(showcaseId ?? ''),
    queryFn: () => commentsApi.list(showcaseId!),
    enabled: Boolean(showcaseId),
  });

  return {
    ...query,
    comments: query.data?.data ?? [],
    /** False when the author has turned commenting off. */
    allowed: query.data?.allowed ?? true,
    loadFailed: query.isError || query.isPaused,
  };
}

/**
 * Saying something, and taking it back.
 *
 * Both answer with the whole thread, which is written straight into the
 * cache — a comment that appears only after a refetch is one people send
 * twice. The showcase itself is invalidated too, because its count is drawn
 * on the card the reader came from.
 */
export function useCommentActions(showcaseId: string) {
  const queryClient = useQueryClient();

  const apply = (result: { data: Comment[] }) => {
    queryClient.setQueryData(queryKeys.showcases.comments(showcaseId), {
      data: result.data,
      allowed: true,
    });
    queryClient.invalidateQueries({ queryKey: queryKeys.showcases.one(showcaseId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.feed.all });
  };

  const add = useMutation({
    mutationFn: (body: string) => commentsApi.add(showcaseId, body),
    onSuccess: apply,
  });

  const remove = useMutation({
    mutationFn: (commentId: string) => commentsApi.remove(showcaseId, commentId),
    onSuccess: apply,
  });

  return { add, remove };
}
