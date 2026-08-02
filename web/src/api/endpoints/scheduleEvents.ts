import { api } from '../client';
import type {
  EventAttendee,
  EventInvitation,
  EventType,
  ListParams,
  ListResponse,
  ScheduleEvent,
} from '../types';

export interface ListScheduleEventsParams extends ListParams {
  workspace_id?: string;
  event_type?: EventType;
  /** Supplying both switches the endpoint to date-range mode (calendar/agenda). */
  from?: string;
  to?: string;
}

export interface CreateScheduleEventInput {
  id?: string;
  workspace_id?: string | null;
  title: string;
  description?: string | null;
  event_date: string;
  event_time?: string | null;
  event_type?: EventType;
}

export type UpdateScheduleEventInput = Partial<
  Omit<CreateScheduleEventInput, 'id'>
>;

export const scheduleEventsApi = {
  list(
    params: ListScheduleEventsParams = {},
  ): Promise<ListResponse<ScheduleEvent>> {
    return api.get<ListResponse<ScheduleEvent>>('/schedule-events', {
      query: params,
    });
  },

  /** Convenience wrapper over the range mode used by calendar and agenda. */
  listRange(from: string, to: string): Promise<ListResponse<ScheduleEvent>> {
    return api.get<ListResponse<ScheduleEvent>>('/schedule-events', {
      query: { from, to },
    });
  },

  get(id: string): Promise<ScheduleEvent> {
    return api.get<ScheduleEvent>(`/schedule-events/${id}`);
  },

  create(input: CreateScheduleEventInput): Promise<ScheduleEvent> {
    return api.post<ScheduleEvent>('/schedule-events', { body: input });
  },

  update(
    id: string,
    input: UpdateScheduleEventInput,
  ): Promise<ScheduleEvent> {
    return api.patch<ScheduleEvent>(`/schedule-events/${id}`, { body: input });
  },

  remove(id: string): Promise<void> {
    return api.delete<void>(`/schedule-events/${id}`);
  },

  // ─── Invitations ───────────────────────────────────────────────────────────

  /** Invites people to an event. Organiser only, and friends only. */
  invite(eventId: string, userIds: string[]): Promise<{ invited: number }> {
    return api.post<{ invited: number }>(`/schedule-events/${eventId}/invite`, {
      body: { user_ids: userIds },
    });
  },

  /** Who was invited and what they said. */
  attendees(eventId: string): Promise<ListResponse<EventAttendee>> {
    return api.get<ListResponse<EventAttendee>>(
      `/schedule-events/${eventId}/attendees`,
    );
  },

  /** Withdraws an invitation. Organiser only. */
  uninvite(eventId: string, userId: string): Promise<{ removed: boolean }> {
    return api.delete<{ removed: boolean }>(
      `/schedule-events/${eventId}/attendees/${userId}`,
    );
  },

  /** Invitations addressed to the signed-in user and not yet answered. */
  invitations(): Promise<ListResponse<EventInvitation>> {
    return api.get<ListResponse<EventInvitation>>(
      '/schedule-events/invitations',
    );
  },

  /** Keyed by event, not by invitation row — one invitation per event per person. */
  respondToInvitation(
    eventId: string,
    accept: boolean,
  ): Promise<{ status: 'accepted' | 'declined' }> {
    return api.post<{ status: 'accepted' | 'declined' }>(
      `/schedule-events/invitations/${eventId}/${accept ? 'accept' : 'decline'}`,
    );
  },
};
