import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { BookingsService } from '../bookings/bookings.service';
import { DatabaseService } from '../database/database.service';
import { relationshipCase } from '../friends/friend-sql';
import { FriendsService } from '../friends/friends.service';
import { blockedBetween } from '../safety/block-sql';
import { StorageConfig } from '../storage/storage.config';
import { StorageService } from '../storage/storage.service';
import { PortfolioService, type PortfolioItem } from './portfolio.service';
import {
  HANDLE_CHANGE_COOLDOWN_DAYS,
  handleProblem,
  handleProblemMessage,
  normalizeHandle,
} from './handles';

/** Where the viewer stands with the person whose profile it is. */
export type ViewerConnection = 'none' | 'pending_out' | 'pending_in' | 'accepted';

export interface ProfileStats {
  /** Connections both sides still hold, counted once. */
  connections: number;
  /** Agreed bookings as the creative, not cancelled, dated before today in Manila. */
  jobsDone: number;
}

/**
 * The viewer's side of a profile.
 *
 * Only ever about the person looking. `friendId` is the VIEWER's own friends
 * row with this person, which they can already read through /friends, and it
 * is what Accept and Message act on. The owner's account id is never here.
 */
export interface ProfileViewer {
  isSelf: boolean;
  connection: ViewerConnection;
  /** Null when `connection` is 'none'. */
  friendId: string | null;
}

/**
 * What another signed-in account is allowed to see.
 *
 * Written as an explicit shape rather than a spread of a user row, because the
 * failure mode of the alternative is silent and permanent: add a column to
 * `users` one day, and `{...row}` publishes it the same afternoon. Everything
 * here was chosen; nothing arrives by accident. profiles.service.spec pins
 * the exact keys, so a new one has to be added there on purpose too.
 */
export interface PublicProfile {
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  /** The CDN address of a WebP the server re-encoded itself. */
  coverUrl: string | null;
  title: string | null;
  bio: string | null;
  /** The free-text city they typed, never coordinates. */
  location: string | null;
  website: string | null;
  /** Only when they switched it on, and it is not blank. */
  studioName: string | null;
  roles: string[];
  /** Year only. "Since 2026" is context; a join date is a fingerprint. */
  memberSince: number;
  /** A badge. It does not gate hiring. */
  availableForBookings: boolean;
  stats: ProfileStats;
  /** 0 on your own profile. */
  mutualConnections: number;
  viewer: ProfileViewer;
  /** Their chosen work, in their chosen order. Empty is a valid profile. */
  portfolio: PortfolioItem[];
}

/**
 * The owner's own page, published or not.
 *
 * The public presentation of the account — the same studio rule and the same
 * portfolio a visitor is given, so it is a true preview — plus what only the
 * owner needs. No viewer, no mutuals, no email and nothing about visitors.
 */
export interface ProfilePage {
  /** Null until they choose one. */
  handle: string | null;
  /** Switched on AND with a handle to be found at. */
  published: boolean;
  displayName: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  title: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  studioName: string | null;
  roles: string[];
  memberSince: number;
  availableForBookings: boolean;
  stats: ProfileStats;
  portfolio: PortfolioItem[];
  /** The owner's photographs the public page leaves out, having no web copy. */
  portfolioHidden: number;
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
  'suspended_at',
  'id',
  'address_line1',
  'address_line2',
  'address_city',
  'address_province',
  'address_postal',
  'address_country',
  'studio_name',
  'social_handle',
  'referral_code',
  'referred_by_user_id',
  'referred_at',
  'two_factor_enabled_at',
  'two_factor_recovery_codes',
  'handle_changed_at',
  'public_profile',
  'show_studio',
  'cover_url',
  'available_for_bookings',
  'sessions_valid_from',
  'updated_at',
] as const;

/** The columns both profile reads share, with the studio already ruled on. */
interface ProfileColumns {
  id: string;
  display_name: string | null;
  email: string;
  avatar_url: string | null;
  cover_url: string | null;
  title: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  roles: string[] | null;
  created_at: Date;
  available_for_bookings: boolean | null;
  /** Null unless show_studio is on and the name is not blank — see STUDIO_SQL. */
  studio_name: string | null;
}

interface ProfileRow extends ProfileColumns {
  handle: string;
  /** The viewer's own friends row with this person, if there is one. */
  viewer_friend_id: string | null;
  relationship: ViewerConnection;
}

interface OwnerRow extends ProfileColumns {
  handle: string | null;
  public_profile: boolean | null;
}

