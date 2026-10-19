const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * When a post went out, the way a feed says it: "Just now", "5m", "2h", "3d",
 * and past a week the date — "12 Oct", with the year once it is not this one.
 *
 * `label` is the same moment in words, for a screen reader, which reads "2h"
 * as "two aitch".
 */
export function postedAgo(
  iso: string | null | undefined,
  now: number = Date.now(),
): { short: string; label: string } {
  const at = iso ? new Date(iso).getTime() : NaN;
  if (!Number.isFinite(at)) return { short: '', label: '' };

  // A clock a little ahead of the server's would otherwise say "-1m".
  const minutes = Math.floor(Math.max(0, now - at) / 60_000);
  if (minutes < 1) return { short: 'Just now', label: 'Posted just now' };
  if (minutes < 60) {
    return { short: `${minutes}m`, label: `Posted ${minutes} minute${minutes === 1 ? '' : 's'} ago` };
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return { short: `${hours}h`, label: `Posted ${hours} hour${hours === 1 ? '' : 's'} ago` };
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return { short: `${days}d`, label: `Posted ${days} day${days === 1 ? '' : 's'} ago` };
  }

  const date = new Date(at);
  const year = date.getFullYear() === new Date(now).getFullYear() ? '' : ` ${date.getFullYear()}`;
  return {
    short: `${date.getDate()} ${MONTHS[date.getMonth()]}${year}`,
    label: `Posted ${date.getDate()} ${MONTHS_LONG[date.getMonth()]}${year}`,
  };
}
