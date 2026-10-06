/**
 * Who can do what in the management console.
 *
 * Four built-in roles whose permissions are fixed here, plus roles an owner
 * defines in the console (the `admin_roles` table). Built-in permissions live
 * in code rather than the table so the owner role can never be edited into one
 * that cannot manage roles, and so a deploy can add a permission to "admin"
 * without a data migration.
 *
 * Deliberately separate from `api/src/auth/roles.ts`, which is what somebody
 * does on a shoot. Those are never permissions and must never be read as any.
 */

export const SYSTEM_ROLES = ['owner', 'admin', 'support', 'viewer'] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

/** A role's name: a built-in one or a custom slug from `admin_roles`. */
export type AdminRole = string;

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
  // Notes and tags on a customer — writing down what happened, so the next
  // person to pick up the account does not ask the customer again.
  'users.notes',
  // Sending a customer the emails they could ask for themselves: a password
  // reset link, a fresh verification link. Nothing changes until they act.
  'users.assist',
  // Changing an account's security on its behalf: marking it verified,
  // removing its two-factor, signing its devices out. A social-engineering
  // target, so it sits with admins, not support.
  'users.security',
  // Deleting an account and everything in it. Owner-only.
  'users.delete',

  'content.read',
  'content.moderate',
  // Reading what was said in a reported chat: the copy taken when it was
  // reported, never the conversation. Private messages, so it sits with the
  // people who act on reports rather than with everyone who can see them.
  'content.evidence',

  'billing.read',
  'billing.manage',

  // Promos hand out quota, which costs storage the same way a plan change
  // does — so managing them sits at the same tier as `users.setPlan`, not at
  // the support tier that can only look.
  'promos.read',
  'promos.manage',

  'support.read',
  'support.reply',
  'support.manage',

  'system.read',

  // Managing the console's own accounts, roles and sessions. Owner-only: an
  // account that can grant roles can grant itself anything, which makes every
  // other line here decorative.
  'admins.read',
  'admins.manage',

  'audit.read',
] as const;
export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

/**
 * Marks a route any signed-in console account may use — reading itself,
 * changing its own password, its own two-factor and sessions.
 *
 * Those used to require `overview.read` on the grounds that every role had it.
 * A custom role need not, and an account that cannot read who it is has a
 * console that cannot render.
 */
export const SIGNED_IN = '@signed-in' as const;

/** What a custom role may never hold. See `admins.manage` and `users.delete` above. */
export const OWNER_ONLY: readonly AdminPermission[] = ['admins.manage', 'users.delete'];

export interface PermissionGroup {
  key: string;
  label: string;
  permissions: { key: AdminPermission; label: string; description: string }[];
}

/**
 * The permissions as the console's role editor shows them: grouped by area,
 * each with a plain sentence. Every entry in ADMIN_PERMISSIONS appears here
 * exactly once (rbac.spec.ts holds it to that).
 */
export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: 'overview',
    label: 'Overview',
    permissions: [
      { key: 'overview.read', label: 'See the overview', description: 'Totals, signups and site visits.' },
    ],
  },
  {
    key: 'users',
    label: 'Virgo users',
    permissions: [
      { key: 'users.read', label: 'Look up accounts', description: 'Profiles, storage, albums and tickets.' },
      { key: 'users.disable', label: 'Suspend accounts', description: 'Sign someone out everywhere and stop them signing in.' },
      { key: 'users.setPlan', label: 'Change plans', description: 'Raise or lower what an account may store.' },
      { key: 'users.notes', label: 'Notes and tags', description: 'Write internal notes and tag customers.' },
      { key: 'users.assist', label: 'Send account emails', description: 'Password reset and verification links, sent to the customer.' },
      { key: 'users.security', label: 'Change account security', description: 'Mark verified, remove two-factor, sign devices out.' },
      { key: 'users.delete', label: 'Delete accounts', description: 'Owner only. Removes the account and every file in it.' },
    ],
  },
  {
    key: 'content',
    label: 'Content',
    permissions: [
      { key: 'content.read', label: 'See content and reports', description: 'Albums, client links and what people reported.' },
      { key: 'content.moderate', label: 'Moderate', description: 'Close reports: dismiss, hide posts and jobs, warn, remove comments, revoke client links.' },
      { key: 'content.evidence', label: 'Read reported messages', description: 'The messages a chat report brought with it, copied when it was filed. Never the conversation itself.' },
    ],
  },
  {
    key: 'support',
    label: 'Support',
    permissions: [
      { key: 'support.read', label: 'Read tickets', description: 'Every ticket and its thread, internal notes included.' },
      { key: 'support.reply', label: 'Reply', description: 'Answer customers and leave internal notes.' },
      { key: 'support.manage', label: 'Triage', description: 'Change status and priority, assign tickets.' },
    ],
  },
  {
    key: 'billing',
    label: 'Billing',
    permissions: [
      { key: 'billing.read', label: 'See subscriptions', description: 'What people pay and when it renews.' },
      { key: 'billing.manage', label: 'Manage billing', description: 'Reserved for refunds and plan changes with payment.' },
    ],
  },
  {
    key: 'promos',
    label: 'Promos',
    permissions: [
      { key: 'promos.read', label: 'See promos', description: 'Rewards and who holds them.' },
      { key: 'promos.manage', label: 'Hand out promos', description: 'Create rewards and offer them to accounts.' },
    ],
  },
  {
    key: 'system',
    label: 'System',
    permissions: [
      { key: 'system.read', label: 'See system health', description: 'Live checks of the database, storage and mail.' },
    ],
  },
  {
    key: 'admins',
    label: 'Console accounts',
    permissions: [
      { key: 'admins.read', label: 'See staff', description: 'Console accounts, roles, sign-ins and sessions.' },
      { key: 'admins.manage', label: 'Manage staff', description: 'Owner only. Create accounts, set roles, end sessions.' },
    ],
  },
  {
    key: 'audit',
    label: 'Audit log',
    permissions: [
      { key: 'audit.read', label: 'Read the audit log', description: 'Every change staff made, and who looked at whom.' },
    ],
  },
];

