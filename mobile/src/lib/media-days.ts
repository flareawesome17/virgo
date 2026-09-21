/**
 * Days, for grouping an album by when its media was taken.
 *
 * Shared by web and mobile — scripts/check-client-sync.mjs keeps the two
 * copies identical — so an album breaks into the same days on every screen.
 * The client delivery page renders on the server and cannot import this; its
 * script mirrors `dayKey` and `dayTitle`, and a change here belongs there too.
 */

/** Anything that knows when it was taken, or failing that when it arrived. */
export interface Dated {
  /** The camera's wall clock, `2026-03-14T16:42:05`, or null when unknown. */
  takenAt?: string | null;
  /** When it was uploaded, as an ISO instant. */
  createdAt: string;
}

export interface DayGroup<T> {
  /** `2026-03-14`, or `undated`. */
  key: string;
  /** "Saturday 14 March". */
  title: string;
  items: T[];
  /** Where `items[0]` sits in the list that was grouped. */
  start: number;
}

const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * The calendar day a file belongs under, as `YYYY-MM-DD`.
 *
 * A capture time is read as written, never through a Date: it is the wall
 * clock where it was shot, and parsing it as an instant would move a
 * reception frame taken at 23:30 onto the next day for anyone viewing from
 * a zone ahead of it. Without one, the upload is placed on the viewer's own
 * calendar — the only calendar an instant with no place attached has.
 */
export function dayKey(file: Dated): string {
  const taken = file.takenAt ? WALL_CLOCK.exec(file.takenAt) : null;
  if (taken) return `${taken[1]}-${taken[2]}-${taken[3]}`;
  const arrived = new Date(file.createdAt);
  if (Number.isNaN(arrived.getTime())) return 'undated';
  return `${arrived.getFullYear()}-${pad(arrived.getMonth() + 1)}-${pad(arrived.getDate())}`;
}

/**
 * "Today", "Yesterday", or "Saturday 14 March" — with the year only when it
 * is not this one, because an album of last month's wedding does not need
 * reminding what year it is on every heading.
 */
export function dayTitle(key: string, now: Date = new Date()): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return 'Undated';
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((today.getTime() - date.getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(year === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

/** "16:42" from a capture time, or null when there is none. */
export function timeOfDay(file: Dated): string | null {
  const taken = file.takenAt ? WALL_CLOCK.exec(file.takenAt) : null;
  return taken ? `${taken[4]}:${taken[5]}` : null;
}

/**
 * Consecutive runs of the same day, in the order given.
 *
 * Runs rather than buckets: the list arrives already sorted by capture time,
 * and keeping that order is what lets a paged list append a page without
 * reshuffling headings already on screen. Two runs of one day can only
 * happen if the input is unsorted, and then two headings is the honest
 * rendering of it.
 */
export function groupByDay<T extends Dated>(
  files: readonly T[],
  now: Date = new Date(),
): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  files.forEach((file, index) => {
    const key = dayKey(file);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(file);
    } else {
      groups.push({ key, title: dayTitle(key, now), items: [file], start: index });
    }
  });
  return groups;
}

/**
 * "11:04 – 13:20": the span a day's frames cover, from their capture times.
 * Null when fewer than two carry one, since a span of one time is a time.
 */
export function daySpan(files: readonly Dated[]): string | null {
  const times = files
    .map(timeOfDay)
    .filter((time): time is string => time !== null)
    .sort();
  if (times.length < 2 || times[0] === times[times.length - 1]) return null;
  return `${times[0]} – ${times[times.length - 1]}`;
}
