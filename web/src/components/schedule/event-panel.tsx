'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  ArrowUpRight,
  BellPlus,
  ChevronRight,
  Clock,
  Folder,
  LogOut,
  MapPin,
  MoreHorizontal,
  Pencil,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { AttendeeRows } from '@/components/event-invites';
import { startsIn } from '@/components/home/use-home';
import { CARD, DateTile, Pill, SectionTitle, StatusDot, dateTileParts } from '@/components/kit';
import { useAuth } from '@/hooks/useAuth';
import { useReminders, useUpdateReminder } from '@/hooks/useReminders';
import { useScheduleEvent } from '@/hooks/useScheduleEvents';
import { useWorkspace } from '@/hooks/useWorkspaces';
import type { Reminder, ScheduleEvent } from '@/api';
import { eventColor, eventTypeLabel, formatTime } from '@/lib/calendar';
import { cn } from '@/lib/utils';
import { HeadLink, ROWS, ReminderRow, SectionHead, fullDate } from './parts';
import { NewReminderDialog } from './reminder-dialog';

/** What the panel hands back to the page, which owns the forms and the confirms. */
type EventActions = {
  onEdit: (event: ScheduleEvent) => void;
  /** The guest list, for whoever organised it. */
  onInvite: (event: ScheduleEvent) => void;
  onDelete: (event: ScheduleEvent) => void;
  /** A guest backing out of an event they accepted. */
  onLeave: (event: ScheduleEvent) => void;
};

export type EventPanelProps = EventActions & {
  /** The event on show. Null closes the panel. */
  eventId: string | null;
  /** The page's own copy of it, shown while the full one is read. */
  known?: ScheduleEvent;
  onClose: () => void;
};

/**
 * One event, in a panel down the right side of the Schedule.
 *
 * The web had no event of its own to open: a day's card carried everything,
 * in six lines and a row of icons. The card is a row now, and this is where
 * the rest went, laid out as the phone's event screen is: the day as a tile
 * beside what it is, the facts a row each, the notes at reading size, who is
 * coming, and its reminders.
 */
