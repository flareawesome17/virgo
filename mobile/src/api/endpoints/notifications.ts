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
  /** A client finished choosing from a delivery and sent their picks. */
  | 'client-picks'
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
 * The kinds of notification someone can filter the list by and switch off in
 * settings. Mirrors NOTIFICATION_CATEGORIES in the API's
 * `notification-categories.ts`, in the same order: the order settings list
 * them in.
 */
export const NOTIFICATION_CATEGORIES = [
  'bookings',
  'albums',
  'jobs',
  'hire',
  'network',
  'schedule',
  'billing',
  'updates',
  'offers',
  'support',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/** Where a notification can reach someone besides the list. */
export type NotificationChannel = 'push' | 'email' | 'desktop';

/** Which kind each topic is. Mirrors CATEGORY_OF_TOPIC in the API. */
export const CATEGORY_OF_TOPIC: Record<NotificationTopic, NotificationCategory> = {
  booking: 'bookings',
  'client-picks': 'albums',
  retention: 'albums',
  'job-application': 'jobs',
  'job-response': 'jobs',
  'hire-enquiry': 'hire',
  'hire-response': 'hire',
  'friend-request': 'network',
  'friend-accepted': 'network',
  'collaborator-invite': 'network',
  'collaborator-response': 'network',
  'event-invite': 'schedule',
  'event-response': 'schedule',
  'event-updated': 'schedule',
  reminder: 'schedule',
  billing: 'billing',
  'app-update': 'updates',
  promo: 'offers',
  support: 'support',
};

/**
 * One row of notification settings. `null` where a kind never travels on that
 * channel (nothing about a booking is emailed), and `locked` where it always
 * reaches you (support replies).
 */
export interface NotificationSetting {
  category: NotificationCategory;
  push: boolean | null;
  email: boolean | null;
  desktop: boolean | null;
  locked: boolean;
}

export interface NotificationListParams {
  limit?: number;
  /** Everything older than this `createdAt` — the next page. */
  before?: string;
  unread?: boolean;
  category?: NotificationCategory | null;
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
  list(params: NotificationListParams = {}): Promise<{
    data: AppNotification[];
    unread: number;
  }> {
    const q = withClient();
    if (params.limit) q.set('limit', String(params.limit));
    if (params.before) q.set('before', params.before);
    if (params.unread) q.set('unread', '1');
    if (params.category) q.set('category', params.category);
    return api.get(`/notifications?${q.toString()}`);
  },

  /**
   * One of them, for the detail view. It says which client is asking because
   * an announcement is only found by the platform it was meant for.
   */
  get(id: string): Promise<AppNotification> {
    return api.get(
      `/notifications/${encodeURIComponent(id)}?${withClient().toString()}`,
    );
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

  markUnread(ids: string[]): Promise<{ updated: number }> {
    return api.post('/notifications/unread', { body: { ids } });
  },

  /** From this account's list only; what it was about is untouched. */
  remove(ids: string[]): Promise<{ deleted: number }> {
    return api.post('/notifications/delete', { body: { ids } });
  },

  settings(): Promise<{ data: NotificationSetting[] }> {
    return api.get('/notifications/settings');
  },

  /** One switch. Answers with every row, as saved. */
  updateSetting(change: {
    category: NotificationCategory;
    channel: NotificationChannel;
    enabled: boolean;
  }): Promise<{ data: NotificationSetting[] }> {
    return api.patch('/notifications/settings', { body: change });
  },
};
