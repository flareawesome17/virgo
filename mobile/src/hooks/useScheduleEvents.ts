import { hasId, patchCachedRows, restoreCached } from './optimistic';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  queryKeys,
  scheduleEventsApi,
  type CreateScheduleEventInput,
  type ListScheduleEventsParams,
  type ScheduleEvent,
  type UpdateScheduleEventInput,
} from '@/src/api';

import type { QueryOptions } from './useWorkspaces';

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
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
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
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
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
      // Over what the screen already had: a save does not say who organised
      // it, and an older API did not say whose it was either.
      queryClient.setQueryData<ScheduleEvent>(
        queryKeys.scheduleEvents.detail(updated.id),
        (prev) => ({
          ...prev,
          ...updated,
          is_owner: updated.is_owner ?? prev?.is_owner,
          organiser_name: updated.organiser_name ?? prev?.organiser_name,
          organiser_avatar_url: updated.organiser_avatar_url ?? prev?.organiser_avatar_url,
        }),
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduleEvents.all });
      // A moved event moves its reminders on the server.
      queryClient.invalidateQueries({ queryKey: queryKeys.reminders.all });
    },
  });
}

/** Deletes an event: off the schedule on the tap, back if the server refuses. */
export function useDeleteScheduleEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => scheduleEventsApi.remove(id),
    onMutate: async (id: string) => ({
      // An invitation is a row under the same key with an id of its own, and
      // its event's id beside it; neither is this event's row.
      before: await patchCachedRows(queryClient, queryKeys.scheduleEvents.all, hasId, (row) =>
        row.id === id && !('event_id' in row) ? null : row,
      ),
    }),
    onError: (_error, _id, context) => restoreCached(queryClient, context?.before),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduleEvents.all });
      // reminders.schedule_event_id is ON DELETE SET NULL, so attached
      // reminders survive but their linkage changes.
      queryClient.invalidateQueries({ queryKey: queryKeys.reminders.all });
    },
  });
}

// ─── Invitations ─────────────────────────────────────────────────────────────

/** Event invitations waiting on the signed-in user. */
export function useEventInvitations() {
  const query = useQuery({
    queryKey: queryKeys.scheduleEvents.invitations,
    queryFn: () => scheduleEventsApi.invitations(),
  });
  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    invitations: query.data?.data ?? [],
  };
}

/** Who is coming to one event. */
export function useEventAttendees(eventId: string | undefined) {
  const query = useQuery({
    queryKey: queryKeys.scheduleEvents.attendees(eventId ?? ''),
    queryFn: () => scheduleEventsApi.attendees(eventId as string),
    enabled: !!eventId,
  });
  return {
    ...query,
    /** Failed *or* paused — an offline device never reaches `isError`. */
    loadFailed: query.isError || query.isPaused,
    attendees: query.data?.data ?? [],
  };
}

export function useInviteToEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, userIds }: { eventId: string; userIds: string[] }) =>
      scheduleEventsApi.invite(eventId, userIds),
    onSuccess: (_result, { eventId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.scheduleEvents.attendees(eventId),
      });
    },
  });
}

export function useUninviteFromEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, userId }: { eventId: string; userId: string }) =>
      scheduleEventsApi.uninvite(eventId, userId),
    onSuccess: (_result, { eventId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.scheduleEvents.attendees(eventId),
      });
    },
  });
}

/**
 * Accepts or declines.
 *
 * Invalidates every schedule key, not just the invitation list: accepting puts
 * the event on the calendar, so the range queries behind it are stale too.
 */
/**
 * Answers an invitation: it leaves the waiting list on the tap, and comes
 * back if the server refuses. An accepted event reaches the schedule with the
 * read that follows.
 */
export function useRespondToEventInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, accept }: { eventId: string; accept: boolean }) =>
      scheduleEventsApi.respondToInvitation(eventId, accept),
    onMutate: async ({ eventId }: { eventId: string; accept: boolean }) => ({
      before: await patchCachedRows(
        queryClient,
        queryKeys.scheduleEvents.invitations,
        (value: unknown): value is { event_id: string } =>
          !!value && typeof value === 'object' && 'event_id' in value,
        (row) => (row.event_id === eventId ? null : row),
      ),
    }),
    onError: (_error, _input, context) => restoreCached(queryClient, context?.before),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scheduleEvents.all });
    },
  });
}
