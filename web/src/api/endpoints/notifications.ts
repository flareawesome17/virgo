import { api } from '../client';
import { clientIdentity } from '../client-identity';

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
  | 'support'
  | 'booking'
  | 'promo'
  /**
   * A new version of the app this client is running. Targeted at a platform
   * and version on the server, so a phone and a browser signed in to the same
   * account each see only the updates that concern them.
   */
  | 'app-update';

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
/**
 * `platform=…&version=…` for whichever app is asking.
 *
 * Update announcements are aimed at a platform and a version range, and only
 * the client knows which it is — so every read of the list says so, and the
 * server returns the announcements meant for this app alongside the ordinary
 * notifications. Marking all read carries it too, so clearing the list on one
 * device does not clear another device's announcements unseen.
 */
function withClient(q: URLSearchParams = new URLSearchParams()): URLSearchParams {
  const { platform, version } = clientIdentity();
  q.set('platform', platform);
  if (version) q.set('version', version);
  return q;
}

export const notificationsApi = {
  list(params: { limit?: number; before?: string } = {}): Promise<{
    data: AppNotification[];
    unread: number;
  }> {
    const q = withClient();
    if (params.limit) q.set('limit', String(params.limit));
    if (params.before) q.set('before', params.before);
    return api.get(`/notifications?${q.toString()}`);
  },

  unreadCount(): Promise<{ count: number }> {
    return api.get(`/notifications/unread-count?${withClient().toString()}`);
  },

  /** Some of them, or — with no ids — all of them. */
  markRead(ids?: string[]): Promise<{ updated: number }> {
    return api.post(`/notifications/read?${withClient().toString()}`, {
      body: ids ? { ids } : {},
    });
  },
};
