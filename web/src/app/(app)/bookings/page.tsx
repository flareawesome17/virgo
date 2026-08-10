'use client';

import Link from 'next/link';
import { FileText } from 'lucide-react';
import { AppShell, PageHeader } from '@/components/app-shell';
import { CenteredSpinner } from '@/components/states';
import { BookingCard } from '@/components/jobs/booking-card';
import { useBookings } from '@/hooks/useBookings';
import { Button } from '@/components/ui/button';

/**
 * Every booking you are on, either side.
 *
 * Cancelled ones stay in the list rather than disappearing — a booking that
 * fell through is part of what happened, and hiding it is how two people end
 * up disagreeing about whether it ever existed.
 */
export default function BookingsPage() {
  const { bookings, isLoading, loadFailed, refetch } = useBookings();

  return (
    <AppShell>
      <PageHeader
        title="Bookings"
        description="What you and the other person agreed"
      />

      {/*
        The header was inside the shell's padding and the list was not, so
        every card ran from the sidebar to the far edge of the window while
        the title above it did not. max-w-4xl to match the other list pages.
      */}
      <div className="mx-auto w-full max-w-4xl px-6 py-6">
        {isLoading ? (
          <CenteredSpinner />
        ) : loadFailed ? (
          <div className="rounded-lg border border-dashed py-12 text-center">
            <p className="text-sm font-medium">Could not load your bookings</p>
            <p className="mt-1 text-xs text-muted-foreground">
              This is a connection problem, not an empty list.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => void refetch()}
            >
              Try again
            </Button>
          </div>
        ) : bookings.length === 0 ? (
          <div className="rounded-lg border border-dashed py-14 text-center">
            <FileText className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">No bookings yet</p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
              One is created when a job application is accepted — from either
              side. It holds the role, the day, and the rate, so neither of you
              has to remember them.
            </p>
            <Button asChild size="sm" variant="outline" className="mt-4">
              <Link href="/jobs/mine">Browse jobs</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {bookings.map((booking) => (
              <div key={booking.id}>
                <p className="mb-1.5 text-xs text-muted-foreground">
                  {booking.postTitle} · with {booking.otherParty.displayName}
                </p>
                <BookingCard booking={booking} />
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
