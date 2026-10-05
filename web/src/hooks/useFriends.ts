import { useEffect, useMemo } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {
  ApiError,
  friendsApi,
  hireApi,
  queryKeys,
  type CreateFriendInput,
  type Friend,
  type FriendRequestTarget,
  type ListFriendsParams,
  type ListResponse,
  type PeopleUnseen,
  type UpdateFriendInput,
} from '@/api';

import { seedPresence } from '@/lib/presence-store';
import type { QueryOptions } from '@/hooks/useWorkspaces';

/**
 * A profile carries the viewer's connection to its owner and both of their
 * counts, so any change to a friendship makes it stale — the one on screen
 * and your own page's stats alike. Without this, Connect kept showing after a
 * request was sent from Network, and a removed connection still read as one.
 */
const invalidateProfiles = (queryClient: QueryClient) => {
  queryClient.invalidateQueries({ queryKey: queryKeys.publicProfiles.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.profile.page });
};

export function useFriends(
  params: ListFriendsParams = {},
  options: QueryOptions = {},
) {
  const query = useQuery({
    queryKey: queryKeys.friends.list(params),
    queryFn: () => friendsApi.list(params),
    enabled: options.enabled ?? true,
  });

  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    friends: query.data?.data ?? ([] as Friend[]),
    total: query.data?.total ?? 0,
  };
}

/**
 * Every accepted connection, however many there are.
 *
 * The chat pickers asked for one page of a hundred, so anyone past the
 * hundredth could not be messaged or added to a group, and there was no
 * search to reach them either. Pages are fetched one after another until the
 * total is in, and the pickers search what came back.
 */
export function useAllConnections(options: QueryOptions = {}) {
  const query = useInfiniteQuery({
    queryKey: [...queryKeys.friends.all, 'all-accepted'],
    // By name, across every page. Newest first, the list read as no order at
    // all, and a name could only be found by scrolling the whole of it.
    queryFn: ({ pageParam }) =>
      friendsApi.list({
        status: 'accepted',
        limit: 100,
        offset: pageParam,
        orderBy: 'friend_name',
        direction: 'asc',
      }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.data.length, 0);
      return last.data.length > 0 && loaded < last.total ? loaded : undefined;
    },
    enabled: options.enabled ?? true,
  });

  const { hasNextPage, isFetchingNextPage, isError, fetchNextPage } = query;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && !isError) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isError, fetchNextPage]);

  const friends = useMemo(
    () => query.data?.pages.flatMap((p) => p.data) ?? ([] as Friend[]),
    [query.data],
  );

  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    /** Nothing has arrived yet, so an empty list says nothing about who you know. */
    loading: query.data === undefined && !query.isError && !query.isPaused,
    friends,
  };
}

/**
 * How many friend requests are waiting on this user to answer.
 *
 * For the Network badge. `requested_by: 'them'` is the recipient's side —
 * without it this would also count requests the user sent themselves, and a
 * badge that lights up because *you* did something is noise.
 *
 * No polling: `friend-request` and `friend-accepted` already invalidate
 * `queryKeys.friends.all` from the socket, so the count moves the moment the
 * request lands rather than on the next screen visit.
 */
export function useIncomingFriendRequests(options: QueryOptions = {}) {
  const { friends, loadFailed } = useFriends(
    { status: 'pending', requested_by: 'them', limit: 100 },
    options,
  );
  return { requests: friends, count: friends.length, loadFailed };
}

export function useFriend(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.friends.detail(id ?? ''),
    queryFn: () => friendsApi.get(id as string),
    enabled: !!id,
  });
}

export function useCreateFriend() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFriendInput) => friendsApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.friends.all });
    },
  });
}

export function useUpdateFriend() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateFriendInput & { id: string }) =>
      friendsApi.update(id, input),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.friends.detail(updated.id), updated);
      queryClient.invalidateQueries({ queryKey: queryKeys.friends.all });
    },
  });
}

export function useDeleteFriend() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => friendsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.friends.all });
      // Nearby shows the same relationship: an ex-connection kept a Message
      // button that failed, and a withdrawn request still read "Requested".
      queryClient.invalidateQueries({ queryKey: ['discover'] });
      invalidateProfiles(queryClient);
    },
  });
}

/**
 * Sends a friend request.
 *
 * The old flow called useCreateFriend with a typed-in name, which wrote a row
 * describing someone rather than reaching them. This addresses a real account,
 * writes both sides of the friendship, and pushes the recipient.
 */
export function useSendFriendRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    // Takes an account id from the people search or an exact address, as
    // before, or a handle from a profile. Posted as given: the body for
    // { userId } and { email } is exactly what the older calls sent.
    mutationFn: (target: FriendRequestTarget) => friendsApi.request(target),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.friends.all });
      // Nearby shows the same relationship as a chip (Add, Requested, Accept).
      queryClient.invalidateQueries({ queryKey: ['discover'] });
      invalidateProfiles(queryClient);
    },
  });
}

/** Every cached pending list, which is where an answered request is drawn from. */
const PENDING_LISTS = { queryKey: [...queryKeys.friends.all, 'list'] };

