import { api } from '../client';
import type {
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
};
