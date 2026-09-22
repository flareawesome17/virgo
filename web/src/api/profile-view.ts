/**
 * How a profile is shown, as pure functions both clients share.
 *
 * Kept apart from endpoints/profiles.ts, and importing nothing but types, so
 * `node --experimental-strip-types` can load it on its own:
 * mobile/scripts/check-profile-helpers.mjs checks these without a bundler, a
 * device or a test runner neither app has.
 */
import type {
  PortfolioItem,
  ProfileStats,
  ProfileView,
  ProfileViewer,
  PublicProfile,
  ViewerConnection,
} from './endpoints/profiles';

/**
 * Width over height of a profile cover.
 *
 * One number for the phone's crop and every surface that draws the result:
 * the photo is cropped to this shape before it is uploaded, so a surface that
 * drew it at another ratio would be cropping somebody's chosen framing again.
 * 2:1 is what the "Your profile" board draws, 390 × 200 across the full width.
 */
export const COVER_ASPECT = 2;

/** 0 to 1, and the middle for anything that is not a number at all. */
export function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5;
}

/**
 * The largest COVER_ASPECT rectangle inside a width × height photo.
 *
 * Centred across; `focusY` places it down the photo, 0 at the top and 1 at
 * the bottom. A photo wider than the cover loses its sides instead and has
 * nothing to place vertically. Whole pixels, because the manipulator crops in
 * pixels and a fractional origin is rounded differently on each platform.
 */
export function coverCropRect(
  width: number,
  height: number,
  focusY = 0.5,
): { originX: number; originY: number; width: number; height: number } {
  let w = width;
  let h = Math.round(width / COVER_ASPECT);
  if (h > height) {
    h = height;
    w = Math.round(height * COVER_ASPECT);
  }
  return {
    originX: Math.round((width - w) / 2),
    originY: Math.round((height - h) * clamp01(focusY)),
    width: w,
    height: h,
  };
}

/**
 * Where the drag in "Position your cover" left the photo, as a focusY.
 *
 * The photo is dragged up to show more of its lower part, so translateY runs
 * from 0 (top edge showing) down to -maxOffset (bottom edge showing), and its
 * negation is the fraction of the way down. Reading translateY as the fraction
 * directly gave 0 or less for every position, and every cover came out cropped
 * at the top whatever the person had chosen.
 */
export function coverFocusFromOffset(translateY: number, maxOffset: number): number {
  return maxOffset > 0 ? clamp01(-translateY / maxOffset) : 0.5;
}

const CONNECTIONS: readonly ViewerConnection[] = ['none', 'pending_out', 'pending_in', 'accepted'];

/** The viewer block if it is one this client understands, otherwise null. */
function viewerOf(value: unknown): ProfileViewer | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<ProfileViewer>;
  if (typeof v.isSelf !== 'boolean') return null;
  // A state added later would otherwise fall through to Connect, offering a
  // request to someone the viewer may already be connected to.
  if (!CONNECTIONS.includes(v.connection as ViewerConnection)) return null;
  return {
    isSelf: v.isSelf,
    connection: v.connection as ViewerConnection,
    friendId: typeof v.friendId === 'string' && v.friendId ? v.friendId : null,
  };
}

/**
 * Every field a screen reads, settled.
 *
 * Runs as the query's `select`, so it covers a profile rehydrated from a cache
 * the previous release wrote as well as one from an older API. That is what
 * lets both clients keep their persisted caches through this release instead
 * of throwing them away with a CACHE_VERSION bump.
 */
export function withProfileDefaults(p: PublicProfile): ProfileView {
  const stats = p.stats;
  return {
    ...p,
    coverUrl: typeof p.coverUrl === 'string' && p.coverUrl ? p.coverUrl : null,
    studioName: typeof p.studioName === 'string' && p.studioName.trim() ? p.studioName.trim() : null,
    availableForBookings: p.availableForBookings === true,
    stats:
      stats && Number.isFinite(stats.connections) && Number.isFinite(stats.jobsDone)
        ? { connections: stats.connections, jobsDone: stats.jobsDone }
        : null,
    mutualConnections: Number.isFinite(p.mutualConnections) ? (p.mutualConnections as number) : 0,
    viewer: viewerOf(p.viewer),
    roles: Array.isArray(p.roles) ? p.roles : [],
    portfolio: Array.isArray(p.portfolio) ? p.portfolio : [],
  };
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * "12 connections · 4 jobs done", zeros included.
 *
 * A zero is shown rather than hidden: a line that appears only once there is
 * something to boast about tells a visitor more by being missing than it would
 * by saying 0.
 */
export function profileStatsLine(s: ProfileStats): string {
  return `${count(s.connections, 'connection', 'connections')} · ${count(s.jobsDone, 'job done', 'jobs done')}`;
}

/** "3 mutual connections", or null when there are none to mention. */
export function mutualConnectionsLine(n: number): string | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  return count(n, 'mutual connection', 'mutual connections');
}

/**
 * What goes across the top of a profile.
 *
 * Their cover, sharp. Without one, their own work, blurred: the first photo,
 * then the first gallery's cover. A photographer's profile that opens on a
 * flat panel wastes the one thing they have most of. Null only when there is
 * nothing at all to show.
 */
export function profileBanner(p: {
  coverUrl?: string | null;
  portfolio: PortfolioItem[];
}): { url: string; blurred: boolean } | null {
  if (typeof p.coverUrl === 'string' && p.coverUrl) return { url: p.coverUrl, blurred: false };
  const items = Array.isArray(p.portfolio) ? p.portfolio : [];
  for (const item of items) {
    if (item.kind === 'image' && item.url) return { url: item.url, blurred: true };
  }
  for (const item of items) {
    if (item.kind === 'album' && item.coverUrl) return { url: item.coverUrl, blurred: true };
  }
  return null;
}
