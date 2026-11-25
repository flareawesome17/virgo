'use client';

import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Bell,
  BellOff,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  LogOut,
  Mail,
  Pencil,
  Trash2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { PageHeader, Screen } from '@/components/app-shell';
import { EmptyState, ErrorState } from '@/components/states';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
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
import { AttendeeCount, ManageAttendeesDialog, initials } from '@/components/event-invites';
import { startsIn } from '@/components/home/use-home';
import { CARD, DateTile, Pill, TimeTile, dateTileParts } from '@/components/kit';
import { useDeleteReminder, useReminders, useUpdateReminder } from '@/hooks/useReminders';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import {
  DAY_DOT_SIZE,
  DAYS,
  dayDots,
  dateToKey,
  eventTypeLabel,
  formatTime,
  getMonthWeeks,
  isEventUpcoming,
  labelForDateKey,
  parseDateKey,
  todayKey,
} from '@/lib/calendar';
import { EventDialog } from '@/components/schedule/event-dialog';
import { EventPanel } from '@/components/schedule/event-panel';
import {
  HeadLink,
  KindLine,
  ROWS,
  ReminderEvent,
  ReminderRow,
  RowsSkeleton,
  SectionHead,
  dayTitle,
  eventLine,
  reminderWhen,
  timeTileParts,
} from '@/components/schedule/parts';
import { NewReminderDialog } from '@/components/schedule/reminder-dialog';

/**
 * What the right-hand column shows: the picked day with what follows it, or
 * one whole list with a way back. ?tab= may name any of them.
 */
type View = 'day' | 'upcoming' | 'reminders';

/** How many events Coming up shows before "See all". */
const SOON_SHOWN = 3;
/** How many reminders the page shows before "See all". */
const REMINDERS_SHOWN = 4;

/** Decline and Accept, the size of the bar's own buttons. */
const ANSWER = 'h-9 rounded-[10px] px-3.5 text-sm font-semibold';

/** A row with nothing in it to open: an empty list, said in one line. */
const QUIET_ROW = cn(CARD, 'flex min-h-[52px] items-center px-4 py-2 text-sm text-muted-foreground');

/**
 * Invitations waiting on an answer, above the day.
 *
 * They had a tab of their own, which kept them out of sight until somebody
 * thought to look there. An invitation is the one thing on this page that
 * needs a decision, so it leads the column, as on the phone, and takes no
 * room at all when there is none.
 */
