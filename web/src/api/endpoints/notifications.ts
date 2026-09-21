import { api } from '../client';

/**
 * Every kind of notification the server sends.
 *
 * Mirrors `NotificationTopic` in the API's realtime gateway. Kept as a union
 * rather than a bare string so a client that switches on it — to pick an icon,
 * or to decide where a tap goes — is told when a new one appears.
 */
export type NotificationTopic =
  | 'friend-request'
  | 'friend-accepted'
  | 'collaborator-invite'
  | 'collaborator-response'
  | 'event-invite'
  | 'event-response'
  | 'event-updated'
  | 'hire-enquiry'
  | 'hire-response'
  | 'job-application'
  | 'job-response'
  | 'reminder'
  | 'billing'
  | 'retention'
  /** A client finished choosing from a delivery and sent their picks. */
  | 'client-picks'
  | 'support'
  | 'booking'
  | 'promo';

export interface AppNotification {
  id: string;
  topic: NotificationTopic;
  title: string;
  body: string;
  /** The same payload the push carries; what the tap handler routes on. */
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

/**
 * The notification list.
 *
 * These used to be a socket frame and an email and nothing else: if the app
 * was shut when one landed, the app itself showed no sign it had happened.
 * Somebody applied to your job, or answered your application, and the only
 * record was in your inbox.
 *
 * Paginated on `before` rather than an offset, because the list grows at the
 * top — an offset page shifts under you exactly when something new arrives,
 * which is when people are looking at it.
 */
export const notificationsApi = {
  list(params: { limit?: number; before?: string } = {}): Promise<{
    data: AppNotification[];
    unread: number;
  }> {
    const q = new URLSearchParams();
    if (params.limit) q.set('limit', String(params.limit));
    if (params.before) q.set('before', params.before);
    const qs = q.toString();
    return api.get(`/notifications${qs ? `?${qs}` : ''}`);
  },

  unreadCount(): Promise<{ count: number }> {
    return api.get('/notifications/unread-count');
  },

  /** Some of them, or — with no ids — all of them. */
  markRead(ids?: string[]): Promise<{ updated: number }> {
    return api.post('/notifications/read', { body: ids ? { ids } : {} });
  },
};
