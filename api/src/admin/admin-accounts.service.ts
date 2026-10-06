import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AdminAuthService } from './admin-auth.service';
import { AdminRolesService } from './admin-roles.service';
import { permissionsFor } from './rbac';

/**
 * The console's own accounts.
 *
 * Every method here can lock somebody out, including the caller, so the
 * invariants are enforced rather than left to the UI: the last owner cannot be
 * removed, demoted or disabled, and nobody can change their own role.
 */
@Injectable()
export class AdminAccountsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly auth: AdminAuthService,
    private readonly roles: AdminRolesService,
  ) {}

  async list() {
    const rows = await this.db.query<{
      role: string;
      role_permissions: string[];
      role_system: boolean;
      [key: string]: unknown;
    }>(
      `select u.id, u.email, u.name, u.role, r.label as role_label, u.disabled_at,
              u.last_login_at, u.created_at, u.must_change_password,
              u.totp_enabled_at is not null as two_factor,
              r.requires_two_factor as role_requires_two_factor,
              case when u.locked_until > now() then u.locked_until end as locked_until,
              u.failed_logins,
              r.permissions as role_permissions, r.system as role_system,
              (select count(*) from admin_sessions s
                where s.admin_id = u.id and s.revoked_at is null and s.expires_at > now())::int
                as sessions
         from admin_users u join admin_roles r on r.name = u.role
        order by u.created_at`,
    );
    return rows.map(({ role_permissions, role_system, ...row }) => ({
      ...row,
      permissions: permissionsFor(row.role, role_permissions, role_system),
    }));
  }

  private async assertRole(role: string) {
    if (!(await this.roles.exists(role))) throw new BadRequestException('Unknown role');
  }

  private async ownerCount(excludingId?: string): Promise<number> {
    const row = await this.db.queryOne<{ count: string }>(
      `select count(*)::text as count from admin_users
        where role = 'owner' and disabled_at is null
          and ($1::uuid is null or id <> $1)`,
      [excludingId ?? null],
    );
    return Number(row?.count ?? 0);
  }

  /**
   * Refuses any change that would leave the console with no owner.
   *
   * The failure mode this prevents is unrecoverable without database access:
   * demote the last owner and nobody can ever grant the role back.
   */
  private async assertNotLastOwner(id: string): Promise<void> {
    const target = await this.db.queryOne<{ role: string }>(
      'select role from admin_users where id = $1',
      [id],
    );
    if (target?.role !== 'owner') return;
    if ((await this.ownerCount(id)) === 0) {
      throw new BadRequestException(
        'This is the only owner. Promote someone else first.',
      );
    }
  }

  async create(input: {
    email: string;
    name: string;
    password: string;
    role: string;
  }) {
    await this.assertRole(input.role);
    if (input.password.length < 12) {
      throw new BadRequestException(
        'Console passwords must be at least 12 characters',
      );
    }

    const hash = await this.auth.hashPassword(input.password);
    try {
      // The password was typed by whoever made the account, and usually sent
      // to the new person over chat. It gets them in once; they choose their
      // own before they can do anything else.
      const row = await this.db.queryOne(
        `insert into admin_users (email, name, password_hash, role, must_change_password)
         values ($1, $2, $3, $4, true)
         returning id, email, name, role, created_at`,
        [input.email.trim().toLowerCase(), input.name.trim(), hash, input.role],
      );
      return row;
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new ConflictException('That email already has a console account');
      }
      throw err;
    }
  }

  async setRole(id: string, role: string, actingAdminId: string) {
    await this.assertRole(role);
    // Self-promotion is the hole that makes every other permission check
    // decorative, and self-demotion is a way to lock the console.
    if (id === actingAdminId) {
      throw new BadRequestException('You cannot change your own role');
    }
    await this.assertNotLastOwner(id);

    const row = await this.db.queryOne(
      `update admin_users set role = $2, updated_at = now()
        where id = $1 returning id, email, name, role`,
      [id, role],
    );
    if (!row) throw new NotFoundException('No such console account');

    // A demotion has to take effect now, not when their access token expires.
    await this.auth.revokeAllFor(id);
    return row;
  }

  async setDisabled(id: string, disabled: boolean, actingAdminId: string) {
    if (id === actingAdminId) {
      throw new BadRequestException('You cannot disable your own account');
    }
    if (disabled) await this.assertNotLastOwner(id);

    const row = await this.db.queryOne(
      `update admin_users
          set disabled_at = case when $2 then now() else null end,
              updated_at = now()
        where id = $1 returning id, email, name, role, disabled_at`,
      [id, disabled],
    );
    if (!row) throw new NotFoundException('No such console account');
    if (disabled) await this.auth.revokeAllFor(id);
    return row;
  }

  async setPassword(id: string, password: string, actingAdminId: string) {
    if (password.length < 12) {
      throw new BadRequestException(
        'Console passwords must be at least 12 characters',
      );
    }
    const hash = await this.auth.hashPassword(password);
    // A password set for somebody else is known to two people, so its owner
    // replaces it at their next sign-in. Setting your own is just a change.
    const row = await this.db.queryOne(
      `update admin_users
          set password_hash = $2,
              must_change_password = (id <> $3::uuid),
              updated_at = now()
        where id = $1 returning id, email`,
      [id, hash, actingAdminId],
    );
    if (!row) throw new NotFoundException('No such console account');
    // Changing a password ends every other session, which is the whole point
    // of changing it after a suspected compromise.
    await this.auth.revokeAllFor(id);
    return row;
  }

  async remove(id: string, actingAdminId: string) {
    if (id === actingAdminId) {
      throw new BadRequestException('You cannot delete your own account');
    }
    await this.assertNotLastOwner(id);
    const row = await this.db.queryOne(
      'delete from admin_users where id = $1 returning id, email',
      [id],
    );
    if (!row) throw new NotFoundException('No such console account');
    return row;
  }
}
