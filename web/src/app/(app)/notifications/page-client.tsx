'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Bell, CheckCheck, Settings } from 'lucide-react';
import { AppShell, PageHeader } from '@/components/app-shell';
import { NotificationRow, notificationHref } from '@/components/notification-bell';
import { NotificationDetail } from '@/components/notification-detail';
import { Button } from '@/components/ui/button';
import {
  useMarkNotificationsRead,
  useNotification,
  useNotificationFeed,
} from '@/hooks/useNotifications';
import type { AppNotification, NotificationCategory } from '@/api';
import {
  CATEGORY_LABELS,
  FILTER_CATEGORIES,
  groupByDay,
  timeOfDay,
} from '@/lib/notification-categories';
import { cn } from '@/lib/utils';

/** What the right-hand pane shows: the chosen notification, all of it. */
function DetailPane({
  selectedId,
  onDeleted,
}: {
  selectedId: string | null;
  onDeleted: () => void;
}) {
  const { notification, isLoading, notFound, loadFailed, refetch } = useNotification(
    selectedId ?? undefined,
  );

  // Opening one marks it read — once. Marking it unread again from here must
  // stick, so the same notification is never marked read twice in a row.
  const { mutate: markRead } = useMarkNotificationsRead();
  const autoRead = useRef<string | null>(null);
  useEffect(() => {
    if (!notification || notification.readAt || autoRead.current === notification.id) return;
    autoRead.current = notification.id;
    markRead([notification.id]);
  }, [notification, markRead]);

  const back = (
    <Link
      href="/notifications"
      className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground lg:hidden"
    >
      <ArrowLeft className="size-4" />
      All notifications
    </Link>
  );

  if (!selectedId) {
    return (
      <div className="flex h-full min-h-[24rem] flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center">
        <Bell className="size-6 text-muted-foreground/60" aria-hidden />
        <p className="mt-3 text-sm font-medium">Choose a notification to read it in full</p>
        <p className="mt-1 text-xs text-muted-foreground">
          What it says, when it came, and what to do about it.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[24rem] flex-col rounded-xl border bg-card p-6 lg:p-8">
      {back}
      {notification ? (
        <NotificationDetail notification={notification} onDeleted={onDeleted} className="flex-1" />
      ) : isLoading ? (
        <div className="space-y-4" aria-label="Loading">
          <div className="h-6 w-40 animate-pulse rounded-full bg-muted" />
          <div className="h-8 w-3/4 animate-pulse rounded-lg bg-muted" />
          <div className="h-16 w-full animate-pulse rounded-lg bg-muted" />
        </div>
      ) : notFound ? (
        <div className="py-10 text-center">
          <p className="text-sm font-medium">This notification is gone</p>
          <p className="mt-1 text-xs text-muted-foreground">
            It was deleted, or it is older than 90 days.
          </p>
        </div>
      ) : loadFailed ? (
        <div className="py-10 text-center">
          <p className="text-sm font-medium">Could not load this notification</p>
          <p className="mt-1 text-xs text-muted-foreground">This is a connection problem.</p>
          <Button size="sm" variant="outline" className="mt-4" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Everything the bell has said, and each of them in full.
 *
 * A list and the one you chose beside it. On a narrow window they take turns:
 * the list, then the notification with a way back. Which one is open lives in
 * the address (`?id=`), so a notification can be linked to, and Back returns
 * to the list.
 */
function NotificationsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get('id');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [category, setCategory] = useState<NotificationCategory | null>(null);

  const {
    notifications,
    unread,
    isLoading,
    loadFailed,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useNotificationFeed({ unread: unreadOnly, category });
  const markRead = useMarkNotificationsRead();
  const days = useMemo(() => groupByDay(notifications), [notifications]);

  const open = (n: AppNotification) => router.push(notificationHref(n), { scroll: false });

  // After a delete, on to the next one down — or the one above, at the end.
  const moveOn = () => {
    const index = notifications.findIndex((n) => n.id === selectedId);
    const next = notifications[index + 1] ?? notifications[index - 1];
    router.replace(next ? notificationHref(next) : '/notifications', { scroll: false });
  };

  const emptyTitle = unreadOnly
    ? 'Nothing unread'
    : category
      ? `No ${CATEGORY_LABELS[category].toLowerCase()} notifications`
      : 'Nothing yet';

  return (
    <AppShell title="Notifications">
      <PageHeader
        title="Notifications"
        description={
          unread > 0 ? `${unread} unread · kept for 90 days` : 'All caught up · kept for 90 days'
        }
        actions={
          <div className="flex gap-2">
            {unread > 0 && (
              <Button
                variant="outline"
                onClick={() => markRead.mutate(undefined)}
                disabled={markRead.isPending}
              >
                <CheckCheck className="size-4" />
                Mark all read
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href="/settings/notifications">
                <Settings className="size-4" />
                Settings
              </Link>
            </Button>
          </div>
        }
      />

      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <div
          className={cn(
            'mb-5 flex flex-wrap items-center gap-2',
            selectedId && 'hidden lg:flex',
          )}
        >
          <div role="tablist" aria-label="Show" className="inline-flex rounded-lg bg-muted p-0.5">
            {[
              { unread: false, label: 'All' },
              { unread: true, label: unread > 0 ? `Unread · ${unread}` : 'Unread' },
            ].map((tab) => (
              <button
                key={String(tab.unread)}
                type="button"
                role="tab"
                aria-selected={unreadOnly === tab.unread}
                onClick={() => setUnreadOnly(tab.unread)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm transition-colors',
                  unreadOnly === tab.unread
                    ? 'bg-card font-semibold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden />
          {FILTER_CATEGORIES.map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={category === key}
              onClick={() => setCategory(category === key ? null : key)}
              className={cn(
                'rounded-full border px-3 py-1 text-sm transition-colors',
                category === key
                  ? 'border-foreground bg-foreground font-medium text-background'
                  : 'bg-card hover:bg-accent',
              )}
            >
              {CATEGORY_LABELS[key]}
            </button>
          ))}
        </div>

        <div className="flex items-stretch gap-5">
          <div
            className={cn(
              'w-full lg:w-[26rem] lg:shrink-0',
              selectedId && 'hidden lg:block',
            )}
          >
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="h-16 animate-pulse rounded-lg bg-muted" />
                ))}
              </div>
            ) : loadFailed ? (
              <div className="rounded-xl border border-dashed py-14 text-center">
                <p className="text-sm font-medium">Could not load your notifications</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  This is a connection problem, not an empty list.
                </p>
                <Button size="sm" variant="outline" className="mt-4" onClick={() => void refetch()}>
                  Try again
                </Button>
              </div>
            ) : days.length === 0 ? (
              <div className="rounded-xl border border-dashed px-6 py-14 text-center">
                <Bell className="mx-auto size-6 text-muted-foreground/60" aria-hidden />
                <p className="mt-3 text-sm font-medium">{emptyTitle}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Applications, answers, bookings and client picks will show up here.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border bg-card">
                {days.map((day, index) => (
                  <section
                    key={day.title}
                    aria-label={day.title}
                    className={cn(index > 0 && 'border-t')}
                  >
                    <h2 className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {day.title}
                    </h2>
                    <ul className="divide-y divide-border/60">
                      {day.items.map((n) => (
                        <li key={n.id}>
                          <NotificationRow
                            notification={n}
                            onOpen={open}
                            selected={n.id === selectedId}
                            when={timeOfDay(n.createdAt)}
                          />
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
                {hasNextPage && (
                  <div className="border-t p-2.5">
                    <Button
                      variant="secondary"
                      className="w-full"
                      onClick={() => void fetchNextPage()}
                      disabled={isFetchingNextPage}
                    >
                      {isFetchingNextPage ? 'Loading…' : 'Show earlier notifications'}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className={cn('min-w-0 flex-1', !selectedId && 'hidden lg:block')}>
            <DetailPane selectedId={selectedId} onDeleted={moveOn} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

/**
 * Suspense is required, not decorative: useSearchParams (for ?id=) makes the
 * page client-rendered below the nearest boundary, and without one the static
 * build for the desktop app fails.
 */
export default function NotificationsPage() {
  return (
    <Suspense fallback={null}>
      <NotificationsPageInner />
    </Suspense>
  );
}
