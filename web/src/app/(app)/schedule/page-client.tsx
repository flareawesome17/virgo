'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Bell,
  BellOff,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { AppShell, PageHeader } from '@/components/app-shell';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useCreateScheduleEvent,
  useDeleteScheduleEvent,
  useEventInvitations,
  useInviteToEvent,
  useRespondToEventInvitation,
  useScheduleEvent,
  useScheduleEventRange,
  useUpdateScheduleEvent,
} from '@/hooks/useScheduleEvents';
import type { Reminder, ScheduleEvent } from '@/api';
import {
  AttendeeSummary,
  InvitePeople,
  ManageAttendeesDialog,
} from '@/components/event-invites';
import {
  useCreateReminder,
  useDeleteReminder,
  useReminders,
  useUpdateReminder,
} from '@/hooks/useReminders';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import {
  DAY_DOT_SIZE,
  DAYS,
  MONTHS,
  dayDots,
  eventTypeLabel,
  dateToKey,
  formatTime,
  getMonthWeeks,
  isEventUpcoming,
  labelForDateKey,
  todayKey,
} from '@/lib/calendar';
import type { EventType } from '@/api';
import { LocationField } from '@/components/location-field';
import {
  DISCARD_BODY,
  DISCARD_TITLE,
  useDiscardGuard,
  useGuardedClose,
  useOpeningKey,
} from '@/lib/discard-guard';

/**
 * Written out with labels rather than capitalising the value, because one of
 * them is not a word — "Others (specify)" is an instruction, and `other`
 * capitalised reads as a category nobody would pick on purpose.
 */
const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: 'event', label: 'Event' },
  { value: 'editing', label: 'Editing' },
  { value: 'review', label: 'Review' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'other', label: 'Others (specify)' },
];

/** Tab values that ?tab= may name. Anything else is ignored. */
const TABS = ['day', 'upcoming', 'invites', 'reminders'];

/**
 * An event's time the way the time input wants it.
 *
 * Postgres `time` comes back as HH:MM:SS; <input type="time"> wants HH:MM and
 * silently renders empty otherwise.
 */
function timeInputValue(event: ScheduleEvent | undefined): string {
  return event?.event_time ? event.event_time.slice(0, 5) : '';
}

/** The workspace select's value for an event that belongs to none. */
const NO_WORKSPACE = 'none';

/**
 * "Discard your changes?", over a form dialog closed with something typed in
 * it. The X, Cancel, Escape and a stray click on the overlay all threw away a
 * half-written event or reminder without a word.
 */
