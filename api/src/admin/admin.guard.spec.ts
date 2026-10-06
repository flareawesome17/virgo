import 'reflect-metadata';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { AdminPromosController } from '../promos/admin-promos.controller';
import type { AdminAuthService, AdminIdentity } from './admin-auth.service';
import { AdminController } from './admin.controller';
import { AdminGuard, PASSWORD_CHANGE_KEY, PERMISSION_KEY } from './admin.guard';
import { AdminSupportController } from './support.controller';
import { permissionsFor } from './rbac';

/** Every controller AdminGuard sits in front of. */
const GUARDED = [AdminController, AdminSupportController, AdminPromosController];

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

  it('lets a pending password change reach only "me" and the change itself', () => {
    const open = GUARDED.flatMap((controller) =>
      routes(controller)
        .filter(({ handler }) => Reflect.getMetadata(PASSWORD_CHANGE_KEY, handler))
        .map(({ name }) => `${controller.name}.${name}`),
    );
    expect(open.sort()).toEqual(['AdminController.changeOwnPassword', 'AdminController.me']);
  });
});

describe('AdminGuard and a password someone else chose', () => {
  function guardFor(identity: Partial<AdminIdentity>) {
    const admin: AdminIdentity = {
      id: 'admin-1',
      email: 'staff@virgo.ph',
      name: 'Staff',
      role: 'owner',
      permissions: permissionsFor('owner'),
      mustChangePassword: false,
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
