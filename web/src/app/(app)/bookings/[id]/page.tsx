'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { ArrowLeft, Check, MessageCircle, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import { rateLabel, type Booking } from '@/api';
import { AppShell } from '@/components/app-shell';
import { CenteredSpinner } from '@/components/states';
import { bookingState } from '@/components/jobs/booking-card';
import {
  useBooking,
  useCancelBooking,
  useConfirmBooking,
  useUpdateBooking,
} from '@/hooks/useBookings';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

/**
 * One booking, and the two things you can do to it.
 *
 * The page states plainly that this is a record rather than a contract. It is
 * worth saying: somebody reading "Agreed" over a rate and a date could
 * reasonably assume more legal weight than there is, and the honest framing
 * costs one line.
 */
export default function BookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { booking, isLoading, loadFailed } = useBooking(id);
  const [editing, setEditing] = useState(false);

  if (isLoading) {
    return (
      <AppShell>
        <CenteredSpinner />
      </AppShell>
    );
  }

  if (loadFailed || !booking) {
    return (
      <AppShell>
        <p className="py-16 text-center text-sm text-muted-foreground">
          That booking is not available.
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Link
        href="/bookings"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Bookings
      </Link>

      {editing ? (
        <EditForm booking={booking} onDone={() => setEditing(false)} />
      ) : (
        <View booking={booking} onEdit={() => setEditing(true)} />
      )}
    </AppShell>
  );
}

function View({ booking, onEdit }: { booking: Booking; onEdit: () => void }) {
  const state = bookingState(booking);
  const confirm = useConfirmBooking(booking.id);
  const cancel = useCancelBooking(booking.id);
  const rate = rateLabel(booking.rateMinor, booking.currency);
  const done = !!booking.cancelledAt;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{booking.postTitle}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            With {booking.otherParty.displayName} ·{' '}
            {booking.yourSide === 'poster' ? 'you posted this' : 'you were hired'}
          </p>
        </div>
        <Badge variant={state.tone === 'todo' ? 'default' : 'secondary'}>
          {state.label}
        </Badge>
      </div>

      <Card>
        <CardContent className="p-5">
          <dl className="space-y-3 text-sm">
            <Row label="Role" value={booking.role} />
            <Row
              label="Date"
              value={
                booking.eventDate
                  ? new Date(`${booking.eventDate}T12:00:00`).toLocaleDateString(
                      undefined,
                      { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
                    )
                  : null
              }
            />
            <Row label="Location" value={booking.location} />
            <Row label="Rate" value={rate} strong />
            <Row label="Notes" value={booking.notes} />
          </dl>

          <div className="mt-5 space-y-2 border-t pt-4 text-sm">
            <Confirmation
              who={booking.yourSide === 'poster' ? 'You' : booking.otherParty.displayName}
              at={booking.posterConfirmedAt}
            />
            <Confirmation
              who={booking.yourSide === 'creative' ? 'You' : booking.otherParty.displayName}
              at={booking.creativeConfirmedAt}
            />
          </div>
        </CardContent>
      </Card>

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        {state.detail}{' '}
        {!done &&
          'Changing anything here clears both confirmations, so neither of you can alter agreed terms on your own.'}
      </p>

      {!done && (
        <div className="mt-5 flex flex-wrap gap-2">
          {!booking.youConfirmed && (
            <Button
              disabled={confirm.isPending}
              onClick={() =>
                confirm.mutate(undefined, {
                  onSuccess: (b) =>
                    toast.success(
                      (b as Booking).lockedAt
                        ? 'Agreed by both of you'
                        : 'Confirmed. Waiting for them.',
                    ),
                  onError: (e: Error) => toast.error(e.message),
                })
              }
            >
              <Check className="size-4" />
              Confirm these terms
            </Button>
          )}

          <Button variant="outline" onClick={onEdit}>
            <Pencil className="size-4" />
            {booking.lockedAt ? 'Propose a change' : 'Edit'}
          </Button>

          {booking.conversationId && (
            <Button asChild variant="outline">
              <Link href={`/chat/${booking.conversationId}`}>
                <MessageCircle className="size-4" />
                Open chat
              </Link>
            </Button>
          )}

          <Button
            variant="ghost"
            className="ml-auto text-muted-foreground hover:text-destructive"
            disabled={cancel.isPending}
            onClick={() => {
              const reason = prompt(
                'Cancel this booking? Tell them why (optional).',
              );
              if (reason === null) return;
              cancel.mutate(reason || undefined, {
                onSuccess: () => toast.success('Booking cancelled'),
                onError: (e: Error) => toast.error(e.message),
              });
            }}
          >
            <X className="size-4" />
            Cancel booking
          </Button>
        </div>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        A record of what you agreed, not a legal contract. It is here so neither
        of you has to rely on memory or scroll back through a chat.
      </p>
    </>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string | null;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd
        className={
          value
            ? strong
              ? 'text-right font-semibold'
              : 'text-right'
            : 'text-right text-muted-foreground'
        }
      >
        {value || 'Not set'}
      </dd>
    </div>
  );
}

function Confirmation({ who, at }: { who: string; at: string | null }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{who}</span>
      {at ? (
        <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
          <Check className="size-3.5" />
          Confirmed {new Date(at).toLocaleDateString()}
        </span>
      ) : (
        <span className="text-muted-foreground">Not yet</span>
      )}
    </div>
  );
}

function EditForm({ booking, onDone }: { booking: Booking; onDone: () => void }) {
  const update = useUpdateBooking(booking.id);
  const [role, setRole] = useState(booking.role ?? '');
  const [eventDate, setEventDate] = useState(booking.eventDate ?? '');
  const [location, setLocation] = useState(booking.location ?? '');
  // Shown in pesos, stored in centavos.
  const [rate, setRate] = useState(
    booking.rateMinor == null ? '' : String(booking.rateMinor / 100),
  );
  const [notes, setNotes] = useState(booking.notes ?? '');

  return (
    <Card>
      <CardContent className="p-5">
        <h1 className="text-lg font-bold tracking-tight">Edit the terms</h1>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {booking.lockedAt
            ? 'This booking is agreed. Changing it clears both confirmations and asks them to agree again.'
            : 'Both of you can edit until you have each confirmed.'}
        </p>

        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const parsed = rate.trim() === '' ? null : Math.round(Number(rate) * 100);
            if (parsed != null && (!Number.isFinite(parsed) || parsed < 0)) {
              toast.error('Give a rate as a number, or leave it blank');
              return;
            }
            update.mutate(
              {
                role: role.trim() || null,
                eventDate: eventDate || null,
                location: location.trim() || null,
                rateMinor: parsed,
                notes: notes.trim() || null,
              },
              {
                onSuccess: () => {
                  toast.success('Terms updated', {
                    description: 'Both confirmations were cleared.',
                  });
                  onDone();
                },
                onError: (e: Error) => toast.error(e.message),
              },
            );
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="role">Role</Label>
              <Input id="role" value={role} onChange={(e) => setRole(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rate">Rate ({booking.currency})</Label>
              <Input
                id="rate"
                inputMode="decimal"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="15000"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">What is included</Label>
            <Textarea
              id="notes"
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="8 hours, RAW files delivered within 2 weeks, travel included."
            />
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? 'Saving…' : 'Save terms'}
            </Button>
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
