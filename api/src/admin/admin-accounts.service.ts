import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AdminAuthService } from './admin-auth.service';
import { isAdminRole, permissionsFor, type AdminRole } from './rbac';

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
  ) {}

  async list() {
    const rows = await this.db.query(
      `select id, email, name, role, disabled_at, last_login_at, created_at
         from admin_users order by created_at`,
    );
    return rows.map((row) => ({
      ...row,
      permissions: permissionsFor(String(row.role)),
    }));
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
    const target = await this.db.queryOne<{ role: AdminRole }>(
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
    if (!isAdminRole(input.role)) {
      throw new BadRequestException('Unknown role');
    }
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
    if (!isAdminRole(role)) throw new BadRequestException('Unknown role');
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
