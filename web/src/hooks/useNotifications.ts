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
  ApiError,
  notificationsApi,
  queryKeys,
  type AppNotification,
  type NotificationCategory,
  type NotificationChannel,
  type NotificationSetting,
} from '@/api';

type ListPage = { data: AppNotification[]; unread: number };

/**
 * The notification list, first page only: the bell's popover.
 *
 * One page, newest first. The page and screen that show everything use
 * `useNotificationFeed`, which pages on `before`.
 */
export function useNotifications(
  limit = 30,
  options: { enabled?: boolean } = {},
) {
  const query = useQuery({
    queryKey: queryKeys.notifications.list(limit),
    queryFn: () => notificationsApi.list({ limit }),
    // The list lives behind a bell that is shut most of the time. Fetching it
    // on every page would pay for thirty rows to render a number the count
    // query already answers.
    enabled: options.enabled ?? true,
  });

  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    notifications: query.data?.data ?? ([] as AppNotification[]),
    unread: query.data?.unread ?? 0,
  };
}

/** What the list is narrowed to: unread only, and one kind. */
export interface NotificationFilter {
  unread?: boolean;
  category?: NotificationCategory | null;
}

const PAGE_SIZE = 30;

/**
 * Everything, a page at a time, for the notifications page and screen.
 *
 * Filtered on the server, so "show earlier" pages through what the filter
 * shows. The next page starts strictly before the oldest item so far, and a
 * short page is the last one.
 */
export function useNotificationFeed(
  filter: NotificationFilter = {},
  options: { enabled?: boolean } = {},
) {
  const query = useInfiniteQuery({
    queryKey: queryKeys.notifications.feed(filter),
    queryFn: ({ pageParam }) =>
      notificationsApi.list({
        limit: PAGE_SIZE,
        before: pageParam,
        unread: filter.unread,
        category: filter.category,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.data.length < PAGE_SIZE
        ? undefined
        : last.data[last.data.length - 1]?.createdAt,
    // Off while the bell's popover is shut, like its first-page list.
    enabled: options.enabled ?? true,
  });

  // Deduplicated, because a notification that arrives between two pages can
  // push one already shown onto the next page as well.
  const notifications = useMemo(() => {
    const seen = new Set<string>();
    return (query.data?.pages ?? [])
      .flatMap((page) => page.data)
      .filter((n) => (seen.has(n.id) ? false : (seen.add(n.id), true)));
  }, [query.data]);

  return {
    ...query,
    loadFailed: query.isError || query.isPaused,
    notifications,
    unread: query.data?.pages[0]?.unread ?? 0,
  };
}

/** Every notification held in any cached list, whatever shape it was fetched in. */
function cachedItems(queryClient: QueryClient): AppNotification[] {
  return queryClient
    .getQueriesData<unknown>({ queryKey: queryKeys.notifications.all })
    .flatMap(([, data]) => {
      if (!data || typeof data !== 'object') return [];
      if ('pages' in data) {
        return (data as InfiniteData<ListPage>).pages.flatMap((page) => page.data);
      }
      if ('data' in data && Array.isArray((data as ListPage).data)) {
        return (data as ListPage).data;
      }
      return [];
    });
}

/**
 * Rewrites notifications in every cached list at once — so a row changes on
 * the tap, not on the refetch after it. `ids` null means all of them; a
 * change that returns null drops the row.
 */
function patchCached(
  queryClient: QueryClient,
  ids: ReadonlySet<string> | null,
  change: (n: AppNotification) => AppNotification | null,
): void {
  const apply = (items: AppNotification[]) =>
    items.flatMap((n) => {
      if (ids && !ids.has(n.id)) return [n];
      const next = change(n);
      return next ? [next] : [];
    });
  queryClient.setQueriesData<unknown>(
    { queryKey: queryKeys.notifications.all },
    (data: unknown) => {
      if (!data || typeof data !== 'object') return data;
      if ('pages' in data) {
        const infinite = data as InfiniteData<ListPage>;
        return {
          ...infinite,
          pages: infinite.pages.map((page) => ({ ...page, data: apply(page.data) })),
        };
      }
      if ('data' in data && Array.isArray((data as ListPage).data)) {
        return { ...(data as ListPage), data: apply((data as ListPage).data) };
      }
      return data;
    },
  );
}

/**
 * One notification, for the detail view.
 *
 * Usually opened from a list that already has it, so that copy is shown at
 * once and refreshed behind it. Opened from a link, it is fetched. A 404 is
 * final — deleted, expired, or someone else's — so it is not retried.
 */
export function useNotification(id: string | undefined) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.notifications.detail(id ?? ''),
    queryFn: () => notificationsApi.get(id as string),
    enabled: !!id,
    initialData: () =>
      id ? cachedItems(queryClient).find((n) => n.id === id) : undefined,
    initialDataUpdatedAt: 0,
    retry: (failures, error) =>
      !(error instanceof ApiError && error.status === 404) && failures < 2,
  });

  return {
    ...query,
    loadFailed: query.isError || query.isPaused,
    notFound: query.error instanceof ApiError && query.error.status === 404,
    notification: query.data ?? null,
  };
}

