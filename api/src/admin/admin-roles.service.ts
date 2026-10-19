import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  PERMISSION_GROUPS,
  permissionsFor,
  validateCustomPermissions,
} from './rbac';

interface RoleRow {
  name: string;
  label: string;
  description: string;
  permissions: string[];
  requires_two_factor: boolean;
  system: boolean;
  members: number;
}

export interface RoleInput {
  label?: string;
  description?: string;
  permissions?: string[];
  requiresTwoFactor?: boolean;
}

/** "Night shift support" → "night-shift-support". */
export function slugFor(label: string): string {
  const slug = label
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28);
  return /^[a-z]/.test(slug) ? slug : `role-${slug}`.slice(0, 28);
}

/**
 * Roles: the four built in, and those an owner defines.
 *
 * A built-in role's permissions cannot be edited — only its description and
 * whether it requires two-factor, and the owner role always does. A custom
 * role cannot be given owner-only permissions (see rbac.ts) and cannot be
 * deleted while anyone holds it.
 */
@Injectable()
export class AdminRolesService {
  constructor(private readonly db: DatabaseService) {}

  async list() {
    const rows = await this.db.query<RoleRow>(
      `select r.*, (select count(*) from admin_users u where u.role = r.name)::int as members
         from admin_roles r
        order by r.system desc,
                 array_position(array['owner','admin','support','viewer'], r.name),
                 r.label`,
    );
    return {
      roles: rows.map((r) => ({
        name: r.name,
        label: r.label,
        description: r.description,
        system: r.system,
        requiresTwoFactor: r.requires_two_factor,
        members: r.members,
        // As stored, wildcards and all, so the editor can show "all of
        // Support" ticked rather than three separate boxes.
        grants: r.system ? [] : r.permissions,
        permissions: permissionsFor(r.name, r.permissions, r.system),
      })),
      catalog: PERMISSION_GROUPS,
    };
  }

  /** Name, label and description for the role pickers, in display order. */
  async summaries() {
    return (await this.list()).roles.map((r) => ({
      name: r.name,
      label: r.label,
      description: r.description,
      system: r.system,
    }));
  }

  async exists(name: string): Promise<boolean> {
    return !!(await this.db.queryOne('select 1 from admin_roles where name = $1', [name]));
  }

  private checked(list: string[]): string[] {
    try {
      return validateCustomPermissions(list);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }

  async create(input: RoleInput) {
    const label = input.label?.trim();
    if (!label) throw new BadRequestException('Give the role a name');
    const permissions = this.checked(input.permissions ?? []);
    if (permissions.length === 0) {
      throw new BadRequestException('A role needs at least one permission');
    }

    // The name is derived, then made unique: two roles called "Support lead"
    // get support-lead and support-lead-2.
    const base = slugFor(label);
    for (let n = 1; n < 50; n += 1) {
      const name = n === 1 ? base : `${base}-${n}`;
      const row = await this.db.queryOne(
        `insert into admin_roles (name, label, description, permissions, requires_two_factor)
         values ($1, $2, $3, $4, $5)
         on conflict (name) do nothing
         returning name`,
        [name, label, input.description?.trim() ?? '', permissions, input.requiresTwoFactor ?? false],
      );
      if (row) return row as { name: string };
    }
    throw new ConflictException('Too many roles with that name');
  }

  async update(name: string, input: RoleInput) {
    const current = await this.db.queryOne<RoleRow>(
      'select * from admin_roles where name = $1',
      [name],
    );
    if (!current) throw new NotFoundException('No such role');

    if (current.system) {
      if (input.permissions !== undefined || (input.label !== undefined && input.label !== current.label)) {
        throw new BadRequestException(
          'Built-in roles keep their name and permissions. Make a custom role instead.',
        );
      }
      if (name === 'owner' && input.requiresTwoFactor === false) {
        throw new BadRequestException('Owners always need two-factor.');
      }
    }

    const permissions =
      input.permissions === undefined ? current.permissions : this.checked(input.permissions);
    if (!current.system && permissions.length === 0) {
      throw new BadRequestException('A role needs at least one permission');
    }

    return this.db.queryOne(
      `update admin_roles
          set label = $2, description = $3, permissions = $4, requires_two_factor = $5,
              updated_at = now()
        where name = $1
        returning name, label`,
      [
        name,
        input.label?.trim() || current.label,
        input.description?.trim() ?? current.description,
        permissions,
        input.requiresTwoFactor ?? current.requires_two_factor,
      ],
    );
  }

  async remove(name: string) {
    const current = await this.db.queryOne<RoleRow>(
      `select r.*, (select count(*) from admin_users u where u.role = r.name)::int as members
         from admin_roles r where r.name = $1`,
      [name],
    );
    if (!current) throw new NotFoundException('No such role');
    if (current.system) throw new BadRequestException('Built-in roles cannot be deleted');
    if (current.members > 0) {
      throw new ConflictException(
        `${current.members} ${current.members === 1 ? 'account holds' : 'accounts hold'} this role. Move them to another first.`,
      );
    }
    await this.db.query('delete from admin_roles where name = $1', [name]);
    return { name };
  }
}