export function EventPanel({ eventId, known, onClose, ...actions }: EventPanelProps) {
  // The event stays on the panel while it slides away: cleared on the close,
  // it would empty first and slide out blank.
  const [shownId, setShownId] = useState(eventId);
  if (eventId && eventId !== shownId) setShownId(eventId);

  // Read on its own even when the page holds it: only a single read says who
  // organised it, which a guest's panel leads its list with.
  const detail = useScheduleEvent(shownId ?? undefined);
  const fresh =
    detail.data?.id === shownId ? detail.data : known?.id === shownId ? known : undefined;
  // Deleting it takes it out of the page's lists at once, while the panel is
  // still on its way out.
  const [last, setLast] = useState<ScheduleEvent | undefined>(fresh);
  if (fresh && fresh !== last) setLast(fresh);
  const event = fresh ?? (last?.id === shownId ? last : undefined);

  return (
    <Sheet open={eventId !== null} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        onCloseAutoFocus={() => setShownId(null)}
        className="gap-5 overflow-y-auto overscroll-contain bg-background px-6 pb-6 pt-3 data-[side=right]:w-full data-[side=right]:sm:max-w-[480px]"
      >
        {event ? (
          <EventPanelBody event={event} {...actions} />
        ) : (
          <>
            <div className="-mx-2 flex items-center">
              <CloseButton />
            </div>
            <SheetTitle className="sr-only">Event</SheetTitle>
            {detail.isError ? (
              <SheetDescription>That event is no longer on your schedule.</SheetDescription>
            ) : (
              <>
                <SheetDescription className="sr-only">Loading the event.</SheetDescription>
                <div aria-hidden className="flex items-start gap-4">
                  <Skeleton className="h-[76px] w-[60px] rounded-2xl" />
                  <div className="flex-1 space-y-3 pt-1">
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-1/3" />
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function CloseButton() {
  return (
    <SheetClose asChild>
      <Button variant="ghost" size="icon-lg" className="size-10 rounded-[10px]" aria-label="Close">
        <X className="size-5" />
      </Button>
    </SheetClose>
  );
}

function EventPanelBody({
  event,
  onEdit,
  onInvite,
  onDelete,
  onLeave,
}: EventActions & { event: ScheduleEvent }) {
  const { user, profile } = useAuth();
  // Undefined on a just-created event, which is always yours.
  const mine = event.is_owner !== false;
  // Read on its own, as on the phone: the page's list leaves out a workspace
  // that has been archived, and an event filed under one still says so.
  const { data: workspace } = useWorkspace(event.workspace_id ?? undefined);
  // Every reminder made for it, done ones too, so a tick stays where it was
  // put instead of taking its row away.
  const { reminders, isLoading: remindersLoading } = useReminders({
    schedule_event_id: event.id,
    orderBy: 'reminder_time',
    direction: 'asc',
  });
  const update = useUpdateReminder();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Reminder | null>(null);

  const date = dateTileParts(event.event_date);
  const countdown = startsIn(event);
  const now = new Date().getTime();

  // "Sirao Garden, Cebu City" reads as a place over its town. One name, or a
  // town alone, is one line.
  const place = event.location?.trim() || null;
  const comma = place ? place.indexOf(',') : -1;
  const venue = place && comma > 0 ? place.slice(0, comma).trim() : place;
  const town = place && comma > 0 ? place.slice(comma + 1).trim() : '';

  const organiser = mine
    ? {
        name: profile?.displayName?.trim() || user?.email || 'You',
        avatarUrl: profile?.avatarUrl ?? null,
        you: true,
      }
    : event.organiser_name
      ? { name: event.organiser_name, avatarUrl: event.organiser_avatar_url ?? null }
      : null;

  const toggle = (reminder: Reminder) =>
    update.mutate(
      { id: reminder.id, is_completed: !reminder.is_completed },
      {
        onError: (err: Error) =>
          toast.error('Could not update the reminder', { description: err.message }),
      },
    );

  return (
    <>
      {/* Close where the panel came from, and Edit where the hand expects it.
          Edit is open to anyone on the event: if it is on your schedule you
          either own it or accepted an invitation to it, which is exactly who
          the API lets write. */}
      <div className="-mx-2 flex items-center gap-1">
        <CloseButton />
        <span className="flex-1" />
        <Button
          variant="secondary"
          className="h-9 rounded-[10px] pl-2.5 pr-3.5 text-sm font-semibold"
          onClick={() => onEdit(event)}
        >
          <Pencil />
          Edit
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-lg" className="size-10 rounded-[10px]" aria-label="More">
              <MoreHorizontal className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={() => setAdding(true)}>
              <BellPlus />
              Remind me
            </DropdownMenuItem>
            {mine && (
              <DropdownMenuItem onSelect={() => onInvite(event)}>
                <Users />
                Who is coming
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {mine ? (
              <DropdownMenuItem variant="destructive" onSelect={() => onDelete(event)}>
                <Trash2 />
                Delete event
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem variant="destructive" onSelect={() => onLeave(event)}>
                <LogOut />
                Can&rsquo;t make it
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* What and when: the date tile, at its largest. */}
      <div className="flex items-start gap-4">
        <DateTile size="lg" top={date.weekday} day={date.day} bottom={date.month} />
        <div className="flex min-w-0 flex-col gap-2">
          <SheetTitle className="text-2xl font-bold leading-[30px] tracking-tight [overflow-wrap:anywhere]">
            {event.title}
          </SheetTitle>
          <SheetDescription className="sr-only">
            {fullDate(event.event_date)}, {event.event_time ? formatTime(event.event_time) : 'all day'}
          </SheetDescription>
          <div className="flex flex-wrap items-center gap-2 text-sm text-secondary-foreground">
            {/* The kind's colour, once, as a dot. */}
            <span className="flex items-center gap-2">
              <StatusDot color={eventColor(event.event_type)} />
              {eventTypeLabel(event)}
            </span>
            {!mine && <Pill>Guest</Pill>}
            {countdown && <Pill tone="warm">Starts {countdown}</Pill>}
          </div>
        </div>
      </div>

      {/* The facts, a row each. */}
      <div className={ROWS}>
        <div className="flex min-h-14 items-center gap-3 px-4 py-2">
          <Clock aria-hidden className="size-[18px] shrink-0 text-secondary-foreground" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-semibold">
              {event.event_time ? formatTime(event.event_time) : 'All day'}
            </span>
            <span className="text-[13px] text-muted-foreground">{fullDate(event.event_date)}</span>
          </span>
        </div>
        {place && (
          <div className="flex min-h-14 items-center gap-3 px-4 py-2">
            <MapPin aria-hidden className="size-[18px] shrink-0 text-secondary-foreground" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-semibold [overflow-wrap:anywhere]">{venue}</span>
              {town && <span className="text-[13px] text-muted-foreground">{town}</span>}
            </span>
            {/* The place as typed, handed to Google Maps as a search: an
                event has no coordinates to drop a pin on. */}
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${place}. Open in Maps`}
              className="flex shrink-0 items-center gap-1 rounded text-sm font-semibold text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Map
              <ArrowUpRight aria-hidden className="size-3.5" />
            </a>
          </div>
        )}
        {workspace && (
          <Link
            href={`/workspaces/${workspace.id}`}
            aria-label={`Open ${workspace.name}`}
            className="flex min-h-14 items-center gap-3 py-2 pl-4 pr-3 outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50"
          >
            <Folder aria-hidden className="size-[18px] shrink-0 text-secondary-foreground" />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{workspace.name}</span>
            <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground/70" />
          </Link>
        )}
      </div>

      {/* Notes, to be read: on the panel itself, at reading size. */}
      {event.description?.trim() ? (
        <section>
          <SectionTitle>Notes</SectionTitle>
          <p className="whitespace-pre-wrap text-sm leading-[22px] text-secondary-foreground [overflow-wrap:anywhere]">
            {event.description}
          </p>
        </section>
      ) : null}

      {/* Only the organiser can change who is invited. A guest sees who
          organised it and who else is going. */}
      <section>
        <SectionHead title="Who is coming">
          {mine && <HeadLink onClick={() => onInvite(event)}>Invite</HeadLink>}
        </SectionHead>
        <AttendeeRows eventId={event.id} organiser={organiser} youId={user?.id} />
      </section>

      {/* A reminder is only ever yours, so a guest sets one as freely as the
          organiser. */}
      <section>
        <SectionHead title="Reminders">
          <HeadLink aria-label="Add a reminder" onClick={() => setAdding(true)}>
            Add
          </HeadLink>
        </SectionHead>
        {reminders.length === 0 ? (
          // One row, not a block: most events have none.
          <p className={cn(CARD, 'flex min-h-[52px] items-center px-4 text-sm text-muted-foreground')}>
            {remindersLoading ? 'Loading…' : 'No reminders set'}
          </p>
        ) : (
          <ul className={ROWS}>
            {reminders.map((reminder) => (
              <ReminderRow
                key={reminder.id}
                reminder={reminder}
                late={!reminder.is_completed && Date.parse(reminder.reminder_time) < now}
                onToggle={() => toggle(reminder)}
                onOpen={() => setEditing(reminder)}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Leaving or deleting, alone at the foot. Delete stays with whoever
          created it: it cannot be undone, and it takes the event off
          everybody's calendar. */}
      <button
        type="button"
        onClick={() => (mine ? onDelete(event) : onLeave(event))}
        className="mt-auto h-10 shrink-0 self-start rounded text-sm font-semibold text-destructive outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {mine ? 'Delete event' : 'Can’t make it'}
      </button>

      {adding && (
        <NewReminderDialog open onOpenChange={(next) => !next && setAdding(false)} event={event} />
      )}
      {editing && (
        <NewReminderDialog
          open
          onOpenChange={(next) => !next && setEditing(null)}
          reminder={editing}
          event={event}
        />
      )}
    </>
  );
}
