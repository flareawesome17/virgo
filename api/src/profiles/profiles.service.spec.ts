import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { AlbumShareService } from '../albums/share/album-share.service';
import type { BookingsService } from '../bookings/bookings.service';
import type { DatabaseService } from '../database/database.service';
import type { FriendsService } from '../friends/friends.service';
import type { MediaLinkService } from '../storage/media-link.service';
import { StorageConfig } from '../storage/storage.config';
import type { StorageService } from '../storage/storage.service';
import type { ThumbnailsService } from '../storage/thumbnails.service';
import { RESERVED_HANDLES } from './handles';
import { PortfolioService } from './portfolio.service';
import { NEVER_PUBLIC, ProfilesService, type ViewerConnection } from './profiles.service';

/**
 * The public profile: who gets one, and what is in it.
 *
 * NEVER_PUBLIC promises a test that nothing on that list reaches the payload,
 * and the exact key lists below are the real guard: a field reaches another
 * account only by being added here on purpose. The database is faked with a
 * row carrying every users column, each set to a value that would be
 * recognisable if it leaked, so a return shape that started spreading the row
 * would fail here.
 *
 * The one column the SQL itself decides is the studio name, so the fake
 * applies the SQL's own rule when — and only when — the query carries it.
 */

const VIEWER = '11111111-1111-4111-8111-111111111111';
const OWNER = '22222222-2222-4222-8222-222222222222';
const CDN = 'https://cdn.virgo.test';

/** Every column of users, as a sentinel. `relationship` and the rest are the query's own. */
const everyColumn = {
  id: OWNER,
  handle: 'ana',
  display_name: 'Ana Cruz',
  email: 'ana@example.com',
  password_hash: 'secret-hash',
  avatar_url: `${CDN}/users/${OWNER}/avatars/2026/09/a.webp`,
  cover_url: `${CDN}/users/${OWNER}/covers/2026/09/c.webp`,
  title: 'Photographer',
  bio: 'Weddings in Cebu',
  location: 'Cebu City',
  website: 'ana.example',
  roles: ['Photographer'],
  created_at: new Date('2025-03-01T00:00:00Z'),
  updated_at: new Date('2026-09-01T00:00:00Z'),
  phone: '+639170000000',
  latitude: 10.3,
  longitude: 123.9,
  location_updated_at: new Date(),
  shares_location: true,
  last_seen_at: new Date(),
  plan: 'pro',
  plan_since: new Date(),
  paymongo_customer_id: 'cus_secret',
  discoverable: true,
  email_verified_at: new Date(),
  disabled_until: null,
  disabled_at: null,
  suspended_at: null,
  address_line1: '1 Secret St',
  address_line2: 'Unit Secret',
  address_city: 'Secret City',
  address_province: 'Secret Province',
  address_postal: '6000-secret',
  address_country: 'PH',
  studio_name: 'Secret Studio',
  show_studio: false,
  social_handle: '@secret',
  referral_code: 'REFSECRET',
  referred_by_user_id: '33333333-3333-4333-8333-333333333333',
  referred_at: new Date(),
  two_factor_enabled_at: new Date(),
  two_factor_recovery_codes: ['recovery-secret'],
  handle_changed_at: new Date(),
  sessions_valid_from: new Date(),
  public_profile: true,
  available_for_bookings: true,
  relationship: 'none' as ViewerConnection,
  viewer_friend_id: null as string | null,
};

type Row = Record<string, unknown>;

/** Values that must never reach another account, outside the URL fields. */
const SENTINELS = [
  OWNER,
  'ana@example.com',
  'secret-hash',
  '+639170000000',
  '1 Secret St',
  'Unit Secret',
  'Secret City',
  'Secret Province',
  '6000-secret',
  'Secret Studio',
  '@secret',
  'cus_secret',
  'REFSECRET',
  '33333333-3333-4333-8333-333333333333',
  'recovery-secret',
];

