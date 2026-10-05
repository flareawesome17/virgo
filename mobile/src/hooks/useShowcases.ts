import { useMemo } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import {
  commentsApi,
  feedApi,
  likesApi,
  queryKeys,
  profileWorkApi,
  retryUnlessGone,
  shelvesApi,
  showcasesApi,
  type CommentPage,
  type FeedItem,
  type FeedPage,
  type NewShowcase,
  type ProfileWorkPage,
  type ShelfSummary,
  type Showcase,
  type ShowcaseDetail,
} from '@/src/api';

type FeedPages = InfiniteData<FeedPage, string | undefined>;

/**
 * Changes one showcase wherever it is drawn: on the open post and in every
 * loaded page of both feeds. Rewritten in place, never refetched — refetching
 * the feed brought new posts in at the top and moved the list under somebody
 * reading it.
 */
function patchShowcase(
  queryClient: QueryClient,
  showcaseId: string,
  patch: (item: FeedItem) => FeedItem,
): void {
  queryClient.setQueryData<ShowcaseDetail>(queryKeys.showcases.one(showcaseId), (old) =>
    old ? patch(old) : old,
  );
  queryClient.setQueriesData<FeedPages>({ queryKey: queryKeys.feed.all }, (old) =>
    old && Array.isArray(old.pages)
      ? {
          ...old,
          pages: old.pages.map((page) =>
            page.items.some((item) => item.id === showcaseId)
              ? {
                  ...page,
                  items: page.items.map((item) => (item.id === showcaseId ? patch(item) : item)),
                }
              : page,
          ),
        }
      : old,
  );
}

