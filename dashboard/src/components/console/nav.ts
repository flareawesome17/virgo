import {
  Activity,
  CreditCard,
  FolderOpen,
  Gift,
  LayoutDashboard,
  LifeBuoy,
  ScrollText,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** The same string the server checks, so nobody is shown a page that 403s. */
  permission: string;
  /** Which overview count, if any, belongs on this row. */
  badge?: 'openTickets' | 'reports';
  /** Extra words the command palette matches on. */
  keywords?: string;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

/**
 * The console's map, read by the rail, the phone menu and the command palette.
 *
 * Grouped because "who can do things" is a different question from "what is
 * going on". Hiding an entry is presentation only: AdminGuard enforces the
 * permission, and a hand-typed URL is refused there regardless.
 */
export const NAV: NavGroup[] = [
  {
    items: [
      {
        href: '/',
        label: 'Overview',
        icon: LayoutDashboard,
        permission: 'overview.read',
        keywords: 'dashboard home stats',
      },
    ],
  },
  {
    label: 'People',
    items: [
      {
        href: '/users',
        label: 'Users',
        icon: ShieldCheck,
        permission: 'admins.read',
        keywords: 'console users admins roles team',
      },
      {
        href: '/virgo-users',
        label: 'Virgo users',
        icon: Users,
        permission: 'users.read',
        keywords: 'customers accounts people',
      },
    ],
  },
  {
    label: 'Platform',
    items: [
      {
        href: '/content',
        label: 'Content',
        icon: FolderOpen,
        permission: 'content.read',
        badge: 'reports',
        keywords: 'albums links reports moderation',
      },
      {
        href: '/billing',
        label: 'Billing',
        icon: CreditCard,
        permission: 'billing.read',
        keywords: 'subscriptions revenue mrr',
      },
      {
        href: '/support',
        label: 'Support',
        icon: LifeBuoy,
        permission: 'support.read',
        badge: 'openTickets',
        keywords: 'tickets help inbox',
      },
      {
        href: '/promos',
        label: 'Promos',
        icon: Gift,
        permission: 'promos.read',
        keywords: 'rewards referrals storage',
      },
    ],
  },
  {
    label: 'Operations',
    items: [
      {
        href: '/system',
        label: 'System',
        icon: Activity,
        permission: 'system.read',
        keywords: 'health status services',
      },
      {
        href: '/audit',
        label: 'Audit log',
        icon: ScrollText,
        permission: 'audit.read',
        keywords: 'history actions log',
      },
    ],
  },
];

/** Whether `href` is the page at `pathname`, or the section it belongs to. */
export function isActive(href: string, pathname: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}
