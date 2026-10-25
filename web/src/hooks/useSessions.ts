import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  queryKeys,
  sessionsApi,
  type DeviceSession,
  type ListResponse,
} from '@/api';
import type { QueryOptions } from '@/hooks/useWorkspaces';

/** The devices signed in to your account, this one first. */
export function useSessions(options: QueryOptions = {}) {
  const query = useQuery({
    queryKey: queryKeys.sessions.list,
    queryFn: () => sessionsApi.list(),
    enabled: options.enabled ?? true,
  });

  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    sessions: query.data?.data ?? ([] as DeviceSession[]),
    total: query.data?.total ?? 0,
  };
}

/**
 * Signs out one other device.
 *
 * A 404 is taken as done: the device was already signed out, by a second tap
 * before the refetch landed or from another device, and saying "not found"
 * to someone who has just got rid of it is wrong and alarming.
 */
export function useSignOutSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      sessionsApi.signOut(id).catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 404) return;
        throw err;
      }),
    onSuccess: (_done, id) => {
      // Out of the list at once, rather than when the refetch returns with its
      // Sign out still enabled on a device that is already gone.
      queryClient.setQueryData<ListResponse<DeviceSession>>(queryKeys.sessions.list, (old) =>
        old
          ? { ...old, data: old.data.filter((s) => s.id !== id), total: Math.max(0, old.total - 1) }
          : old,
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
    },
  });
}

/** Signs out every device but this one. */
export function useSignOutOtherSessions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => sessionsApi.signOutOthers(),
    onSuccess: () => {
      queryClient.setQueryData<ListResponse<DeviceSession>>(queryKeys.sessions.list, (old) => {
        if (!old) return old;
        const kept = old.data.filter((s) => s.current);
        return { ...old, data: kept, total: kept.length };
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all });
    },
  });
}
