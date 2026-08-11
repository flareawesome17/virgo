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
   * Postal address, collected at signup. Private — see PublicUser below for
   * why it is safe to return. Null on accounts made before migration 050.
   */
  address_line1: string | null;
  address_line2: string | null;
  address_city: string | null;
  address_province: string | null;
  address_postal: string | null;
  address_country: string | null;
  /** What they trade as, if that is not their own name. */
  studio_name: string | null;
  /** A handle, a page or a URL — whatever they actually use. */
  social_handle: string | null;
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

/**
 * Shape returned to clients — never includes password_hash.
 *
 * "Public" here means "safe to serialise", not "public to everybody". Every
 * caller resolves the row from the authenticated session's own id — /auth/me,
 * register, login, refresh, updateProfile, enable — so this only ever reaches
 * the account it describes. That is what makes it safe to carry the postal
 * address, which is otherwise private.
 *
 * Another person's details go through PublicProfile (profiles module) or
 * NearbyPerson (discover), which are separate shapes and carry no address. If
 * this one ever starts serving somebody else's row, the address has to come
 * back out of it first.
 */
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
  addressLine1: string | null;
  addressLine2: string | null;
  addressCity: string | null;
  addressProvince: string | null;
  addressPostal: string | null;
  addressCountry: string | null;
  studioName: string | null;
  socialHandle: string | null;
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
    // Null on accounts made before migration 050, which is not an error —
    // they signed up before there was anywhere to put an address.
    addressLine1: row.address_line1 ?? null,
    addressLine2: row.address_line2 ?? null,
    addressCity: row.address_city ?? null,
    addressProvince: row.address_province ?? null,
    addressPostal: row.address_postal ?? null,
    addressCountry: row.address_country ?? null,
    studioName: row.studio_name ?? null,
    socialHandle: row.social_handle ?? null,
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
    | 'address_line1'
    | 'address_line2'
    | 'address_city'
    | 'address_province'
    | 'address_postal'
    | 'address_country'
    | 'studio_name'
    | 'social_handle'
  >
>;

/**
 * What signup collects beyond the credentials.
 *
 * Every field optional here even though the API requires most of them: this
 * is the storage layer, and the accounts that predate the address have none
 * of it. The requirement lives in RegisterDto, where it can be explained to
 * the person filling the form in.
 */
export interface SignupDetails {
  addressLine1?: string;
  addressLine2?: string;
  addressCity?: string;
  addressProvince?: string;
  addressPostal?: string;
  addressCountry?: string;
  studioName?: string;
  socialHandle?: string;
  /**
   * Resolved from a referral code before this call, never the raw code — an
   * unknown code is a no-op signup detail, not a failed registration, and that
   * decision belongs in the service rather than in an insert.
   */
  referredByUserId?: string;
}

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
    // An object rather than six more positional arguments: a create() with
    // ten parameters is a call site nobody can read and one transposition
    // away from storing a province in a postal code.
    details: SignupDetails = {},
  ): Promise<UserRow> {
    const row = await this.db.queryOne<UserRow>(
      `insert into users (
         email, password_hash, display_name, roles,
         address_line1, address_line2, address_city, address_province,
         address_postal, address_country, studio_name, social_handle,
         referred_by_user_id
       )
       values ($1, $2, $3, $4::text[], $5, $6, $7, $8, $9, $10, $11, $12, $13)
       returning *`,
      [
        email,
        passwordHash,
        displayName ?? null,
        roles,
        details.addressLine1 ?? null,
        details.addressLine2 ?? null,
        details.addressCity ?? null,
        details.addressProvince ?? null,
        details.addressPostal ?? null,
        details.addressCountry ?? null,
        details.studioName ?? null,
        details.socialHandle ?? null,
        details.referredByUserId ?? null,
      ],
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
