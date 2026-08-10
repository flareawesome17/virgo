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
        <div className="mx-auto w-full max-w-3xl px-6 py-6">
          <p className="py-16 text-center text-sm text-muted-foreground">
            That booking is not available.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/*
        The same container every other page in the app has, and this one did
        not: it rendered straight into the shell, so the back link sat against
        the sidebar and the card stretched to the far edge of the window. On a
        wide screen that put "Role" and "Photographer" nearly 1500px apart —
        a row you have to track across the whole monitor to read.

        max-w-3xl to match the other detail pages (a job post, settings,
        nearby) rather than the wider list pages.
      */}
      <div className="mx-auto w-full max-w-3xl px-6 py-6">
        <Link
          href="/bookings"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Bookings
        </Link>

        {/* `editing` is only ever set by a button the creative does not get,
            but the check is here too — a form that 403s on save is a worse
            way to learn this than not being offered it. */}
        {editing && booking.yourSide === 'poster' ? (
          <EditForm booking={booking} onDone={() => setEditing(false)} />
        ) : (
          <View booking={booking} onEdit={() => setEditing(true)} />
        )}
      </div>
    </AppShell>
  );
}

function View({ booking, onEdit }: { booking: Booking; onEdit: () => void }) {
  const state = bookingState(booking);
  const confirm = useConfirmBooking(booking.id);
  const cancel = useCancelBooking(booking.id);
  const rate = rateLabel(booking.rateMinor, booking.currency);
  const done = !!booking.cancelledAt;
  /*
   * Only the poster sets the terms.
   *
   * They are hiring and paying, so the booking is their offer; the creative's
   * answer is to confirm it or not. Negotiating by editing a form at each
   * other is a worse way to argue about a rate than the chat next to it.
   *
   * The server refuses either way — this only decides whether to offer a
   * button that would be rejected.
   */
  const canEdit = booking.yourSide === 'poster';

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

      {/*
        Two different sentences, because the two sides can do different things.
        Telling somebody who has no Edit button that changing things clears the
        confirmations describes a control they cannot see.
      */}
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        {state.detail}{' '}
        {!done &&
          (canEdit
            ? 'Changing anything here clears both confirmations, so you cannot alter agreed terms on your own.'
            : `Only ${booking.otherParty.displayName} can change these terms — they posted the job. If something is not right, say so in the chat.`)}
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

          {canEdit && (
            <Button variant="outline" onClick={onEdit}>
              <Pencil className="size-4" />
              {booking.lockedAt ? 'Change the terms' : 'Edit'}
            </Button>
          )}

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

/*
 * Two columns, not a label and a value pushed to opposite ends.
 *
 * `justify-between` is fine in something narrow — it is what the chat card
 * uses — but this card is the width of the page, and it put "Role" and
 * "Photographer" a screen apart with nothing in between. Five facts read as a
 * spec sheet, so they get one: a fixed label column and values that all start
 * on the same line, which the eye can run straight down.
 */
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
    <div className="grid grid-cols-[7rem_1fr] items-baseline gap-x-4 sm:grid-cols-[9rem_1fr]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={value ? (strong ? 'font-semibold' : '') : 'text-muted-foreground'}>
        {value || 'Not set'}
      </dd>
    </div>
  );
}

function Confirmation({ who, at }: { who: string; at: string | null }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] items-center gap-x-4 sm:grid-cols-[9rem_1fr]">
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
            : 'Yours to set — they confirm it. Any change clears both confirmations.'}
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
