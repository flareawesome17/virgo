'use client';

import Link from 'next/link';
import { BriefcaseBusiness, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { track } from '@/lib/analytics';
import { Button } from '@/components/ui/button';
import { bookingState } from '@/components/jobs/booking-card';
import { useBooking, useConfirmBooking } from '@/hooks/useBookings';
import { rateLabel, type JobAcceptedContext } from '@/api';

/**
 * The first thing in a job's conversation.
 *
 * Accepting somebody opened this chat and left it empty. Both people arrived
 * at a blank thread and had to remember which job it was, which role was
 * accepted, and what had been agreed — while the booking that answers all
 * three sat on a screen neither of them was on.
 *
 * So the card carries the job, the role, the terms, and the one action that
 * matters: confirming. Read live from the booking rather than from a snapshot
 * in the message, because the terms are editable — a card frozen at the rate
 * it opened with would put two different agreements on one screen.
 */
export function JobAcceptedCard({ context }: { context: JobAcceptedContext }) {
  const { booking, isLoading, loadFailed } = useBooking(context.bookingId);
  const confirm = useConfirmBooking(context.bookingId);

  const state = booking ? bookingState(booking) : null;
  const rate = booking ? rateLabel(booking.rateMinor, booking.currency) : null;

  return (
    <div className="mx-auto my-3 w-full max-w-md rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <BriefcaseBusiness className="size-3.5" />
        {context.role ? `Hired as ${context.role}` : 'Hired'}
      </div>

      <Link
        href={`/jobs/${context.postSlug}`}
        className="mt-1.5 block text-[15px] font-bold leading-snug hover:underline"
      >
        {context.postTitle}
      </Link>

      {isLoading ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading the terms…</p>
      ) : loadFailed || !booking ? (
        // The card is the only path to the booking from here, so a failed load
        // has to say so rather than quietly render a job title and nothing.
        <p className="mt-3 text-sm text-muted-foreground">
          Could not load the terms.{' '}
          <Link href="/bookings" className="font-medium text-primary hover:underline">
            Open bookings
          </Link>
        </p>
      ) : (
        <>
          <dl className="mt-3 space-y-1.5 border-t pt-3 text-sm">
            <Row label="Date">
              {booking.eventDate
                ? new Date(`${booking.eventDate}T12:00:00`).toLocaleDateString()
                : null}
            </Row>
            <Row label="Location">{booking.location}</Row>
            <Row label="Rate" strong>
              {rate}
            </Row>
          </dl>

          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            {state?.detail}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {/* Only the person hired. The poster wrote the offer; agreeing
                with your own offer is a step with no decision in it. */}
            {!booking.cancelledAt &&
              !booking.confirmed &&
              booking.yourSide === 'creative' && (
                <Button
                  size="sm"
                  disabled={confirm.isPending}
                  onClick={() =>
                    confirm.mutate(undefined, {
                      onSuccess: () => {
                        track('booking_confirmed', { from: 'chat_card' });
                        toast.success('Agreed');
                      },
                      onError: (e: Error) => toast.error(e.message),
                    })
                  }
                >
                  {confirm.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  Confirm these terms
                </Button>
              )}
            <Button asChild size="sm" variant="outline">
              <Link href={`/bookings/${booking.id}`}>
                {/* Only the poster gets an offer to change them. The creative
                    is looking at somebody else's terms, and this chat is
                    where they say what they think of them. */}
                {booking.yourSide === 'poster' && !booking.cancelledAt
                  ? 'Change the terms'
                  : 'View booking'}
              </Link>
            </Button>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            A record of what you agreed, not a legal contract.{' '}
            {booking.yourSide === 'poster'
              ? 'Changing anything clears their confirmation, so you cannot alter agreed terms on your own.'
              : 'Only they can change these terms — if something is not right, say so here.'}
          </p>
        </>
      )}
    </div>
  );
}

function Row({
  label,
  children,
  strong,
}: {
  label: string;
  children: string | null | undefined;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={
          children
            ? strong
              ? 'text-right font-semibold'
              : 'text-right'
            : 'text-right text-muted-foreground'
        }
      >
        {children || 'Not set'}
      </dd>
    </div>
  );
}
