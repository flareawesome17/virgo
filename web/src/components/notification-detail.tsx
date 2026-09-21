'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Mail, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  TopicIcon,
  destination,
  followDestination,
} from '@/components/notification-bell';
import { useAlbum } from '@/hooks/useAlbums';
import { useBooking } from '@/hooks/useBookings';
import {
  useDeleteNotifications,
  useMarkNotificationsUnread,
} from '@/hooks/useNotifications';
import { useScheduleEvent } from '@/hooks/useScheduleEvents';
import { CATEGORY_OF_TOPIC, rateLabel, type AppNotification } from '@/api';
import {
  CATEGORY_LABELS,
  actionLabel,
  fullTimestamp,
} from '@/lib/notification-categories';
import { cn } from '@/lib/utils';

function Fact({ label, value }: { label: string; value: ReactNode }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{value}</p>
    </div>
  );
}

/** The frame every context card sits in: what the notification is about. */
function ContextCard({
  title,
  status,
  children,
}: {
  title: string;
  status?: { label: string; tone: 'good' | 'bad' | 'neutral' } | null;
  children?: ReactNode;
}) {
  return (
    <div className="max-w-2xl rounded-xl border bg-background/60 p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-base font-semibold">{title}</p>
        {status && (
          <span
            className={cn(
              'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold',
              status.tone === 'good' && 'bg-success/15 text-success',
              status.tone === 'bad' && 'bg-destructive/10 text-destructive',
              status.tone === 'neutral' && 'bg-muted text-muted-foreground',
            )}
          >
            {status.label}
          </span>
        )}
      </div>
      {children && (
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">{children}</div>
      )}
    </div>
  );
}

function BookingContext({ bookingId }: { bookingId: string }) {
  const { booking } = useBooking(bookingId);
  if (!booking) return null;
  const status = booking.cancelledAt
    ? { label: 'Cancelled', tone: 'bad' as const }
    : booking.confirmed
      ? { label: 'Agreed', tone: 'good' as const }
      : { label: 'Waiting on terms', tone: 'neutral' as const };
  return (
    <ContextCard title={booking.postTitle} status={status}>
      <Fact
        label="When"
        value={
          booking.eventDate
            ? new Date(`${booking.eventDate}T12:00:00`).toLocaleDateString(undefined, {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })
            : null
        }
      />
      <Fact label="Where" value={booking.location} />
      <Fact label="With" value={booking.otherParty.displayName} />
      <Fact label="Role" value={booking.role} />
      <Fact label="Rate" value={rateLabel(booking.rateMinor, booking.currency)} />
    </ContextCard>
  );
}

function EventContext({ eventId }: { eventId: string }) {
  const { data: event } = useScheduleEvent(eventId);
  if (!event) return null;
  const date = new Date(`${event.event_date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return (
    <ContextCard title={event.title}>
      <Fact label="When" value={event.event_time ? `${date} · ${event.event_time.slice(0, 5)}` : date} />
      <Fact label="Where" value={event.location} />
    </ContextCard>
  );
}

function AlbumContext({ albumId }: { albumId: string }) {
  const { data: album } = useAlbum(albumId);
  if (!album) return null;
  return <ContextCard title={album.name} />;
}

/**
 * What the notification is about, when that is something the app can show:
 * the booking, the event, the album. Anything else has said all it can in its
 * own words.
 */
function Context({ notification: n }: { notification: AppNotification }) {
  const id = (key: string) =>
    typeof n.data[key] === 'string' ? (n.data[key] as string) : null;
  if (n.topic === 'booking' && id('bookingId')) {
    return <BookingContext bookingId={id('bookingId')!} />;
  }
  if (
    (n.topic === 'event-invite' || n.topic === 'event-updated' || n.topic === 'event-response') &&
    id('eventId')
  ) {
    return <EventContext eventId={id('eventId')!} />;
  }
  if (n.topic === 'client-picks' && id('albumId')) {
    return <AlbumContext albumId={id('albumId')!} />;
  }
  return null;
}

/**
 * One notification, all of it.
 *
 * The list and the popover clamp a notification to fit; this is where it is
 * read: the whole title and body, when it came, what it is about, and the one
 * thing to do about it.
 */
export function NotificationDetail({
  notification: n,
  onDeleted,
  className,
}: {
  notification: AppNotification;
  /** Called as it is deleted, so the page can move on to the next one. */
  onDeleted?: () => void;
  className?: string;
}) {
  const router = useRouter();
  const markUnread = useMarkNotificationsUnread();
  const remove = useDeleteNotifications();
  const href = destination(n);
  const category = CATEGORY_OF_TOPIC[n.topic];

  return (
    <article className={cn('flex flex-col gap-6', className)} aria-labelledby={`notification-${n.id}`}>
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-2 rounded-full bg-muted py-1 pl-1 pr-3 text-xs font-semibold">
          <TopicIcon topic={n.topic} className="size-6" />
          {CATEGORY_LABELS[category]}
        </span>
        <span className="flex-1 text-sm text-muted-foreground">
          {fullTimestamp(n.createdAt)}
        </span>
        {n.readAt && (
          <Button
            variant="outline"
            size="icon"
            aria-label="Mark as unread"
            title="Mark as unread"
            onClick={() => markUnread.mutate([n.id])}
            disabled={markUnread.isPending}
          >
            <Mail className="size-4" />
          </Button>
        )}
        <Button
          variant="outline"
          size="icon"
          aria-label="Delete"
          title="Delete"
          className="text-destructive hover:text-destructive"
          onClick={() => {
            remove.mutate([n.id]);
            onDeleted?.();
          }}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <div className="max-w-2xl space-y-3">
        <h2
          id={`notification-${n.id}`}
          className="text-balance text-2xl font-bold leading-tight tracking-tight"
        >
          {n.title}
        </h2>
        <p className="whitespace-pre-line text-base leading-relaxed text-foreground/85">
          {n.body}
        </p>
      </div>

      <Context notification={n} />

      {href && (
        <div>
          <Button onClick={() => followDestination(href, router.push)}>
            {actionLabel(n)}
            <ArrowRight className="size-4" />
          </Button>
        </div>
      )}

      <p className="mt-auto border-t pt-4 text-sm text-muted-foreground">
        {category === 'support' ? (
          'Replies from support always reach you.'
        ) : (
          <>
            This is one of your {CATEGORY_LABELS[category].toLowerCase()} notifications.{' '}
            <Link
              href="/settings/notifications"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Choose what reaches you
            </Link>
          </>
        )}
      </p>
    </article>
  );
}
