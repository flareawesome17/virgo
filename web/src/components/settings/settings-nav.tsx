'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType, ReactNode } from 'react';
import {
  Bell,
  CircleHelp,
  HardDrive,
  Info,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserRound,
  UserX,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SettingsItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Pages beneath this one, so it stays lit on them. */
  also?: string[];
}

/*
 * The phone's two groups: what is about you, and what is about the app.
 * Settings was one long page with everything on it, and Profile was a page
 * of its own outside it.
 */
const GROUPS: { title: string; items: SettingsItem[] }[] = [
  {
    title: 'Profile & account',
    items: [
      { href: '/settings/profile', label: 'Profile', icon: UserRound },
      {
        href: '/settings/account',
        label: 'Account & security',
        icon: ShieldCheck,
        also: ['/settings/two-factor', '/settings/devices'],
      },
      { href: '/settings/blocked', label: 'Blocked people', icon: UserX },
      {
        href: '/settings/storage',
        label: 'Storage & plan',
        icon: HardDrive,
        also: ['/settings/plans'],
      },
      // Outside /settings: it lives beside the workspace list, as on the phone.
      { href: '/workspaces/deleted', label: 'Recently deleted', icon: Trash2 },
    ],
  },
  {
    title: 'App',
    items: [
      { href: '/settings', label: 'General', icon: SlidersHorizontal },
      { href: '/settings/notifications', label: 'Notifications', icon: Bell },
      { href: '/settings/help', label: 'Help', icon: CircleHelp },
      { href: '/settings/about', label: 'About', icon: Info },
    ],
  },
];

function isActive(item: SettingsItem, pathname: string): boolean {
  if (item.href === '/settings') return pathname === '/settings';
  return [item.href, ...(item.also ?? [])].some(
    (href) => pathname === href || pathname.startsWith(`${href}/`),
  );
}

/**
 * Every settings page, with the list beside it.
 *
 * A column at `lg` and up; a row of chips above the page below that, so the
 * list is one tap away on a narrow window too rather than behind a Back.
 */
export function SettingsFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const items = GROUPS.flatMap((group) => group.items);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:flex lg:gap-8 lg:px-8">
      <nav aria-label="Settings" className="mb-5 lg:mb-0 lg:w-52 lg:shrink-0">
        <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 lg:hidden">
          {items.map((item) => {
            const active = isActive(item, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-card text-muted-foreground hover:text-foreground',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="sticky top-6 hidden flex-col gap-5 lg:flex">
          {GROUPS.map((group) => (
            <div key={group.title} className="flex flex-col gap-0.5">
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {group.title}
              </p>
              {group.items.map((item) => {
                const active = isActive(item, pathname);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      active
                        ? 'bg-accent text-foreground'
                        : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                    )}
                  >
                    <Icon className={cn('size-4 shrink-0', active && 'text-primary')} />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </nav>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
