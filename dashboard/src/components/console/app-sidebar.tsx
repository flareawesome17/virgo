'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  CreditCard,
  FolderOpen,
  Gift,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  ScrollText,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { signOut } from '@/api/client';
import type { AdminMe } from '@/api/console';
import { APP_COMMIT, APP_VERSION } from '@/lib/version';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';

/**
 * Grouped, because eight flat entries is a list you read rather than a map you
 * navigate. "Who can do things" is a different question from "what is going
 * on", and the groups say so.
 *
 * Every entry names the permission it needs — the same string the server
 * checks, so a viewer is never shown a tab that would 403 on click. This is
 * presentation only; AdminGuard is what enforces it, and a hand-typed URL is
 * refused there regardless.
 */
const GROUPS: {
  label?: string;
  items: {
    href: string;
    label: string;
    icon: typeof LayoutDashboard;
    permission: string;
    /** Which count on the overview, if any, belongs on this row. */
    badge?: 'openTickets' | 'reports';
  }[];
}[] = [
  {
    items: [
      {
        href: '/',
        label: 'Overview',
        icon: LayoutDashboard,
        permission: 'overview.read',
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
      },
      {
        href: '/virgo-users',
        label: 'Virgo users',
        icon: Users,
        permission: 'users.read',
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
      },
      {
        href: '/billing',
        label: 'Billing',
        icon: CreditCard,
        permission: 'billing.read',
      },
      {
        href: '/support',
        label: 'Support',
        icon: LifeBuoy,
        permission: 'support.read',
        badge: 'openTickets',
      },
      {
        href: '/promos',
        label: 'Promos',
        icon: Gift,
        permission: 'promos.read',
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
      },
      {
        href: '/audit',
        label: 'Audit log',
        icon: ScrollText,
        permission: 'audit.read',
      },
    ],
  },
];

export function AppSidebar({
  me,
  counts,
}: {
  me: AdminMe;
  /** From the overview query, so the nav shows what is waiting. */
  counts?: { openTickets: number; reports: number };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const can = (permission: string) => me.permissions.includes(permission);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <span className="grid aspect-square size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
                  <ShieldCheck className="size-4" />
                </span>
                <span className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-sm font-bold">
                    Virgo Console
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {me.roleLabel}
                  </span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {GROUPS.map((group, i) => {
          const visible = group.items.filter((item) => can(item.permission));
          // A group whose every entry is hidden must not leave its label
          // floating over nothing.
          if (visible.length === 0) return null;

          return (
            <SidebarGroup key={group.label ?? i}>
              {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
              <SidebarGroupContent>
                <SidebarMenu>
                  {visible.map((item) => {
                    const active =
                      item.href === '/'
                        ? pathname === '/'
                        : pathname.startsWith(item.href);
                    const count = item.badge ? counts?.[item.badge] : undefined;

                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          isActive={active}
                          tooltip={item.label}
                        >
                          <Link href={item.href}>
                            <item.icon />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                        {!!count && <SidebarMenuBadge>{count}</SidebarMenuBadge>}
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="cursor-default" asChild>
              <div>
                <span className="grid aspect-square size-8 shrink-0 place-items-center rounded-lg bg-muted text-xs font-bold">
                  {me.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-sm font-medium">{me.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {me.email}
                  </span>
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Sign out"
              onClick={async () => {
                await signOut();
                router.replace('/sign-in');
              }}
            >
              <LogOut />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* The running release. Absent on a local build, which is not one. */}
        {APP_VERSION && (
          <p
            className="px-2 pb-1 text-center text-[10px] tabular-nums text-muted-foreground/60 group-data-[collapsible=icon]:hidden"
            title={APP_COMMIT ? `Release ${APP_VERSION} · commit ${APP_COMMIT}` : undefined}
          >
            {APP_VERSION}
          </p>
        )}
      </SidebarFooter>

      {/* Drag to resize, click to collapse. */}
      <SidebarRail />
    </Sidebar>
  );
}
