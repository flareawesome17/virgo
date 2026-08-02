import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  queryKeys,
  scheduleEventsApi,
  type CreateScheduleEventInput,
  type ListScheduleEventsParams,
  type ScheduleEvent,
  type UpdateScheduleEventInput,
} from '@/api';

import type { QueryOptions } from '@/hooks/useWorkspaces';

export function useScheduleEvents(
  params: ListScheduleEventsParams = {},
  options: QueryOptions = {},
) {
  const query = useQuery({
    queryKey: queryKeys.scheduleEvents.list(params),
    queryFn: () => scheduleEventsApi.list(params),
    enabled: options.enabled ?? true,
  });

  return {
    ...query,
    events: query.data?.data ?? ([] as ScheduleEvent[]),
    total: query.data?.total ?? 0,
  };
}

/** Calendar and agenda views: a date window rather than offset pagination. */
export function useScheduleEventRange(
  from: string | undefined,
  to: string | undefined,
) {
  const query = useQuery({
    queryKey: queryKeys.scheduleEvents.list({ from, to }),
    queryFn: () => scheduleEventsApi.listRange(from as string, to as string),
    enabled: !!from && !!to,
  });

  return {
    ...query,
    events: query.data?.data ?? ([] as ScheduleEvent[]),
  };
}

export function useScheduleEvent(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.scheduleEvents.detail(id ?? ''),
    queryFn: () => scheduleEventsApi.get(id as string),
    enabled: !!id,
  });
}

export function useCreateScheduleEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateScheduleEventInput) =>
      scheduleEventsApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduleEvents.all });
    },
  });
}

export function useUpdateScheduleEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateScheduleEventInput & { id: string }) =>
      scheduleEventsApi.update(id, input),
    onSuccess: (updated) => {
      queryClient.setQueryData(
        queryKeys.scheduleEvents.detail(updated.id),
        updated,
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduleEvents.all });
    },
  });
}

export function useDeleteScheduleEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => scheduleEventsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduleEvents.all });
      // reminders.schedule_event_id is ON DELETE SET NULL, so attached
      // reminders survive but their linkage changes.
      queryClient.invalidateQueries({ queryKey: queryKeys.reminders.all });
    },
  });
}