/**
 * The studio name, decided in SQL rather than in TypeScript.
 *
 * So a switched-off studio never leaves the database for a public read at
 * all, and a name that is only spaces counts as none. Both reads use it, so
 * the owner's page shows exactly what a visitor would.
 */
const STUDIO_SQL = `case when u.show_studio then nullif(btrim(u.studio_name), '') end as studio_name`;

/**
 * A cover key as buildKey mints it for the covers scope. Anything else — a
 * traversal, an avatar key, another scope — is not a cover this caller
 * uploaded.
 */
const COVER_KEY_SHAPE = /^users\/[0-9a-f-]{36}\/covers\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.[a-z0-9]+$/i;

/**
 * Sets or clears the cover and hands back the one it replaced.
 *
 * The row is locked before it is read, so two saves at once queue here and
 * each is told what it really replaced. The later one then removes the
 * earlier one's cover rather than both removing the one from before.
 *
 * `prev` is joined in FROM, not read in RETURNING. A CTE is evaluated where
 * it is first used, and one first used in RETURNING runs after this very
 * UPDATE has changed the row: FOR UPDATE then skips the row as modified by
 * its own statement and hands back nothing, so every save would report no
 * previous cover and none would ever be removed. Joined, it locks and reads
 * the row before the update touches it. Checked on PostgreSQL 18, in one
 * session and in two racing ones.
 */
const COVER_WRITE = (value: string) => `with prev as (select cover_url from users where id = $1 for update)
update users u
   set cover_url = ${value}, updated_at = now()
  from prev
 where u.id = $1
returning prev.cover_url as previous`;

@Injectable()
export class ProfilesService {
  private readonly logger = new Logger(ProfilesService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly portfolio: PortfolioService,
    private readonly friends: FriendsService,
    private readonly bookings: BookingsService,
    private readonly storage: StorageService,
    private readonly storageConfig: StorageConfig,
  ) {}

  /**
   * A published profile, or nothing.
   *
   * Returns the same 404 for a handle that does not exist, one that exists but
   * is unpublished, one whose owner has paused their account or been
   * suspended, and one on the other side of a block from the viewer, either
   * way round. Different answers would make this endpoint a membership oracle
   * — a way to ask "is this person on Virgo", or "have they blocked me", about
   * anybody whose handle you can guess. The album share resolver takes the
   * same line.
   */
  async publicProfile(rawHandle: string, viewerId: string): Promise<PublicProfile> {
    const handle = normalizeHandle(rawHandle);

    // Both friends rows are joined, the viewer's (`mine`) and theirs, because
    // one row on its own is not a relationship — see friend-sql.ts.
    const row = await this.db.queryOne<ProfileRow>(
      `select u.id, u.handle, u.display_name, u.email, u.avatar_url, u.cover_url,
              u.title, u.bio, u.location, u.website, u.roles, u.created_at,
              u.available_for_bookings,
              ${STUDIO_SQL},
              mine.id as viewer_friend_id,
              ${relationshipCase('mine', 'theirs')} as relationship
         from users u
         left join friends mine
                on mine.user_id = $2 and mine.friend_user_id = u.id
         left join friends theirs
                on theirs.user_id = u.id and theirs.friend_user_id = $2
        where lower(u.handle) = $1
          and u.public_profile = true
          and (u.disabled_until is null or u.disabled_until <= now())
          and u.suspended_at is null
          and not ${blockedBetween('$2', 'u.id')}`,
      [handle, viewerId],
    );
    // Before anything else is asked, so a profile that is not there costs
    // one query and answers in the same time whatever the reason.
    if (!row) throw new NotFoundException('Profile not found');

    // `id` is selected to reach the portfolio and the counts and then dropped
    // — the explicit return shape below is what leaves this method, and a
    // uuid is a handle for every other endpoint in the product.
    const isSelf = row.id === viewerId;
    const [portfolio, connections, jobsDone, mutualConnections] = await Promise.all([
      this.portfolio.list(row.id),
      this.friends.connectionCount(row.id),
      this.bookings.jobsDoneCount(row.id),
      isSelf ? Promise.resolve(0) : this.friends.mutualCount(viewerId, row.id),
    ]);
    const connection: ViewerConnection = isSelf ? 'none' : row.relationship;

    return {
      handle: row.handle,
      displayName: displayNameOf(row),
      avatarUrl: row.avatar_url,
      coverUrl: row.cover_url ?? null,
      title: row.title,
      bio: row.bio,
      location: row.location,
      website: row.website,
      studioName: row.studio_name ?? null,
      roles: row.roles ?? [],
      memberSince: row.created_at.getFullYear(),
      availableForBookings: row.available_for_bookings === true,
      stats: { connections, jobsDone },
      mutualConnections,
      viewer: {
        isSelf,
        connection,
        friendId: connection === 'none' ? null : row.viewer_friend_id,
      },
      portfolio,
    };
  }

