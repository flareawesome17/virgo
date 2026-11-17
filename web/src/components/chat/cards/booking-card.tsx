'use client';

import { CalendarX, ClipboardCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { planDayLabel, rateLabel, type BookingCardContext } from '@/api';
import { CardAction, GoneNote, type CardEnv } from '@/components/chat/cards/card-parts';

type BookingNow = NonNullable<BookingCardContext['booking']>;

/** "Booking agreed" once both sides have, "Booking cancelled", or just "Booking". */
export function bookingCardLabel(booking: BookingNow | null | undefined): string {
  if (!booking) return 'Booking';
  if (booking.cancelled) return 'Booking cancelled';
  return booking.confirmed ? 'Booking agreed' : 'Booking';
}

/** "Videographer · Cruz Debut". */
export function bookingCardTitle(booking: BookingNow): string {
  return [booking.role, booking.postTitle].filter(Boolean).join(' · ');
}

/** "Sat, Dec 13 · Tagaytay". */
export function bookingCardWhen(booking: BookingNow): string {
  return [planDayLabel(booking.eventDate), booking.location].filter(Boolean).join(' · ');
}

/**
 * A booking (board ChatCards): centred, like the app's own "job accepted"
 * card, because it is an agreement between two people rather than a line one
 * of them typed. Read fresh with the thread, so a changed rate shows on a
 * card sent last week. Only the two on it can open it.
 */
export function BookingCard({ context, env }: { context: BookingCardContext | null; env: CardEnv }) {
  const booking = context?.booking;
  const label = bookingCardLabel(booking);
  const party = !!booking && !!env.meId && booking.parties.includes(env.meId);
  const rate = booking ? rateLabel(booking.rateMinor, booking.currency) : null;
  const when = booking ? bookingCardWhen(booking) : '';

  return (
    <div
      className={cn(
        'flex w-full flex-col gap-1.5 rounded-2xl border bg-card p-4 text-card-foreground shadow-xs transition-shadow',
        'group-hover/message:ring-3 group-hover/message:ring-accent',
        'group-focus-visible/message:ring-2 group-focus-visible/message:ring-ring',
      )}
    >
      <span
        className={cn(
          'flex items-center gap-1.5 self-start rounded-full px-2.5 py-0.5 text-xs font-bold',
          booking?.cancelled
            ? 'bg-destructive/10 text-destructive'
            : booking?.confirmed
              ? 'bg-success/15 text-success'
              : 'bg-muted text-muted-foreground',
        )}
      >
        {booking?.cancelled ? (
          <CalendarX className="size-3.5" aria-hidden />
        ) : (
          <ClipboardCheck className="size-3.5" aria-hidden />
        )}
        {label}
      </span>

      {!booking ? (
        <GoneNote>This booking isn&apos;t available any more.</GoneNote>
      ) : (
        <>
          <p className="text-[15px] font-bold leading-snug">{bookingCardTitle(booking)}</p>
          {when && <p className="text-sm text-muted-foreground">{when}</p>}
          <p className="mt-1 flex items-baseline justify-between gap-4 border-t pt-2 text-sm">
            <span className="text-muted-foreground">Rate</span>
            <span className={rate ? 'font-bold' : 'text-muted-foreground'}>{rate ?? 'Not set'}</span>
          </p>
          {party && <CardAction href={`/bookings/${booking.id}`}>Open booking</CardAction>}
        </>
      )}
    </div>
  );
}
