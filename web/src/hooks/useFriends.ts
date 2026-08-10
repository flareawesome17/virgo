import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  friendsApi,
  queryKeys,
  type CreateFriendInput,
  type Friend,
  type ListFriendsParams,
  type UpdateFriendInput,
} from '@/api';

import { seedPresence } from '@/lib/presence-store';
import type { QueryOptions } from '@/hooks/useWorkspaces';

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
    },
  });
}

/**
 * Sends a friend request by email.
 *
 * The old flow called useCreateFriend with a typed-in name, which wrote a row
 * describing someone rather than reaching them. This addresses a real account,
 * writes both sides of the friendship, and pushes the recipient.
 */
export function useSendFriendRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    // Takes an account id from the people search; an email is still accepted
    // for adding someone by exact address.
    mutationFn: (target: { userId: string } | { email: string }) =>
      'userId' in target
        ? friendsApi.sendRequestToUser(target.userId)
        : friendsApi.sendRequest(target.email),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.friends.all });
    },
  });
}

export function useRespondToFriendRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) =>
      accept ? friendsApi.accept(id) : friendsApi.decline(id),
    onSuccess: () => {
      // Both sides change, and collaborator pickers read the accepted list.
      queryClient.invalidateQueries({ queryKey: queryKeys.friends.all });
      queryClient.invalidateQueries({ queryKey: ['collaborators'] });
    },
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
    queryKey: ['friends', 'search', q],
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
  const { friends, loadFailed, refetch } = useFriends(
    { status: 'accepted', limit: 100 },
    options,
  );

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
  return { friends, loadFailed, refetch };
}