/** A showcase from whichever feed page already has it. */
function cachedFeedItem(queryClient: QueryClient, showcaseId: string): FeedItem | undefined {
  for (const [, data] of queryClient.getQueriesData<FeedPages>({ queryKey: queryKeys.feed.all })) {
    if (!data || !Array.isArray(data.pages)) continue;
    for (const page of data.pages) {
      const found = page.items.find((item) => item.id === showcaseId);
      if (found) return found;
    }
  }
  return undefined;
}

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
    // Refreshed by pulling, not behind somebody's back: a refetch fetched
    // every page they had scrolled through and pushed new posts in at the top,
    // moving what they were reading.
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
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
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.showcases.one(id ?? ''),
    queryFn: () => showcasesApi.one(id!),
    enabled: Boolean(id),
    retry: retryUnlessGone,
    // The card it was opened from already has all of it: opening a post
    // showed a spinner while it fetched what was on screen a moment before.
    placeholderData: () => (id ? cachedFeedItem(queryClient, id) : undefined),
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

  /*
   * Keeping is drawn at once, like the heart. It waited for a reload of every
   * feed page before the button said "Kept", which is the thing people press
   * twice. Only the shelves are refetched afterwards; the cards are patched.
   */
  const keep = useMutation({
    mutationFn: ({
      shelfId,
      showcaseId,
      note,
    }: {
      shelfId: string;
      showcaseId: string;
      note?: string;
      /** Whether some shelf held it before this one, so the count is right. */
      alreadyKept?: boolean;
    }) => shelvesApi.keep(shelfId, showcaseId, note),
    onMutate: ({ showcaseId, alreadyKept }) => {
      if (!alreadyKept) {
        patchShowcase(queryClient, showcaseId, (item) =>
          item.keptByMe ? item : { ...item, keptByMe: true, keptCount: item.keptCount + 1 },
        );
      }
      return { alreadyKept };
    },
    onError: (_err, { showcaseId, alreadyKept }) => {
      if (!alreadyKept) {
        patchShowcase(queryClient, showcaseId, (item) =>
          item.keptByMe
            ? { ...item, keptByMe: false, keptCount: Math.max(0, item.keptCount - 1) }
            : item,
        );
      }
    },
    onSettled: (_data, _err, { showcaseId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shelves.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.showcases.one(showcaseId) });
    },
  });

  const unkeep = useMutation({
    mutationFn: ({
      shelfId,
      showcaseId,
    }: {
      shelfId: string;
      showcaseId: string;
      /** Whether another shelf still holds it, so the card stays "Kept". */
      stillKept?: boolean;
    }) => shelvesApi.unkeep(shelfId, showcaseId),
    onSuccess: (_data, { showcaseId, stillKept }) => {
      if (!stillKept) {
        patchShowcase(queryClient, showcaseId, (item) =>
          item.keptByMe
            ? { ...item, keptByMe: false, keptCount: Math.max(0, item.keptCount - 1) }
            : item,
        );
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.shelves.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.showcases.one(showcaseId) });
    },
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
  const query = useInfiniteQuery({
    queryKey: queryKeys.showcases.ofHandle(handle ?? ''),
    queryFn: ({ pageParam }) => profileWorkApi.showcases(handle!, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: ProfileWorkPage) => last.nextCursor ?? undefined,
    enabled: Boolean(handle),
  });

  const showcases = useMemo(
    () => query.data?.pages.flatMap((page) => page.data) ?? ([] as Showcase[]),
    [query.data],
  );

  return {
    ...query,
    showcases,
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
export function useLike(showcaseId?: string) {
  const queryClient = useQueryClient();
  const mutationKey = ['like', showcaseId ?? ''];

  const write = (id: string, liked: boolean, delta: number) =>
    patchShowcase(queryClient, id, (item) => ({
      ...item,
      likedByMe: liked,
      likeCount: Math.max(0, item.likeCount + delta),
    }));

  return useMutation({
    mutationKey,
    /*
     * One at a time, per post. A fast double tap sent like and unlike side by
     * side, and whichever the server finished last won — not whichever was
     * tapped last. In one scope the second waits for the first.
     */
    scope: showcaseId ? { id: `like:${showcaseId}` } : undefined,
    mutationFn: ({ showcaseId: id, liked }: { showcaseId: string; liked: boolean }) =>
      liked ? likesApi.like(id) : likesApi.unlike(id),
    onMutate: async ({ showcaseId: id, liked }) => {
      // A refetch already in flight would land after this and put the old
      // heart back.
      await Promise.all([
        queryClient.cancelQueries({ queryKey: queryKeys.showcases.one(id) }),
        queryClient.cancelQueries({ queryKey: queryKeys.feed.all }),
      ]);
      write(id, liked, liked ? 1 : -1);
      return { showcaseId: id, liked };
    },
    // The server's count, once nothing else for this post is still on its
    // way: everyone else's likes are in it, which a +1 is not.
    onSuccess: (result, { showcaseId: id }) => {
      if (!showcaseId || queryClient.isMutating({ mutationKey }) > 1) return;
      patchShowcase(queryClient, id, (item) => ({
        ...item,
        likedByMe: result.liked,
        likeCount: result.likeCount,
      }));
    },
    // Put it back on a real failure. Offline the mutation pauses rather than
    // failing, so the heart stays filled and the request goes when the device
    // returns — which is the behaviour somebody expects from a tap.
    onError: (_error, variables) =>
      write(variables.showcaseId, !variables.liked, variables.liked ? -1 : 1),
  });
}

type CommentPages = InfiniteData<CommentPage, string | undefined>;

/**
 * The thread on a post: the newest page, and earlier pages on request.
 *
 * It was the oldest 30, so past the thirtieth a new comment never showed and
 * people posted it again.
 */
export function useComments(showcaseId: string | undefined) {
  const query = useInfiniteQuery({
    queryKey: queryKeys.showcases.comments(showcaseId ?? ''),
    queryFn: ({ pageParam }) => commentsApi.list(showcaseId!, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: CommentPage) => last.earlier ?? undefined,
    enabled: Boolean(showcaseId),
  });

  // Pages run newest to earliest; each reads oldest first within itself.
  const comments = useMemo(
    () =>
      (query.data?.pages ?? [])
        .slice()
        .reverse()
        .flatMap((page) => page.data),
    [query.data],
  );

  return {
    ...query,
    comments,
    /** False when the author has turned commenting off. */
    allowed: query.data?.pages[0]?.allowed ?? true,
    /** Whether there are comments before the ones loaded. */
    hasEarlier: query.hasNextPage,
    loadEarlier: query.fetchNextPage,
    loadingEarlier: query.isFetchingNextPage,
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

  /*
   * The answer is the newest page, which replaces whatever was loaded: the
   * new comment is at its end. The count on the post and on its card is
   * moved by one rather than refetched — invalidating the feed reloaded
   * every page of it for one comment.
   */
  const apply = (result: CommentPage, delta: number) => {
    queryClient.setQueryData<CommentPages>(queryKeys.showcases.comments(showcaseId), (old) => ({
      pages: [
        {
          data: result.data,
          allowed: result.allowed ?? old?.pages[0]?.allowed ?? true,
          earlier: result.earlier ?? null,
        },
      ],
      pageParams: [undefined],
    }));
    patchShowcase(queryClient, showcaseId, (item) => ({
      ...item,
      commentCount: Math.max(0, item.commentCount + delta),
    }));
  };

  const add = useMutation({
    mutationFn: (body: string) => commentsApi.add(showcaseId, body),
    onSuccess: (result) => apply(result, 1),
  });

  const remove = useMutation({
    mutationFn: (commentId: string) => commentsApi.remove(showcaseId, commentId),
    onSuccess: (result) => apply(result, -1),
  });

  return { add, remove };
}
