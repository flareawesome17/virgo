'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  BriefcaseBusiness,
  Calendar,
  CheckCheck,
  CreditCard,
  FileText,
  Gift,
  LifeBuoy,
  MessageCircle,
  Sparkles,
  Trash2,
  Heart,
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
  useMarkNotificationsRead,
  useNotifications,
  useUnreadNotifications,
} from '@/hooks/useNotifications';
import type { AppNotification, NotificationTopic } from '@/api';
import { cn } from '@/lib/utils';

/**
 * An icon per topic, and where tapping one goes.
 *
 * The same table as useRealtime's, and deliberately so: a notification read
 * from this list must land in the same place as the toast that announced it,
 * or the two surfaces disagree about what the same event means.
 */
const TOPICS: Record<
  NotificationTopic,
  { icon: LucideIcon; href: string | ((d: Record<string, unknown>) => string) }
> = {
  'friend-request': { icon: UserPlus, href: '/network' },
  'friend-accepted': { icon: UserPlus, href: '/network' },
  'collaborator-invite': { icon: Users, href: '/network' },
  'collaborator-response': { icon: Users, href: '/network' },
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
  // An announcement opens its link when it has one, and otherwise has said all
  // it needs to in the list — there is no page in the app it belongs to.
  'app-update': {
    icon: Sparkles,
    href: (d) => (typeof d.url === 'string' ? d.url : ''),
  },
};

/**
 * Opens a link outside the app.
 *
 * In a browser that is a new tab. In the desktop app the page is served from a
 * loopback origin, so an ordinary new-window request goes nowhere; the opener
 * plugin hands the URL to the system browser instead, and it is only allowed
 * to for api.virgo.ph — so a page cannot send somebody to an address of its
 * choosing. A link it refuses simply does not open.
 */
function openExternal(url: string): void {
  const opener = (
    window as { __TAURI_PLUGIN_OPENER__?: { openUrl?: (url: string) => Promise<void> } }
  ).__TAURI_PLUGIN_OPENER__;
  if (opener?.openUrl) {
    void opener.openUrl(url).catch(() => undefined);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** "4m", "3h", "2d" — a list this dense has no room for a sentence. */
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

export function destination(n: AppNotification): string | null {
  const topic = TOPICS[n.topic];
  if (!topic) return null;
  return typeof topic.href === 'function' ? topic.href(n.data) : topic.href;
}

/**
 * One notification, as the popover and the notifications page both draw it.
 * Shared so the two cannot come to disagree about what a notification looks like.
 */
export function NotificationRow({
  notification: n,
  onOpen,
  roomy = false,
}: {
  notification: AppNotification;
  onOpen: (n: AppNotification) => void;
  /** The page has room for the whole body; the popover clamps it. */
  roomy?: boolean;
}) {
  const Icon = TOPICS[n.topic]?.icon ?? Bell;
  return (
    <button
      type="button"
      onClick={() => onOpen(n)}
      className={cn(
        'flex w-full items-start gap-3 text-left transition-colors hover:bg-accent/60',
        roomy ? 'px-5 py-4' : 'px-4 py-3',
        !n.readAt && 'bg-primary/[0.04]',
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full',
          n.readAt ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary',
        )}
      >
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{n.title}</span>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{ago(n.createdAt)}</span>
        </span>
        <span className={cn('mt-0.5 block text-xs leading-relaxed text-muted-foreground', !roomy && 'line-clamp-2')}>
          {n.body}
        </span>
      </span>
      {!n.readAt && <span aria-label="Unread" className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />}
    </button>
  );
}

/**
 * The notification list, and the badge that says there is one.
 *
 * Every notification in the product used to be a socket frame and an email:
 * live for whoever happened to be looking, and gone otherwise. This is the
 * place the app finally admits something happened while you were away.
 *
 * The count is its own query, because it is on screen everywhere and the list
 * is on screen only while this popover is open — one cheap poll rather than
 * fetching thirty rows to render a number.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { count } = useUnreadNotifications();
  // Only while the popover is open. Nothing on a page needs the list itself.
  const { notifications, isLoading, loadFailed } = useNotifications(30, {
    enabled: open,
  });
  const markRead = useMarkNotificationsRead();

  const openNotification = (n: AppNotification) => {
    if (!n.readAt) markRead.mutate([n.id]);
    const href = destination(n);
    setOpen(false);
    if (!href) return;
    if (/^https:\/\//.test(href)) openExternal(href);
    else router.push(href);
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

      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <p className="text-sm font-semibold">Notifications</p>
          {count > 0 && (
            <button
              type="button"
              onClick={() => markRead.mutate(undefined)}
              disabled={markRead.isPending}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              <CheckCheck className="size-3.5" />
              Mark all read
            </button>
          )}
        </div>

        {/* A plain scrolling box, not Radix's ScrollArea. That component's
            viewport is `size-full`, which needs a height to resolve against —
            given only a max-height it stays as tall as its contents, and a long
            list ran straight out of the popover and down the page. The sidebar
            friends list dropped it for the same reason. */}
        <div className="max-h-[24rem] overflow-y-auto overscroll-contain">
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
              <p className="mt-2 text-sm font-medium">Nothing yet</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Applications, answers and bookings will show up here.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {notifications.map((n) => (
                <li key={n.id}>
                  <NotificationRow notification={n} onOpen={openNotification} />
                </li>
              ))}
            </ul>
          )}
        </div>
        {/* The popover shows thirty. Everything older used to be unreachable
            once it scrolled off the bottom. */}
        <div className="border-t px-4 py-2 text-center">
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            See all notifications
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
