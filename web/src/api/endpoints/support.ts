import { api } from '../client';

export type TicketStatus = 'open' | 'pending' | 'resolved' | 'closed';

export interface SupportTicket {
  id: string;
  subject: string;
  status: TicketStatus;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
  messages?: number;
}

export interface SupportMessage {
  id: string;
  author_type: 'user' | 'admin';
  author_name: string;
  body: string;
  created_at: string;
}

/**
 * Customer support, from the customer's side.
 *
 * Every route is scoped server-side by the authenticated account — a ticket id
 * alone is never enough to read a thread, or one leaked number would expose
 * somebody else's conversation with support.
 *
 * Internal notes written by staff are filtered out in SQL before they reach
 * this client, so nothing here can accidentally render one.
 */
export const supportApi = {
  /** Opens a ticket. Rate limited server-side to 5 an hour. */
  open(subject: string, body: string): Promise<{ id: string }> {
    return api.post('/support/tickets', { body: { subject, body } });
  },

  list(): Promise<SupportTicket[]> {
    return api.get('/support/tickets');
  },

  thread(id: string): Promise<{
    ticket: SupportTicket;
    messages: SupportMessage[];
  }> {
    return api.get(`/support/tickets/${id}`);
  },

  reply(id: string, body: string): Promise<{ ok: true }> {
    return api.post(`/support/tickets/${id}/reply`, { body: { body } });
  },
};
