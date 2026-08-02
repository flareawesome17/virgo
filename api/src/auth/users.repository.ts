import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  avatar_url: string | null;
  title: string | null;
  phone: string | null;
  website: string | null;
  location: string | null;
  bio: string | null;
  /** Whether name search can surface this account. Email lookup is unaffected. */
  discoverable: boolean;
  /** Null until the address is proven by following a verification link. */
  email_verified_at: Date | null;
  /** What they do on a shoot. See auth/roles.ts. */
  roles: string[];
  /**
   * When a self-imposed pause ends. Null, or in the past, means active.
   *
   * A date rather than a flag so it lifts on its own — see migration 027.
   */
  disabled_until: Date | null;
  /** When they last disabled it. Kept after it lifts, as history. */
  disabled_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/** Shape returned to clients — never includes password_hash. */
export interface PublicUser {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  title: string | null;
  phone: string | null;
  website: string | null;
  location: string | null;
  bio: string | null;
  discoverable: boolean;
  emailVerified: boolean;
  roles: string[];
  createdAt: Date;
}

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    title: row.title,
    phone: row.phone,
    website: row.website,
    location: row.location,
    bio: row.bio,
    // Defaulted rather than assumed present: a row read before migration 020
    // has no column, and search should stay open in that case.
    discoverable: row.discoverable ?? true,
    emailVerified: !!row.email_verified_at,
    // Defaulted for rows written before the column existed.
    roles: row.roles ?? [],
    createdAt: row.created_at,
  };
}

/** Columns a user may edit on their own profile. */
export type ProfileFields = Partial<
  Pick<
    UserRow,
    | 'display_name'
    | 'avatar_url'
    | 'title'
    | 'phone'
    | 'website'
    | 'location'
    | 'bio'
    | 'discoverable'
    | 'roles'
  >
>;

@Injectable()
export class UsersRepository {
  constructor(private readonly db: DatabaseService) {}

  /** Emails are stored lowercase; callers must pass an already-normalized value. */
  async findByEmail(email: string): Promise<UserRow | null> {
    return this.db.queryOne<UserRow>('select * from users where email = $1', [
      email,
    ]);
  }

  async findById(id: string): Promise<UserRow | null> {
    return this.db.queryOne<UserRow>('select * from users where id = $1', [id]);
  }

  async create(
    email: string,
    passwordHash: string,
    displayName?: string,
    roles: string[] = [],
  ): Promise<UserRow> {
    const row = await this.db.queryOne<UserRow>(
      `insert into users (email, password_hash, display_name, roles)
       values ($1, $2, $3, $4::text[])
       returning *`,
      [email, passwordHash, displayName ?? null, roles],
    );
    return row as UserRow;
  }

  /**
   * Updates the editable profile fields. Only keys actually supplied are
   * touched, so a partial PATCH cannot blank out the fields it omits.
   * Returns null when the user does not exist.
   */
  async updateProfile(
    id: string,
    fields: ProfileFields,
  ): Promise<UserRow | null> {
    const entries = Object.entries(fields).filter(
      ([, value]) => value !== undefined,
    );
    if (entries.length === 0) return this.findById(id);

    const assignments = entries.map(([column], i) => `${column} = $${i + 1}`);
    const params = [...entries.map(([, value]) => value), id];

    return this.db.queryOne<UserRow>(
      `update users set ${assignments.join(', ')}
        where id = $${params.length}
        returning *`,
      params,
    );
  }

  async storeRefreshToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.db.query(
      `insert into refresh_tokens (user_id, token_hash, expires_at)
       values ($1, $2, $3)`,
      [userId, tokenHash, expiresAt],
    );
  }

  /** Returns the row only when it is unrevoked and unexpired. */
  async findActiveRefreshToken(
    tokenHash: string,
  ): Promise<{ id: string; user_id: string } | null> {
    return this.db.queryOne<{ id: string; user_id: string }>(
      `select id, user_id from refresh_tokens
        where token_hash = $1
          and revoked_at is null
          and expires_at > now()`,
      [tokenHash],
    );
  }

  async revokeRefreshToken(tokenHash: string): Promise<void> {
    await this.db.query(
      `update refresh_tokens set revoked_at = now()
        where token_hash = $1 and revoked_at is null`,
      [tokenHash],
    );
  }

  /** Used on password change, "sign out everywhere", disable and delete. */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.db.query(
      `update refresh_tokens set revoked_at = now()
        where user_id = $1 and revoked_at is null`,
      [userId],
    );
  }

  /** Pauses the account until `until`. */
  async disable(userId: string, until: Date): Promise<UserRow | null> {
    return this.db.queryOne<UserRow>(
      `update users set disabled_until = $2, disabled_at = now(), updated_at = now()
        where id = $1
        returning *`,
      [userId, until],
    );
  }

  /**
   * Lifts a pause early.
   *
   * `disabled_at` is kept: it is the record that the user did this, and the
   * app says "you paused this on the 14th" rather than nothing.
   */
  async enable(userId: string): Promise<UserRow | null> {
    return this.db.queryOne<UserRow>(
      `update users set disabled_until = null, updated_at = now()
        where id = $1
        returning *`,
      [userId],
    );
  }

  /**
   * Removes the account.
   *
   * Everything owned by the user is reached by `on delete cascade` from
   * users.id — workspaces, albums, events, reminders, messages, friendships,
   * tokens. Deleting the row is the whole operation; the storage objects are
   * the caller's job, because they live in a bucket Postgres knows nothing
   * about.
   */
  async remove(userId: string): Promise<boolean> {
    const rows = await this.db.query<{ id: string }>(
      'delete from users where id = $1 returning id',
      [userId],
    );
    return rows.length > 0;
  }
}
