import type {
  AppNotification,
  NotificationCategory,
  NotificationTopic,
} from '@/api';

/**
 * What each kind of notification is called, and what it covers — wherever
 * someone chooses between them: the list's filters and the settings screen.
 *
 * Shared by the web app and the phone app, so a notification reads the same
 * in both places.
 */
export const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  bookings: 'Bookings',
  albums: 'Albums',
  jobs: 'Jobs',
  hire: 'Hire enquiries',
  network: 'Network',
  schedule: 'Schedule',
  billing: 'Billing',
  updates: 'App updates',
  offers: 'Offers and rewards',
  support: 'Support',
};

export const CATEGORY_DESCRIPTIONS: Record<NotificationCategory, string> = {
  bookings: 'New, agreed, changed and cancelled bookings',
  albums: 'Client picks and scheduled clean-ups',
  jobs: 'Applications and replies',
  hire: 'People asking to hire you',
  network: 'Friend requests and workspace invites',
  schedule: 'Event invites, replies and reminders',
  billing: 'Payments and your plan',
  updates: "What's new in Virgo",
  offers: 'Promotions and referral rewards',
  support: 'Replies to your support requests',
};

/**
 * The list's filters, in order. Billing, offers and support come rarely
 * enough that a filter each would only be clutter; they stay under "All".
 */
export const FILTER_CATEGORIES: readonly NotificationCategory[] = [
  'bookings',
  'albums',
  'jobs',
  'hire',
  'network',
  'schedule',
  'updates',
];

/**
 * What the detail view's button says, per topic. Where a notification leads is
 * platform code — the routes differ — but what the button calls it does not.
 */
const ACTION_LABELS: Record<NotificationTopic, string> = {
  booking: 'Open booking',
  'client-picks': 'See their picks',
  retention: 'Open albums',
  'job-application': 'See applications',
  'job-response': 'Open my applications',
  'hire-enquiry': 'Open enquiries',
  'hire-response': 'Open enquiries',
  'friend-request': 'Open network',
  'friend-accepted': 'Open network',
  'collaborator-invite': 'See the invitation',
  'collaborator-response': 'Open workspace',
  'event-invite': 'Open schedule',
  'event-response': 'Open schedule',
  'event-updated': 'Open schedule',
  reminder: 'Open schedule',
  billing: 'Open plans',
  support: 'Open support',
  promo: 'Open rewards',
  'app-update': 'Read more',
};

export function actionLabel(n: AppNotification): string {
  // An accepted application opens the conversation it started.
  if (n.topic === 'job-response' && typeof n.data.conversationId === 'string') {
    return 'Open chat';
  }
  return ACTION_LABELS[n.topic] ?? 'Open';
}

function midnight(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** "Today", "Yesterday", or the date — the list's day headings. */
export function dayHeading(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const days = Math.round((midnight(now) - midnight(date)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

/** Consecutive notifications under their day, newest day first. */
export function groupByDay<T extends { createdAt: string }>(
  items: readonly T[],
  now: Date = new Date(),
): { title: string; items: T[] }[] {
  const groups: { title: string; items: T[] }[] = [];
  for (const item of items) {
    const title = dayHeading(item.createdAt, now);
    const last = groups[groups.length - 1];
    if (last?.title === title) last.items.push(item);
    else groups.push({ title, items: [item] });
  }
  return groups;
}

/** The time of day, for a row under today's heading. */
export function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** "Today at 1:18 AM", or the full date — the detail view's timestamp. */
export function fullTimestamp(iso: string, now: Date = new Date()): string {
  const heading = dayHeading(iso, now);
  return `${heading} at ${timeOfDay(iso)}`;
}
