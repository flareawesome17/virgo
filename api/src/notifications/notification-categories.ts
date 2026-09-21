import type { NotificationTopic } from '../realtime/realtime.gateway';

/**
 * The kinds of notification someone can tell apart: filter the list by, and
 * switch off channel by channel in settings.
 *
 * Coarser than topics on purpose. Nobody wants a switch for "event response"
 * apart from "event invite"; they want to stop hearing about their schedule by
 * email. Every topic belongs to exactly one, which the spec checks.
 *
 * Mirrored in the clients' `api/endpoints/notifications.ts`. The order here is
 * the order settings list them in.
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

/**
 * Where a notification can reach someone besides the list, which it always
 * reaches. `desktop` is the desktop app's system alert: raised by the app
 * itself from the live frame, so the server only stores the choice.
 */
export const NOTIFICATION_CHANNELS = ['push', 'email', 'desktop'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

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

export function isNotificationCategory(value: unknown): value is NotificationCategory {
  return (NOTIFICATION_CATEGORIES as readonly unknown[]).includes(value);
}

export function topicsIn(category: NotificationCategory): NotificationTopic[] {
  return (Object.keys(CATEGORY_OF_TOPIC) as NotificationTopic[]).filter(
    (topic) => CATEGORY_OF_TOPIC[topic] === category,
  );
}

/**
 * The kinds whose notifications carry an email: invitations, applications and
 * enquiries. A booking change or a client's picks never did, so settings offer
 * no email switch for them rather than one that would do nothing.
 */
const EMAILED: ReadonlySet<NotificationCategory> = new Set([
  'jobs',
  'hire',
  'network',
  'schedule',
]);

/** Whether a kind ever travels on a channel at all. */
export function usesChannel(
  category: NotificationCategory,
  channel: NotificationChannel,
): boolean {
  if (channel === 'email') return EMAILED.has(category);
  // Desktop alerts are raised from the socket frame, and announcements are
  // never sent over the socket.
  if (channel === 'desktop') return category !== 'updates';
  return true;
}

/**
 * Kinds that reach someone whatever they set. A support reply answers
 * something the person asked; switching it off would only mean never seeing
 * the answer.
 */
export function isLocked(category: NotificationCategory): boolean {
  return category === 'support';
}

/** One row of the settings screen. */
export interface CategorySetting {
  category: NotificationCategory;
  /** `null` where the kind never travels on that channel. */
  push: boolean | null;
  email: boolean | null;
  desktop: boolean | null;
  /** On whatever is stored, and not offered as a switch. */
  locked: boolean;
}

function storedValue(
  stored: unknown,
  category: NotificationCategory,
  channel: NotificationChannel,
): boolean | undefined {
  if (!stored || typeof stored !== 'object') return undefined;
  const row = (stored as Record<string, unknown>)[category];
  if (!row || typeof row !== 'object') return undefined;
  const value = (row as Record<string, unknown>)[channel];
  return typeof value === 'boolean' ? value : undefined;
}

/**
 * Whether a notification of this kind goes out on this channel, given what the
 * person stored. Anything not stored is on: that is what everybody had before
 * settings existed, and a setting nobody chose must not silence anything.
 */
export function allows(
  stored: unknown,
  category: NotificationCategory,
  channel: NotificationChannel,
): boolean {
  if (isLocked(category) || !usesChannel(category, channel)) return true;
  return storedValue(stored, category, channel) ?? true;
}

/** Settings as the screen shows them, in the order it lists them. */
export function presentSettings(stored: unknown): CategorySetting[] {
  return NOTIFICATION_CATEGORIES.map((category) => {
    const locked = isLocked(category);
    const value = (channel: NotificationChannel): boolean | null =>
      usesChannel(category, channel) ? allows(stored, category, channel) : null;
    return {
      category,
      push: value('push'),
      email: value('email'),
      desktop: value('desktop'),
      locked,
    };
  });
}
