'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { CalendarDays, Check } from 'lucide-react';
import { CARD, StatusDot } from '@/components/kit';
import { Skeleton } from '@/components/ui/skeleton';
import { useScheduleEvent } from '@/hooks/useScheduleEvents';
import type { Reminder, ScheduleEvent } from '@/api';
import { eventColor, eventTypeLabel, formatTime, labelForDateKey, parseDateKey } from '@/lib/calendar';
import { cn } from '@/lib/utils';

/*
 * What the Schedule page and an event's panel are both made of: the words a
 * date is written in, a section's title, an event's second line, and a
 * reminder with its round tick.
 */

/** A card of rows, a hairline between each. */
export const ROWS = cn(CARD, 'overflow-hidden [&>*+*]:border-t [&>*+*]:border-border/40');

const weekday = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'long' });
const month = (d: Date) => d.toLocaleDateString('en-US', { month: 'long' });

/** "Saturday, 14 November 2026": a day in full, the day before the month. */
export function fullDate(key: string): string {
  const d = parseDateKey(key.slice(0, 10));
  return `${weekday(d)}, ${d.getDate()} ${month(d)} ${d.getFullYear()}`;
}

/**
 * "Today, 14 November" or "Saturday, 21 November": a day as the title of
 * what is on it. The year only when it is not this one.
 */
export function dayTitle(key: string, now = new Date()): string {
  const d = parseDateKey(key.slice(0, 10));
  const near = labelForDateKey(key);
  const lead = near === 'Today' || near === 'Tomorrow' ? near : weekday(d);
  const year = d.getFullYear() === now.getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${lead}, ${d.getDate()} ${month(d)}${year}`;
}

/**
 * "Yesterday, 5:00 PM", "Today, 1:00 PM", "Tuesday, 9:00 AM": when a
 * reminder is for, in the words somebody would say it in. Past this week it
 * is the date, "26 Nov, 9:00 AM".
 */
export function reminderWhen(iso: string, now = new Date()): string {
  const at = new Date(iso);
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  // Rounded, so the day a clock change makes 23 or 25 hours long still counts as one.
  const days = Math.round((midnight(at) - midnight(now)) / 86_400_000);
  const day =
    days === -1
      ? 'Yesterday'
      : days === 0
        ? 'Today'
        : days === 1
          ? 'Tomorrow'
          : days > 1 && days < 7
            ? weekday(at)
            : at.toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                ...(at.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
              });
  return `${day}, ${at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

/** "4:00" over "PM" for a TimeTile; "All" over "DAY" for an event with no time. */
export function timeTileParts(time: string | null): { time: string; meridiem: string } {
  const [clock, half] = formatTime(time).split(' ');
  return clock && half ? { time: clock, meridiem: half } : { time: 'All', meridiem: 'DAY' };
}

/**
 * "Shoot · Sirao Garden": an event's kind, then one more thing about it.
 * On its own day that is where it is, since the day is spent getting there;
 * among the days ahead it is the workspace it is for, as on Home. Either
 * stands in when the other is missing.
 */
export function eventLine(
  event: ScheduleEvent,
  workspace?: string,
  lead: 'place' | 'workspace' = 'place',
): string {
  const place = event.location?.trim();
  const second = lead === 'place' ? place || workspace : workspace || place;
  return [eventTypeLabel(event), second].filter(Boolean).join(' · ');
}

/** The line under an event's title: its kind's colour as a dot, then the words. */
export function KindLine({
  event,
  children,
}: {
  /** An event, or an invitation to one: anything that has a kind. */
  event: { event_type?: string | null };
  children: ReactNode;
}) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
      <StatusDot color={eventColor(event.event_type)} className="size-[7px]" />
      <span className="truncate">{children}</span>
    </span>
  );
}

/**
 * A section's title with what can be done to it on the right. The kit's
 * SectionTitle takes one link to another page; these act on this one (open
 * a form, show the whole list), so they are buttons.
 */
export function SectionHead({
  title,
  id,
  children,
}: {
  title: ReactNode;
  id?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-3">
      <h2 id={id} className="min-w-0 truncate text-base font-bold tracking-tight">
        {title}
      </h2>
      {children ? <div className="flex shrink-0 items-center gap-4">{children}</div> : null}
    </div>
  );
}

/** A SectionHead's action, in the words and colour of a link. */
export function HeadLink({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'rounded text-sm font-semibold text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50',
        className,
      )}
    />
  );
}

/** Rows still on their way, the size of the rows they stand in for. */
export function RowsSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div aria-hidden className={ROWS}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex min-h-16 items-center gap-3 px-2.5">
          <Skeleton className="size-11 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * A reminder's tick: an empty ring until it is done, red once it is late.
 * Round, as on the phone, so it is never read as one more box in a form.
 */
export function RoundTick({
  checked,
  late = false,
  label,
  onChange,
}: {
  checked: boolean;
  late?: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        // The ring is 24px; `before` gives the pointer 40px to land on.
        'relative grid size-6 shrink-0 place-items-center rounded-full border-2 outline-none transition-colors before:absolute before:-inset-2 focus-visible:ring-3 focus-visible:ring-ring/50',
        checked
          ? 'border-success bg-success text-background'
          : late
            ? 'border-destructive hover:bg-destructive/10'
            : 'border-muted-foreground/60 hover:border-foreground',
      )}
    >
      {checked ? <Check aria-hidden className="size-3.5" strokeWidth={3} /> : null}
    </button>
  );
}

/**
 * One reminder: its tick, what it says and when. The words open it in the
 * form it was made with; the tick and anything in `trailing` sit outside
 * them, so neither opens the form on the way.
 */
export function ReminderRow({
  reminder,
  late,
  onToggle,
  onOpen,
  detail,
  trailing,
}: {
  reminder: Reminder;
  /** Its time has passed and it is not done. */
  late: boolean;
  onToggle: () => void;
  onOpen: () => void;
  /** A line under the time: the event it is for. */
  detail?: ReactNode;
  /** After the words: a bin. */
  trailing?: ReactNode;
}) {
  return (
    <li className={cn('flex min-h-[52px] items-center gap-3 py-2 pl-3', trailing ? 'pr-2' : 'pr-4')}>
      <RoundTick
        checked={reminder.is_completed}
        late={late}
        label={`${reminder.title}, done`}
        onChange={onToggle}
      />
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={onOpen}
        className="flex min-w-0 flex-1 flex-col rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span
          className={cn(
            'truncate text-sm font-semibold',
            reminder.is_completed && 'text-muted-foreground line-through',
          )}
        >
          {reminder.title}
        </span>
        <span className={cn('text-[13px]', late ? 'text-destructive' : 'text-muted-foreground')}>
          {reminderWhen(reminder.reminder_time)}
        </span>
        {detail}
      </button>
      {trailing}
    </li>
  );
}

/**
 * "For Reyes wedding", on a reminder made for an event.
 *
 * A reminder carries only the event's id. The page already holds most events
 * it could name, so those are used as they are; the rest — an overdue
 * reminder's event from months back — are read one by one.
 */
export function ReminderEvent({ eventId, known }: { eventId: string; known?: ScheduleEvent }) {
  const { data } = useScheduleEvent(known ? undefined : eventId);
  const event = known ?? data;
  return (
    <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
      <CalendarDays className="size-3 shrink-0" aria-hidden />
      {/* Still for an event while it loads, or when you can no longer see it. */}
      <span className="truncate">{event ? `For ${event.title}` : 'For an event'}</span>
    </span>
  );
}
