import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PortfolioService, type PortfolioItem } from './portfolio.service';
import {
  HANDLE_CHANGE_COOLDOWN_DAYS,
  handleProblem,
  handleProblemMessage,
  normalizeHandle,
} from './handles';

/**
 * What the open web is allowed to see.
 *
 * Written as an explicit shape rather than a spread of a user row, because the
 * failure mode of the alternative is silent and permanent: add a column to
 * `users` one day, and `{...row}` publishes it to Google the same afternoon.
 * Everything here was chosen; nothing arrives by accident.
 */
export interface PublicProfile {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  title: string | null;
  bio: string | null;
  /** The free-text city they typed, never coordinates. */
  location: string | null;
  website: string | null;
  roles: string[];
  /** Year only. "Since 2026" is context; a join date is a fingerprint. */
  memberSince: number;
  /** Their chosen work, in their chosen order. Empty is a valid profile. */
  portfolio: PortfolioItem[];
}

/** Everything that must never reach the public payload, asserted in tests. */
export const NEVER_PUBLIC = [
  'email',
  'phone',
  'latitude',
  'longitude',
  'location_updated_at',
  'shares_location',
  'last_seen_at',
  'plan',
  'plan_since',
  'paymongo_customer_id',
  'password_hash',
  'discoverable',
  'email_verified_at',
  'disabled_until',
  'disabled_at',
  'id',
] as const;

interface ProfileRow {
  id: string;
  handle: string;
  display_name: string | null;
  email: string;
  avatar_url: string | null;
  title: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  roles: string[] | null;
  created_at: Date;
}

@Injectable()
export class ProfilesService {
  private readonly logger = new Logger(ProfilesService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly portfolio: PortfolioService,
  ) {}

  /**
   * A published profile, or nothing.
   *
   * Returns the same 404 for a handle that does not exist, one that exists but
   * is unpublished, and one whose owner has paused their account. Three
   * different answers would make this endpoint a membership oracle — a way to
   * ask "is this person on Virgo" about anybody whose handle you can guess.
   * The album share resolver takes the same line.
   */
  async publicProfile(rawHandle: string): Promise<PublicProfile> {
    const handle = normalizeHandle(rawHandle);

    const row = await this.db.queryOne<ProfileRow>(
      `select u.id, u.handle, u.display_name, u.email, u.avatar_url, u.title,
              u.bio, u.location, u.website, u.roles, u.created_at
         from users u
        where lower(u.handle) = $1
          and u.public_profile = true
          and (u.disabled_until is null or u.disabled_until <= now())`,
      [handle],
    );
    if (!row) throw new NotFoundException('Profile not found');

    // `id` is selected to reach the portfolio and then dropped — the explicit
    // return shape below is what leaves this method, and a uuid is a handle for
    // every other endpoint in the product.
    const portfolio = await this.portfolio.list(row.id);

    return {
      handle: row.handle,
      // The email local-part is the same fallback the rest of the app uses for
      // somebody who never set a display name.
      displayName: row.display_name?.trim() || row.email.split('@')[0],
      avatarUrl: row.avatar_url,
      title: row.title,
      bio: row.bio,
      location: row.location,
      website: row.website,
      roles: row.roles ?? [],
      memberSince: row.created_at.getFullYear(),
      portfolio,
    };
  }

  /** Whether a handle can be claimed right now, and why not if it cannot. */
  async checkHandle(
    userId: string,
    rawHandle: string,
  ): Promise<{ available: boolean; reason: string | null }> {
    const problem = handleProblem(rawHandle);
    if (problem) {
      return { available: false, reason: handleProblemMessage(problem) };
    }

    const handle = normalizeHandle(rawHandle);
    const taken = await this.db.queryOne<{ id: string }>(
      'select id from users where lower(handle) = $1 and id <> $2',
      [handle, userId],
    );

    return taken
      ? { available: false, reason: 'That handle is taken.' }
      : { available: true, reason: null };
  }

