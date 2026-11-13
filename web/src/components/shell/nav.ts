import type { ComponentType } from 'react';
import {
  BriefcaseBusiness,
  CalendarDays,
  FolderOpen,
  Home,
  Images,
  LayoutGrid,
  MessageCircle,
  Users,
  Wallet,
} from 'lucide-react';
import { useUnreadCount } from '@/hooks/useChat';
import { useCollaboratorInvitations } from '@/hooks/useCollaborators';
import { usePeopleUnseen } from '@/hooks/useFriends';
import { useEventInvitations } from '@/hooks/useScheduleEvents';
import { useUnseenJobs } from '@/hooks/useJobs';

export type BadgeKind = 'unread' | 'invitations' | 'friendRequests' | 'eventInvites' | 'newJobs';

export interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Other routes that belong to this item, so it stays lit on them. */
  also?: string[];
  /** Which live count fills this item's badge slot, if any. */
  badge?: BadgeKind;
}

/*
 * Nine places, grouped as the phone groups them: its tabs first, then the
 * work, then the people. Notifications live behind the bell, and Rewards,
 * Support and Settings behind your picture, as they do on the phone; they
 * were thirteen rows here, competing with the places you actually go.
 *
 * Bookings is a tab of Jobs and Nearby a tab of People, as on the phone.
 *
 * One list for everything that draws the app's places: the web sidebar, the
 * desktop rail and the desktop's jump-to field.
 */
export const NAV: { heading?: string; items: NavItem[] }[] = [
  {
    items: [
      // Home, as the phone calls it. It was Dashboard, which names a kind of
      // page, not a place.
      { href: '/', label: 'Home', icon: Home },
      // A post opened from the feed is still the feed.
      { href: '/feed', label: 'Feed', icon: LayoutGrid, also: ['/showcase'] },
      {
        href: '/jobs',
        label: 'Jobs',
        icon: BriefcaseBusiness,
        // A booking opened from the Bookings tab is still Jobs.
        also: ['/bookings', '/hire'],
        badge: 'newJobs',
      },
    ],
  },
  {
    heading: 'Work',
    items: [
      { href: '/workspaces', label: 'Workspaces', icon: FolderOpen, badge: 'invitations' },
      // Every album across every workspace.
      { href: '/albums', label: 'Albums', icon: Images },
      { href: '/schedule', label: 'Schedule', icon: CalendarDays, badge: 'eventInvites' },
      // What the work earned and cost. Only the account's own.
      { href: '/money', label: 'Money', icon: Wallet },
    ],
  },
  {
    heading: 'Connect',
    items: [
      { href: '/chat', label: 'Messages', icon: MessageCircle, badge: 'unread' },
      {
        href: '/people',
        label: 'People',
        icon: Users,
        also: ['/u'],
        badge: 'friendRequests',
      },
    ],
  },
];

export function isActive(item: NavItem, pathname: string): boolean {
  // Exact match for the root, prefix for everything else, so /workspaces/abc
  // still lights up Workspaces.
  if (item.href === '/') return pathname === '/';
  return [item.href, ...(item.also ?? [])].some(
    (href) => pathname === href || pathname.startsWith(`${href}/`),
  );
}

/** What is waiting behind each place that can have something waiting. */
export function useNavCounts(): Record<BadgeKind, number> {
  const unread = useUnreadCount();
  // An invitation is invisible until answered — the workspace does not
  // appear anywhere else — so the count has to live on the nav itself.
  const { invitations } = useCollaboratorInvitations();
  // Connection requests and hire enquiries that arrived since People was last
  // opened. Opening People clears it; the requests stay listed there.
  const { count: friendRequests } = usePeopleUnseen();
  // Invitations to somebody else's shoot, waiting on an answer.
  const { invitations: eventInvites } = useEventInvitations();
  // Open postings not yet looked at, plus unanswered applications on your own.
  const { total: newJobs } = useUnseenJobs();

  return {
    unread,
    invitations: invitations.length,
    friendRequests,
    eventInvites: eventInvites.length,
    newJobs,
  };
}
