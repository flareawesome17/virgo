/**
 * Shared data for the landing mocks.
 *
 * `ROLES` was declared twice — in `nearby.tsx` and `community.tsx` — with the
 * same nine strings in the same order, and `initials()` was duplicated verbatim
 * in `nearby.tsx` and `hero.tsx`, doc comment and all. Two copies of a list
 * that has to match `api/src/auth/roles.ts` is two places to forget when a
 * tenth role ships.
 */

/** The nine roles the product actually knows about. See api/src/auth/roles.ts. */
export const ROLES = [
  'Photographer',
  'Videographer',
  'Photo Editor',
  'Video Editor',
  'SDE Editor Photo',
  'SDE Editor Video',
  'Coordinator',
  'Host',
  'HMUA',
] as const;

/**
 * "Kenn Francis" → "KF".
 *
 * The first two letters of the string gave "KE" and "JU", which reads as a
 * truncation bug rather than an avatar. Falls back to the first two letters
 * only for a single-word name.
 */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
