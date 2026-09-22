'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Bell,
  BriefcaseBusiness,
  Calendar,
  Check,
  CheckCheck,
  CreditCard,
  FileText,
  Gift,
  Heart,
  LifeBuoy,
  Mail,
  MessageCircle,
  Settings,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  useDeleteNotifications,
  useMarkNotificationsRead,
  useMarkNotificationsUnread,
  useNotificationFeed,
  useUnreadNotifications,
} from '@/hooks/useNotifications';
import {
  CATEGORY_OF_TOPIC,
  type AppNotification,
  type NotificationCategory,
  type NotificationTopic,
} from '@/api';
import { groupByDay, timeOfDay } from '@/lib/notification-categories';
import { cn } from '@/lib/utils';

/**
 * An icon per topic, and where its action leads.
 *
 * The same table as useRealtime's, and deliberately so: a notification read
 * from the list must lead to the same place as the toast that announced it,
 * or the two surfaces disagree about what the same event means.
 */
const TOPICS: Record<
  NotificationTopic,
  { icon: LucideIcon; href: string | ((d: Record<string, unknown>) => string) }
> = {
  'friend-request': { icon: UserPlus, href: '/network' },
  'friend-accepted': { icon: UserPlus, href: '/network' },
  // Invitations are answered on Workspaces, where they show what is on
  // offer; an answer, or someone leaving, is about one of your workspaces.
  'collaborator-invite': { icon: Users, href: '/workspaces' },
  'collaborator-response': {
    icon: Users,
    href: (d) =>
      typeof d.workspaceId === 'string' ? `/workspaces/${d.workspaceId}?tab=members` : '/workspaces',
  },
  'event-invite': { icon: Calendar, href: '/schedule?tab=invites' },
  'event-response': { icon: Calendar, href: '/schedule' },
  'event-updated': { icon: Calendar, href: '/schedule' },
  'hire-enquiry': { icon: MessageCircle, href: '/network?tab=enquiries' },
  'hire-response': { icon: MessageCircle, href: '/network?tab=enquiries' },
  'job-application': {
    icon: BriefcaseBusiness,
    href: '/jobs/mine?tab=posted',
  },
  'job-response': {
    icon: BriefcaseBusiness,
    href: (d) =>
      typeof d.conversationId === 'string'
        ? `/chat/${d.conversationId}`
        : '/jobs/mine?tab=applications',
  },
  booking: {
    icon: FileText,
    href: (d) =>
      typeof d.bookingId === 'string' ? `/bookings/${d.bookingId}` : '/bookings',
  },
  reminder: { icon: Calendar, href: '/schedule' },
  // There is no /settings/billing; plans and what you are paying live here.
  billing: { icon: CreditCard, href: '/settings/plans' },
  retention: { icon: Trash2, href: '/albums' },
  'client-picks': {
    icon: Heart,
    href: (d) =>
      typeof d.albumId === 'string' ? `/albums/${d.albumId}?picked=1` : '/albums',
  },
  support: { icon: LifeBuoy, href: '/support' },
  promo: { icon: Gift, href: '/rewards' },
  // An announcement opens its link when it has one, and otherwise has said
  // all it needs to — there is no page in the app it belongs to.
  'app-update': {
    icon: Sparkles,
    href: (d) => (typeof d.url === 'string' ? d.url : ''),
  },
};

/**
 * The tint each kind of notification carries, so a column of them can be
 * scanned by kind before a word of it is read. Theme tokens, so both themes
 * get their own.
 */
const TINTS: Record<NotificationCategory, string> = {
  bookings: 'bg-primary/10 text-primary',
  albums: 'bg-chart-3/15 text-chart-3',
  jobs: 'bg-info/15 text-info',
  hire: 'bg-info/15 text-info',
  network: 'bg-success/15 text-success',
  schedule: 'bg-warning/15 text-warning',
  billing: 'bg-muted text-muted-foreground',
  updates: 'bg-brand-accent/15 text-brand-accent',
  offers: 'bg-brand-accent/15 text-brand-accent',
  support: 'bg-muted text-muted-foreground',
};

/** The round icon a notification is drawn with, tinted by its kind. */
export function TopicIcon({
  topic,
  className,
}: {
  topic: NotificationTopic;
  className?: string;
}) {
  const Icon = TOPICS[topic]?.icon ?? Bell;
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full',
        TINTS[CATEGORY_OF_TOPIC[topic]] ?? 'bg-muted text-muted-foreground',
        className ?? 'size-8',
      )}
    >
      <Icon className="size-[45%]" />
    </span>
  );
}