const STUDIO_RULE =
  /case when u\.show_studio then nullif\(btrim\(u\.studio_name\), ''\) end as studio_name/;

/** The row as Postgres hands it back for this query. */
function asSelected(sql: string, row: Row): Row {
  if (!STUDIO_RULE.test(sql)) return row;
  const name = typeof row.studio_name === 'string' ? row.studio_name.trim() : '';
  return { ...row, studio_name: row.show_studio === true && name ? name : null };
}

interface World {
  /** The profile row, or null for no profile. */
  profile?: Row | null;
  /** The caller's own user_files row for a cover key, or null. */
  coverFile?: Row | null;
  /** What users.cover_url held before a cover write. */
  previousCover?: string | null;
  /** The caller's user_files keys under their covers prefix. */
  coverKeys?: string[];
  /** Of those, the ones confirmed within the sweep's ten-minute grace. */
  youngCoverKeys?: string[];
  /**
   * A save racing this one that lands just after its write: what
   * users.cover_url holds by the time the sweep asks.
   */
  racedBy?: string;
  /** users.handle / handle_changed_at for setHandle. */
  me?: { handle: string | null; handle_changed_at: Date | null } | null;
  /** Whether another account holds the handle being checked. */
  takenByOther?: boolean;
  /** Whether the caller holds the handle being checked. */
  heldByCaller?: boolean;
  deleteFails?: boolean;
  /** A delete the bucket never answers, to prove the response does not wait. */
  deleteHangs?: boolean;
  /** The listing the sweep reads fails. */
  sweepFails?: boolean;
}

/**
 * Lets the tidy-up after a cover write run.
 *
 * setCover and removeCover start it and answer without waiting (see
 * `tidyCovers`), and everything it awaits here is a mock, so one turn of the
 * loop is all it needs.
 */
const settle = () => new Promise((resolve) => setImmediate(resolve));

function serviceOver(world: World = {}) {
  const profile = world.profile === undefined ? everyColumn : world.profile;
  let coverUrl = world.previousCover ?? null;
  const writes: { sql: string; params: unknown[] }[] = [];

  const queryOne = jest.fn(async (sql: string, params: unknown[] = []) => {
    if (/from users u\s+left join friends mine/.test(sql)) {
      return profile ? asSelected(sql, profile) : null;
    }
    if (/u\.public_profile,/.test(sql) && /where u\.id = \$1/.test(sql)) {
      return profile ? asSelected(sql, profile) : null;
    }
    if (/from user_files\s+where key = \$1/.test(sql)) {
      return world.coverFile === undefined ? { ok: 1 } : world.coverFile;
    }
    if (/with prev as/.test(sql)) {
      writes.push({ sql, params });
      const previous = coverUrl;
      coverUrl = /set cover_url = null/.test(sql) ? null : (params[1] as string);
      if (world.racedBy !== undefined) coverUrl = world.racedBy;
      return { previous };
    }
    if (/select handle, handle_changed_at from users/.test(sql)) {
      return world.me === undefined ? { handle: null, handle_changed_at: null } : world.me;
    }
    if (/select 1 as ok from users where id = \$1 and handle = \$2/.test(sql)) {
      return world.heldByCaller ? { ok: 1 } : null;
    }
    if (/select id from users where lower\(handle\) = \$1 and id <> \$2/.test(sql)) {
      return world.takenByOther ? { id: 'someone-else' } : null;
    }
    throw new Error(`Unexpected queryOne: ${sql}`);
  });
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    if (/f\.key like \$2/.test(sql)) {
      if (world.sweepFails) throw new Error('database unreachable');
      // The sweep, as its SQL reads: the caller's covers, not the one just
      // set, none confirmed in the last ten minutes, and not the one
      // users.cover_url names now.
      const [, prefix, keep, base] = params as string[];
      const graced = /f\.created_at < now\(\) - interval '10 minutes'/.test(sql);
      return (world.coverKeys ?? [])
        .filter((key) => key.startsWith(prefix.replace(/%$/, '')))
        .filter((key) => !(graced && world.youngCoverKeys?.includes(key)))
        .filter((key) => key !== keep && coverUrl !== `${base}${key}`)
        .map((key) => ({ key }));
    }
    writes.push({ sql, params });
    return [];
  });
  const db = { queryOne, query } as unknown as DatabaseService;

  const portfolio = {
    list: jest.fn(async () => []),
    hiddenCount: jest.fn(async () => 2),
  };
  const friends = {
    connectionCount: jest.fn(async () => 12),
    mutualCount: jest.fn(async () => 3),
  };
  const bookings = { jobsDoneCount: jest.fn(async () => 4) };

  const values: Record<string, string> = { CDN_BASE_URL: CDN };
  const storageConfig = new StorageConfig({
    get: (key: string, fallback?: string) => values[key] ?? fallback,
  } as unknown as ConfigService);
  const storage = {
    keyFromPublicUrl: (url: string | null) => storageConfig.keyFromPublicUrl(url),
    deleteObject: jest.fn(async () => {
      if (world.deleteHangs) await new Promise(() => undefined);
      if (world.deleteFails) throw new Error('bucket unreachable');
    }),
  };

  const service = new ProfilesService(
    db,
    portfolio as unknown as PortfolioService,
    friends as unknown as FriendsService,
    bookings as unknown as BookingsService,
    storage as unknown as StorageService,
    storageConfig,
  );
  return { service, queryOne, query, portfolio, friends, bookings, storage, writes };
}

