import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsApi, queryKeys, type AppNotification } from '@/api';

/**
 * The notification list.
 *
 * One page, newest first. Deliberately not infinite: the sweep caps what any
 * account keeps, and a list nobody scrolls past the first screen of does not
 * need paging machinery to go with it. `before` is on the endpoint for when
 * that stops being true.
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
 * Writes the new count into the cache rather than waiting for a refetch, so
 * the badge clears on the click instead of on the next poll. Both queries are
 * then invalidated, because the server is what decides in the end and two
 * places showing different numbers is worse than a moment of staleness.
 */
export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) => notificationsApi.markRead(ids),
    onSuccess: (result) => {
      queryClient.setQueryData(
        queryKeys.notifications.unread,
        (prev: { count: number } | undefined) => ({
          count: Math.max(0, (prev?.count ?? 0) - result.updated),
        }),
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}
