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
    expect(permissionsFor('admin')).not.toContain('users.delete');
    expect(permissionsFor('owner')).toContain('users.delete');
    expect(permissionsFor('support')).toEqual(expect.arrayContaining(['users.notes', 'users.assist']));
    expect(permissionsFor('support')).not.toContain('users.security');
  });

  it('expands an area wildcard to every permission in it', () => {
    expect(expandPermissions(['support.*', 'promos.read'])).toEqual([
      'promos.read',
      'support.read',
      'support.reply',
      'support.manage',
    ]);
  });

  it('never lets a custom role manage staff or delete accounts, whatever the row says', () => {
    expect(expandPermissions(['admins.*'])).toEqual(['admins.read']);
    expect(expandPermissions(['users.*'])).not.toContain('users.delete');
    expect(expandPermissions(['users.*'])).toContain('users.security');
    expect(validateCustomPermissions(['users.*', 'admins.*'])).toEqual(['admins.*', 'users.*']);
    expect(() => validateCustomPermissions(['users.delete'])).toThrow(/owner-only/);
    expect(expandPermissions(['admins.manage', 'audit.read'])).toEqual(['audit.read']);
    expect(permissionsFor('night-shift', ['admins.manage'], false)).toEqual([]);
  });

  it('drops names it does not know instead of trusting them', () => {
    expect(expandPermissions(['users.read', 'users.purge', 'nonsense'])).toEqual(['users.read']);
  });

  it('refuses an owner-only or unknown permission at save time, with a reason', () => {
    expect(() => validateCustomPermissions(['admins.manage'])).toThrow(/owner-only/);
    expect(() => validateCustomPermissions(['users.purge'])).toThrow(/Unknown permission/);
    expect(() => validateCustomPermissions(['ghosts.*'])).toThrow(/Unknown area/);
    expect(validateCustomPermissions(['support.*', 'users.read', 'users.read'])).toEqual([
      'support.*',
      'users.read',
    ]);
  });
});
