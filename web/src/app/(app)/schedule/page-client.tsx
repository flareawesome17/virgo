'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Bell,
  BellOff,
  BellPlus,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  Pencil,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { PageHeader, Screen } from '@/components/app-shell';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  useDeleteScheduleEvent,
  useEventInvitations,
  useRespondToEventInvitation,
  useScheduleEvent,
  useScheduleEventRange,
} from '@/hooks/useScheduleEvents';
import type { Reminder, ScheduleEvent } from '@/api';
import { AttendeeSummary, ManageAttendeesDialog } from '@/components/event-invites';
import { useDeleteReminder, useReminders, useUpdateReminder } from '@/hooks/useReminders';
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
import { EventDialog } from '@/components/schedule/event-dialog';
import { NewReminderDialog } from '@/components/schedule/reminder-dialog';

/** Tab values that ?tab= may name. Anything else is ignored. */
const TABS = ['day', 'upcoming', 'invites', 'reminders'];

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
 * "For Reyes wedding", on a reminder made for an event.
 *
 * A reminder carries only the event's id. The page already holds most events
 * it could name, so those are used as they are; the rest — an overdue
 * reminder's event from months back — are read one by one.
 */
function ReminderEvent({ eventId, known }: { eventId: string; known?: ScheduleEvent }) {
  const { data } = useScheduleEvent(known ? undefined : eventId);
  const event = known ?? data;
  return (
    <span className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
      <CalendarDays className="size-3 shrink-0" aria-hidden />
      {/* Still for an event while it loads, or when you can no longer see it. */}
      <span className="truncate">{event ? `For ${event.title}` : 'For an event'}</span>
    </span>
  );
}

/**
 * Every reminder: overdue first, then what is coming, then what was done
 * lately — each with a tick.
 *
 * It was a flat list with a bin and nothing else. A reminder could not be
 * ticked off on the web at all, and one whose time had passed sat among the
 * ones still to come with nothing to say it was late.
 */
function RemindersTab({
  onNew,
  knownEvents,
}: {
  onNew: () => void;
  /** The events the page already holds, by id, for naming a reminder's. */
  knownEvents: Map<string, ScheduleEvent>;
}) {
  const open = useReminders(OPEN_REMINDERS);
  const done = useReminders(DONE_REMINDERS);
  const update = useUpdateReminder();
  const remove = useDeleteReminder();
  const [deleting, setDeleting] = useState<Reminder | null>(null);
  // A reminder could not be changed here at all: a wrong time meant deleting
  // it and starting again. Clicking it opens the same form it was made with.
  const [editing, setEditing] = useState<Reminder | null>(null);

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
                  <Card className="transition-colors hover:border-primary/40">
                    <CardContent className="flex items-center gap-3 py-3">
                      <Checkbox
                        checked={reminder.is_completed}
                        onCheckedChange={() => toggle(reminder)}
                        aria-label={`${reminder.title}, done`}
                      />
                      {/* The tick and the bin sit outside it, so neither
                          opens the form on the way. */}
                      <button
                        type="button"
                        aria-haspopup="dialog"
                        onClick={() => setEditing(reminder)}
                        className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {reminder.is_alarm_enabled ? (
                          <Bell className="size-4 shrink-0 text-primary" aria-hidden />
                        ) : (
                          <BellOff className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        )}
                        <span className="block min-w-0 flex-1">
                          <span
                            className={cn(
                              'block truncate text-sm font-semibold',
                              reminder.is_completed && 'text-muted-foreground line-through',
                            )}
                          >
                            {reminder.title}
                          </span>
                          <span
                            className={cn(
                              'mt-0.5 block text-xs',
                              section.key === 'overdue' && !reminder.is_completed
                                ? 'text-destructive'
                                : 'text-muted-foreground',
                            )}
                          >
                            {reminderWhen(reminder.reminder_time)}
                          </span>
                          {reminder.schedule_event_id && (
                            <ReminderEvent
                              eventId={reminder.schedule_event_id}
                              known={knownEvents.get(reminder.schedule_event_id)}
                            />
                          )}
                        </span>
                      </button>
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

      {editing && (
        <NewReminderDialog
          open
          onOpenChange={(next) => !next && setEditing(null)}
          reminder={editing}
          event={
            editing.schedule_event_id ? knownEvents.get(editing.schedule_event_id) : undefined
          }
        />
      )}
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
  /** The event a new reminder is being made for: its card's Remind me. */
  const [remindingFor, setRemindingFor] = useState<ScheduleEvent | null>(null);
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

  // Every event the page already holds, so a reminder can name the one it is
  // for without reading it again.
  const knownEvents = useMemo(() => {
    const map = new Map<string, ScheduleEvent>();
    for (const event of [...soonEvents, ...events]) map.set(event.id, event);
    return map;
  }, [events, soonEvents]);

  // The open reminders for each event, soonest first as they are listed, so
  // an event's card can say one is set rather than invite a second by
  // accident.
  const remindersByEvent = useMemo(() => {
    const map = new Map<string, Reminder[]>();
    for (const reminder of reminders) {
      if (!reminder.schedule_event_id) continue;
      const list = map.get(reminder.schedule_event_id);
      if (list) list.push(reminder);
      else map.set(reminder.schedule_event_id, [reminder]);
    }
    return map;
  }, [reminders]);

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
    <Screen title="Schedule">
      <PageHeader
        title="Schedule"
        // Coming up rather than a total: the page no longer holds every event,
        // and the count that matters is what is ahead.
        description={`${upcoming.length} coming up · ${reminders.length} reminder${reminders.length === 1 ? '' : 's'}`}
        // New event and New reminder are the bar's Create, as on the phone.
        // The empty states keep theirs, and ?new=1 still opens a new event.
      />

      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 sm:px-6 py-6 lg:grid-cols-[1fr_20rem]">
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
                    const eventReminders = remindersByEvent.get(event.id) ?? [];
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
                              {eventReminders.length > 0 && (
                                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                                  <Bell className="size-3 shrink-0 text-primary" aria-hidden />
                                  <span className="truncate">
                                    {eventReminders.length === 1
                                      ? `Reminder · ${reminderWhen(eventReminders[0].reminder_time)}`
                                      : `${eventReminders.length} reminders · first ${reminderWhen(eventReminders[0].reminder_time)}`}
                                  </span>
                                </p>
                              )}
                              {/* A reminder is only ever yours, so a guest
                                  sets one as freely as the organiser — the
                                  phone's event screen offers it to both. A
                                  word rather than one more icon: the row of
                                  them already leaves the title little room. */}
                              <Button
                                size="xs"
                                variant="link"
                                className="mt-1 h-auto px-0"
                                onClick={() => setRemindingFor(event)}
                              >
                                <BellPlus />
                                Remind me
                              </Button>
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
              <RemindersTab
                onNew={() => setCreatingReminder(true)}
                knownEvents={knownEvents}
              />
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
      {remindingFor && (
        <NewReminderDialog
          open
          onOpenChange={(next) => !next && setRemindingFor(null)}
          event={remindingFor}
        />
      )}
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
    </Screen>
  );
}

export default function SchedulePage() {
  return (
    <Suspense fallback={null}>
      <ScheduleContent />
    </Suspense>
  );
}