/**
 * Opens a link outside the app.
 *
 * In a browser that is a new tab. In the desktop app the page is served from a
 * loopback origin, so an ordinary new-window request goes nowhere; the opener
 * plugin hands the URL to the system browser instead, and it is only allowed
 * to for api.virgo.ph — so a page cannot send somebody to an address of its
 * choosing. A link it refuses simply does not open.
 */
export function openExternal(url: string): void {
  const opener = (
    window as { __TAURI_PLUGIN_OPENER__?: { openUrl?: (url: string) => Promise<void> } }
  ).__TAURI_PLUGIN_OPENER__;
  if (opener?.openUrl) {
    void opener.openUrl(url).catch(() => undefined);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** "4m", "3h", "2d" — the popover is too narrow for more. */
function ago(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604_800) return `${Math.floor(seconds / 86_400)}d`;
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}

/** Where a notification's action leads, or null when it has nowhere to go. */
export function destination(n: AppNotification): string | null {
  const topic = TOPICS[n.topic];
  if (!topic) return null;
  const href = typeof topic.href === 'function' ? topic.href(n.data) : topic.href;
  return href || null;
}

/** Follows a notification's action: a route in the app, or a link outside it. */
export function followDestination(
  href: string,
  push: (href: string) => void,
): void {
  // An update announcement can link outside the app. Pushed through the
  // router it would navigate the whole tab away — and in the desktop app,
  // take the window out of Virgo with no way back.
  if (/^https:\/\//.test(href)) openExternal(href);
  else push(href);
}

/** The detail view's address for one notification. */
export function notificationHref(n: AppNotification): string {
  return `/notifications?id=${encodeURIComponent(n.id)}`;
}

/**
 * One notification in a list, as the popover and the notifications page both
 * draw it. Shared so the two cannot come to disagree about what a notification
 * looks like.
 *
 * The title is never cut: it is usually the whole point. The body is clamped
 * to two lines here and read in full in the detail view.
 */
export function NotificationRow({
  notification: n,
  onOpen,
  selected = false,
  when,
  actions = false,
}: {
  notification: AppNotification;
  onOpen: (n: AppNotification) => void;
  /** The one open in the detail pane beside the list. */
  selected?: boolean;
  /** The time as the list around it shows times; relative when left out. */
  when?: string;
  /** Mark read or unread, and delete, on hover — the popover's quick actions. */
  actions?: boolean;
}) {
  const markRead = useMarkNotificationsRead();
  const markUnread = useMarkNotificationsUnread();
  const remove = useDeleteNotifications();

  return (
    <div
      className={cn(
        'group relative flex items-start gap-3 px-4 py-3 transition-colors',
        selected
          ? 'bg-secondary'
          : !n.readAt
            ? 'bg-primary/[0.045] hover:bg-accent/60'
            : 'hover:bg-accent/60',
      )}
    >
      <TopicIcon topic={n.topic} />
      <button
        type="button"
        onClick={() => onOpen(n)}
        aria-current={selected ? 'true' : undefined}
        className="min-w-0 flex-1 text-left after:absolute after:inset-0 focus-visible:outline-none after:focus-visible:rounded-md after:focus-visible:ring-2 after:focus-visible:ring-ring"
      >
        <span className="flex items-baseline gap-2">
          <span
            className={cn(
              'min-w-0 flex-1 text-sm leading-snug',
              n.readAt ? 'font-medium' : 'font-semibold',
            )}
          >
            {n.title}
          </span>
          <span
            className={cn(
              'shrink-0 text-[11px] tabular-nums text-muted-foreground',
              actions && 'group-hover:invisible group-focus-within:invisible',
            )}
          >
            {when ?? ago(n.createdAt)}
          </span>
        </span>
        <span
          className={cn(
            'mt-0.5 line-clamp-2 block text-xs leading-relaxed',
            n.readAt ? 'text-muted-foreground' : 'text-foreground/75',
          )}
        >
          {n.body}
        </span>
      </button>
      {!n.readAt && (
        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary">
          <span className="sr-only">Unread</span>
        </span>
      )}
      {actions && (
        // Above the row's stretched button, so these take their own clicks.
        <span className="absolute right-3 top-2.5 z-10 hidden gap-1 group-hover:flex group-focus-within:flex">
          {n.readAt ? (
            <button
              type="button"
              aria-label="Mark as unread"
              title="Mark as unread"
              onClick={() => markUnread.mutate([n.id])}
              className="flex size-7 items-center justify-center rounded-md border bg-card text-muted-foreground hover:text-foreground"
            >
              <Mail className="size-3.5" />
            </button>
          ) : (
            <button
              type="button"
              aria-label="Mark as read"
              title="Mark as read"
              onClick={() => markRead.mutate([n.id])}
              className="flex size-7 items-center justify-center rounded-md border bg-card text-muted-foreground hover:text-foreground"
            >
              <Check className="size-3.5" />
            </button>
          )}
          <button
            type="button"
            aria-label="Delete"
            title="Delete"
            onClick={() => remove.mutate([n.id])}
            className="flex size-7 items-center justify-center rounded-md border bg-card text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="size-3.5" />
          </button>
        </span>
      )}
    </div>
  );
}

/**
 * The bell, and the popover of what came in lately.
 *
 * A notification opens in full on the notifications page, where its action
 * button is — the popover is for seeing what arrived, and it used to send
 * people straight to wherever the notification pointed without ever letting
 * them read all of it.
 *
 * The count is its own query, because it is on screen everywhere and the list
 * is on screen only while this popover is open.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const router = useRouter();
  const { count } = useUnreadNotifications();
  // Only while the popover is open. Nothing on a page needs the list itself.
  const { notifications, isLoading, loadFailed } = useNotificationFeed(
    { unread: unreadOnly },
    { enabled: open },
  );
  const markRead = useMarkNotificationsRead();
  const days = groupByDay(notifications);

  const openNotification = (n: AppNotification) => {
    if (!n.readAt) markRead.mutate([n.id]);
    setOpen(false);
    router.push(notificationHref(n));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            count > 0 ? `Notifications, ${count} unread` : 'Notifications'
          }
        >
          <Bell className="size-5" />
          {count > 0 && (
            // A dot with a number rather than a full badge component: it sits
            // on the icon, and the count matters less than the fact of it.
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground tabular-nums">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[25rem] p-0">
        <div className="flex items-center gap-1 px-4 pb-2 pt-3">
          <p className="flex-1 text-sm font-semibold">Notifications</p>
          {count > 0 && (
            <button
              type="button"
              onClick={() => markRead.mutate(undefined)}
              disabled={markRead.isPending}
              className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              <CheckCheck className="size-3.5" />
              Mark all read
            </button>
          )}
          <Link
            href="/settings/notifications"
            onClick={() => setOpen(false)}
            aria-label="Notification settings"
            title="Notification settings"
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Settings className="size-4" />
          </Link>
        </div>

        <div className="px-4 pb-2.5">
          <div role="tablist" aria-label="Show" className="inline-flex rounded-lg bg-muted p-0.5">
            {[
              { unread: false, label: 'All' },
              { unread: true, label: count > 0 ? `Unread · ${count}` : 'Unread' },
            ].map((tab) => (
              <button
                key={String(tab.unread)}
                type="button"
                role="tab"
                aria-selected={unreadOnly === tab.unread}
                onClick={() => setUnreadOnly(tab.unread)}
                className={cn(
                  'rounded-md px-3 py-1 text-xs transition-colors',
                  unreadOnly === tab.unread
                    ? 'bg-card font-semibold shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* A plain scrolling box, not Radix's ScrollArea. That component's
            viewport is `size-full`, which needs a height to resolve against —
            given only a max-height it stays as tall as its contents, and a long
            list ran straight out of the popover and down the page. The sidebar
            friends list dropped it for the same reason. */}
        <div className="max-h-[26rem] overflow-y-auto overscroll-contain border-t">
          {isLoading ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Loading…
            </p>
          ) : loadFailed ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Could not load your notifications. This is a connection problem,
              not an empty list.
            </p>
          ) : notifications.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <Bell className="mx-auto size-6 text-muted-foreground/50" />
              <p className="mt-2 text-sm font-medium">
                {unreadOnly ? 'Nothing unread' : 'Nothing yet'}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Applications, answers and bookings will show up here.
              </p>
            </div>
          ) : (
            days.map((day) => (
              <section key={day.title} aria-label={day.title}>
                <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {day.title}
                </p>
                <ul className="divide-y divide-border/60">
                  {day.items.map((n) => (
                    <li key={n.id}>
                      <NotificationRow
                        notification={n}
                        onOpen={openNotification}
                        when={day.title === 'Today' ? ago(n.createdAt) : timeOfDay(n.createdAt)}
                        actions
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>

        <div className="border-t p-2.5">
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="flex h-9 items-center justify-center gap-1.5 rounded-md bg-muted text-xs font-semibold transition-colors hover:bg-accent"
          >
            View all notifications
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
