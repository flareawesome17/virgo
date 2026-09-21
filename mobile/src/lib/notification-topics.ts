import {
  BellIcon,
  BriefcaseBusinessIcon,
  CalendarIcon,
  CreditCardIcon,
  FileTextIcon,
  GiftIcon,
  HeartIcon,
  LifeBuoyIcon,
  MessageCircleIcon,
  SparklesIcon,
  Trash2Icon,
  UserPlusIcon,
  UsersIcon,
} from 'lucide-react-native';
import type {
  AppNotification,
  NotificationCategory,
  NotificationTopic,
} from '@/src/api';
import type { Palette } from '@/theme';

type Icon = typeof BellIcon;

/**
 * An icon per topic, and where its action leads.
 *
 * Matches web's table and the push routing in useNotificationRouting — a
 * notification opened from the list has to lead where the push for the same
 * event would, or the two disagree about what happened. The routes are this
 * app's own, which is why this is not shared with web.
 */
const TOPICS: Record<
  NotificationTopic,
  { icon: Icon; href: string | ((d: Record<string, unknown>) => string) }
> = {
  'friend-request': { icon: UserPlusIcon, href: '/friends' },
  'friend-accepted': { icon: UserPlusIcon, href: '/friends' },
  'collaborator-invite': { icon: UsersIcon, href: '/workspaces' },
  'collaborator-response': { icon: UsersIcon, href: '/workspaces' },
  'event-invite': { icon: CalendarIcon, href: '/schedule' },
  'event-response': { icon: CalendarIcon, href: '/schedule' },
  'event-updated': { icon: CalendarIcon, href: '/schedule' },
  'hire-enquiry': { icon: MessageCircleIcon, href: '/friends/enquiries' },
  'hire-response': { icon: MessageCircleIcon, href: '/friends/enquiries' },
  'job-application': { icon: BriefcaseBusinessIcon, href: '/jobs/mine?tab=posted' },
  'job-response': {
    icon: BriefcaseBusinessIcon,
    href: (d) =>
      typeof d.conversationId === 'string'
        ? `/chat/${d.conversationId}`
        : '/jobs/mine?tab=applied',
  },
  booking: {
    icon: FileTextIcon,
    href: (d) =>
      typeof d.bookingId === 'string' ? `/bookings/${d.bookingId}` : '/bookings',
  },
  reminder: { icon: CalendarIcon, href: '/schedule' },
  // There is no /settings/billing; plans and what you are paying live here.
  billing: { icon: CreditCardIcon, href: '/settings/storage/plans' },
  retention: { icon: Trash2Icon, href: '/albums' },
  'client-picks': {
    icon: HeartIcon,
    href: (d) =>
      typeof d.albumId === 'string' ? `/albums/${d.albumId}?picked=1` : '/albums',
  },
  support: { icon: LifeBuoyIcon, href: '/support' },
  promo: { icon: GiftIcon, href: '/rewards' },
  // An announcement opens its link when it has one, and otherwise has said
  // all it needs to.
  'app-update': {
    icon: SparklesIcon,
    href: (d) => (typeof d.url === 'string' ? d.url : ''),
  },
};

export function topicIcon(topic: NotificationTopic): Icon {
  return TOPICS[topic]?.icon ?? BellIcon;
}

/** Where a notification's action leads, or null when it has nowhere to go. */
export function destination(n: AppNotification): string | null {
  const topic = TOPICS[n.topic];
  if (!topic) return null;
  const href = typeof topic.href === 'function' ? topic.href(n.data) : topic.href;
  return href || null;
}

/**
 * The colour each kind of notification is tinted with, so a column of them
 * can be scanned by kind before a word of it is read. From the palette, so
 * the dark theme gets its own.
 */
export function tintFor(category: NotificationCategory, palette: Palette): string {
  switch (category) {
    case 'bookings':
      return palette.primary;
    case 'albums':
    case 'updates':
    case 'offers':
      return palette.accent;
    case 'jobs':
    case 'hire':
      return palette.info;
    case 'network':
      return palette.success;
    case 'schedule':
      return palette.warning;
    default:
      return palette.mutedForeground;
  }
}
