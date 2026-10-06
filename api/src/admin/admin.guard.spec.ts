import 'reflect-metadata';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { AdminPromosController } from '../promos/admin-promos.controller';
import type { AdminAuthService, AdminIdentity } from './admin-auth.service';
import { AdminController } from './admin.controller';
import { AdminSecurityController } from './admin-security.controller';
import { AdminGuard, PENDING_SETUP_KEY, PERMISSION_KEY } from './admin.guard';
import { AdminSupportController } from './support.controller';
import { permissionsFor } from './rbac';

/** Every controller AdminGuard sits in front of. */
const GUARDED = [
  AdminController,
  AdminSecurityController,
  AdminSupportController,
  AdminPromosController,
];

/** The handlers on a controller that Nest routes to. */
function routes(controller: { prototype: object }) {
  const proto = controller.prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(proto)
    .filter((name) => name !== 'constructor')
    .map((name) => ({ name, handler: proto[name] as object }))
    .filter(({ handler }) => Reflect.getMetadata(PATH_METADATA, handler) !== undefined);
}

/**
 * The guard refuses a route with no permission declared, for everyone.
 *
 * That is the right failure, but it is a silent one in the console: the
 * showcase-reports route shipped without one and its tab answered 403 to
 * every role, owners included. This catches the next one before it ships.
 */
describe('console routes', () => {
  it.each(GUARDED.map((c) => [c.name, c] as const))(
    '%s declares a permission on every route',
    (_name, controller) => {
      const missing = routes(controller)
        .filter(({ handler }) => !Reflect.getMetadata(PERMISSION_KEY, handler))
        .map(({ name }) => name);
      expect(missing).toEqual([]);
    },
  );

  it('lets unfinished setup reach only "me", the password change and two-factor setup', () => {
    const open = GUARDED.flatMap((controller) =>
      routes(controller)
        .filter(({ handler }) => Reflect.getMetadata(PENDING_SETUP_KEY, handler))
        .map(({ name }) => `${controller.name}.${name}`),
    );
    expect(open.sort()).toEqual([
      'AdminController.changeOwnPassword',
      'AdminController.me',
      'AdminSecurityController.enableTwoFactor',
      'AdminSecurityController.setUpTwoFactor',
    ]);
  });
});

describe('AdminGuard and a password someone else chose', () => {
  function guardFor(identity: Partial<AdminIdentity>) {
    const admin: AdminIdentity = {
      id: 'admin-1',
      email: 'staff@virgo.ph',
      name: 'Staff',
      role: 'owner',
      roleLabel: 'Owner',
      permissions: permissionsFor('owner'),
      mustChangePassword: false,
      twoFactorEnabled: true,
      twoFactorRequired: true,
      mustSetUpTwoFactor: false,
      ...identity,
    };
    const auth = { verify: jest.fn(async () => admin) } as unknown as AdminAuthService;
    return new AdminGuard(auth, new Reflector());
  }

  function contextFor(handler: object): ExecutionContext {
    const req = { headers: { authorization: 'Bearer token' } };
    return {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => handler,
      getClass: () => AdminController,
    } as unknown as ExecutionContext;
  }

  const proto = AdminController.prototype;

  it('refuses everything else until the password is changed', async () => {
    const guard = guardFor({ mustChangePassword: true });
    await expect(guard.canActivate(contextFor(proto.overview))).rejects.toThrow(
      ForbiddenException,
    );
    await expect(guard.canActivate(contextFor(proto.users))).rejects.toThrow(
      'Choose a new password before continuing',
    );
  });

  it('still lets the account read itself and change the password', async () => {
    const guard = guardFor({ mustChangePassword: true });
    await expect(guard.canActivate(contextFor(proto.me))).resolves.toBe(true);
    await expect(guard.canActivate(contextFor(proto.changeOwnPassword))).resolves.toBe(true);
  });

  it('lets the account through once it has its own password', async () => {
    const guard = guardFor({ mustChangePassword: false });
    await expect(guard.canActivate(contextFor(proto.overview))).resolves.toBe(true);
  });
});

describe('AdminGuard and two-factor a role requires', () => {
  const security = AdminSecurityController.prototype;

  function guardFor(identity: Partial<AdminIdentity>) {
    const admin: AdminIdentity = {
      id: 'admin-1',
      email: 'staff@virgo.ph',
      name: 'Staff',
      role: 'admin',
      roleLabel: 'Admin',
      permissions: permissionsFor('admin'),
      mustChangePassword: false,
      twoFactorEnabled: false,
      twoFactorRequired: true,
      mustSetUpTwoFactor: true,
      ...identity,
    };
    const auth = { verify: jest.fn(async () => admin) } as unknown as AdminAuthService;
    return new AdminGuard(auth, new Reflector());
  }

  function contextFor(handler: object, controller: object): ExecutionContext {
    const req = { headers: { authorization: 'Bearer token' } };
    return {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => handler,
      getClass: () => controller,
    } as unknown as ExecutionContext;
  }

  it('holds the account at setup until it has enrolled', async () => {
    const guard = guardFor({});
    await expect(
      guard.canActivate(contextFor(AdminController.prototype.users, AdminController)),
    ).rejects.toThrow('Set up two-factor sign-in before continuing');
    await expect(
      guard.canActivate(contextFor(security.setUpTwoFactor, AdminSecurityController)),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(contextFor(AdminController.prototype.me, AdminController)),
    ).resolves.toBe(true);
  });

  it('serves a signed-in route to a custom role with no permissions at all', async () => {
    const guard = guardFor({ role: 'night-shift', permissions: [], mustSetUpTwoFactor: false });
    await expect(
      guard.canActivate(contextFor(security.mySecurity, AdminSecurityController)),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(contextFor(AdminController.prototype.overview, AdminController)),
    ).rejects.toThrow(ForbiddenException);
  });
});
