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

export function useUpdateReminder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateReminderInput & { id: string }) =>
      remindersApi.update(id, input),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.reminders.detail(updated.id), updated);
      queryClient.invalidateQueries({ queryKey: queryKeys.reminders.all });
    },
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
