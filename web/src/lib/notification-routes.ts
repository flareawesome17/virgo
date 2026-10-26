import type { NotificationTopic } from '@/api';

type Data = Record<string, unknown> | undefined;

/*
 * Where each kind of notification leads.
 *
 * One table for the list, the bell and the toast that announced it. There
 * were two copies, kept in step by hand: a notification read from the list
 * must lead where its toast did, or the two disagree about what the same
 * event means, and two copies are two chances to drift.
 */
const ROUTES: Record<NotificationTopic, string | ((d: Data) => string)> = {
  'friend-request': '/people',
  'friend-accepted': '/people',
  // Invitations are answered on Workspaces, where they show what is on
  // offer; an answer, or someone leaving, is about one of your workspaces.
  'collaborator-invite': '/workspaces',
  'collaborator-response': (d) =>
    typeof d?.workspaceId === 'string' ? `/workspaces/${d.workspaceId}?tab=members` : '/workspaces',
  // An invitation stays on Invites even with its event id: until it is
  // accepted the event cannot be read, and the decision is what it is for.
  'event-invite': '/schedule?tab=invites',
  // An answer or a change is about one event, so it opens on that event's day
  // and points it out, rather than on today.
  'event-response': (d) =>
    typeof d?.eventId === 'string' ? `/schedule?event=${d.eventId}` : '/schedule',
  'event-updated': (d) =>
    typeof d?.eventId === 'string' ? `/schedule?event=${d.eventId}` : '/schedule',
  'hire-enquiry': '/people?tab=enquiries',
  // An accepted enquiry opened a conversation; that is where the next move is.
  'hire-response': (d) =>
    typeof d?.conversationId === 'string' ? `/chat/${d.conversationId}` : '/people?tab=enquiries',
  // Applications arrive on your own posts, so they land on that tab, with the
  // post they came in on opened, rather than on the board.
  'job-application': (d) =>
    typeof d?.postId === 'string' ? `/jobs?tab=posted&post=${d.postId}` : '/jobs?tab=posted',
  // An acceptance carries the conversation it just opened and goes straight
  // there; a shortlist or decline has nowhere better than your applications.
  'job-response': (d) =>
    typeof d?.conversationId === 'string' ? `/chat/${d.conversationId}` : '/jobs?tab=applied',
  booking: (d) =>
    typeof d?.bookingId === 'string' ? `/bookings/${d.bookingId}` : '/jobs?tab=bookings',
  // The Reminders tab, where it can be ticked off; the calendar is not.
  // A recap opens Insights on its month; a payment due or late, its package.
  money: (d) =>
    typeof d?.recap === 'string'
      ? `/money/insights?year=${d.recap.slice(0, 4)}&month=${d.recap}`
      : typeof d?.packageId === 'string'
        ? `/money/packages/${d.packageId}`
        : '/money',
  reminder: '/schedule?tab=reminders',
  // There is no /settings/billing; plans and what you are paying live here.
  // A client-downloads alert travels as billing too, and opens Storage, where
  // the month's downloads are counted.
  billing: (d) => (d?.type === 'downloads' ? '/settings/storage' : '/settings/plans'),
  retention: '/albums',
  'client-picks': (d) =>
    typeof d?.albumId === 'string' ? `/albums/${d.albumId}?picked=1` : '/albums',
  // A reply opens the conversation it is part of, not the list of them.
  support: (d) =>
    typeof d?.ticketId === 'string' ? `/support?ticket=${d.ticketId}` : '/support',
  promo: '/rewards',
  // An announcement opens its link when it has one, and otherwise has said
  // all it needs to: there is no page in the app it belongs to.
  'app-update': (d) => (typeof d?.url === 'string' ? d.url : ''),
  // News from Virgo, the same: its link, or nowhere.
  announcement: (d) => (typeof d?.url === 'string' ? d.url : ''),
};

/** Where a notification of this kind leads, or null when it has nowhere to go. */
export function topicDestination(topic: NotificationTopic, data: Data): string | null {
  const route = ROUTES[topic];
  if (route === undefined) return null;
  const href = typeof route === 'function' ? route(data) : route;
  return href || null;
}