  /**
   * Claims or changes a handle.
   *
   * The cooldown is not bureaucracy: a handle is a public URL that people put
   * in a bio and send to clients, and changing it silently breaks every one of
   * those links. Old handles are not held or redirected — worth knowing, and
   * worth saying in the UI.
   */
  async setHandle(userId: string, rawHandle: string): Promise<{ handle: string }> {
    const problem = handleProblem(rawHandle);
    if (problem) throw new BadRequestException(handleProblemMessage(problem));

    const handle = normalizeHandle(rawHandle);

    const me = await this.db.queryOne<{
      handle: string | null;
      handle_changed_at: Date | null;
    }>('select handle, handle_changed_at from users where id = $1', [userId]);
    if (!me) throw new NotFoundException('Account not found');

    if (me.handle === handle) return { handle };

    if (me.handle && me.handle_changed_at) {
      const days =
        (Date.now() - me.handle_changed_at.getTime()) / 86_400_000;
      if (days < HANDLE_CHANGE_COOLDOWN_DAYS) {
        const wait = Math.ceil(HANDLE_CHANGE_COOLDOWN_DAYS - days);
        throw new ConflictException(
          `You can change your handle again in ${wait} day${wait === 1 ? '' : 's'}.`,
        );
      }
    }

    try {
      await this.db.query(
        `update users
            set handle = $2, handle_changed_at = now(), updated_at = now()
          where id = $1`,
        [userId, handle],
      );
    } catch (err) {
      // The unique index is the authority, not the availability check above —
      // two people can pass that check at the same moment and only one can win.
      if ((err as { code?: string }).code === '23505') {
        throw new ConflictException('That handle is taken.');
      }
      throw err;
    }

    return { handle };
  }

  /**
   * Turns the public page on or off.
   *
   * Publishing has preconditions, and the refusal names the missing one — "you
   * cannot publish yet" with no reason is a dead end.
   */
  async setPublished(
    userId: string,
    published: boolean,
  ): Promise<{ published: boolean; handle: string | null }> {
    const me = await this.db.queryOne<{
      handle: string | null;
      roles: string[] | null;
      email_verified_at: Date | null;
      disabled_until: Date | null;
    }>(
      `select handle, roles, email_verified_at, disabled_until
         from users where id = $1`,
      [userId],
    );
    if (!me) throw new NotFoundException('Account not found');

    if (published) {
      if (!me.handle) {
        throw new BadRequestException('Choose a handle first — it is your profile address.');
      }
      if ((me.roles ?? []).length === 0) {
        throw new BadRequestException('Add at least one role, so people know what you do.');
      }
      if (!me.email_verified_at) {
        throw new BadRequestException('Verify your email before publishing a profile.');
      }
      if (me.disabled_until && me.disabled_until > new Date()) {
        throw new BadRequestException('Your account is paused. Reactivate it to publish.');
      }
    }

    await this.db.query(
      'update users set public_profile = $2, updated_at = now() where id = $1',
      [userId, published],
    );

    this.logger.log(`${userId} ${published ? 'published' : 'unpublished'} their profile`);
    return { published, handle: me.handle };
  }

  /** The caller's own profile settings, for the editor. */
  async settings(userId: string): Promise<{
    handle: string | null;
    handleChangedAt: string | null;
    published: boolean;
    canPublish: boolean;
    blockers: string[];
  }> {
    const me = await this.db.queryOne<{
      handle: string | null;
      handle_changed_at: Date | null;
      public_profile: boolean;
      roles: string[] | null;
      email_verified_at: Date | null;
    }>(
      `select handle, handle_changed_at, public_profile, roles, email_verified_at
         from users where id = $1`,
      [userId],
    );
    if (!me) throw new NotFoundException('Account not found');

    const blockers: string[] = [];
    if (!me.handle) blockers.push('Choose a handle');
    if ((me.roles ?? []).length === 0) blockers.push('Add at least one role');
    if (!me.email_verified_at) blockers.push('Verify your email');

    return {
      handle: me.handle,
      handleChangedAt: me.handle_changed_at?.toISOString() ?? null,
      published: me.public_profile,
      canPublish: blockers.length === 0,
      blockers,
    };
  }

}