/**
 * Just the badge.
 *
 * Its own query, and its own request, because the badge is on screen
 * everywhere and the list is on screen almost nowhere. Polled as well as
 * pushed, for the same reason the jobs badge is: a socket that dropped while
 * the laptop was asleep misses every frame sent in between, and a badge that
 * silently stops counting is worse than one that lags.
 */
export function useUnreadNotifications() {
  const query = useQuery({
    queryKey: queryKeys.notifications.unread,
    queryFn: () => notificationsApi.unreadCount(),
    refetchInterval: 60_000,
    // The count is the point; a stale one defeats it.
    staleTime: 0,
  });

  return {
    ...query,
    loadFailed: query.isError || query.isPaused,
    count: query.data?.count ?? 0,
  };
}

/**
 * Marks notifications read — some by id, or all of them with no argument.
 *
 * The rows and the badge change on the click; the server's word comes with
 * the refetch after it, because two places showing different numbers is worse
 * than a moment of staleness.
 */
export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) => notificationsApi.markRead(ids),
    onMutate: (ids) => {
      const at = new Date().toISOString();
      patchCached(queryClient, ids ? new Set(ids) : null, (n) =>
        n.readAt ? n : { ...n, readAt: at },
      );
    },
    onSuccess: (result) => {
      queryClient.setQueryData(
        queryKeys.notifications.unread,
        (prev: { count: number } | undefined) => ({
          count: Math.max(0, (prev?.count ?? 0) - result.updated),
        }),
      );
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all }),
  });
}

/** Marks notifications unread again, to come back to later. */
export function useMarkNotificationsUnread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => notificationsApi.markUnread(ids),
    onMutate: (ids) => {
      patchCached(queryClient, new Set(ids), (n) => ({ ...n, readAt: null }));
    },
    onSuccess: (result) => {
      queryClient.setQueryData(
        queryKeys.notifications.unread,
        (prev: { count: number } | undefined) => ({
          count: (prev?.count ?? 0) + result.updated,
        }),
      );
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all }),
  });
}

/**
 * Deletes notifications from this account's list. The rows go on the tap —
 * a swipe that leaves the row sitting there until a refetch looks like it
 * failed.
 */
export function useDeleteNotifications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => notificationsApi.remove(ids),
    onMutate: (ids) => {
      patchCached(queryClient, new Set(ids), () => null);
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all }),
  });
}

/** Which kinds reach this account where. */
export function useNotificationSettings() {
  const query = useQuery({
    queryKey: queryKeys.notifications.settings,
    queryFn: () => notificationsApi.settings(),
  });

  return {
    ...query,
    loadFailed: query.isError || query.isPaused,
    settings: query.data?.data ?? ([] as NotificationSetting[]),
  };
}

/**
 * Flips one switch. It moves on the tap and moves back if the server refuses;
 * the saved table the server answers with then replaces the guess.
 */
export function useUpdateNotificationSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (change: {
      category: NotificationCategory;
      channel: NotificationChannel;
      enabled: boolean;
    }) => notificationsApi.updateSetting(change),
    onMutate: async (change) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications.settings });
      const previous = queryClient.getQueryData<{ data: NotificationSetting[] }>(
        queryKeys.notifications.settings,
      );
      if (previous) {
        queryClient.setQueryData(queryKeys.notifications.settings, {
          data: previous.data.map((row) =>
            row.category === change.category
              ? { ...row, [change.channel]: change.enabled }
              : row,
          ),
        });
      }
      return { previous };
    },
    onError: (_error, _change, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.notifications.settings, context.previous);
      }
    },
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.notifications.settings, result);
    },
  });
}
