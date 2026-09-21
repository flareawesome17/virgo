'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck } from 'lucide-react';
import { AppShell, PageHeader } from '@/components/app-shell';
import { NotificationRow, destination, openExternal } from '@/components/notification-bell';
import { Button } from '@/components/ui/button';
import { useMarkNotificationsRead, useNotifications } from '@/hooks/useNotifications';
import type { AppNotification } from '@/api';
import { cn } from '@/lib/utils';

/** As many as the API returns in one page — and more than the sweep keeps. */
const LIMIT = 100;

function dayOf(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(today) - midnight(date)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(date.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }),
  });
}

/**
 * Everything the bell has said, on a page of its own.
 *
 * The popover shows the latest thirty and nothing more; anything older was
 * simply gone once it scrolled off. The phone has had a notifications screen
 * from the start.
 */
export default function NotificationsPage() {
  const router = useRouter();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { notifications, unread, isLoading, loadFailed, refetch } = useNotifications(LIMIT);
  const markRead = useMarkNotificationsRead();

  const shown = unreadOnly ? notifications.filter((n) => !n.readAt) : notifications;
  const days = useMemo(() => {
    const groups: { title: string; items: AppNotification[] }[] = [];
    for (const n of shown) {
      const title = dayOf(n.createdAt);
      const last = groups[groups.length - 1];
      if (last?.title === title) last.items.push(n);
      else groups.push({ title, items: [n] });
    }
    return groups;
  }, [shown]);

  const open = (n: AppNotification) => {
    if (!n.readAt) markRead.mutate([n.id]);
    const href = destination(n);
    if (!href) return;
    // An update announcement can link outside the app. Pushed through the
    // router it would navigate the whole tab away — and in the desktop app,
    // take the window out of Virgo with no way back. Same rule as the bell.
    if (/^https:\/\//.test(href)) openExternal(href);
    else router.push(href);
  };

  return (
    <AppShell title="Notifications">
      <PageHeader
        title="Notifications"
        description={unread > 0 ? `${unread} unread` : 'All caught up'}
        actions={
          unread > 0 ? (
            <Button variant="outline" onClick={() => markRead.mutate(undefined)} disabled={markRead.isPending}>
              <CheckCheck className="size-4" />
              Mark all read
            </Button>
          ) : undefined
        }
      />
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <div role="tablist" aria-label="Show" className="mb-5 inline-flex rounded-lg bg-muted p-0.5">
          {[
            { key: false, label: 'All' },
            { key: true, label: `Unread${unread ? ` · ${unread}` : ''}` },
          ].map((option) => (
            <button
              key={String(option.key)}
              type="button"
              role="tab"
              aria-selected={unreadOnly === option.key}
              onClick={() => setUnreadOnly(option.key)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm transition-colors',
                unreadOnly === option.key ? 'bg-card font-semibold shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-16 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : loadFailed ? (
          <div className="rounded-xl border border-dashed py-14 text-center">
            <p className="text-sm font-medium">Could not load your notifications</p>
            <p className="mt-1 text-xs text-muted-foreground">This is a connection problem, not an empty list.</p>
            <Button size="sm" variant="outline" className="mt-4" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        ) : days.length === 0 ? (
          <div className="rounded-xl border border-dashed px-6 py-14 text-center">
            <Bell className="mx-auto size-6 text-muted-foreground/60" aria-hidden />
            <p className="mt-3 text-sm font-medium">{unreadOnly ? 'Nothing unread' : 'Nothing yet'}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Applications, answers, bookings and client picks will show up here.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {days.map((day) => (
              <section key={day.title} aria-label={day.title}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{day.title}</h2>
                <ul className="divide-y overflow-hidden rounded-xl border bg-card">
                  {day.items.map((n) => (
                    <li key={n.id}>
                      <NotificationRow notification={n} onOpen={open} roomy />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