function DiscardChangesDialog({ guard }: { guard: ReturnType<typeof useGuardedClose> }) {
  return (
    <AlertDialog open={guard.asking} onOpenChange={(o) => !o && guard.keepEditing()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{DISCARD_TITLE}</AlertDialogTitle>
          <AlertDialogDescription>{DISCARD_BODY}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep editing</AlertDialogCancel>
          <AlertDialogAction onClick={guard.discard}>Discard</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type EventDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate: string;
  /** The workspace a new event starts in: "Add" from a workspace's Coming up. */
  defaultWorkspaceId?: string | null;
  /** Present to edit that event; absent to create a new one. */
  event?: ScheduleEvent;
};

/**
 * Filled afresh on every opening, not just on mount: the New event dialog
 * stays mounted between uses, so it would otherwise open on the day it was
 * last opened for, with whatever was typed and thrown away last time. The
 * form is keyed on the opening instead, which also gives the discard guard a
 * clean starting point each time.
 */
function EventDialog(props: EventDialogProps) {
  const opening = useOpeningKey(props.open);
  return <EventDialogForm key={opening} {...props} />;
}

function EventDialogForm({
  open,
  onOpenChange,
  defaultDate,
  defaultWorkspaceId,
  event,
}: EventDialogProps) {
  const create = useCreateScheduleEvent();
  const update = useUpdateScheduleEvent();
  const invite = useInviteToEvent();
  const editing = Boolean(event);
  /** Editing something somebody else created. Undefined means just-created. */
  const guestEdit = editing && event?.is_owner === false;
  const pending = editing ? update.isPending : create.isPending;
  const [title, setTitle] = useState(event?.title ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [date, setDate] = useState(event?.event_date ?? defaultDate);
  const [time, setTime] = useState(timeInputValue(event));
  // Said and chosen, as on the phone. An empty time always saved as all day,
  // but nothing said so, and clearing a time input is not something people
  // think to do.
  const [allDay, setAllDay] = useState(editing && !event?.event_time);
  const [type, setType] = useState<EventType>(
    (event?.event_type as EventType | undefined) ?? 'event',
  );
  const [otherLabel, setOtherLabel] = useState(event?.event_type_other ?? '');
  const [location, setLocation] = useState(event?.location ?? '');
  const [guests, setGuests] = useState<string[]>([]);
  const [workspaceId, setWorkspaceId] = useState(
    event?.workspace_id ?? defaultWorkspaceId ?? NO_WORKSPACE,
  );
  // Your own workspaces only: an event is filed under a workspace the same
  // way an album is, and only its owner can do that.
  const { workspaces: listed } = useWorkspaces(
    { limit: 100, orderBy: 'name', direction: 'asc' },
    { enabled: open && !guestEdit },
  );
  const ownWorkspaces = listed.filter((w) => w.is_owner);

  // An "other" event is only half-described until it is named, so the save
  // button waits for the name the same way it waits for the title.
  const needsLabel = type === 'other' && !otherLabel.trim();

  const { dirty } = useDiscardGuard(
    { title, description, date, time, allDay, type, otherLabel, location, guests, workspaceId },
    open,
  );
  // Escape, the overlay, the X and Cancel all come through `close`. A save
  // closes through onOpenChange directly, which nobody needs to confirm.
  const guard = useGuardedClose(dirty, onOpenChange);
  const close = guard.close;
  const eventTime = allDay ? null : time || null;

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed || !date || needsLabel) return;

    // Sent on every save, not only when `other` is chosen: switching away from
    // it has to clear the old name, and omitting the field would leave the
    // server to guess whether that was intended.
    const typeFields = {
      event_type: type,
      event_type_other: type === 'other' ? otherLabel.trim() : null,
      // Null rather than '' when cleared, so "has a location" stays one check.
      // The server settles the spelling — "cebu" comes back as "Cebu City".
      location: location.trim() || null,
      // A guest cannot file somebody else's event under a workspace, so their
      // edit leaves it where it is.
      ...(guestEdit ? {} : { workspace_id: workspaceId === NO_WORKSPACE ? null : workspaceId }),
    };

    if (event) {
      update.mutate(
        {
          id: event.id,
          title: trimmed,
          description: description.trim() || null,
          event_date: date,
          event_time: eventTime,
          ...typeFields,
        },
        {
          onSuccess: () => {
            toast.success('Event updated');
            onOpenChange(false);
          },
          onError: (err: Error) =>
            toast.error('Could not save the event', { description: err.message }),
        },
      );
      return;
    }

    create.mutate(
      {
        title: trimmed,
        description: description.trim() || null,
        event_date: date,
        event_time: eventTime,
        ...typeFields,
      },
      {
        onSuccess: (event) => {
          // Invitations are a second call on purpose: the event exists either
          // way, so a failure here loses the invitations, not the event.
          if (guests.length > 0) {
            invite.mutate(
              { eventId: event.id, userIds: guests },
              {
                onSuccess: ({ invited }) =>
                  toast.success(
                    `Event created · invited ${invited} ${invited === 1 ? 'person' : 'people'}`,
                  ),
                onError: (err: Error) =>
                  toast.error('Event created, but the invitations failed', {
                    description: err.message,
                  }),
              },
            );
          }
          // Nothing to reset: the next opening mounts a fresh form.
          onOpenChange(false);
        },
        onError: (err: Error) =>
          toast.error('Could not create event', { description: err.message }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit event' : 'New event'}</DialogTitle>
          <DialogDescription>
            {!editing
              ? 'A shoot, an edit, a meeting — or anything else you name.'
              : guestEdit
                ? // Says who owns it and that the change is not quiet. Editing
                  // somebody else's event should feel like an act with an
                  // audience, because it is one.
                  event?.organiser_name
                  ? `This is ${event.organiser_name}’s event. They and everyone going will be told what you changed.`
                  : 'This is not your event. The organiser and everyone going will be told what you changed.'
                : 'Anyone who accepted sees these changes on their own calendar.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="event-title">Title</Label>
            <Input
              id="event-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Reyes wedding — ceremony"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="event-date">Date</Label>
              {/* A native date input: the browser gives a real, localised,
                  keyboard-accessible picker for free. */}
              <Input
                id="event-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="event-time">Time</Label>
              <Input
                id="event-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                disabled={allDay}
              />
            </div>
          </div>

          <div className="-mt-1 flex items-center gap-2">
            <Checkbox
              id="event-all-day"
              checked={allDay}
              onCheckedChange={(checked) => {
                const next = checked === true;
                setAllDay(next);
                // Cleared rather than kept behind the box: unticking it later
                // should not bring back a time that was decided against.
                if (next) setTime('');
              }}
            />
            <Label htmlFor="event-all-day" className="font-normal">
              All day
            </Label>
          </div>

          <div className="grid gap-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as EventType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENT_TYPES.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {type === 'other' && (
              <Input
                id="event-type-other"
                value={otherLabel}
                onChange={(e) => setOtherLabel(e.target.value)}
                placeholder="Client viewing"
                maxLength={40}
                aria-label="What kind of event"
                autoFocus
              />
            )}
          </div>

          {!guestEdit && ownWorkspaces.length > 0 && (
            <div className="grid gap-2">
              <Label htmlFor="event-workspace">Workspace</Label>
              <Select value={workspaceId} onValueChange={setWorkspaceId}>
                <SelectTrigger id="event-workspace">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_WORKSPACE}>None</SelectItem>
                  {ownWorkspaces.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="event-location">Where</Label>
            <LocationField
              id="event-location"
              value={location}
              onChange={setLocation}
              placeholder="Cebu City, or the venue"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="event-description">Notes</Label>
            <Textarea
              id="event-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
              rows={3}
            />
          </div>

          {/* Guests are managed from the event's own Users button once it
              exists, so an edit does not offer to invite anyone. */}
          {!editing && (
            <div className="grid gap-2 border-t pt-3">
              <Label>
                Invite collaborators
                {guests.length > 0 && (
                  <span className="ml-1 font-normal text-muted-foreground">
                    · {guests.length} selected
                  </span>
                )}
              </Label>
              <p className="-mt-1 text-xs text-muted-foreground">
                They choose whether to join. Accepting puts it on their calendar.
              </p>
              <InvitePeople selected={guests} onChange={setGuests} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!title.trim() || !date || needsLabel || pending}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            {editing ? 'Save changes' : 'Create event'}
          </Button>
        </DialogFooter>
      </DialogContent>
      <DiscardChangesDialog guard={guard} />
    </Dialog>
  );
}

type NewReminderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Keyed on the opening, as EventDialog is, so each one starts empty. */
function NewReminderDialog(props: NewReminderDialogProps) {
  const opening = useOpeningKey(props.open);
  return <NewReminderForm key={opening} {...props} />;
}

function NewReminderForm({ open, onOpenChange }: NewReminderDialogProps) {
  const create = useCreateReminder();
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState('');
  const { dirty } = useDiscardGuard({ title, when }, open);
  const guard = useGuardedClose(dirty, onOpenChange);
  const close = guard.close;
  // Refused here, as on the phone: a reminder for a time already gone was
  // saved and then never went off. Judged when the time is picked and again
  // on save, since a form left open can pass the time it holds.
  const [inPast, setInPast] = useState(false);
  const isPast = (value: string) => !!value && new Date(value).getTime() <= Date.now();

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New reminder</DialogTitle>
          <DialogDescription>
            At this time you get an alert here, and a push on your phone if you
            use the Virgo app.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="reminder-title">Title</Label>
            <Input
              id="reminder-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Send the Reyes gallery"
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="reminder-when">When</Label>
            <Input
              id="reminder-when"
              type="datetime-local"
              value={when}
              onChange={(e) => {
                setWhen(e.target.value);
                setInPast(isPast(e.target.value));
              }}
              aria-invalid={inPast || undefined}
            />
            {inPast && (
              <p className="text-xs text-destructive">
                That time has passed. Pick a later one.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button
            disabled={!title.trim() || !when || inPast || create.isPending}
            onClick={() => {
              if (isPast(when)) {
                setInPast(true);
                return;
              }
              create.mutate(
                {
                  title: title.trim(),
                  // datetime-local has no zone; the Date constructor reads it
                  // as local time, which is what the user meant.
                  reminder_time: new Date(when).toISOString(),
                  is_alarm_enabled: true,
                },
                {
                  onSuccess: () => onOpenChange(false),
                  onError: (err: Error) =>
                    toast.error('Could not create reminder', { description: err.message }),
                },
              );
            }}
          >
            {create.isPending && <Loader2 className="size-4 animate-spin" />}
            Create reminder
          </Button>
        </DialogFooter>
      </DialogContent>
      <DiscardChangesDialog guard={guard} />
    </Dialog>
  );
}

/**
 * Invitations waiting on an answer.
 *
 * Its own tab rather than inline on the day: an invitation is not yet part of
 * your schedule, and showing it beside events you have actually committed to
 * would blur the one thing that matters about it — that it needs a decision.
 */
function InvitationsTab() {
  const { invitations, isLoading } = useEventInvitations();
  const respond = useRespondToEventInvitation();
  /** Which invitation is mid-flight, so only its buttons show a spinner. */
  const [answering, setAnswering] = useState<string | null>(null);

  const answer = (eventId: string, accept: boolean, title: string) => {
    setAnswering(eventId);
    respond.mutate(
      { eventId, accept },
      {
        onSuccess: () =>
          toast.success(accept ? `You’re going to ${title}` : 'Invitation declined'),
        onError: (err: Error) =>
          toast.error('Could not send your answer', { description: err.message }),
        onSettled: () => setAnswering(null),
      },
    );
  };

  if (isLoading && invitations.length === 0) return <ListSkeleton rows={2} />;

  if (invitations.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Mail}
          title="No invitations"
          description="When someone invites you to an event, it lands here."
        />
      </Card>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {invitations.map((invitation) => (
        <li key={invitation.id}>
          <Card className="border-primary/30">
            <CardContent className="py-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{invitation.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {labelForDateKey(invitation.event_date)}
                    {invitation.event_time
                      ? ` · ${formatTime(invitation.event_time)}`
                      : ''}
                    {invitation.location ? ` · ${invitation.location}` : ''}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Invited by {invitation.inviter_name}
                  </p>
                </div>
                <Badge variant="secondary" className="shrink-0">
                  {eventTypeLabel(invitation)}
                </Badge>
              </div>

              {invitation.description && (
                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                  {invitation.description}
                </p>
              )}

              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  disabled={answering === invitation.event_id}
                  onClick={() => answer(invitation.event_id, true, invitation.title)}
                >
                  {answering === invitation.event_id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Check className="size-3.5" />
                  )}
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  disabled={answering === invitation.event_id}
                  onClick={() => answer(invitation.event_id, false, invitation.title)}
                >
                  <X className="size-3.5" />
                  Decline
                </Button>
              </div>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}

/**
 * The two reminder lists, as the phone's All reminders screen asks for them.
 *
 * Open ones oldest first, so an overdue reminder is never cut off by the
 * limit; done ones newest first, and only the last few. One list of the
 * first hundred, oldest first, filled up with long-finished reminders and
 * left the ones still waiting off the end.
 */
const OPEN_REMINDERS = {
  is_completed: false,
  orderBy: 'reminder_time',
  direction: 'asc',
  limit: 100,
} as const;
const DONE_REMINDERS = {
  is_completed: true,
  orderBy: 'reminder_time',
  direction: 'desc',
  limit: 30,
} as const;

function reminderWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Every reminder: overdue first, then what is coming, then what was done
 * lately — each with a tick.
 *
 * It was a flat list with a bin and nothing else. A reminder could not be
 * ticked off on the web at all, and one whose time had passed sat among the
 * ones still to come with nothing to say it was late.
 */
function RemindersTab({ onNew }: { onNew: () => void }) {
  const open = useReminders(OPEN_REMINDERS);
  const done = useReminders(DONE_REMINDERS);
  const update = useUpdateReminder();
  const remove = useDeleteReminder();
  const [deleting, setDeleting] = useState<Reminder | null>(null);

  const now = new Date().getTime();
  const overdue = open.reminders.filter((r) => Date.parse(r.reminder_time) < now);
  const upcoming = open.reminders.filter((r) => Date.parse(r.reminder_time) >= now);
  // A tick moves a reminder between the two lists only once both have been
  // read again; until then it stays where it was, ticked, rather than
  // showing twice.
  const openIds = new Set(open.reminders.map((r) => r.id));
  const sections = [
    { key: 'overdue', title: `Overdue · ${overdue.length}`, items: overdue },
    { key: 'upcoming', title: 'Coming up', items: upcoming },
    { key: 'done', title: 'Done lately', items: done.reminders.filter((r) => !openIds.has(r.id)) },
  ].filter((s) => s.items.length > 0);

  const toggle = (reminder: Reminder) =>
    update.mutate(
      { id: reminder.id, is_completed: !reminder.is_completed },
      {
        onError: (err: Error) =>
          toast.error('Could not update the reminder', { description: err.message }),
      },
    );

  if (open.loadFailed && open.reminders.length === 0) {
    // Not "No reminders": that would tell someone their reminders are gone
    // when the request simply never arrived.
    return (
      <ErrorState
        message="Could not load your reminders."
        onRetry={() => {
          void open.refetch();
          void done.refetch();
        }}
      />
    );
  }

  if ((open.isLoading && open.reminders.length === 0) || (sections.length === 0 && done.isLoading)) {
    return <ListSkeleton rows={3} />;
  }

  if (sections.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Bell}
          title="No reminders"
          description="A nudge at a set time: an alert here, and a push on your phone if you use the app."
          action={
            <Button size="sm" onClick={onNew}>
              Add a reminder
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-5">
        {sections.map((section) => (
          <section key={section.key} aria-labelledby={`reminders-${section.key}`}>
            <h3
              id={`reminders-${section.key}`}
              className={cn(
                'mb-2 text-[11px] font-bold uppercase tracking-[0.12em]',
                section.key === 'overdue' ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {section.title}
            </h3>
            <ul className="flex flex-col gap-2">
              {section.items.map((reminder) => (
                <li key={reminder.id}>
                  <Card>
                    <CardContent className="flex items-center gap-3 py-3">
                      <Checkbox
                        checked={reminder.is_completed}
                        onCheckedChange={() => toggle(reminder)}
                        aria-label={`${reminder.title}, done`}
                      />
                      {reminder.is_alarm_enabled ? (
                        <Bell className="size-4 shrink-0 text-primary" aria-hidden />
                      ) : (
                        <BellOff className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      )}
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            'truncate text-sm font-semibold',
                            reminder.is_completed && 'text-muted-foreground line-through',
                          )}
                        >
                          {reminder.title}
                        </p>
                        <p
                          className={cn(
                            'mt-0.5 text-xs',
                            section.key === 'overdue' && !reminder.is_completed
                              ? 'text-destructive'
                              : 'text-muted-foreground',
                          )}
                        >
                          {reminderWhen(reminder.reminder_time)}
                        </p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Delete reminder"
                        onClick={() => setDeleting(reminder)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {/* The bin deleted on the click, with nothing to say it had worked or
          failed — beside a tick now, where a slip is easy. */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this reminder?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.title} is removed, and its alarm will not go off. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!deleting) return;
                remove.mutate(deleting.id, {
                  onError: (err: Error) =>
                    toast.error('Could not delete the reminder', { description: err.message }),
                });
                setDeleting(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** "Organised by Ana Reyes", on an event you are a guest at. */
function OrganisedBy({ event }: { event: ScheduleEvent }) {
  if (!event.organiser_name) return null;
  return (
    <p className="mt-1 truncate text-xs text-muted-foreground">
      Organised by <span className="font-medium text-foreground">{event.organiser_name}</span>
    </p>
  );
}

function ScheduleContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const today = todayKey();
  const [selected, setSelected] = useState(today);
  const [cursor, setCursor] = useState(() => new Date());
  const [creatingEvent, setCreatingEvent] = useState(false);
  /** The workspace a linked "new event" starts in (?workspace=). */
  const [newEventWorkspace, setNewEventWorkspace] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<ScheduleEvent | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; title: string } | null>(
    null,
  );
  const [creatingReminder, setCreatingReminder] = useState(false);
  /** The event whose guest list is open, if any. */
  const [managing, setManaging] = useState<{ id: string; title: string } | null>(
    null,
  );
  const [tab, setTab] = useState('day');
  /** The event a notification pointed at (?event=), until it is on screen. */
  const [linkedEventId, setLinkedEventId] = useState<string | null>(null);

  // ?new=1 and ?date=… let links from anywhere land on the right day, already
  // open. Applied during render whenever the query changes, rather than in an
  // effect, so the page never paints today first and then jumps.
  const linkQuery = searchParams.toString();
  const [appliedQuery, setAppliedQuery] = useState('');
  if (linkQuery !== appliedQuery) {
    setAppliedQuery(linkQuery);
    const date = searchParams.get('date');
    if (date) {
      setSelected(date);
      setCursor(new Date(`${date}T00:00:00`));
    }
    if (searchParams.get('new') === '1') {
      setNewEventWorkspace(searchParams.get('workspace'));
      setCreatingEvent(true);
    }
    // ?tab=invites is where an event-invite notification points, so tapping it
    // lands on the decision rather than on the calendar; ?tab=reminders is a
    // reminder's.
    const wanted = searchParams.get('tab');
    if (wanted && TABS.includes(wanted)) setTab(wanted);
    // ?event= is an answer or a change to one event. Its date is not in the
    // link, so it is read first and the day is chosen once it arrives.
    const linked = searchParams.get('event');
    if (linked) setLinkedEventId(linked);
  }

  // Cleared afterwards so a refresh does not reopen the dialog.
  useEffect(() => {
    if (
      searchParams.get('date') ||
      searchParams.get('new') ||
      searchParams.get('tab') ||
      searchParams.get('event')
    ) {
      router.replace('/schedule');
    }
  }, [searchParams, router]);

  const weeks = useMemo(
    () => getMonthWeeks(cursor.getFullYear(), cursor.getMonth()),
    [cursor],
  );

  /*
   * The days the grid draws, and the weeks ahead — not the account's 100
   * oldest events.
   *
   * Both used to come from one list of the 100 earliest, ordered by date, so
   * an account with a past behind it saw nothing this month or later and
   * Upcoming sat empty. The phone made the same change: the grid asks for
   * exactly the days it shows, and Upcoming for the next 60 days.
   */
  const { events, isLoading } = useScheduleEventRange(
    weeks[0]?.[0]?.key,
    weeks[weeks.length - 1]?.[6]?.key,
  );
  const [soonWindow] = useState(() => {
    const end = new Date();
    end.setDate(end.getDate() + 60);
    return { from: todayKey(), to: dateToKey(end) };
  });
  const { events: soonEvents, isLoading: soonLoading } = useScheduleEventRange(
    soonWindow.from,
    soonWindow.to,
  );
  const { invitations } = useEventInvitations();
  // The same query as the Reminders tab's, so this costs no second request.
  const { reminders } = useReminders(OPEN_REMINDERS);
  const removeEvent = useDeleteScheduleEvent();
  const respond = useRespondToEventInvitation();
  /** An accepted event a guest is backing out of. */
  const [leaving, setLeaving] = useState<{ id: string; title: string } | null>(null);

  // The linked event, read on its own: it may be outside the month on screen,
  // or the list may not have arrived yet.
  const linkedQuery = useScheduleEvent(linkedEventId ?? undefined);
  // Not once a read of it fails: deleted from here, it would otherwise stay
  // on its day from the copy held before.
  const linkedEvent =
    !linkedQuery.isError && linkedQuery.data?.id === linkedEventId ? linkedQuery.data : null;
  /** The event shown picked out on its day, once the link has been followed. */
  const [highlighted, setHighlighted] = useState<string | null>(null);
  if (linkedEvent && highlighted !== linkedEvent.id) {
    setHighlighted(linkedEvent.id);
    setSelected(linkedEvent.event_date);
    setCursor(new Date(`${linkedEvent.event_date}T00:00:00`));
    setTab('day');
  }
  // Only before it was shown: a failure after that is the event being deleted
  // from this page, which needs no telling.
  const linkedFailed = linkedQuery.isError && !!linkedEventId && highlighted !== linkedEventId;
  useEffect(() => {
    // Deleted since, or you are no longer on it. Said, rather than landing on
    // today as though the link had worked.
    if (linkedFailed) toast.error('That event is no longer on your schedule');
  }, [linkedFailed]);
  useEffect(() => {
    if (!highlighted) return;
    document
      .getElementById(`schedule-event-${highlighted}`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [highlighted]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, typeof events> = {};
    for (const event of events) {
      (map[event.event_date] ??= []).push(event);
    }
    return map;
  }, [events]);

  const now = new Date();
  const listedForDay = eventsByDate[selected] ?? [];
  // The linked event joins its day even when the list does not hold it, so
  // following a notification never lands on "Nothing on this day".
  const dayEvents =
    linkedEvent &&
    linkedEvent.event_date === selected &&
    !listedForDay.some((e) => e.id === linkedEvent.id)
      ? [...listedForDay, linkedEvent]
      : listedForDay;
  const upcoming = soonEvents
    .filter((e) => isEventUpcoming(e.event_date, e.event_time, now))
    .sort((a, b) =>
      `${a.event_date}${a.event_time ?? ''}`.localeCompare(
        `${b.event_date}${b.event_time ?? ''}`,
      ),
    );

  const shiftMonth = (by: number) =>
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + by, 1));

  return (
    <AppShell title="Schedule">
      <PageHeader
        title="Schedule"
        // Coming up rather than a total: the page no longer holds every event,
        // and the count that matters is what is ahead.
        description={`${upcoming.length} coming up · ${reminders.length} reminder${reminders.length === 1 ? '' : 's'}`}
        actions={
          <>
            <Button variant="outline" onClick={() => setCreatingReminder(true)}>
              <Bell className="size-4" />
              Reminder
            </Button>
            <Button onClick={() => setCreatingEvent(true)}>
              <Plus className="size-4" />
              New event
            </Button>
          </>
        }
      />

      <div className="mx-auto grid w-full max-w-6xl gap-6 px-6 py-6 lg:grid-cols-[1fr_20rem]">
        {/* Calendar */}
        <Card className="h-fit">
          <CardContent className="py-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold">
                {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
              </h2>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" onClick={() => shiftMonth(-1)} aria-label="Previous month">
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setCursor(new Date());
                    setSelected(today);
                  }}
                >
                  Today
                </Button>
                <Button size="icon" variant="ghost" onClick={() => shiftMonth(1)} aria-label="Next month">
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {DAYS.map((day) => (
                <div
                  key={day}
                  className="pb-1 text-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
                >
                  {day}
                </div>
              ))}
              {weeks.flat().map((cell) => {
                const dots = dayDots(eventsByDate[cell.key] ?? []);
                const isSelected = cell.key === selected;
                return (
                  <button
                    key={cell.key}
                    onClick={() => setSelected(cell.key)}
                    className={cn(
                      'relative aspect-square rounded-lg text-sm transition-colors',
                      cell.isOutside && 'text-muted-foreground/40',
                      isSelected
                        ? 'bg-primary font-bold text-primary-foreground'
                        : 'hover:bg-accent',
                      cell.isToday && !isSelected && 'font-bold text-primary',
                    )}
                  >
                    {cell.day}
                    {dots.colors.length > 0 && (
                      <span className="absolute inset-x-0 bottom-1 flex items-center justify-center gap-[3px]">
                        {dots.colors.map((color, i) => (
                          <span
                            key={i}
                            // A selected cell is filled with `primary`, and a
                            // type colour on top of that can disappear. The
                            // fill already says which day is selected, so the
                            // dots only have to stay visible.
                            className={cn('rounded-full', isSelected && 'bg-primary-foreground')}
                            style={{
                              width: DAY_DOT_SIZE,
                              height: DAY_DOT_SIZE,
                              opacity: cell.isOutside ? 0.4 : 1,
                              ...(isSelected ? {} : { backgroundColor: color }),
                            }}
                          />
                        ))}
                        {dots.overflow > 0 && (
                          <span
                            className={cn(
                              'text-[9px] font-bold leading-none',
                              isSelected ? 'text-primary-foreground' : 'text-muted-foreground',
                            )}
                          >
                            +{dots.overflow}
                          </span>
                        )}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Day detail + lists */}
        <div className="min-w-0">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full">
              <TabsTrigger value="day" className="flex-1">
                {labelForDateKey(selected)}
              </TabsTrigger>
              <TabsTrigger value="upcoming" className="flex-1">
                Upcoming
              </TabsTrigger>
              <TabsTrigger value="invites" className="flex-1">
                Invites
                {invitations.length > 0 && (
                  <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                    {invitations.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="reminders" className="flex-1">
                Reminders
              </TabsTrigger>
            </TabsList>

            <TabsContent value="day" className="mt-4">
              {/* Each month is its own fetch now, so a month still on its way
                  is not "Nothing on this day". */}
              {isLoading && dayEvents.length === 0 ? (
                <ListSkeleton rows={2} />
              ) : dayEvents.length === 0 ? (
                <Card>
                  <EmptyState
                    icon={CalendarDays}
                    title="Nothing on this day"
                    action={
                      <Button size="sm" onClick={() => setCreatingEvent(true)}>
                        Add an event
                      </Button>
                    }
                  />
                </Card>
              ) : (
                <ul className="flex flex-col gap-2">
                  {dayEvents.map((event) => {
                    // Undefined on a just-created event, which is always yours.
                    const mine = event.is_owner !== false;
                    return (
                      <li key={event.id} id={`schedule-event-${event.id}`}>
                        <Card
                          className={cn(
                            event.id === highlighted && 'border-primary ring-2 ring-primary/30',
                          )}
                        >
                          <CardContent className="flex items-start gap-3 py-3">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold">{event.title}</p>
                              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                                {event.event_time ? formatTime(event.event_time) : 'All day'}
                                {event.location && (
                                  <>
                                    <span aria-hidden>·</span>
                                    <MapPin className="size-3 shrink-0" />
                                    <span className="truncate">{event.location}</span>
                                  </>
                                )}
                              </p>
                              {event.description && (
                                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                  {event.description}
                                </p>
                              )}
                              {!mine && <OrganisedBy event={event} />}
                              {/* A guest too: who else is going is theirs to
                                  read, and was never shown. Read-only either
                                  way — managing it is the Users button. */}
                              <span className="mt-1 block">
                                <AttendeeSummary eventId={event.id} />
                              </span>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              <Badge variant="secondary">
                                {eventTypeLabel(event)}
                              </Badge>
                              {!mine && (
                                <Badge variant="outline" className="text-[10px]">
                                  Guest
                                </Badge>
                              )}
                            </div>
                            {/* Editing is open to anyone on the event. If this
                                row is in your list at all you either own it or
                                accepted an invitation to it — the API scopes
                                the read to exactly those two — so no extra
                                flag is needed to know you may change it. */}
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="Edit event"
                              onClick={() => setEditingEvent(event)}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            {/* The guest list and deleting stay with whoever
                                created it. */}
                            {mine ? (
                              <>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  aria-label="Manage who is invited"
                                  onClick={() =>
                                    setManaging({ id: event.id, title: event.title })
                                  }
                                >
                                  <Users className="size-3.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  aria-label="Delete event"
                                  onClick={() =>
                                    setDeleting({ id: event.id, title: event.title })
                                  }
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </>
                            ) : (
                              // A guest who accepted could not back out short of
                              // asking the organiser. The API takes a decline
                              // after an accept; this is the button for it.
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label="Can't make it"
                                title="Can't make it"
                                onClick={() =>
                                  setLeaving({ id: event.id, title: event.title })
                                }
                              >
                                <LogOut className="size-3.5" />
                              </Button>
                            )}
                          </CardContent>
                        </Card>
                      </li>
                    );
                  })}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="upcoming" className="mt-4">
              {soonLoading && soonEvents.length === 0 ? (
                <ListSkeleton rows={3} />
              ) : upcoming.length === 0 ? (
                <Card>
                  <EmptyState
                    icon={CalendarDays}
                    title="Nothing upcoming"
                    description="Nothing in the next 60 days. Later events are on the calendar."
                  />
                </Card>
              ) : (
                <ul className="flex flex-col gap-2">
                  {upcoming.map((event) => (
                    <li key={event.id}>
                      <button
                        className="w-full text-left"
                        onClick={() => {
                          setSelected(event.event_date);
                          setCursor(new Date(`${event.event_date}T00:00:00`));
                        }}
                      >
                        <Card className="transition-colors hover:border-primary/40">
                          <CardContent className="py-3">
                            <p className="truncate text-sm font-semibold">{event.title}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {labelForDateKey(event.event_date)}
                              {event.event_time ? ` · ${formatTime(event.event_time)}` : ''}
                            </p>
                            {event.is_owner === false && (
                              <>
                                <OrganisedBy event={event} />
                                <Badge variant="outline" className="mt-1 text-[10px]">
                                  Guest
                                </Badge>
                              </>
                            )}
                            <span className="mt-1 block">
                              <AttendeeSummary eventId={event.id} />
                            </span>
                          </CardContent>
                        </Card>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="invites" className="mt-4">
              <InvitationsTab />
            </TabsContent>

            <TabsContent value="reminders" className="mt-4">
              <RemindersTab onNew={() => setCreatingReminder(true)} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <EventDialog
        open={creatingEvent}
        onOpenChange={(next) => {
          setCreatingEvent(next);
          if (!next) setNewEventWorkspace(null);
        }}
        defaultDate={selected}
        defaultWorkspaceId={newEventWorkspace}
      />
      {editingEvent && (
        <EventDialog
          open
          onOpenChange={(next) => !next && setEditingEvent(null)}
          defaultDate={selected}
          event={editingEvent}
        />
      )}
      <NewReminderDialog open={creatingReminder} onOpenChange={setCreatingReminder} />
      {/* Deleting an event was immediate and irreversible, with no undo and
          no trace — one mis-aimed click on a phone-sized target destroyed a
          booking and everyone's invitations to it. */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this event?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.title} will be removed from your schedule and from the
              calendar of everyone who accepted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!deleting) return;
                removeEvent.mutate(deleting.id, {
                  onError: (err: Error) =>
                    toast.error('Could not delete the event', {
                      description: err.message,
                    }),
                });
                setDeleting(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!leaving} onOpenChange={(o) => !o && setLeaving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Can&rsquo;t make it?</AlertDialogTitle>
            <AlertDialogDescription>
              The organiser is told, and {leaving?.title ?? 'the event'} leaves your
              schedule.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={respond.isPending}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              disabled={respond.isPending}
              onClick={(event) => {
                // Open until it settles, so a failure is reported.
                event.preventDefault();
                if (!leaving) return;
                respond.mutate(
                  { eventId: leaving.id, accept: false },
                  {
                    onSuccess: () => {
                      setLeaving(null);
                      toast.success('Taken off your schedule');
                    },
                    onError: (err: Error) =>
                      toast.error('Could not change that', { description: err.message }),
                  },
                );
              }}
            >
              {respond.isPending && <Loader2 className="size-4 animate-spin" />}
              Can&rsquo;t make it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {managing && (
        <ManageAttendeesDialog
          eventId={managing.id}
          eventTitle={managing.title}
          open
          onOpenChange={(next) => !next && setManaging(null)}
        />
      )}
    </AppShell>
  );
}

export default function SchedulePage() {
  return (
    <Suspense fallback={null}>
      <ScheduleContent />
    </Suspense>
  );
}