function Invitations({ linked, className }: { linked: boolean; className?: string }) {
  const { invitations, isLoading } = useEventInvitations();
  const respond = useRespondToEventInvitation();
  /** Which invitation is mid-flight, so only its buttons show a spinner. */
  const [answering, setAnswering] = useState<string | null>(null);
  const section = useRef<HTMLElement>(null);

  // A notification's link lands here. In a narrow window the month sits above
  // the invitation, so the invitation is brought into view.
  const waiting = invitations.length > 0;
  useEffect(() => {
    if (linked && waiting) section.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [linked, waiting]);

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

  if (!waiting) {
    // Said only to somebody who followed a link to one that has since been
    // withdrawn or answered. Otherwise no invitations is no card.
    if (!linked || isLoading) return null;
    return (
      <div className={cn(CARD, 'flex min-h-[60px] items-center gap-3 px-3 py-2.5', className)}>
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-secondary-foreground">
          <Mail aria-hidden className="size-[18px]" />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-sm font-semibold">No invitations</span>
          <span className="text-[13px] text-muted-foreground">
            When someone invites you to an event, it lands here.
          </span>
        </span>
      </div>
    );
  }

  return (
    <section ref={section} aria-label="Invitations" className={className}>
      <ul className={ROWS}>
        {invitations.map((invitation) => {
          const busy = answering === invitation.event_id;
          const facts = [
            eventTypeLabel(invitation),
            dayTitle(invitation.event_date),
            invitation.event_time ? formatTime(invitation.event_time) : 'the whole day',
            invitation.location?.trim(),
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <li key={invitation.id} className="flex flex-wrap items-center gap-3 py-3 pl-4 pr-3">
              <Avatar className="size-9">
                <AvatarFallback className="text-[13px] font-bold">
                  {initials(invitation.inviter_name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-[1_1_240px] flex-col">
                <p className="text-sm font-semibold [overflow-wrap:anywhere]">
                  {invitation.inviter_name} invited you to {invitation.title}
                </p>
                <KindLine event={invitation}>{facts}</KindLine>
                {invitation.description && (
                  <p className="mt-0.5 line-clamp-2 text-[13px] text-muted-foreground">
                    {invitation.description}
                  </p>
                )}
              </div>
              <Button
                variant="secondary"
                className={ANSWER}
                disabled={busy}
                onClick={() => answer(invitation.event_id, false, invitation.title)}
              >
                Decline
              </Button>
              {/* Dark, not terracotta: the page's one filled button is the
                  bar's Create. */}
              <Button
                className={cn(ANSWER, 'bg-foreground text-background hover:bg-foreground/85')}
                disabled={busy}
                onClick={() => answer(invitation.event_id, true, invitation.title)}
              >
                {busy && <Loader2 className="size-4 animate-spin" />}
                Accept
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
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

/** Ticks a reminder off, or back on, and says so when the server refuses. */
function useToggleReminder() {
  const update = useUpdateReminder();
  return (reminder: Reminder) =>
    update.mutate(
      { id: reminder.id, is_completed: !reminder.is_completed },
      {
        onError: (err: Error) =>
          toast.error('Could not update the reminder', { description: err.message }),
      },
    );
}

/**
 * The next few reminders, under the month.
 *
 * Their own, not only from inside an event: a reminder to back up a card or
 * send an invoice belongs to no event. They sat behind a tab; what is late
 * is said here now, where the page opens, and the rest is one click away.
 */
function RemindersGlance({
  knownEvents,
  onSeeAll,
  onNew,
  className,
}: {
  /** The events the page already holds, by id, for the form of a reminder made for one. */
  knownEvents: Map<string, ScheduleEvent>;
  onSeeAll: () => void;
  onNew: () => void;
  className?: string;
}) {
  // The same query as the whole list's, so opening that costs no second read.
  const open = useReminders(OPEN_REMINDERS);
  const toggle = useToggleReminder();
  const [editing, setEditing] = useState<Reminder | null>(null);

  const now = new Date().getTime();
  const isLate = (r: Reminder) => !r.is_completed && Date.parse(r.reminder_time) < now;
  const overdue = open.reminders.filter(isLate).length;
  // Oldest first as they are listed, so what is late leads.
  const shown = open.reminders.slice(0, REMINDERS_SHOWN);

  return (
    <section aria-labelledby="schedule-reminders" className={className}>
      <SectionHead id="schedule-reminders" title="Reminders">
        <HeadLink aria-label="See all reminders" onClick={onSeeAll}>
          See all
        </HeadLink>
        <HeadLink aria-label="New reminder" onClick={onNew}>
          New
        </HeadLink>
      </SectionHead>

      {overdue > 0 && (
        <button
          type="button"
          onClick={onSeeAll}
          className="mb-2.5 flex min-h-10 w-full items-center gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-left text-[13px] font-semibold text-destructive outline-none transition-opacity hover:opacity-80 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Clock aria-hidden className="size-4 shrink-0" />
          {overdue} overdue. Tick {overdue === 1 ? 'it' : 'them'} off, or move{' '}
          {overdue === 1 ? 'it' : 'them'}.
        </button>
      )}

      {open.loadFailed && open.reminders.length === 0 ? (
        // Not "No reminders set": that would tell someone their reminders are
        // gone when the request simply never arrived.
        <ErrorState message="Could not load your reminders." onRetry={() => void open.refetch()} />
      ) : open.isLoading && open.reminders.length === 0 ? (
        <RowsSkeleton rows={2} />
      ) : shown.length === 0 ? (
        <p className={QUIET_ROW}>No reminders set</p>
      ) : (
        <ul className={ROWS}>
          {shown.map((reminder) => (
            <ReminderRow
              key={reminder.id}
              reminder={reminder}
              late={isLate(reminder)}
              onToggle={() => toggle(reminder)}
              onOpen={() => setEditing(reminder)}
            />
          ))}
        </ul>
      )}

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
    </section>
  );
}

/** A whole list's title, with the way back to the day beside it. */
function ListHead({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children?: ReactNode;
}) {
  const head = useRef<HTMLDivElement>(null);
  // "See all" can sit below where its list then opens: under the month, in
  // one column. The list is brought to the reader, not left above them.
  useEffect(() => {
    head.current?.scrollIntoView({ block: 'nearest' });
  }, []);

  return (
    <div ref={head} className="mb-2.5 flex scroll-mt-4 items-center gap-1.5">
      <Button
        variant="ghost"
        size="icon"
        className="-ml-2 rounded-[10px]"
        aria-label="Back to the day"
        title="Back to the day"
        onClick={onBack}
      >
        <ArrowLeft />
      </Button>
      <h2 className="min-w-0 flex-1 truncate text-base font-bold tracking-tight">{title}</h2>
      {children}
    </div>
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
function AllReminders({
  onNew,
  onBack,
  knownEvents,
}: {
  onNew: () => void;
  onBack: () => void;
  /** The events the page already holds, by id, for naming a reminder's. */
  knownEvents: Map<string, ScheduleEvent>;
}) {
  const open = useReminders(OPEN_REMINDERS);
  const done = useReminders(DONE_REMINDERS);
  const toggle = useToggleReminder();
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

  const head = (
    <ListHead title="Reminders" onBack={onBack}>
      <HeadLink aria-label="New reminder" onClick={onNew}>
        New
      </HeadLink>
    </ListHead>
  );

  if (open.loadFailed && open.reminders.length === 0) {
    // Not "No reminders": that would tell someone their reminders are gone
    // when the request simply never arrived.
    return (
      <section>
        {head}
        <ErrorState
          message="Could not load your reminders."
          onRetry={() => {
            void open.refetch();
            void done.refetch();
          }}
        />
      </section>
    );
  }

  if ((open.isLoading && open.reminders.length === 0) || (sections.length === 0 && done.isLoading)) {
    return (
      <section>
        {head}
        <RowsSkeleton rows={3} />
      </section>
    );
  }

  if (sections.length === 0) {
    return (
      <section>
        {head}
        <div className={CARD}>
          <EmptyState
            icon={Bell}
            title="No reminders"
            description="A nudge at a set time: an alert here, and a push on your phone if you use the app."
            action={
              <Button size="sm" variant="secondary" onClick={onNew}>
                Add a reminder
              </Button>
            }
          />
        </div>
      </section>
    );
  }

  return (
    <section>
      {head}
      <div className="flex flex-col gap-5">
        {sections.map((section) => (
          <section key={section.key} aria-labelledby={`reminders-${section.key}`}>
            <h3
              id={`reminders-${section.key}`}
              className={cn(
                'mb-2 text-[13px] font-semibold',
                section.key === 'overdue' ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {section.title}
            </h3>
            <ul className={ROWS}>
              {section.items.map((reminder) => (
                <ReminderRow
                  key={reminder.id}
                  reminder={reminder}
                  late={section.key === 'overdue' && !reminder.is_completed}
                  onToggle={() => toggle(reminder)}
                  onOpen={() => setEditing(reminder)}
                  detail={
                    reminder.schedule_event_id ? (
                      <ReminderEvent
                        eventId={reminder.schedule_event_id}
                        known={knownEvents.get(reminder.schedule_event_id)}
                      />
                    ) : null
                  }
                  trailing={
                    <>
                      {/* Said only when it is off: a reminder that will not
                          sound is the one worth noticing. */}
                      {!reminder.is_alarm_enabled && (
                        <span role="img" aria-label="Alarm off" title="Alarm off" className="flex">
                          <BellOff aria-hidden className="size-4 text-muted-foreground" />
                        </span>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="rounded-[10px] text-secondary-foreground"
                        aria-label="Delete reminder"
                        onClick={() => setDeleting(reminder)}
                      >
                        <Trash2 />
                      </Button>
                    </>
                  }
                />
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
    </section>
  );
}

/** One of the small icons at the end of a day's row. */
function RowIcon({
  label,
  title,
  onClick,
  children,
}: {
  label: string;
  title?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      size="icon"
      variant="ghost"
      className="rounded-[10px] text-secondary-foreground"
      aria-label={label}
      title={title}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/**
 * An event on the day being looked at: a row that leads with the hour,
 * because the day is already in the title above it.
 *
 * It was a card of six lines. What a row cannot hold (the notes, who
 * organised it, who is going by name) is in the event's panel, which the
 * row's words open; the icons at its end are the ones the card had.
 */
function DayRow({
  event,
  workspace,
  reminders,
  onOpen,
  onEdit,
  onGuests,
  onDelete,
  onLeave,
}: {
  event: ScheduleEvent;
  /** The name of the workspace it is filed under, when the page holds it. */
  workspace?: string;
  /** Its open reminders, soonest first. */
  reminders: Reminder[];
  onOpen: () => void;
  onEdit: () => void;
  onGuests: () => void;
  onDelete: () => void;
  onLeave: () => void;
}) {
  // Undefined on a just-created event, which is always yours.
  const mine = event.is_owner !== false;
  const tile = timeTileParts(event.event_time);
  const countdown = startsIn(event);
  const bell =
    reminders.length === 0
      ? ''
      : reminders.length === 1
        ? `Reminder · ${reminderWhen(reminders[0].reminder_time)}`
        : `${reminders.length} reminders · first ${reminderWhen(reminders[0].reminder_time)}`;

  return (
    <li className="flex min-h-16 items-center gap-3 py-2 pl-2.5 pr-3 transition-colors has-[[data-opens]:hover]:bg-muted/50">
      <TimeTile time={tile.time} meridiem={tile.meridiem} />
      <button
        type="button"
        data-opens
        aria-haspopup="dialog"
        onClick={onOpen}
        className="flex min-w-0 flex-1 flex-col justify-center self-stretch rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="truncate text-sm font-semibold">{event.title}</span>
        <KindLine event={event}>
          {eventLine(event, workspace)}
          <AttendeeCount eventId={event.id} />
          {!mine && ' · Guest'}
        </KindLine>
      </button>
      {/* Not in a phone-sized window, where the icons already leave the
          title little room. The panel says it there. */}
      {countdown && (
        <Pill tone="warm" className="hidden sm:inline-flex">
          Starts {countdown}
        </Pill>
      )}
      {bell && (
        <span role="img" aria-label={bell} title={bell} className="flex shrink-0">
          <Bell aria-hidden className="size-4 text-secondary-foreground" />
        </span>
      )}
      {/* Editing is open to anyone on the event. If this row is in your list
          at all you either own it or accepted an invitation to it — the API
          scopes the read to exactly those two — so no extra flag is needed
          to know you may change it. */}
      <RowIcon label={`Edit ${event.title}`} onClick={onEdit}>
        <Pencil />
      </RowIcon>
      {/* The guest list and deleting stay with whoever created it. */}
      {mine ? (
        <>
          <RowIcon label={`Who is coming to ${event.title}`} onClick={onGuests}>
            <Users />
          </RowIcon>
          <RowIcon label={`Delete ${event.title}`} onClick={onDelete}>
            <Trash2 />
          </RowIcon>
        </>
      ) : (
        // A guest who accepted could not back out short of asking the
        // organiser. The API takes a decline after an accept; this is the
        // button for it.
        <RowIcon label="Can't make it" title="Can't make it" onClick={onLeave}>
          <LogOut />
        </RowIcon>
      )}
    </li>
  );
}

/**
 * An event on some other day: a row that leads with its date, as on Home.
 * The whole row opens the event.
 */
function UpcomingRow({
  event,
  workspace,
  going = false,
  onOpen,
}: {
  event: ScheduleEvent;
  workspace?: string;
  /** Says how many are going: in the whole list, not in the three on the day's page. */
  going?: boolean;
  onOpen: () => void;
}) {
  const date = dateTileParts(event.event_date);
  return (
    <li>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={onOpen}
        className="flex min-h-[60px] w-full items-center gap-3 py-2 pl-2.5 pr-4 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50"
      >
        <DateTile top={date.weekday} day={date.day} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold">{event.title}</span>
          <KindLine event={event}>
            {eventLine(event, workspace, 'workspace')}
            {going && <AttendeeCount eventId={event.id} />}
            {event.is_owner === false && ' · Guest'}
          </KindLine>
        </span>
        {event.event_time ? (
          <span className="shrink-0 text-[13px] font-semibold tabular-nums text-secondary-foreground">
            {formatTime(event.event_time)}
          </span>
        ) : null}
      </button>
    </li>
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
  const [view, setView] = useState<View>('day');
  /** Whether a link asked for the invitations, which then say so when there are none. */
  const [invitesLinked, setInvitesLinked] = useState(false);
  /** The event open in the panel, if any. */
  const [panelEventId, setPanelEventId] = useState<string | null>(null);
  /** The event a link pointed at (?event=), until it has been read. */
  const [linkedEventId, setLinkedEventId] = useState<string | null>(null);
  /** The linked event whose day and panel have been opened, so that happens once. */
  const [followed, setFollowed] = useState<string | null>(null);

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
      setView('day');
    }
    if (searchParams.get('new') === '1') {
      setNewEventWorkspace(searchParams.get('workspace'));
      setCreatingEvent(true);
    }
    // ?tab=invites is where an event-invite notification points, so tapping it
    // lands on the decision rather than on the calendar; ?tab=reminders is a
    // reminder's, and opens the whole list. The invitations are above the day
    // now, so theirs is the day.
    const wanted = searchParams.get('tab');
    if (wanted === 'day' || wanted === 'upcoming' || wanted === 'reminders') setView(wanted);
    if (wanted === 'invites') {
      setView('day');
      setInvitesLinked(true);
    }
    // ?event= is an answer or a change to one event. Its date is not in the
    // link, so it is read first and the day is chosen once it arrives.
    const linked = searchParams.get('event');
    if (linked) {
      setLinkedEventId(linked);
      // Followed again even when it is the event the last link named.
      setFollowed(null);
    }
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
  // The same query as the reminder lists', so this costs no second request.
  const { reminders } = useReminders(OPEN_REMINDERS);
  // The list the Create forms choose from, so naming a row's workspace costs
  // no request either.
  const { workspaces } = useWorkspaces({ limit: 100, orderBy: 'name', direction: 'asc' });
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
  // Its day behind, and the event itself in the panel. It used to be ringed
  // on its day's list, which was as close as the page came to opening one.
  if (linkedEvent && followed !== linkedEvent.id) {
    setFollowed(linkedEvent.id);
    setSelected(linkedEvent.event_date);
    setCursor(new Date(`${linkedEvent.event_date}T00:00:00`));
    setView('day');
    setPanelEventId(linkedEvent.id);
  }
  // Only before it was shown: a failure after that is the event being deleted
  // from this page, which needs no telling.
  const linkedFailed = linkedQuery.isError && !!linkedEventId && followed !== linkedEventId;
  useEffect(() => {
    // Deleted since, or you are no longer on it. Said, rather than landing on
    // today as though the link had worked.
    if (linkedFailed) toast.error('That event is no longer on your schedule');
  }, [linkedFailed]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, typeof events> = {};
    for (const event of events) {
      (map[event.event_date] ??= []).push(event);
    }
    return map;
  }, [events]);

  // Every event the page already holds, so a reminder can name the one it is
  // for, and the panel can open on one, without reading it again.
  const knownEvents = useMemo(() => {
    const map = new Map<string, ScheduleEvent>();
    for (const event of [...soonEvents, ...events]) map.set(event.id, event);
    return map;
  }, [events, soonEvents]);

  // The open reminders for each event, soonest first as they are listed, so
  // an event's row can say one is set.
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

  const workspaceNames = useMemo(
    () => new Map(workspaces.map((w) => [w.id, w.name])),
    [workspaces],
  );
  const workspaceOf = (event: ScheduleEvent) =>
    event.workspace_id ? workspaceNames.get(event.workspace_id) : undefined;

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
  // The picked day is left out of the few shown beside it: it is the list
  // above them, and its events would show in both.
  const soon = upcoming.filter((e) => e.event_date !== selected).slice(0, SOON_SHOWN);

  // The whole list, a month to a card: over sixty days a tile's "MON 16"
  // would not say which month it meant.
  const upcomingByMonth: { month: string; events: ScheduleEvent[] }[] = [];
  for (const event of upcoming) {
    const month = parseDateKey(event.event_date).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
    const last = upcomingByMonth[upcomingByMonth.length - 1];
    if (last?.month === month) last.events.push(event);
    else upcomingByMonth.push({ month, events: [event] });
  }

  const shiftMonth = (by: number) =>
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + by, 1));
  // A day picked on the calendar is always shown: from one of the whole
  // lists, it is also the way back.
  const pickDay = (key: string) => {
    setSelected(key);
    setView('day');
  };
  const awayFromToday =
    selected !== today ||
    cursor.getMonth() !== now.getMonth() ||
    cursor.getFullYear() !== now.getFullYear();
  /** Opens an event in its panel, with the calendar on its day behind it. */
  const openEvent = (event: ScheduleEvent) => {
    setSelected(event.event_date);
    setCursor(parseDateKey(event.event_date));
    setPanelEventId(event.id);
  };
  const named = (event: ScheduleEvent) => ({ id: event.id, title: event.title });

  return (
    <Screen title="Schedule">
      <PageHeader
        title="Schedule"
        // Coming up rather than a total: the page no longer holds every event,
        // and the count that matters is what is ahead.
        description={`${upcoming.length} coming up · ${reminders.length} reminder${reminders.length === 1 ? '' : 's'}`}
        // New event and New reminder are the bar's Create, as on the phone.
        // The sections keep their own links, and ?new=1 still opens a new
        // event.
      />

      {/* Two columns where the page is wide enough for both, measured on the
          page and not the window, since the sidebar takes its share. In one
          column the sections fall in the phone's order: the month, what
          needs an answer, the day, what follows, then the reminders. */}
      <div className="@container mx-auto w-full max-w-[1200px] px-4 pb-12 pt-7 sm:px-6">
        <div className="flex flex-col gap-7 @4xl:flex-row @4xl:items-start">
          <div className="contents @4xl:flex @4xl:min-w-0 @4xl:flex-[1_1_380px] @4xl:flex-col @4xl:gap-7">
            <section aria-label="Calendar" className={cn(CARD, 'order-1 @4xl:order-none')}>
              <div className="flex items-center gap-1 pb-1 pl-4 pr-2 pt-3">
                <h2 className="min-w-0 flex-1 truncate text-base font-bold" aria-live="polite">
                  {cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </h2>
                {/* A way home, only once you have wandered off it. */}
                {awayFromToday && (
                  <button
                    type="button"
                    aria-label="Go to today"
                    onClick={() => {
                      setCursor(new Date());
                      pickDay(today);
                    }}
                    className="h-8 rounded-full bg-muted px-3 text-[13px] font-semibold text-secondary-foreground outline-none transition-colors hover:bg-muted/70 focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    Today
                  </button>
                )}
                <Button
                  size="icon-lg"
                  variant="ghost"
                  className="rounded-[10px]"
                  onClick={() => shiftMonth(-1)}
                  aria-label="Previous month"
                >
                  <ChevronLeft className="size-5" />
                </Button>
                <Button
                  size="icon-lg"
                  variant="ghost"
                  className="rounded-[10px]"
                  onClick={() => shiftMonth(1)}
                  aria-label="Next month"
                >
                  <ChevronRight className="size-5" />
                </Button>
              </div>

              <div className="grid grid-cols-7 px-2 pb-2">
                {DAYS.map((day) => (
                  <span
                    key={day}
                    className="flex h-7 items-center justify-center text-xs font-semibold text-muted-foreground"
                  >
                    <span aria-hidden>{day.slice(0, 1)}</span>
                    <span className="sr-only">{day}</span>
                  </span>
                ))}
                {weeks.flat().map((cell) => {
                  const cellEvents = eventsByDate[cell.key] ?? [];
                  const dots = dayDots(cellEvents);
                  const isSelected = cell.key === selected;
                  return (
                    <button
                      key={cell.key}
                      type="button"
                      onClick={() => pickDay(cell.key)}
                      aria-pressed={isSelected}
                      aria-current={cell.isToday ? 'date' : undefined}
                      aria-label={`${labelForDateKey(cell.key)}, ${cellEvents.length} event${cellEvents.length === 1 ? '' : 's'}`}
                      className="group flex h-[52px] flex-col items-center justify-center gap-[3px] outline-none"
                    >
                      {/* Today is the one filled day. A day you picked gets a
                          ring, so the two can never be mistaken for each
                          other. */}
                      <span
                        className={cn(
                          'grid size-8 place-items-center rounded-full text-sm tabular-nums transition-colors group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-ring',
                          cell.isToday
                            ? 'bg-primary font-bold text-primary-foreground'
                            : isSelected
                              ? 'font-bold ring-2 ring-inset ring-foreground'
                              : cn(
                                  'font-medium group-hover:bg-muted',
                                  cell.isOutside && 'text-muted-foreground/60',
                                ),
                        )}
                      >
                        {cell.day}
                      </span>
                      <span
                        className="flex items-center gap-[3px]"
                        style={{ height: DAY_DOT_SIZE, opacity: cell.isOutside ? 0.4 : 1 }}
                      >
                        {dots.colors.map((color, i) => (
                          <span
                            key={i}
                            className="rounded-full"
                            style={{ width: DAY_DOT_SIZE, height: DAY_DOT_SIZE, backgroundColor: color }}
                          />
                        ))}
                        {dots.overflow > 0 && (
                          <span className="text-[9px] font-bold leading-none text-muted-foreground">
                            +{dots.overflow}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Not beside the whole list of them, which would say it twice. */}
            {view !== 'reminders' && (
              <RemindersGlance
                knownEvents={knownEvents}
                onSeeAll={() => setView('reminders')}
                onNew={() => setCreatingReminder(true)}
                className="order-5 @4xl:order-none"
              />
            )}
          </div>

          <div className="contents @4xl:flex @4xl:min-w-0 @4xl:flex-[2_1_480px] @4xl:flex-col @4xl:gap-7">
            <Invitations linked={invitesLinked} className="order-2" />

            {view === 'reminders' ? (
              <div className="order-3">
                <AllReminders
                  onNew={() => setCreatingReminder(true)}
                  onBack={() => setView('day')}
                  knownEvents={knownEvents}
                />
              </div>
            ) : view === 'upcoming' ? (
              <section className="order-3">
                <ListHead title="Coming up" onBack={() => setView('day')} />
                {soonLoading && soonEvents.length === 0 ? (
                  <RowsSkeleton rows={3} />
                ) : upcoming.length === 0 ? (
                  <div className={CARD}>
                    <EmptyState
                      icon={CalendarDays}
                      title="Nothing upcoming"
                      description="Nothing in the next 60 days. Later events are on the calendar."
                    />
                  </div>
                ) : (
                  <div className="flex flex-col gap-5">
                    {upcomingByMonth.map((group) => (
                      <section key={group.month} aria-label={group.month}>
                        <h3 className="mb-2 text-[13px] font-semibold text-muted-foreground">
                          {group.month}
                        </h3>
                        <ul className={ROWS}>
                          {group.events.map((event) => (
                            <UpcomingRow
                              key={event.id}
                              event={event}
                              workspace={workspaceOf(event)}
                              going
                              onOpen={() => openEvent(event)}
                            />
                          ))}
                        </ul>
                      </section>
                    ))}
                  </div>
                )}
              </section>
            ) : (
              <>
                {/* The picked day. Its rows lead with the hour, because the
                    day is already in the title. */}
                <section aria-labelledby="schedule-day" className="order-3">
                  <SectionHead id="schedule-day" title={dayTitle(selected)}>
                    <HeadLink onClick={() => setCreatingEvent(true)}>Add event</HeadLink>
                  </SectionHead>
                  {/* Each month is its own fetch now, so a month still on its
                      way is not "Nothing on this day". */}
                  {isLoading && dayEvents.length === 0 ? (
                    <RowsSkeleton rows={2} />
                  ) : dayEvents.length === 0 ? (
                    // One row, not a block: most days have nothing on them.
                    <button
                      type="button"
                      aria-label="Nothing on this day. Add event"
                      onClick={() => setCreatingEvent(true)}
                      className={cn(
                        CARD,
                        'flex min-h-[60px] w-full items-center gap-3 px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50',
                      )}
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-secondary-foreground">
                        <CalendarDays aria-hidden className="size-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1 text-muted-foreground">Nothing on this day</span>
                      <span className="shrink-0 font-semibold text-primary">Add event</span>
                    </button>
                  ) : (
                    <ul className={ROWS}>
                      {dayEvents.map((event) => (
                        <DayRow
                          key={event.id}
                          event={event}
                          workspace={workspaceOf(event)}
                          reminders={remindersByEvent.get(event.id) ?? []}
                          onOpen={() => openEvent(event)}
                          onEdit={() => setEditingEvent(event)}
                          onGuests={() => setManaging(named(event))}
                          onDelete={() => setDeleting(named(event))}
                          onLeave={() => setLeaving(named(event))}
                        />
                      ))}
                    </ul>
                  )}
                </section>

                {/* What follows, in Home's rows, led by the date. */}
                <section aria-labelledby="schedule-soon" className="order-4">
                  <SectionHead id="schedule-soon" title="Coming up">
                    <HeadLink aria-label="See all that is coming up" onClick={() => setView('upcoming')}>
                      See all
                    </HeadLink>
                  </SectionHead>
                  {soonLoading && soonEvents.length === 0 ? (
                    <RowsSkeleton rows={3} />
                  ) : soon.length === 0 ? (
                    <p className={QUIET_ROW}>
                      {upcoming.length === 0
                        ? 'Nothing in the next 60 days. Later events are on the calendar.'
                        : 'Nothing else in the next 60 days'}
                    </p>
                  ) : (
                    <ul className={ROWS}>
                      {soon.map((event) => (
                        <UpcomingRow
                          key={event.id}
                          event={event}
                          workspace={workspaceOf(event)}
                          onOpen={() => openEvent(event)}
                        />
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}
          </div>
        </div>
      </div>

      <EventPanel
        eventId={panelEventId}
        known={panelEventId ? knownEvents.get(panelEventId) : undefined}
        onClose={() => setPanelEventId(null)}
        onEdit={setEditingEvent}
        onInvite={(event) => setManaging(named(event))}
        onDelete={(event) => setDeleting(named(event))}
        onLeave={(event) => setLeaving(named(event))}
      />

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
                // Its panel goes with it, and a link that named it is done
                // with: read again, it would only fail.
                if (panelEventId === deleting.id) setPanelEventId(null);
                if (linkedEventId === deleting.id) setLinkedEventId(null);
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
                      if (panelEventId === leaving.id) setPanelEventId(null);
                      if (linkedEventId === leaving.id) setLinkedEventId(null);
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
