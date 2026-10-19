'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import { LogOut, Monitor, Moon, PanelLeftClose, PanelLeftOpen, Sun } from 'lucide-react';
import { signOut } from '@/api/client';
import type { AdminMe } from '@/api/console';
import { APP_COMMIT, APP_VERSION } from '@/lib/version';
import { cn } from '@/lib/utils';
import { NAV, isActive } from './nav';

export interface NavCounts {
  openTickets: number;
  reports: number;
}

/** Collapsed and open widths. The layout reserves the narrow one. */
const RAIL = 'w-12';
const OPEN = 'w-56';

/**
 * The console's navigation, after Termix's app rail.
 *
 * A 48px column of icons that opens to full labels while the pointer (or
 * keyboard focus) is on it, drawn over the page so nothing underneath jumps.
 * Pinned, it stays open and the page makes room. Below `md` it is not shown;
 * the top bar's menu button opens the same list in a sheet.
 */
export function AppRail({
  me,
  counts,
  pinned,
  onPinnedChange,
}: {
  me: AdminMe;
  counts?: NavCounts;
  pinned: boolean;
  onPinnedChange: (pinned: boolean) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const open = pinned || hovered;

  // A short delay before opening, so sweeping the pointer across the edge on
  // the way to something else does not throw a panel over the page.
  function enter() {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setHovered(true), 120);
  }
  function leave() {
    clearTimeout(timer.current);
    setHovered(false);
  }

  return (
    <div className={cn('relative hidden shrink-0 md:block', pinned ? OPEN : RAIL)}>
      <nav
        aria-label="Console"
        onMouseEnter={enter}
        onMouseLeave={leave}
        onFocus={() => setHovered(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setHovered(false);
        }}
        className={cn(
          'absolute inset-y-0 left-0 z-30 flex flex-col overflow-hidden border-r bg-sidebar text-sidebar-foreground transition-[width,box-shadow] duration-200 ease-out',
          open ? OPEN : RAIL,
          open && !pinned && 'shadow-xl',
        )}
      >
        <NavList me={me} counts={counts} expanded={open} />
        <RailFooter
          me={me}
          expanded={open}
          pinned={pinned}
          onPinnedChange={onPinnedChange}
        />
      </nav>
    </div>
  );
}

/**
 * The entries themselves, shared by the rail and the phone sheet.
 *
 * `expanded` false draws the icon column: labels and group names are kept in
 * the DOM but hidden, so the rail opening is a width change rather than a
 * re-layout, and a screen reader hears the same list either way.
 */
