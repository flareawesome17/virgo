/**
 * What someone does on a shoot.
 *
 * A closed list rather than free text: these feed discovery ("a video editor
 * near me"), and free text turns that into a search for every spelling of
 * "videographer" anyone has ever typed.
 *
 * Stored as the exact strings below, so the value is legible in the database
 * without a lookup table.
 */
export const USER_ROLES = [
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

export type UserRole = (typeof USER_ROLES)[number];

export function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}

/**
 * Keeps only recognised roles, de-duplicated and in the canonical order.
 *
 * Order comes from USER_ROLES rather than what the client sent, so two people
 * with the same roles always render them the same way.
 */
export function normalizeRoles(roles: readonly string[]): UserRole[] {
  const wanted = new Set(roles.filter(isUserRole));
  return USER_ROLES.filter((role) => wanted.has(role));
}

/** How many roles of their own a person may add. */
export const CUSTOM_ROLES_MAX = 3;
/** A role in somebody's own words: long enough to mean something, short enough for a chip. */
export const CUSTOM_ROLE_MIN = 2;
export const CUSTOM_ROLE_MAX = 40;

/**
 * Sorts what a person chose into roles from the list and roles of their own.
 *
 * The list is still what Nearby and the job board match on. A role typed by
 * hand that turns out to be on the list ("videographer") is taken as the
 * listed one, so nobody is left out of a match for having typed instead of
 * tapped. What is left is tidied (one space between words), kept once
 * whatever its capitals, and cut to the few a profile has room for.
 */
export function splitRoles(
  listed: readonly string[] = [],
  own: readonly string[] = [],
): { roles: UserRole[]; customRoles: string[] } {
  const byLower = new Map(USER_ROLES.map((role) => [role.toLowerCase(), role]));
  const chosen = new Set<string>(listed.filter(isUserRole));
  const customRoles: string[] = [];
  const seen = new Set<string>();

  for (const raw of own) {
    if (typeof raw !== 'string') continue;
    const text = raw.replace(/\s+/g, ' ').trim();
    if (text.length < CUSTOM_ROLE_MIN || text.length > CUSTOM_ROLE_MAX) continue;
    const lower = text.toLowerCase();
    const known = byLower.get(lower);
    if (known) {
      chosen.add(known);
      continue;
    }
    if (seen.has(lower) || customRoles.length >= CUSTOM_ROLES_MAX) continue;
    seen.add(lower);
    customRoles.push(text);
  }

  return { roles: USER_ROLES.filter((role) => chosen.has(role)), customRoles };
}
