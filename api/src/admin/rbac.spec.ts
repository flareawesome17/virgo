import {
  ADMIN_PERMISSIONS,
  PERMISSION_GROUPS,
  ROLE_PERMISSIONS,
  expandPermissions,
  permissionsFor,
  validateCustomPermissions,
} from './rbac';

describe('rbac', () => {
  it('lists every permission in the editor exactly once', () => {
    const listed = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));
    expect([...listed].sort()).toEqual([...ADMIN_PERMISSIONS].sort());
    expect(new Set(listed).size).toBe(listed.length);
    for (const group of PERMISSION_GROUPS) {
      for (const p of group.permissions) expect(p.key.startsWith(`${group.key}.`)).toBe(true);
    }
  });

  it('keeps the built-in roles where they were', () => {
    expect(permissionsFor('owner')).toEqual([...ADMIN_PERMISSIONS]);
    expect(permissionsFor('viewer')).toEqual(ROLE_PERMISSIONS.viewer);
    expect(permissionsFor('support')).toContain('support.reply');
    expect(permissionsFor('admin')).not.toContain('admins.manage');
  });

  it('expands an area wildcard to every permission in it', () => {
    expect(expandPermissions(['support.*', 'promos.read'])).toEqual([
      'promos.read',
      'support.read',
      'support.reply',
      'support.manage',
    ]);
  });

  it('never lets a custom role manage staff, whatever the row says', () => {
    expect(expandPermissions(['admins.*'])).toEqual(['admins.read']);
    expect(expandPermissions(['admins.manage', 'audit.read'])).toEqual(['audit.read']);
    expect(permissionsFor('night-shift', ['admins.manage'], false)).toEqual([]);
  });

  it('drops names it does not know instead of trusting them', () => {
    expect(expandPermissions(['users.read', 'users.delete', 'nonsense'])).toEqual(['users.read']);
  });

  it('refuses an owner-only or unknown permission at save time, with a reason', () => {
    expect(() => validateCustomPermissions(['admins.manage'])).toThrow(/owner-only/);
    expect(() => validateCustomPermissions(['admins.*'])).toThrow(/owner-only/);
    expect(() => validateCustomPermissions(['users.delete'])).toThrow(/Unknown permission/);
    expect(() => validateCustomPermissions(['ghosts.*'])).toThrow(/Unknown area/);
    expect(validateCustomPermissions(['support.*', 'users.read', 'users.read'])).toEqual([
      'support.*',
      'users.read',
    ]);
  });
});
