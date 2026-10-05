import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  queryKeys,
  remindersApi,
  type CreateReminderInput,
  type ListRemindersParams,
  type Reminder,
  type UpdateReminderInput,
} from '@/src/api';

import type { QueryOptions } from './useWorkspaces';

export function useReminders(
  params: ListRemindersParams = {},
  options: QueryOptions = {},
) {
  const query = useQuery({
    queryKey: queryKeys.reminders.list(params),
    queryFn: () => remindersApi.list(params),
    enabled: options.enabled ?? true,
  });

  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    reminders: query.data?.data ?? ([] as Reminder[]),
    total: query.data?.total ?? 0,
  };
}

export function useReminder(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.reminders.detail(id ?? ''),
    queryFn: () => remindersApi.get(id as string),
    enabled: !!id,
  });
}

export function useCreateReminder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateReminderInput) => remindersApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reminders.all });
    },
  });
}

/**
 * Changes a reminder, on screen at once.
 *
 * The tick and the alarm and push switches waited for the server, so a tap
 * did nothing visible for a moment, and a failure did nothing at all. They
 * change on the tap now and go back if the server refuses; the caller says so.
 */
export function useUpdateReminder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateReminderInput & { id: string }) =>
      remindersApi.update(id, input),
    onMutate: async ({ id, ...input }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.reminders.all });
      const before = queryClient.getQueriesData<unknown>({ queryKey: queryKeys.reminders.all });
      const apply = (r: Reminder) => (r.id === id ? { ...r, ...input } : r);
      queryClient.setQueriesData<unknown>({ queryKey: queryKeys.reminders.all }, (data: unknown) => {
        if (!data || typeof data !== 'object') return data;
        if ('data' in data && Array.isArray((data as { data: unknown }).data)) {
          const list = data as { data: Reminder[] };
          return { ...list, data: list.data.map(apply) };
        }
        if ('id' in data && (data as Reminder).id === id) return apply(data as Reminder);
        return data;
      });
      return { before };
    },
    onError: (_error, _input, context) => {
      for (const [key, data] of context?.before ?? []) queryClient.setQueryData(key, data);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.reminders.detail(updated.id), updated);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.reminders.all }),
  });
}

export function useDeleteReminder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => remindersApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reminders.all });
    },
  });
}
