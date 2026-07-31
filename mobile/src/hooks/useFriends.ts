import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  friendsApi,
  queryKeys,
  type CreateFriendInput,
  type Friend,
  type ListFriendsParams,
  type UpdateFriendInput,
} from '@/src/api';

import type { QueryOptions } from './useWorkspaces';

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