export function useRespondToFriendRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) =>
      accept ? friendsApi.accept(id) : friendsApi.decline(id),
    /*
     * Off the list the moment it is answered.
     *
     * The buttons came back before the list had refreshed, so a second tap
     * answered a request that was already answered — and reported an error
     * for an accept that had worked.
     */
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries(PENDING_LISTS);
      const before = queryClient.getQueriesData<ListResponse<Friend>>(PENDING_LISTS);
      queryClient.setQueriesData<ListResponse<Friend>>(PENDING_LISTS, (old) =>
        old && Array.isArray(old.data) && old.data.some((f) => f.id === id && f.status === 'pending')
          ? { ...old, data: old.data.filter((f) => f.id !== id), total: Math.max(0, old.total - 1) }
          : old,
      );
      return { before };
    },
    onError: (_err, _vars, context) => {
      for (const [key, data] of context?.before ?? []) queryClient.setQueryData(key, data);
    },
    // Returned, so the mutation stays pending until the lists have the answer.
    onSuccess: () =>
      Promise.all([
        // Both sides change, and collaborator pickers read the accepted list.
        queryClient.invalidateQueries({ queryKey: queryKeys.friends.all }),
        // Nearby shows the same relationship as a chip (Connect, Requested, Accept).
        queryClient.invalidateQueries({ queryKey: ['discover'] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.collaborators.all }),
        invalidateProfiles(queryClient),
      ]),
  });
}

/**
 * People matching a search, with the caller's relationship to each.
 *
 * Debounced by the caller; disabled under two characters, which is also what
 * the server requires.
 */
export function usePeopleSearch(query: string) {
  const q = query.trim();
  const result = useQuery({
    queryKey: queryKeys.friends.search(q),
    queryFn: () => friendsApi.searchPeople(q),
    enabled: q.length >= 2,
  });
  return {
    ...result,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: result.isError || result.isPaused,
    people: result.data?.data ?? [],
  };
}

/**
 * Accepted friends, ordered for a presence list: connected first, then by
 * name, so the people you can actually reach right now are at the top.
 *
 * Seeds the presence store from the snapshot on load. After that the socket
 * owns it — `usePresence(id)` re-renders only the row whose friend changed,
 * rather than re-sorting the whole list on every heartbeat.
 */
export function useFriendPresence(options: QueryOptions = {}) {
  // Every connection, by name: the first hundred, newest first, was all a
  // list of your connections ever showed.
  const { friends, loadFailed, loading, refetch } = useAllConnections(options);

  const snapshot = useQuery({
    queryKey: queryKeys.friends.presence,
    queryFn: () => friendsApi.presence(),
    enabled: options.enabled ?? true,
    // A safety net only: a missed socket event would otherwise leave a dot
    // wrong until the next reload.
    refetchInterval: 120_000,
  });

  useEffect(() => {
    const rows = snapshot.data?.data;
    if (rows?.length) seedPresence(rows);
  }, [snapshot.data]);

  // `refetch` passes through for pull-to-refresh: this is the friend list a
  // screen shows, not a separate one, so a screen using it should not have to
  // call useFriends a second time just to be able to reload.
  return { friends, loadFailed, loading, refetch };
}

/**
 * What the Messages dot counts for People: connection requests and hire
 * enquiries that arrived since People was last opened.
 *
 * A request lit the dot until it was answered, so ignoring a stranger meant
 * a dot that never went out. It now clears on being seen, as the Jobs badge
 * does; the requests themselves stay listed until they are answered.
 *
 * An API from before this answers 404. Then the count is what it always
 * was — everything still waiting.
 */
export function usePeopleUnseen(options: QueryOptions = {}) {
  const query = useQuery({
    queryKey: [...queryKeys.friends.all, 'unseen'],
    queryFn: async (): Promise<PeopleUnseen & { supported: boolean }> => {
      try {
        return { ...(await friendsApi.unseen()), supported: true };
      } catch (err) {
        if (!(err instanceof ApiError) || err.status !== 404) throw err;
        const [requests, enquiries] = await Promise.all([
          friendsApi.list({ status: 'pending', requested_by: 'them', limit: 100 }),
          hireApi.list(),
        ]);
        return {
          requests: requests.data.length,
          enquiries: enquiries.data.filter((e) => e.direction === 'received' && e.status === 'new')
            .length,
          seenAt: null,
          // Nothing to mark: the count only falls by answering.
          supported: false,
        };
      }
    },
    enabled: options.enabled ?? true,
    refetchInterval: 120_000,
  });
  const requests = query.data?.requests ?? 0;
  const enquiries = query.data?.enquiries ?? 0;
  return {
    ...query,
    requests,
    enquiries,
    count: requests + enquiries,
    /** Whether the API keeps a seen marker at all; an older one does not. */
    supported: query.data?.supported ?? true,
  };
}

/** Marks People as seen, and clears the dot here at once rather than on the refetch. */
export function useMarkPeopleSeen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => friendsApi.markSeen(),
    onMutate: () => {
      queryClient.setQueryData<PeopleUnseen>([...queryKeys.friends.all, 'unseen'], (old) =>
        old ? { ...old, requests: 0, enquiries: 0 } : old,
      );
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: [...queryKeys.friends.all, 'unseen'] }),
  });
}
