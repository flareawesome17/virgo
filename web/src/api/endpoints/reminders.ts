import { api } from '../client';
import type { ListParams, ListResponse, Reminder } from '../types';

export interface ListRemindersParams extends ListParams {
  schedule_event_id?: string;
  is_completed?: boolean;
}

export interface CreateReminderInput {
  id?: string;
  schedule_event_id?: string | null;
  title: string;
  description?: string | null;
  reminder_time: string;
  is_alarm_enabled?: boolean;
  has_push_notification?: boolean;
  is_completed?: boolean;
}

export type UpdateReminderInput = Partial<Omit<CreateReminderInput, 'id'>>;

export const remindersApi = {
  list(params: ListRemindersParams = {}): Promise<ListResponse<Reminder>> {
    return api.get<ListResponse<Reminder>>('/reminders', { query: params });
  },

  get(id: string): Promise<Reminder> {
    return api.get<Reminder>(`/reminders/${id}`);
  },

  create(input: CreateReminderInput): Promise<Reminder> {
    return api.post<Reminder>('/reminders', { body: input });
  },

  update(id: string, input: UpdateReminderInput): Promise<Reminder> {
    return api.patch<Reminder>(`/reminders/${id}`, { body: input });
  },

  remove(id: string): Promise<void> {
    return api.delete<void>(`/reminders/${id}`);
  },
};
