'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Bell,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
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
import { EmptyState, ListSkeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  useScheduleEvents,
  useUpdateScheduleEvent,
} from '@/hooks/useScheduleEvents';
import type { ScheduleEvent } from '@/api';
import {
  AttendeeSummary,
  InvitePeople,
  ManageAttendeesDialog,
} from '@/components/event-invites';
import { useCreateReminder, useDeleteReminder, useReminders } from '@/hooks/useReminders';
import {
  DAY_DOT_SIZE,
  DAYS,
  MONTHS,
  dayDots,
  eventTypeLabel,
  formatTime,
  getMonthWeeks,
  isEventUpcoming,
  labelForDateKey,
  todayKey,
} from '@/lib/calendar';
import type { EventType } from '@/api';
import { LocationField } from '@/components/location-field';

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

function EventDialog({
  open,
  onOpenChange,
  defaultDate,
  event,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate: string;
  /** Present to edit that event; absent to create a new one. */
  event?: ScheduleEvent;
}) {
  const create = useCreateScheduleEvent();
  const update = useUpdateScheduleEvent();
  const invite = useInviteToEvent();
  const editing = Boolean(event);
  /** Editing something somebody else created. Undefined means just-created. */
  const guestEdit = editing && event?.is_owner === false;
  const pending = editing ? update.isPending : create.isPending;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState('');
  const [type, setType] = useState<EventType>('event');
  const [otherLabel, setOtherLabel] = useState('');
  const [location, setLocation] = useState('');
  const [guests, setGuests] = useState<string[]>([]);

  // An "other" event is only half-described until it is named, so the save
  // button waits for the name the same way it waits for the title.
  const needsLabel = type === 'other' && !otherLabel.trim();

  // Refilled on every open, not just mount: one dialog instance serves
  // whichever event the pencil was pressed on, so without this you would be
  // editing the previous event's values.
  useEffect(() => {
    if (!open) return;
    if (event) {
      setTitle(event.title);
      setDescription(event.description ?? '');
      setDate(event.event_date);
      // Postgres `time` comes back as HH:MM:SS; <input type="time"> wants HH:MM
      // and silently renders empty otherwise.
      setTime(event.event_time ? event.event_time.slice(0, 5) : '');
      setType(event.event_type as EventType);
      setOtherLabel(event.event_type_other ?? '');
      setLocation(event.location ?? '');
    } else {
      setDate(defaultDate);
    }
  }, [open, event, defaultDate]);

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
    };

    if (event) {
      update.mutate(
        {
          id: event.id,
          title: trimmed,
          description: description.trim() || null,
          event_date: date,
          event_time: time || null,
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
        event_time: time || null,
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
          onOpenChange(false);
          setTitle('');
          setDescription('');
          setTime('');
          setOtherLabel('');
          setLocation('');
          setGuests([]);
        },
        onError: (err: Error) =>
          toast.error('Could not create event', { description: err.message }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                  'This is not your event. The organiser and everyone going will be told what you changed.'
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
              />
            </div>
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
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
    </Dialog>
  );
}

function NewReminderDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateReminder();
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState('');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New reminder</DialogTitle>
          <DialogDescription>
            The mobile app alarms at this time, and the server pushes it too.
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
              onChange={(e) => setWhen(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!title.trim() || !when || create.isPending}
            onClick={() =>
              create.mutate(
                {
                  title: title.trim(),
                  // datetime-local has no zone; the Date constructor reads it
                  // as local time, which is what the user meant.
                  reminder_time: new Date(when).toISOString(),
                  is_alarm_enabled: true,
                },
                {
                  onSuccess: () => {
                    onOpenChange(false);
                    setTitle('');
                    setWhen('');
                  },
                  onError: (err: Error) =>
                    toast.error('Could not create reminder', { description: err.message }),
                },
              )
            }
          >
            {create.isPending && <Loader2 className="size-4 animate-spin" />}
            Create reminder
          </Button>
        </DialogFooter>
      </DialogContent>
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

function ScheduleContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const today = todayKey();
  const [selected, setSelected] = useState(today);
  const [cursor, setCursor] = useState(() => new Date());
  const [creatingEvent, setCreatingEvent] = useState(false);
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

  // ?new=1 and ?date=… let links from anywhere land on the right day, already
  // open. Cleared afterwards so a refresh does not reopen the dialog.
  useEffect(() => {
    const date = searchParams.get('date');
    if (date) {
      setSelected(date);
      setCursor(new Date(`${date}T00:00:00`));
    }
    if (searchParams.get('new') === '1') setCreatingEvent(true);
    // ?tab=invites is where an event-invite notification points, so tapping it
    // lands on the decision rather than on the calendar.
    const wanted = searchParams.get('tab');
    if (wanted && TABS.includes(wanted)) setTab(wanted);
    if (date || searchParams.get('new') || wanted) router.replace('/schedule');
  }, [searchParams, router]);

  const { events, isLoading } = useScheduleEvents({ limit: 100 });
  const { invitations } = useEventInvitations();
  const { reminders } = useReminders({ orderBy: 'reminder_time', direction: 'asc', limit: 100 });
  const removeEvent = useDeleteScheduleEvent();
  const removeReminder = useDeleteReminder();

  const weeks = useMemo(
    () => getMonthWeeks(cursor.getFullYear(), cursor.getMonth()),
    [cursor],
  );

  const eventsByDate = useMemo(() => {
    const map: Record<string, typeof events> = {};
    for (const event of events) {
      (map[event.event_date] ??= []).push(event);
    }
    return map;
  }, [events]);

  const now = new Date();
  const dayEvents = eventsByDate[selected] ?? [];
  const upcoming = events
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
        description={`${events.length} event${events.length === 1 ? '' : 's'} · ${reminders.length} reminder${reminders.length === 1 ? '' : 's'}`}
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
              {dayEvents.length === 0 ? (
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
                      <li key={event.id}>
                        <Card>
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
                              {mine && (
                                <span className="mt-1 block">
                                  <AttendeeSummary eventId={event.id} />
                                </span>
                              )}
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
                            ) : null}
                          </CardContent>
                        </Card>
                      </li>
                    );
                  })}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="upcoming" className="mt-4">
              {isLoading && events.length === 0 ? (
                <ListSkeleton rows={3} />
              ) : upcoming.length === 0 ? (
                <Card>
                  <EmptyState icon={CalendarDays} title="Nothing upcoming" />
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
                            {event.is_owner !== false ? (
                              <span className="mt-1 block">
                                <AttendeeSummary eventId={event.id} />
                              </span>
                            ) : (
                              <Badge variant="outline" className="mt-1 text-[10px]">
                                Guest
                              </Badge>
                            )}
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
              {reminders.length === 0 ? (
                <Card>
                  <EmptyState
                    icon={Bell}
                    title="No reminders"
                    description="Reminders alarm on your phone even with no connection."
                    action={
                      <Button size="sm" onClick={() => setCreatingReminder(true)}>
                        Add a reminder
                      </Button>
                    }
                  />
                </Card>
              ) : (
                <ul className="flex flex-col gap-2">
                  {reminders.map((reminder) => (
                    <li key={reminder.id}>
                      <Card>
                        <CardContent className="flex items-center gap-3 py-3">
                          <Bell className="size-4 shrink-0 text-primary" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{reminder.title}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {new Date(reminder.reminder_time).toLocaleString('en-US', {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })}
                            </p>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Delete reminder"
                            onClick={() => removeReminder.mutate(reminder.id)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </CardContent>
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <EventDialog
        open={creatingEvent}
        onOpenChange={setCreatingEvent}
        defaultDate={selected}
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
