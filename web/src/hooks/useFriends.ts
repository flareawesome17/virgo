import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  friendsApi,
  queryKeys,
  type CreateFriendInput,
  type Friend,
  type ListFriendsParams,
  type UpdateFriendInput,
} from '@/api';

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
  return { ...result, people: result.data?.data ?? [] };
}
