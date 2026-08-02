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
