'use client';

import Link from 'next/link';
import { Check, Clock, FileText, XCircle } from 'lucide-react';
import { rateLabel, type Booking } from '@/api';
import { Badge } from '@/components/ui/badge';

/**
 * The state of an agreement, in one line.
 *
 * Four states worth telling apart: cancelled, agreed by both, waiting on you,
 * waiting on them. Anything vaguer — "pending" — leaves the reader unsure
 * whether there is something for them to do, which is the only question this
 * has to answer.
 */
export function bookingState(booking: Booking): {
  label: string;
  detail: string;
  tone: 'good' | 'todo' | 'waiting' | 'gone';
} {
  if (booking.cancelledAt) {
    return {
      label: 'Cancelled',
      detail: booking.cancelReason ?? 'This booking was cancelled.',
      tone: 'gone',
    };
  }
  if (booking.lockedAt) {
    return {
      label: 'Agreed',
      detail: 'Both of you confirmed these terms.',
      tone: 'good',
    };
  }
  if (!booking.youConfirmed) {
    return {
      label: 'Needs you',
      detail: booking.theyConfirmed
        ? 'They have confirmed. Your turn.'
        : 'Neither of you has confirmed yet.',
      tone: 'todo',
    };
  }
  return {
    label: 'Waiting on them',
    detail: 'You confirmed. Waiting for them to agree.',
    tone: 'waiting',
  };
}

const TONE: Record<ReturnType<typeof bookingState>['tone'], string> = {
  good: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  todo: 'bg-primary/15 text-primary',
  waiting: 'bg-muted text-muted-foreground',
  gone: 'bg-muted text-muted-foreground',
};

const ICON = { good: Check, todo: Clock, waiting: Clock, gone: XCircle };

/** The compact form, shown on an accepted application. */
export function BookingCard({ booking }: { booking: Booking }) {
  const state = bookingState(booking);
  const Icon = ICON[state.tone];
  const rate = rateLabel(booking.rateMinor, booking.currency);

  return (
    <Link
      href={`/bookings/${booking.id}`}
      className="block rounded-lg border p-3.5 transition-colors hover:bg-accent/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={`grid size-8 shrink-0 place-items-center rounded-full ${TONE[state.tone]}`}>
            <Icon className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <FileText className="size-3.5 text-muted-foreground" />
              Booking
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {state.detail}
            </p>
          </div>
        </div>
        <Badge variant={state.tone === 'todo' ? 'default' : 'secondary'}>
          {state.label}
        </Badge>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {booking.role && <span>{booking.role}</span>}
        {booking.eventDate && (
          <span>{new Date(`${booking.eventDate}T12:00:00`).toLocaleDateString()}</span>
        )}
        {booking.location && <span>{booking.location}</span>}
        {rate && <span className="font-medium text-foreground">{rate}</span>}
      </div>
    </Link>
  );
}