  /**
   * The caller's own page, whatever state it is in.
   *
   * Works unpublished, without a handle and while paused, which is when the
   * owner most needs to see what they are about to publish. Everything on it
   * is what a visitor would get, down to which photographs are left out, and
   * `portfolioHidden` says how many those are.
   */
  async ownerPage(userId: string): Promise<ProfilePage> {
    const row = await this.db.queryOne<OwnerRow>(
      `select u.id, u.handle, u.public_profile, u.display_name, u.email, u.avatar_url,
              u.cover_url, u.title, u.bio, u.location, u.website, u.roles, u.created_at,
              u.available_for_bookings,
              ${STUDIO_SQL}
         from users u
        where u.id = $1`,
      [userId],
    );
    if (!row) throw new NotFoundException('Account not found');

    const [portfolio, connections, jobsDone, portfolioHidden] = await Promise.all([
      this.portfolio.list(userId),
      this.friends.connectionCount(userId),
      this.bookings.jobsDoneCount(userId),
      this.portfolio.hiddenCount(userId),
    ]);

    return {
      handle: row.handle ?? null,
      published: row.public_profile === true && !!row.handle,
      displayName: displayNameOf(row),
      avatarUrl: row.avatar_url,
      coverUrl: row.cover_url ?? null,
      title: row.title,
      bio: row.bio,
      location: row.location,
      website: row.website,
      studioName: row.studio_name ?? null,
      roles: row.roles ?? [],
      memberSince: row.created_at.getFullYear(),
      availableForBookings: row.available_for_bookings === true,
      stats: { connections, jobsDone },
      portfolio,
      portfolioHidden,
    };
  }

  /**
   * Makes an uploaded object the cover.
   *
   * Takes a key, never a URL, and builds the URL itself. A cover is a large
   * public image, so what is stored has to be an object the server can vouch
   * for: under the caller's own covers prefix, filed under no album, and
   * re-encoded by confirm — WebP with its dimensions recorded, which confirm
   * writes in the same statement. Anything else, including a PATCH that
   * raced its own confirm, gets the one answer.
   */
  async setCover(userId: string, key: string): Promise<{ coverUrl: string }> {
    if (!COVER_KEY_SHAPE.test(key) || !key.startsWith(`users/${userId}/covers/`)) {
      throw coverNotReady();
    }
    const ready = await this.db.queryOne<{ ok: number }>(
      `select 1 as ok
         from user_files
        where key = $1
          and user_id = $2
          and album_id is null
          and content_type = 'image/webp'
          and width_px is not null`,
      [key, userId],
    );
    if (!ready) throw coverNotReady();

    const url = this.storageConfig.publicUrl(key);
    if (!url) throw new ServiceUnavailableException('Covers are not available right now.');

    const row = await this.db.queryOne<{ previous: string | null }>(COVER_WRITE('$2'), [
      userId,
      url,
    ]);
    if (!row) throw new NotFoundException('Account not found');

    this.tidyCovers(userId, row.previous === url ? null : row.previous, key);
    return { coverUrl: url };
  }

  /** Takes the cover off. Idempotent: with none set it just answers null. */
  async removeCover(userId: string): Promise<{ coverUrl: null }> {
    const row = await this.db.queryOne<{ previous: string | null }>(COVER_WRITE('null'), [
      userId,
    ]);
    if (!row) throw new NotFoundException('Account not found');

    this.tidyCovers(userId, row.previous, '');
    return { coverUrl: null };
  }

  /**
   * What a cover write leaves to tidy: the cover it replaced, then strays.
   *
   * Started and not waited for. The write has landed by the time this runs,
   * and the answer is what the app acts on. Held back behind B2 — three
   * attempts at each delete, half a minute allowed for each — it is an answer
   * the app may stop waiting for, and a save that worked is then shown to
   * somebody as one that failed. Nothing in the answer depends on this, and
   * it cannot fail the request either: each step is best effort and logs its
   * own failures, and the catch below is for anything else, so a tidy-up can
   * never become an unhandled rejection that takes the process down.
   */
  private tidyCovers(userId: string, previous: string | null, keep: string): void {
    void (async () => {
      if (previous) await this.discardCover(userId, previous);
      await this.sweepCovers(userId, keep);
    })().catch((err: unknown) => {
      this.logger.warn(`Cover tidy-up failed for ${userId}: ${String(err)}`);
    });
  }

