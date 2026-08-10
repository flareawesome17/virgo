/**
 * Date wording for job posts.
 *
 * In `src/lib` rather than exported from the board screen: every file under
 * `app/` is a route, and hanging shared helpers off one so a sibling route can
 * import them makes the router's job ambiguous for no benefit.
 */

/** "Sat 19 Dec" — a job date is a day, and this year's year is noise. */
export function jobDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  const thisYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(thisYear ? {} : { year: 'numeric' }),
  });
}

/** "3 days ago" — how fresh a post is, which is most of how promising it is. */
export function postedAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? 'a week ago' : `${weeks} weeks ago`;
}

/**
 * How an application status reads, in words.
 *
 * Matches web's APPLICATION_STATE so both clients say the same thing, and
 * lives here rather than in a screen because three of them show it now: the
 * post page per role, the applicants list, and your own applications.
 */
export const APPLICATION_LABEL: Record<string, string> = {
  new: 'Applied',
  shortlisted: 'Shortlisted',
  accepted: 'Accepted',
  declined: 'Not selected',
};