export function NavList({
  me,
  counts,
  expanded,
  onNavigate,
}: {
  me: AdminMe;
  counts?: NavCounts;
  expanded: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const can = (permission: string) => me.permissions.includes(permission);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Link
        href="/"
        onClick={onNavigate}
        className="flex h-12 shrink-0 items-center gap-3 border-b px-2.5"
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary text-[13px] font-bold text-primary-foreground">
          V
        </span>
        <span className={cn('min-w-0 leading-tight', !expanded && 'invisible')}>
          <span className="block truncate text-sm font-semibold">Virgo Console</span>
          <span className="block truncate text-[11px] text-muted-foreground">{me.roleLabel}</span>
        </span>
      </Link>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-2 [scrollbar-width:none]">
        {NAV.map((group, g) => {
          const items = group.items.filter((item) => can(item.permission));
          // A group whose every entry is hidden must not leave its label
          // floating over nothing.
          if (items.length === 0) return null;
          return (
            <div key={group.label ?? g} className={cn(g > 0 && 'mt-1')}>
              {group.label &&
                (expanded ? (
                  <p className="caption truncate px-4 pb-1 pt-3">{group.label}</p>
                ) : (
                  <div className="mx-auto my-2 h-px w-5 bg-border" aria-hidden />
                ))}
              <ul className="space-y-0.5 px-1.5">
                {items.map((item) => {
                  const active = isActive(item.href, pathname);
                  const count = item.badge ? (counts?.[item.badge] ?? 0) : 0;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={active ? 'page' : undefined}
                        title={expanded ? undefined : item.label}
                        className={cn(
                          'relative flex h-9 items-center gap-3 rounded-md px-2.5 text-sm transition-colors',
                          active
                            ? 'bg-primary/10 font-medium text-primary'
                            : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                        )}
                      >
                        {active && (
                          <span
                            className="absolute -left-1.5 top-2 h-5 w-0.5 rounded-r bg-primary"
                            aria-hidden
                          />
                        )}
                        <item.icon className="size-4 shrink-0" />
                        <span className={cn('flex-1 truncate', !expanded && 'invisible')}>
                          {item.label}
                        </span>
                        {count > 0 &&
                          (expanded ? (
                            <span className="rounded-full bg-primary/15 px-1.5 text-[11px] font-semibold tabular-nums text-primary">
                              {count}
                            </span>
                          ) : (
                            <span
                              className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-primary"
                              aria-label={`${count} waiting`}
                            />
                          ))}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const THEMES = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const;

/** Who is signed in, the theme, pinning, signing out and the release. */
export function RailFooter({
  me,
  expanded,
  pinned,
  onPinnedChange,
  onNavigate,
}: {
  me: AdminMe;
  expanded: boolean;
  pinned?: boolean;
  onPinnedChange?: (pinned: boolean) => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const current = THEMES.find((t) => t.value === theme) ?? THEMES[2];
  const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];

  const button =
    'flex h-9 w-full items-center gap-3 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground';
  const label = cn('truncate', !expanded && 'invisible');

  return (
    <div className="shrink-0 space-y-0.5 border-t px-1.5 py-2">
      <button
        type="button"
        className={button}
        onClick={() => setTheme(next.value)}
        title={`Theme: ${current.label}. Switch to ${next.label}`}
      >
        <current.icon className="size-4 shrink-0" />
        <span className={label}>Theme: {current.label}</span>
      </button>

      {onPinnedChange && (
        <button
          type="button"
          className={button}
          onClick={() => onPinnedChange(!pinned)}
          title={pinned ? 'Collapse the sidebar' : 'Keep the sidebar open'}
        >
          {pinned ? (
            <PanelLeftClose className="size-4 shrink-0" />
          ) : (
            <PanelLeftOpen className="size-4 shrink-0" />
          )}
          <span className={label}>{pinned ? 'Collapse' : 'Keep open'}</span>
        </button>
      )}

      {/* Your own account: password, two-factor, sessions. */}
      <Link
        href="/account"
        onClick={onNavigate}
        aria-current={pathname === '/account' ? 'page' : undefined}
        title={expanded ? undefined : `${me.name} — My account`}
        className={cn(
          'flex h-11 items-center gap-3 rounded-md px-1 transition-colors hover:bg-sidebar-accent',
          pathname === '/account' && 'bg-primary/10',
        )}
      >
        <span className="relative grid size-7 shrink-0 place-items-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
          {me.name.slice(0, 2).toUpperCase()}
          {!me.twoFactorEnabled && (
            <span
              className="absolute -right-0.5 -top-0.5 size-2 rounded-full border border-sidebar bg-warning"
              aria-label="Two-factor is off"
            />
          )}
        </span>
        <span className={cn('min-w-0 flex-1 leading-tight', !expanded && 'invisible')}>
          <span className="block truncate text-sm font-medium">{me.name}</span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {me.twoFactorEnabled ? me.email : 'Two-factor is off'}
          </span>
        </span>
      </Link>

      <button
        type="button"
        className={cn(button, 'hover:text-destructive')}
        onClick={async () => {
          await signOut();
          router.replace('/sign-in');
        }}
        title="Sign out"
      >
        <LogOut className="size-4 shrink-0" />
        <span className={label}>Sign out</span>
      </button>

      {/* The running release. Absent on a local build, which is not one. */}
      {APP_VERSION && (
        <p
          className={cn(
            'truncate px-2 pt-1 text-[10px] tabular-nums text-muted-foreground/60',
            !expanded && 'invisible',
          )}
          title={APP_COMMIT ? `Release ${APP_VERSION} · commit ${APP_COMMIT}` : undefined}
        >
          {APP_VERSION}
        </p>
      )}
    </div>
  );
}
