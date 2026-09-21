import type { DatabaseService } from '../database/database.service';
import {
  DISPLAY_URL_TTL_SECONDS,
  DOWNLOAD_URL_TTL_SECONDS,
} from '../storage/storage.config';
import type { StorageService } from '../storage/storage.service';
import { AlbumsRepository, type AlbumRow } from './albums.repository';

/**
 * What an album card is given to draw.
 *
 * Two mistakes this guards against. Covers were signed with `mediaUrls`'
 * one-hour download default, which is re-signed every five minutes, so the
 * album list handed out new URLs a few minutes later and every card was
 * fetched again — and the argument that prevents it is easy to leave off.
 * And they were signed from the original photograph, so a list of a dozen
 * albums downloaded a dozen whole photographs to fill a dozen cards.
 */

const OWNER = 'owner-1';

/** A `user_files` row, as much of one as a cover reads. */
interface FileRow {
  album_id: string;
  key: string;
  thumb_key: string | null;
}

function photo(albumId: string, name: string, { thumbnail = true } = {}): FileRow {
  const stem = `users/${OWNER}/albums/2026/09/${name}`;
  return {
    album_id: albumId,
    key: `${stem}.jpg`,
    thumb_key: thumbnail ? `${stem}-thumb.webp` : null,
  };
}

function album(id: string, coverKey: string | null = null): AlbumRow {
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

/** What the fake signer below returns for a display-length link. */
const shown = (key: string | null) =>
  `https://media.test/${key}?ttl=${DISPLAY_URL_TTL_SECONDS}`;

/**
 * A repository over these albums and files. Files are listed newest first,
 * the order the derived-cover query asks for.
 */
function repositoryOf(albums: AlbumRow[], files: FileRow[]) {
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('from albums')) return albums;
    if (sql.includes('distinct on (album_id)')) {
      const ids = params[0] as string[];
      const newest = new Map<string, FileRow>();
      for (const file of files) {
        if (ids.includes(file.album_id) && !newest.has(file.album_id)) {
          newest.set(file.album_id, file);
        }
      }
      return [...newest.values()];
    }
    if (sql.includes('where key = any')) {
      const keys = params[0] as string[];
      return files.filter((file) => keys.includes(file.key));
    }
    // The per-kind counts. Not what this is about.
    return [];
  });
  const db = {
    query,
    queryOne: jest.fn(
      async (sql: string, params?: unknown[]) => (await query(sql, params))[0] ?? null,
    ),
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
  it('draws a chosen cover and a derived one from their thumbnails', async () => {
    const picked = photo('chosen', 'pick');
    const newest = photo('derived', 'newest');
    const { repository } = repositoryOf(
      [album('chosen', picked.key), album('derived')],
      [picked, newest],
    );

    const albums = await repository.findAll(OWNER);

    expect(albums.map((a) => a.cover_url)).toEqual([
      shown(picked.thumb_key),
      shown(newest.thumb_key),
    ]);
  });

  it('falls back to the original while a photograph has no thumbnail', async () => {
    const fresh = photo('fresh', 'just-uploaded', { thumbnail: false });
    const { repository } = repositoryOf([album('fresh', fresh.key)], [fresh]);

    const found = await repository.findOne(OWNER, 'fresh');

    expect(found?.cover_url).toBe(shown(fresh.key));
  });

  it('signs every cover for display, not with the download default', async () => {
    const picked = photo('chosen', 'pick');
    const newest = photo('derived', 'newest');
    const { repository, mediaUrls } = repositoryOf(
      [album('chosen', picked.key), album('derived')],
      [picked, newest],
    );

    await repository.findAll(OWNER);
    await repository.findOne(OWNER, 'chosen');

    expect(mediaUrls).toHaveBeenCalled();
    for (const [, ttl] of mediaUrls.mock.calls) {
      expect(ttl).toBe(DISPLAY_URL_TTL_SECONDS);
    }
  });
});
