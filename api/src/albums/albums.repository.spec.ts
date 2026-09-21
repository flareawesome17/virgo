import type { DatabaseService } from '../database/database.service';
import {
  DISPLAY_URL_TTL_SECONDS,
  DOWNLOAD_URL_TTL_SECONDS,
} from '../storage/storage.config';
import type { StorageService } from '../storage/storage.service';
import { AlbumsRepository, type AlbumRow } from './albums.repository';

/**
 * Album covers are signed for display, not with the download default.
 *
 * `mediaUrls` falls back to the one-hour download lifetime when no lifetime
 * is passed, and a one-hour link is re-signed every five minutes. Covers were
 * left on it when thumbnails moved to display-length links, so the album list
 * handed out a new URL for every card each time it was fetched a few minutes
 * later, and every cover was downloaded again. Leaving the argument off is an
 * easy mistake to make twice.
 */

const OWNER = 'owner-1';
const PICKED = 'users/owner-1/albums/2026/09/pick.jpg';
const NEWEST = 'users/owner-1/albums/2026/09/newest.jpg';

/** What the fake signer below returns for a display-length link. */
const shown = (key: string) =>
  `https://media.test/${key}?ttl=${DISPLAY_URL_TTL_SECONDS}`;

function album(id: string, coverKey: string | null): AlbumRow {
  return {
    id,
    user_id: OWNER,
    workspace_id: 'workspace-1',
    name: id,
    description: null,
    cover_url: null,
    cover_key: coverKey,
    item_count: 0,
    status: 'draft',
    retention_days: null,
    created_at: new Date('2026-09-01T00:00:00Z'),
    updated_at: new Date('2026-09-01T00:00:00Z'),
  };
}

/** A repository over these albums, whose newest image is `newest[albumId]`. */
function repositoryOf(albums: AlbumRow[], newest: Record<string, string>) {
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('from albums')) return albums;
    if (sql.includes('distinct on (album_id)')) {
      return Object.entries(newest).map(([album_id, key]) => ({ album_id, key }));
    }
    // The per-kind counts. Not what this is about.
    return [];
  });
  const db = {
    query,
    queryOne: jest.fn(async (sql: string) => (await query(sql))[0] ?? null),
  } as unknown as DatabaseService;

  const mediaUrls = jest.fn(
    async (
      keys: (string | null | undefined)[],
      ttl = DOWNLOAD_URL_TTL_SECONDS,
    ) => keys.map((key) => (key ? `https://media.test/${key}?ttl=${ttl}` : null)),
  );
  const storage = { mediaUrls } as unknown as StorageService;

  return { repository: new AlbumsRepository(db, storage), mediaUrls };
}

describe('AlbumsRepository covers', () => {
  it('signs a chosen cover and a derived one for display on the album list', async () => {
    const { repository, mediaUrls } = repositoryOf(
      [album('chosen', PICKED), album('derived', null)],
      { derived: NEWEST },
    );

    const albums = await repository.findAll(OWNER);

    expect(mediaUrls).toHaveBeenCalled();
    for (const [, ttl] of mediaUrls.mock.calls) {
      expect(ttl).toBe(DISPLAY_URL_TTL_SECONDS);
    }
    expect(albums.map((a) => a.cover_url)).toEqual([shown(PICKED), shown(NEWEST)]);
  });

  it('signs the cover of a single album for display too', async () => {
    const { repository, mediaUrls } = repositoryOf([album('one', null)], {
      one: NEWEST,
    });

    const found = await repository.findOne(OWNER, 'one');

    expect(mediaUrls).toHaveBeenCalled();
    for (const [, ttl] of mediaUrls.mock.calls) {
      expect(ttl).toBe(DISPLAY_URL_TTL_SECONDS);
    }
    expect(found?.cover_url).toBe(shown(NEWEST));
  });
});
