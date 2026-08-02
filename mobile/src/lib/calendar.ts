/**
 * Calendar/date helpers shared by the schedule screens.
 *
 * These were duplicated in `(tabs)/schedule.tsx` and `schedule/calendar.tsx`,
 * each carrying the same two bugs:
 *
 *   1. Leading/trailing cells stored `month - 1` / `month + 1` without rolling
 *      the year, so January produced month `-1` and December month `12`.
 *      dateKey() then emitted `2026-00-29` and `2026-13-01` — dates that match
 *      no event and parse to Invalid Date.
 *   2. `new Date('2026-08-01')` parses as UTC midnight. Anywhere west of UTC
 *      that is the *previous* day locally, so "Today" and weekday labels were
 *      off by one.
 */

export const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Which weekday the grid starts on, as a JS `getDay()` value
 * (0 = Sunday … 6 = Saturday).
 *
 * Change this one constant and both the header labels and the leading-cell
 * offset follow — they used to be derived separately, which is how a header
 * could drift out of alignment with the columns beneath it.
 */
export const WEEK_STARTS_ON = 0; // Sunday

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Weekday labels in grid-column order. */
export const DAYS = Array.from(
  { length: 7 },
  (_, i) => WEEKDAY_NAMES[(WEEK_STARTS_ON + i) % 7],
);

export interface MonthCell {
  day: number;
  /** Always 0-11, with `year` already rolled where needed. */
  month: number;
  year: number;
  isToday: boolean;
  /** Belongs to the previous or next month — rendered dimmed. */
  isOutside: boolean;
  /** `YYYY-MM-DD`, always a real date. */
  key: string;
}

/** Normalises any month offset into a valid { year, month } pair. */
function rollMonth(year: number, month: number): { year: number; month: number } {
  const total = year * 12 + month;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

/** `YYYY-MM-DD` for a local calendar date. */
export function dateKey(year: number, month: number, day: number): string {
  const r = rollMonth(year, month);
  return `${r.year}-${String(r.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Parses `YYYY-MM-DD` as a LOCAL date.
 *
 * `new Date('2026-08-01')` is UTC midnight; this builds the date from parts so
 * it lands on the same calendar day the user typed regardless of timezone.
 */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function todayKey(): string {
  const t = new Date();
  return dateKey(t.getFullYear(), t.getMonth(), t.getDate());
}

/**
 * Six-week grid (always 42 cells) for the given month.
 *
 * Fixed height keeps the calendar from resizing as you page through months —
 * the old version emitted 35 or 42 depending on how the weeks fell.
 */
export function getMonthGrid(year: number, month: number): MonthCell[] {
  const base = rollMonth(year, month);
  const firstWeekday = new Date(base.year, base.month, 1).getDay();
  // How many trailing days of the previous month precede the 1st, given where
  // the week starts. The +7 keeps the result non-negative.
  const leading = (firstWeekday - WEEK_STARTS_ON + 7) % 7;

  const daysInMonth = new Date(base.year, base.month + 1, 0).getDate();
  const daysInPrev = new Date(base.year, base.month, 0).getDate();

  const today = new Date();
  const isToday = (y: number, m: number, d: number) =>
    today.getFullYear() === y && today.getMonth() === m && today.getDate() === d;

  const cells: MonthCell[] = [];

  const push = (y: number, m: number, d: number, outside: boolean) => {
    const r = rollMonth(y, m);
    cells.push({
      day: d,
      month: r.month,
      year: r.year,
      isToday: isToday(r.year, r.month, d),
      isOutside: outside,
      key: dateKey(r.year, r.month, d),
    });
  };

  for (let i = leading - 1; i >= 0; i--) {
    push(base.year, base.month - 1, daysInPrev - i, true);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    push(base.year, base.month, d, false);
  }
  // Pad to a full 6 weeks.
  for (let d = 1; cells.length < 42; d++) {
    push(base.year, base.month + 1, d, true);
  }

  return cells;
}

/**
 * The month grid split into six rows of seven.
 *
 * Render these as explicit rows with `flex-1` cells rather than one wrapping
 * container of `width: 100/7 %`. Seven cells at 14.2857% each round up past
 * 100% of the container, so `flex-wrap` pushed the seventh cell onto the next
 * line — the Sunday column came out empty and every row shifted by one.
 */
export function getMonthWeeks(year: number, month: number): MonthCell[][] {
  const cells = getMonthGrid(year, month);
  const weeks: MonthCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

export function isSameDayKey(key: string, date: Date): boolean {
  return (
    key === dateKey(date.getFullYear(), date.getMonth(), date.getDate())
  );
}

/** "Today" / "Tomorrow" / "Sat, Aug 1". */
export function labelForDateKey(key: string): string {
  const today = new Date();
  if (isSameDayKey(key, today)) return 'Today';

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (isSameDayKey(key, tomorrow)) return 'Tomorrow';

  return parseDateKey(key).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** `HH:MM[:SS]` -> `9:00 AM`. */
export function formatTime(timeStr: string | null): string {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h, 10);
  if (Number.isNaN(hour)) return '';
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

/** Date -> `YYYY-MM-DD`, in local time. */
export function dateToKey(d: Date): string {
  return dateKey(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Date -> `HH:MM` local, which is what the API's `time` column accepts. */
export function dateToTimeString(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Is this event still ahead of us?
 *
 * Compares the moment, not the day. `event_date >= today` counted a 9am shoot
 * as upcoming all afternoon, which is what put finished events in the Upcoming
 * list.
 *
 * An event with no time is treated as lasting its whole day, so it stays
 * upcoming until midnight rather than vanishing at 00:00 — the alternative
 * would hide an all-day booking from the moment it started.
 */
export function isEventUpcoming(
  eventDate: string,
  eventTime: string | null,
  now: Date = new Date(),
): boolean {
  if (!eventDate) return false;
  if (!eventTime) return eventDate >= dateToKey(now);
  return combineDateAndTime(eventDate, eventTime).getTime() > now.getTime();
}

/** Combines a `YYYY-MM-DD` key and an `HH:MM` string into a local Date. */
export function combineDateAndTime(key: string, time: string): Date {
  const base = parseDateKey(key);
  const [h, m] = time.split(':').map(Number);
  base.setHours(h || 0, m || 0, 0, 0);
  return base;
}
