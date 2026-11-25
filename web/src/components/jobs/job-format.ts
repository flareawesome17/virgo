import { distanceLabel, type JobPost } from '@/api';

/*
 * How a job's day, place and age read. The phone's words (its
 * src/lib/jobs-format.ts and components/jobs/JobCard.tsx), so the two clients
 * do not say one post two ways.
 */

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * "NOV" and 26 from a job's date. Read off the string, not through Date: a
 * date-only value parses as UTC midnight, which is the day before anywhere
 * west of Greenwich.
 */
export function jobDay(eventDate: string): { month: string; day: number } | null {
  const [, month, day] = eventDate.slice(0, 10).split('-').map(Number);
  if (!month || !day) return null;
  return { month: MONTHS[month - 1] ?? '', day };
}

/**
 * "Thursday", beside a tile that already says the month and the day. The year
 * follows when it is not this one, since the tile has no room for it.
 */
export function jobWeekday(eventDate: string, now: Date = new Date()): string | null {
  const [y, m, d] = eventDate.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  const weekday = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  return y === now.getFullYear() ? weekday : `${weekday} · ${y}`;
}

/**
 * How soon a job is: "Today", "In 3 days", "in 11 days". `soon` is three days
 * or fewer, which is when it stops being something to think about. Null for a
 * day that has passed.
 */
export function jobCountdown(
  eventDate: string,
  now: Date = new Date(),
): { text: string; soon: boolean } | null {
  const [y, m, d] = eventDate.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  const days = Math.round(
    (Date.UTC(y, m - 1, d) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86_400_000,
  );
  if (days < 0) return null;
  if (days === 0) return { text: 'Today', soon: true };
  if (days === 1) return { text: 'Tomorrow', soon: true };
  return days <= 3 ? { text: `In ${days} days`, soon: true } : { text: `in ${days} days`, soon: false };
}

/** Posted today or yesterday: what the dot on a card means. */
export function isFreshJob(job: Pick<JobPost, 'createdAt'>): boolean {
  return Date.now() - new Date(job.createdAt).getTime() < 2 * 86_400_000;
}

/** "3 days ago": how fresh a post is, which is most of how promising it is. */
export function postedAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? 'a week ago' : `${weeks} weeks ago`;
}

/** "4 km away", or nothing when the label would only repeat the place. */
export function jobDistance(job: Pick<JobPost, 'distanceKm' | 'location'>): string | null {
  const distance = distanceLabel(job.distanceKm, job.location);
  // Past 50 km the label is "near <the place>", which beside the place itself
  // says it twice.
  return distance && job.location && distance.startsWith('near ') ? null : distance;
}

/** "Tagaytay, Cavite · 4 km away". */
export function jobPlace(job: Pick<JobPost, 'distanceKm' | 'location'>): string {
  return [job.location, jobDistance(job)].filter(Boolean).join(' · ');
}