const SUPPORT: AdminPermission[] = [
  'overview.read',
  'users.read',
  'users.notes',
  'users.assist',
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
  'users.security',
  'content.moderate',
  'content.evidence',
  'billing.manage',
  'support.manage',
  'audit.read',
  'admins.read',
];

/**
 * The built-in matrix.
 *
 * `viewer` is read-only on purpose: it is the role to hand to someone who
 * needs the numbers and should not be able to change anything, which is most
 * people who ask for access.
 */
export const ROLE_PERMISSIONS: Record<SystemRole, readonly AdminPermission[]> = {
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

export function isSystemRole(value: string): value is SystemRole {
  return (SYSTEM_ROLES as readonly string[]).includes(value);
}

function isPermission(value: string): value is AdminPermission {
  return (ADMIN_PERMISSIONS as readonly string[]).includes(value);
}

/**
 * Expands a stored list into real permissions.
 *
 * `users.*` means every `users.` permission that exists now — including ones
 * a later deploy adds. Unknown names are dropped rather than trusted, and the
 * owner-only ones never survive into a custom role whatever the row says.
 */
export function expandPermissions(stored: readonly string[]): AdminPermission[] {
  const out = new Set<AdminPermission>();
  for (const entry of stored) {
    if (entry.endsWith('.*')) {
      const area = entry.slice(0, -1);
      for (const p of ADMIN_PERMISSIONS) if (p.startsWith(area)) out.add(p);
    } else if (isPermission(entry)) {
      out.add(entry);
    }
  }
  for (const p of OWNER_ONLY) out.delete(p);
  return ADMIN_PERMISSIONS.filter((p) => out.has(p));
}

/** What an account with this role may do. */
export function permissionsFor(
  role: string,
  stored: readonly string[] = [],
  system = isSystemRole(role),
): readonly AdminPermission[] {
  if (system) return isSystemRole(role) ? ROLE_PERMISSIONS[role] : [];
  return expandPermissions(stored);
}

/**
 * Checks a custom role's list before it is saved, and says what is wrong.
 *
 * Returns the list as it will be stored: known permissions and `<area>.*`
 * wildcards, de-duplicated. Refusing rather than silently dropping, so an
 * owner who ticked "Manage staff" learns why it did not stick.
 */
export function validateCustomPermissions(list: readonly string[]): string[] {
  const areas = new Set(PERMISSION_GROUPS.map((g) => g.key));
  const kept = new Set<string>();
  for (const raw of list) {
    const entry = raw.trim();
    if (entry.endsWith('.*')) {
      // Allowed even where the area holds an owner-only permission: the
      // wildcard expands to everything else in it (see expandPermissions).
      const area = entry.slice(0, -2);
      if (!areas.has(area)) throw new Error(`Unknown area: ${entry}`);
      kept.add(entry);
    } else if (isPermission(entry)) {
      if (OWNER_ONLY.includes(entry)) {
        throw new Error(`${entry} is owner-only and cannot be part of a custom role.`);
      }
      kept.add(entry);
    } else {
      throw new Error(`Unknown permission: ${entry}`);
    }
  }
  return [...kept].sort();
}