beforeEach(() => {
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

const PUBLIC_KEYS = [
  'availableForBookings',
  'avatarUrl',
  'bio',
  'coverUrl',
  'displayName',
  'handle',
  'location',
  'memberSince',
  'mutualConnections',
  'portfolio',
  'roles',
  'stats',
  'studioName',
  'title',
  'viewer',
  'website',
];

describe('ProfilesService.publicProfile', () => {
  it('returns exactly the allow-listed keys', async () => {
    const { service } = serviceOver();

    const profile = await service.publicProfile('ana', VIEWER);

    expect(Object.keys(profile).sort()).toEqual(PUBLIC_KEYS);
    expect(Object.keys(profile.stats).sort()).toEqual(['connections', 'jobsDone']);
    expect(Object.keys(profile.viewer).sort()).toEqual(['connection', 'friendId', 'isSelf']);
  });

  it('returns none of the columns that must never be public', async () => {
    const { service } = serviceOver();

    const profile = await service.publicProfile('ana', VIEWER);

    expect(NEVER_PUBLIC).toContain('suspended_at');
    for (const key of NEVER_PUBLIC) {
      expect(profile).not.toHaveProperty(key);
    }
  });

  it('carries no private value outside its URL fields', async () => {
    // Media URLs carry the users/<uuid>/ key prefix, which is documented and
    // accepted; everything else must say nothing about the account.
    const { service } = serviceOver();

    const profile = await service.publicProfile('ana', VIEWER);
    const text = JSON.stringify({ ...profile, avatarUrl: null, coverUrl: null, portfolio: [] });

    for (const sentinel of SENTINELS) {
      expect(text).not.toContain(sentinel);
    }
  });

  it('shows the studio only when it is switched on and not blank, decided in SQL', async () => {
    const off = serviceOver();
    await expect(off.service.publicProfile('ana', VIEWER)).resolves.toMatchObject({
      studioName: null,
    });
    const [sql] = off.queryOne.mock.calls[0];
    expect(sql).toMatch(STUDIO_RULE);
    // Never the bare column, which would carry a switched-off name out of
    // the database for every read.
    expect(sql.replace(STUDIO_RULE, '')).not.toMatch(/u\.studio_name/);

    const on = serviceOver({
      profile: { ...everyColumn, show_studio: true, studio_name: 'Nailify Studio' },
    });
    await expect(on.service.publicProfile('ana', VIEWER)).resolves.toMatchObject({
      studioName: 'Nailify Studio',
    });

    const blank = serviceOver({ profile: { ...everyColumn, show_studio: true, studio_name: '   ' } });
    await expect(blank.service.publicProfile('ana', VIEWER)).resolves.toMatchObject({
      studioName: null,
    });

    const none = serviceOver({ profile: { ...everyColumn, show_studio: true, studio_name: null } });
    await expect(none.service.publicProfile('ana', VIEWER)).resolves.toMatchObject({
      studioName: null,
    });
  });

  it('is not there across a block, either way, or for a suspended account', async () => {
    const { service, queryOne } = serviceOver();

    await service.publicProfile('Ana', VIEWER);

    const [sql, params] = queryOne.mock.calls[0];
    expect(params).toEqual(['ana', VIEWER]);
    expect(sql).toMatch(/u\.suspended_at is null/);
    expect(sql).toMatch(/user_blocks/);
    expect(sql).toMatch(/ub\.blocker_id = \$2 and ub\.blocked_id = u\.id/);
    expect(sql).toMatch(/ub\.blocker_id = u\.id and ub\.blocked_id = \$2/);
    // Both rows of the pair, the viewer's and theirs.
    expect(sql).toMatch(/mine\.user_id = \$2 and mine\.friend_user_id = u\.id/);
    expect(sql).toMatch(/theirs\.user_id = u\.id and theirs\.friend_user_id = \$2/);
  });

  it('gives one 404 for every reason there is no profile, before asking anything else', async () => {
    const { service, portfolio, friends, bookings } = serviceOver({ profile: null });

    await expect(service.publicProfile('ana', VIEWER)).rejects.toThrow(
      new NotFoundException('Profile not found'),
    );
    expect(portfolio.list).not.toHaveBeenCalled();
    expect(friends.connectionCount).not.toHaveBeenCalled();
    expect(friends.mutualCount).not.toHaveBeenCalled();
    expect(bookings.jobsDoneCount).not.toHaveBeenCalled();
  });

  it('counts the owner, and the connections the two have in common', async () => {
    const { service, friends, bookings } = serviceOver();

    const profile = await service.publicProfile('ana', VIEWER);

    expect(profile.stats).toEqual({ connections: 12, jobsDone: 4 });
    expect(profile.mutualConnections).toBe(3);
    expect(friends.connectionCount).toHaveBeenCalledWith(OWNER);
    expect(bookings.jobsDoneCount).toHaveBeenCalledWith(OWNER);
    expect(friends.mutualCount).toHaveBeenCalledWith(VIEWER, OWNER);
  });

  it('is your own profile, with nothing mutual, when you look at yourself', async () => {
    const { service, friends } = serviceOver({
      profile: { ...everyColumn, id: VIEWER, relationship: 'none', viewer_friend_id: 'f1' },
    });

    const profile = await service.publicProfile('ana', VIEWER);

    expect(profile.viewer).toEqual({ isSelf: true, connection: 'none', friendId: null });
    expect(profile.mutualConnections).toBe(0);
    expect(friends.mutualCount).not.toHaveBeenCalled();
  });

  it('hands the viewer their own friends row only while there is a relationship', async () => {
    const none = serviceOver({ profile: { ...everyColumn, viewer_friend_id: 'f1' } });
    await expect(none.service.publicProfile('ana', VIEWER)).resolves.toMatchObject({
      viewer: { isSelf: false, connection: 'none', friendId: null },
    });

    for (const connection of ['pending_in', 'pending_out', 'accepted'] as const) {
      const { service } = serviceOver({
        profile: { ...everyColumn, relationship: connection, viewer_friend_id: 'f1' },
      });
      await expect(service.publicProfile('ana', VIEWER)).resolves.toMatchObject({
        viewer: { isSelf: false, connection, friendId: 'f1' },
      });
    }
  });
});

const OWNER_KEYS = [
  'availableForBookings',
  'avatarUrl',
  'bio',
  'coverUrl',
  'displayName',
  'handle',
  'location',
  'memberSince',
  'portfolio',
  'portfolioHidden',
  'published',
  'roles',
  'stats',
  'studioName',
  'title',
  'website',
];

describe('ProfilesService.ownerPage', () => {
  it('is the public presentation plus what only the owner needs, and nothing else', async () => {
    const { service, portfolio } = serviceOver();

    const page = await service.ownerPage(OWNER);

    expect(Object.keys(page).sort()).toEqual(OWNER_KEYS);
    expect(page).not.toHaveProperty('viewer');
    expect(page).not.toHaveProperty('mutualConnections');
    expect(JSON.stringify(page)).not.toContain('ana@example.com');
    expect(page.stats).toEqual({ connections: 12, jobsDone: 4 });
    expect(page.portfolioHidden).toBe(2);
    // The public list, so it is a true preview.
    expect(portfolio.list).toHaveBeenCalledWith(OWNER);
    expect(page.studioName).toBeNull();
  });

  it('is published only when it is switched on and has a handle to be found at', async () => {
    const cases: [Row, boolean][] = [
      [{ handle: null, public_profile: true }, false],
      [{ handle: 'ana', public_profile: false }, false],
      [{ handle: 'ana', public_profile: true }, true],
    ];
    for (const [fields, published] of cases) {
      const { service } = serviceOver({ profile: { ...everyColumn, ...fields } });
      const page = await service.ownerPage(OWNER);
      expect(page.published).toBe(published);
      expect(page.handle).toBe(fields.handle);
    }
  });

  it('is a 404 for an account that has gone', async () => {
    const { service } = serviceOver({ profile: null });
    await expect(service.ownerPage(OWNER)).rejects.toThrow(
      new NotFoundException('Account not found'),
    );
  });
});

/**
 * What a portfolio item may say, through the real PortfolioService.
 *
 * The profile's own keys are pinned above; these are the items inside it,
 * which are built elsewhere and would otherwise be the easy place for an
 * owner-only field to slip out.
 */
describe('Portfolio items on a profile', () => {
  const IMAGE_KEYS = ['caption', 'displaySources', 'id', 'kind', 'url'];
  const ALBUM_KEYS = ['caption', 'coverUrl', 'id', 'itemCount', 'kind', 'name', 'url'];

  function withRealPortfolio() {
    const stem = `users/${OWNER}/albums/2026/09`;
    const rows = [
      {
        id: 'image-1',
        kind: 'image',
        file_key: `${stem}/portrait.jpg`,
        album_id: null,
        caption: 'Portrait',
        image_thumb_key: `${stem}/portrait-thumb.webp`,
        image_display_widths: [1024],
      },
      {
        id: 'album-1',
        kind: 'album',
        file_key: null,
        album_id: 'wedding',
        caption: null,
        image_thumb_key: null,
        image_display_widths: null,
        album_name: 'Wedding',
        album_cover_url: null,
        album_photo_count: '5',
        share_token: 'token-1',
        chosen_cover_key: null,
        chosen_cover_thumb_key: null,
        derived_cover_key: `${stem}/newest.jpg`,
        derived_cover_thumb_key: `${stem}/newest-thumb.webp`,
      },
    ];
    const portfolioDb = {
      query: jest.fn(async (sql: string) => (sql.includes('from portfolio_items') ? rows : [])),
      queryOne: jest.fn(async () => ({ n: 0 })),
    } as unknown as DatabaseService;
    const portfolio = new PortfolioService(
      portfolioDb,
      { mediaUrl: async (key: string | null) => (key ? `https://b2.test/${key}` : null) } as unknown as StorageService,
      { urlFor: (token: string) => `https://share.test/${token}` } as unknown as AlbumShareService,
      {
        displaySources: (key: string, widths: number[] | null) =>
          (widths ?? []).map((width) => ({ width, url: `https://media.test/${key}-${width}` })),
      } as unknown as MediaLinkService,
      { generate: jest.fn() } as unknown as ThumbnailsService,
    );
    // The profile rows come from the same fake as everywhere else here.
    const world = serviceOver();
    const service = new ProfilesService(
      { queryOne: world.queryOne, query: world.query } as unknown as DatabaseService,
      portfolio,
      { connectionCount: async () => 0, mutualCount: async () => 0 } as unknown as FriendsService,
      { jobsDoneCount: async () => 0 } as unknown as BookingsService,
      {} as unknown as StorageService,
      new StorageConfig({ get: (_k: string, fallback?: string) => fallback } as unknown as ConfigService),
    );
    return service;
  }

  it('gives an image exactly its public keys, and an album exactly its own', async () => {
    const service = withRealPortfolio();

    for (const page of [await service.publicProfile('ana', VIEWER), await service.ownerPage(OWNER)]) {
      const [image, album] = page.portfolio;
      expect(Object.keys(image).sort()).toEqual(IMAGE_KEYS);
      expect(Object.keys(album).sort()).toEqual(ALBUM_KEYS);
      expect(image.url).toBe(`https://b2.test/users/${OWNER}/albums/2026/09/portrait-thumb.webp`);
    }
  });
});

describe('ProfilesService.setCover', () => {
  const KEY = `users/${VIEWER}/covers/2026/09/44444444-4444-4444-8444-444444444444.jpg`;
  const notReady = expect.objectContaining({
    response: expect.objectContaining({ statusCode: 400, code: 'COVER_NOT_READY' }),
  });

  it.each([
    ['under another account', `users/${OWNER}/covers/2026/09/44444444-4444-4444-8444-444444444444.jpg`],
    ['with a traversal in it', `users/${VIEWER}/covers/../avatars/44444444-4444-4444-8444-444444444444.jpg`],
    ['under the avatars prefix', `users/${VIEWER}/avatars/2026/09/44444444-4444-4444-8444-444444444444.jpg`],
  ])('refuses a key %s, without touching the database', async (_why, key) => {
    const { service, queryOne, writes } = serviceOver();

    await expect(service.setCover(VIEWER, key)).rejects.toEqual(notReady);
    expect(queryOne).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it('refuses a key confirm has not finished with', async () => {
    // No row of the caller's, or one confirm has not re-encoded — a JPEG, a
    // WebP without its dimensions — or one filed under an album. The query
    // asks all of that at once, so the fake answers for it with a null.
    const { service, queryOne, writes } = serviceOver({ coverFile: null });

    await expect(service.setCover(VIEWER, KEY)).rejects.toEqual(notReady);
    const [sql, params] = queryOne.mock.calls[0];
    expect(params).toEqual([KEY, VIEWER]);
    expect(sql).toMatch(/user_id = \$2/);
    expect(sql).toMatch(/album_id is null/);
    expect(sql).toMatch(/content_type = 'image\/webp'/);
    expect(sql).toMatch(/width_px is not null/);
    expect(writes).toEqual([]);
  });

  it('stores the URL it builds itself, and removes the cover it replaced', async () => {
    const previousKey = `users/${VIEWER}/covers/2026/08/55555555-5555-4555-8555-555555555555.jpg`;
    const { service, storage, writes } = serviceOver({ previousCover: `${CDN}/${previousKey}` });

    await expect(service.setCover(VIEWER, KEY)).resolves.toEqual({ coverUrl: `${CDN}/${KEY}` });
    await settle();

    expect(writes[0].sql).toMatch(/for update/);
    // Joined in FROM so it runs before the update. Read only from RETURNING,
    // Postgres evaluates it after the row has changed, FOR UPDATE skips the
    // row, and every save reports no previous cover (verified on PG 18).
    expect(writes[0].sql).toMatch(/from prev\s+where u\.id = \$1/);
    expect(writes[0].sql).not.toMatch(/returning \(select/);
    expect(writes[0].params).toEqual([VIEWER, `${CDN}/${KEY}`]);
    expect(storage.deleteObject).toHaveBeenCalledWith(VIEWER, previousKey);
  });

  it('leaves alone a previous cover that is not under the caller’s covers', async () => {
    for (const previous of [
      `${CDN}/users/${OWNER}/covers/2026/08/x.jpg`,
      `${CDN}/users/${VIEWER}/avatars/2026/08/x.jpg`,
      `https://elsewhere.test/users/${VIEWER}/covers/2026/08/x.jpg`,
    ]) {
      const { service, storage } = serviceOver({ previousCover: previous });
      await service.setCover(VIEWER, KEY);
      await settle();
      expect(storage.deleteObject).not.toHaveBeenCalled();
    }
  });

  it('still answers when removing the old one fails', async () => {
    const { service } = serviceOver({
      previousCover: `${CDN}/users/${VIEWER}/covers/2026/08/x.jpg`,
      deleteFails: true,
    });

    await expect(service.setCover(VIEWER, KEY)).resolves.toEqual({ coverUrl: `${CDN}/${KEY}` });
    await settle();
  });

  it('answers without waiting for the tidy-up at all', async () => {
    // Three attempts at each delete, half a minute allowed for each: held
    // behind that, the answer to a save that worked arrives after the app has
    // given up on it and told somebody it failed.
    const { service, storage } = serviceOver({
      previousCover: `${CDN}/users/${VIEWER}/covers/2026/08/x.jpg`,
      coverKeys: [KEY, `users/${VIEWER}/covers/2026/09/stray.jpg`],
      deleteHangs: true,
    });

    await expect(service.setCover(VIEWER, KEY)).resolves.toEqual({ coverUrl: `${CDN}/${KEY}` });
    await expect(service.removeCover(VIEWER)).resolves.toEqual({ coverUrl: null });
    // Started all the same, and still waiting on the bucket.
    await settle();
    expect(storage.deleteObject).toHaveBeenCalled();
  });

  it('answers when the sweep cannot even read the list', async () => {
    const { service } = serviceOver({ sweepFails: true });

    await expect(service.setCover(VIEWER, KEY)).resolves.toEqual({ coverUrl: `${CDN}/${KEY}` });
    await settle();
  });

  it('is unavailable without a CDN to serve the cover from', async () => {
    const world = serviceOver();
    const service = new ProfilesService(
      { queryOne: world.queryOne, query: world.query } as unknown as DatabaseService,
      world.portfolio as unknown as PortfolioService,
      world.friends as unknown as FriendsService,
      world.bookings as unknown as BookingsService,
      world.storage as unknown as StorageService,
      new StorageConfig({ get: (_k: string, fallback?: string) => fallback } as unknown as ConfigService),
    );

    await expect(service.setCover(VIEWER, KEY)).rejects.toThrow('Covers are not available right now.');
    expect(world.writes).toEqual([]);
  });

  it('sweeps up covers that were uploaded and never set, never the one in use', async () => {
    // An app closed between confirm and this PATCH leaves a public cover
    // nothing points at. The next save clears it.
    const stray = `users/${VIEWER}/covers/2026/09/66666666-6666-4666-8666-666666666666.jpg`;
    const { service, storage, query } = serviceOver({ coverKeys: [KEY, stray] });

    await service.setCover(VIEWER, KEY);
    await settle();

    expect(storage.deleteObject).toHaveBeenCalledWith(VIEWER, stray);
    expect(storage.deleteObject).not.toHaveBeenCalledWith(VIEWER, KEY);
    const [sql, params] = query.mock.calls.find(([s]) => /f\.key like \$2/.test(s))!;
    expect(sql).toMatch(/not exists \([\s\S]*u\.cover_url = \$4 \|\| f\.key\)/);
    expect(params).toEqual([VIEWER, `users/${VIEWER}/covers/%`, KEY, `${CDN}/`]);
  });

  it('never sweeps the cover a racing save has just set', async () => {
    // Two saves at once: the other one's write lands after this one's, so by
    // the time this sweep asks, users.cover_url names the other key. That is
    // the cover the profile shows, and it has to survive this sweep.
    const winner = `users/${VIEWER}/covers/2026/09/77777777-7777-4777-8777-777777777777.jpg`;
    const { service, storage } = serviceOver({
      coverKeys: [KEY, winner],
      racedBy: `${CDN}/${winner}`,
    });

    await service.setCover(VIEWER, KEY);
    await settle();

    expect(storage.deleteObject).not.toHaveBeenCalledWith(VIEWER, winner);
    expect(storage.deleteObject).not.toHaveBeenCalledWith(VIEWER, KEY);
  });

  it('never sweeps a cover a racing save has checked but not yet written', async () => {
    // The other order: the other save has passed its own check, and its
    // write lands after this sweep has read the list. users.cover_url cannot
    // say it is coming, so only the cover's age keeps it. Deleting it would
    // leave that save's profile pointing at nothing.
    const pending = `users/${VIEWER}/covers/2026/09/88888888-8888-4888-8888-888888888888.jpg`;
    const { service, storage, query } = serviceOver({
      coverKeys: [KEY, pending],
      youngCoverKeys: [pending],
    });

    await service.setCover(VIEWER, KEY);
    await settle();

    expect(storage.deleteObject).not.toHaveBeenCalledWith(VIEWER, pending);
    const [sql] = query.mock.calls.find(([s]) => /f\.key like \$2/.test(s))!;
    expect(sql).toMatch(/f\.created_at < now\(\) - interval '10 minutes'/);
  });
});

describe('ProfilesService.removeCover', () => {
  it('clears the cover, removes its object, and is fine to repeat', async () => {
    const key = `users/${VIEWER}/covers/2026/09/44444444-4444-4444-8444-444444444444.jpg`;
    const { service, storage, writes } = serviceOver({ previousCover: `${CDN}/${key}` });

    await expect(service.removeCover(VIEWER)).resolves.toEqual({ coverUrl: null });
    await settle();
    expect(writes[0].sql).toMatch(/set cover_url = null/);
    expect(writes[0].params).toEqual([VIEWER]);
    expect(storage.deleteObject).toHaveBeenCalledWith(VIEWER, key);

    storage.deleteObject.mockClear();
    await expect(service.removeCover(VIEWER)).resolves.toEqual({ coverUrl: null });
    await settle();
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });
});

describe('Reserved handles', () => {
  it('holds back the words P3 and P4 route on', () => {
    for (const word of ['feed', 'showcase', 'showcases', 'connections']) {
      expect(RESERVED_HANDLES.has(word)).toBe(true);
    }
  });

  it('lets somebody who already holds one save it again, and nobody else claim it', async () => {
    const holder = serviceOver({ me: { handle: 'feed', handle_changed_at: new Date() } });
    await expect(holder.service.setHandle(VIEWER, 'Feed')).resolves.toEqual({ handle: 'feed' });
    expect(holder.writes).toEqual([]);

    const other = serviceOver({ me: { handle: 'ana', handle_changed_at: null } });
    await expect(other.service.setHandle(VIEWER, 'feed')).rejects.toThrow(
      new BadRequestException('That one is reserved. Try another.'),
    );
  });

  it('tells only the holder that it is available', async () => {
    const holder = serviceOver({ heldByCaller: true });
    await expect(holder.service.checkHandle(VIEWER, 'feed')).resolves.toEqual({
      available: true,
      reason: null,
    });

    const other = serviceOver({ heldByCaller: false });
    await expect(other.service.checkHandle(VIEWER, 'feed')).resolves.toEqual({
      available: false,
      reason: 'That one is reserved. Try another.',
    });
  });
});