  /**
   * Deletes the object a replaced cover pointed at.
   *
   * Best effort, like discardAvatar: the profile has already been saved, and
   * failing the request over a tidy-up would be the wrong trade. The key is
   * checked against the caller's own covers prefix first, so a URL from
   * before this rule, or on another host, is left alone. deleteObject also
   * forgets the row and hands the space back.
   */
  private async discardCover(userId: string, url: string): Promise<void> {
    try {
      const key = this.storage.keyFromPublicUrl(url);
      if (!key || !key.startsWith(`users/${userId}/covers/`)) return;
      await this.storage.deleteObject(userId, key);
    } catch (err) {
      this.logger.warn(`Could not remove the previous cover for ${userId}: ${String(err)}`);
    }
  }

  /**
   * Deletes the caller's other covers: uploaded, but never set or since
   * replaced.
   *
   * An app closed between confirm and the PATCH, or a PATCH that failed,
   * leaves a re-encoded cover at a public URL that nothing points at. The
   * next set or remove clears it. Whatever users.cover_url holds at this
   * moment is excluded as well as the key just set, so a save whose write
   * has already landed is never undone here.
   *
   * A cover confirmed in the last ten minutes is left alone as well. It may
   * be the one another save is about to set: that PATCH can pass its own
   * check before this sweep reads the list and write after it, and nothing
   * in users.cover_url says so yet. Deleting it then would leave the profile
   * pointing at an object that is gone. Ten minutes is far longer than
   * confirm to PATCH ever takes, and a stray that young goes with a later
   * save instead.
   *
   * Best effort per object, like discardCover. Account deletion takes what is
   * left.
   */
  private async sweepCovers(userId: string, keep: string): Promise<void> {
    let rows: { key: string }[];
    try {
      rows = await this.db.query<{ key: string }>(
        `select f.key
           from user_files f
          where f.user_id = $1
            and f.key like $2
            and f.key <> $3
            and f.created_at < now() - interval '10 minutes'
            and not exists (
                  select 1 from users u
                   where u.id = $1
                     and u.cover_url = $4 || f.key)`,
        [userId, `users/${userId}/covers/%`, keep, this.storageConfig.publicUrl('') ?? ''],
      );
    } catch (err) {
      this.logger.warn(`Could not list stray covers for ${userId}: ${String(err)}`);
      return;
    }
    for (const { key } of rows) {
      try {
        await this.storage.deleteObject(userId, key);
      } catch (err) {
        this.logger.warn(`Could not remove stray cover ${key}: ${String(err)}`);
      }
    }
  }

  /** Whether a handle can be claimed right now, and why not if it cannot. */
  async checkHandle(
    userId: string,
    rawHandle: string,
  ): Promise<{ available: boolean; reason: string | null }> {
    const handle = normalizeHandle(rawHandle);
    const problem = handleProblem(rawHandle);

    // A word reserved after somebody claimed it stays theirs. setHandle lets
    // them save it again, so the check says the same thing.
    if (problem === 'reserved') {
      const mine = await this.db.queryOne<{ ok: number }>(
        'select 1 as ok from users where id = $1 and handle = $2',
        [userId, handle],
      );
      if (mine) return { available: true, reason: null };
    }
    if (problem) {
      return { available: false, reason: handleProblemMessage(problem) };
    }

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
    const handle = normalizeHandle(rawHandle);

    const me = await this.db.queryOne<{
      handle: string | null;
      handle_changed_at: Date | null;
    }>('select handle, handle_changed_at from users where id = $1', [userId]);
    if (!me) throw new NotFoundException('Account not found');

    // Before the rules, not after them. A handle that was fine when it was
    // claimed and has since become a reserved route word is still this
    // person's address, and re-saving the profile must not turn it into a
    // 400. Nothing is written, so nothing about the claim changes.
    if (me.handle === handle) return { handle };

    const problem = handleProblem(rawHandle);
    if (problem) throw new BadRequestException(handleProblemMessage(problem));

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

/**
 * The name a profile shows. The email local-part is the same fallback the
 * rest of the app uses for somebody who never set a display name.
 */
function displayNameOf(row: { display_name: string | null; email: string }): string {
  return row.display_name?.trim() || row.email.split('@')[0];
}

/** One answer for every reason a cover key cannot be used, so none is a probe. */
function coverNotReady(): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    error: 'Bad Request',
    code: 'COVER_NOT_READY',
    message: 'Upload the photo again, then set it as your cover.',
  });
}
