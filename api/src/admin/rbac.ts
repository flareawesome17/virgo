/**
 * Who can do what in the management console.
 *
 * Roles are a closed list and permissions are derived from them, rather than
 * each admin carrying a bag of grants. At this size a per-admin permission
 * table would be a join and a UI to maintain something with four sensible
 * answers — and the thing that actually goes wrong with hand-assembled grants
 * is someone ending up with `users.disable` and no way to notice.
 *
 * Deliberately separate from `api/src/auth/roles.ts`, which is what somebody
 * does on a shoot. Those are never permissions and must never be read as any.
 */

export const ADMIN_ROLES = ['owner', 'admin', 'support', 'viewer'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

/**
 * Every distinct capability the console exposes.
 *
 * Named `<area>.<verb>` so a permission check reads as the thing it guards.
 * Read and write are split everywhere it matters: support staff need to see a
 * customer's storage to answer a question about it, and must not be able to
 * delete it.
 */
export const ADMIN_PERMISSIONS = [
  'overview.read',

  'users.read',
  'users.disable',
  'users.setPlan',

  'content.read',
  'content.moderate',

  'billing.read',
  'billing.manage',

  'support.read',
  'support.reply',
  'support.manage',

  'system.read',

  // Managing the console's own accounts. Owner-only: an admin who can grant
  // roles can grant themselves anything, which makes every other line here
  // decorative.
  'admins.read',
  'admins.manage',

  'audit.read',
] as const;
export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

const SUPPORT: AdminPermission[] = [
  'overview.read',
  'users.read',
  'content.read',
  'billing.read',
  'support.read',
  'support.reply',
  'system.read',
];

const ADMIN: AdminPermission[] = [
  ...SUPPORT,
  'users.disable',
  'users.setPlan',
  'content.moderate',
  'billing.manage',
  'support.manage',
  'audit.read',
  'admins.read',
];

/**
 * The matrix.
 *
 * `viewer` is read-only on purpose: it is the role to hand to someone who
 * needs the numbers and should not be able to change anything, which is most
 * people who ask for access.
 */
export const ROLE_PERMISSIONS: Record<AdminRole, readonly AdminPermission[]> = {
  viewer: [
    'overview.read',
    'users.read',
    'content.read',
    'billing.read',
    'support.read',
    'system.read',
  ],
  support: SUPPORT,
  admin: ADMIN,
  // Everything, including the ability to create and demote other admins.
  owner: [...ADMIN_PERMISSIONS],
};

export function isAdminRole(value: string): value is AdminRole {
  return (ADMIN_ROLES as readonly string[]).includes(value);
}

export function permissionsFor(role: string): readonly AdminPermission[] {
  return isAdminRole(role) ? ROLE_PERMISSIONS[role] : [];
}

export function roleAllows(role: string, permission: AdminPermission): boolean {
  return permissionsFor(role).includes(permission);
}

/**
 * Human labels, so the console does not have to keep its own copy and drift.
 */
export const ROLE_LABEL: Record<AdminRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  support: 'Support',
  viewer: 'Viewer',
};

export const ROLE_DESCRIPTION: Record<AdminRole, string> = {
  owner: 'Full access, including creating and removing other console accounts.',
  admin: 'Everything except managing console accounts.',
  support: 'Answer tickets and look things up. Cannot disable accounts or change plans.',
  viewer: 'Read-only. Can see every screen and change nothing.',
};
