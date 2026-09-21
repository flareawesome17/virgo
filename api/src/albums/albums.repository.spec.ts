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

/** A `user_files` row, as much of one as a cover or a count reads. */
interface FileRow {
  album_id: string;
  key: string;
  thumb_key: string | null;
  content_type: string;
}

function photo(albumId: string, name: string, { thumbnail = true } = {}): FileRow {
  const stem = `users/${OWNER}/albums/2026/09/${name}`;
  return {
    album_id: albumId,
    key: `${stem}.jpg`,
    thumb_key: thumbnail ? `${stem}-thumb.webp` : null,
    content_type: 'image/jpeg',
  };
}

/** Something an album holds that is not a photograph: a film or a track. */
function media(albumId: string, key: string, contentType: string): FileRow {
  return {
    album_id: albumId,
    key: `users/${OWNER}/albums/2026/09/${key}`,
    thumb_key: null,
    content_type: contentType,
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
 * the order the derived-cover query asks for. An insert or an update hands
 * back the first album, as `returning *` hands back the row as stored.
 */
function repositoryOf(albums: AlbumRow[], files: FileRow[]) {
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    if (/^\s*(insert into|update) albums\b/.test(sql)) return albums.slice(0, 1);
    if (sql.includes('from albums')) return albums;
    if (sql.includes('group by album_id')) {
      const ids = params[0] as string[];
      return ids.flatMap((id) => {
        const held = files.filter((file) => file.album_id === id);
        const of = (kind: string) =>
          String(held.filter((file) => file.content_type.startsWith(`${kind}/`)).length);
        return held.length === 0
          ? []
          : [
              {
                album_id: id,
                count: String(held.length),
                image: of('image'),
                video: of('video'),
                audio: of('audio'),
              },
            ];
      });
    }
    if (sql.includes('distinct on (album_id)')) {
      const ids = params[0] as string[];
      const newest = new Map<string, FileRow>();
      for (const file of files) {
        if (
          ids.includes(file.album_id) &&
          file.content_type.startsWith('image/') &&
          !newest.has(file.album_id)
        ) {
          newest.set(file.album_id, file);
        }
      }
      return [...newest.values()];
    }
    if (sql.includes('where key = any')) {
      const keys = params[0] as string[];
      return files.filter((file) => keys.includes(file.key));
    }
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

  return { repository: new AlbumsRepository(db, storage), mediaUrls, query };
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

/**
 * How much an album holds, which only its files can say.
 *
 * `albums.item_count` was a counter the apps bumped after each upload. They
 * stopped when the API began counting, nothing else ever wrote it, and it has
 * read 0 for every album made since, while an older album read 24 holding 5
 * files. These fail if an answer goes back to the column — including the ones
 * create and update give, which both apps put straight into their cache — or
 * if a client can write it again.
 */

/** The album that read 24 while it held five files, not all of them photographs. */
const DRIFTED: AlbumRow = { ...album('drifted'), item_count: 24 };
const FIVE_FILES = [
  photo('drifted', 'first-dance'),
  photo('drifted', 'toast'),
  photo('drifted', 'vows'),
  media('drifted', 'highlights.mp4', 'video/mp4'),
  media('drifted', 'vows.m4a', 'audio/mp4'),
];

/** An album as `returning *` hands it back once the column is dropped. */
function withoutColumn(row: AlbumRow): AlbumRow {
  const stored: Partial<AlbumRow> = { ...row };
  delete stored.item_count;
  return stored as AlbumRow;
}

describe('AlbumsRepository item_count', () => {
  it('counts every file in the album, whatever the column says', async () => {
    const { repository } = repositoryOf([DRIFTED, album('empty')], FIVE_FILES);

    const albums = await repository.findAll(OWNER);

    expect(albums.map((a) => a.item_count)).toEqual([5, 0]);
    expect(albums[0].counts).toEqual({ image: 3, video: 1, audio: 1 });
  });

  it('answers an edit with the count, not the row as stored', async () => {
    const { repository } = repositoryOf([DRIFTED], FIVE_FILES);

    const updated = await repository.update(OWNER, 'drifted', { name: 'Reyes wedding' });

    expect(updated?.item_count).toBe(5);
    expect(updated?.counts).toEqual({ image: 3, video: 1, audio: 1 });
  });

  it('answers a new album with a count once the column is gone', async () => {
    // Installed apps read `item_count` off every album they are given, and
    // after the drop the stored row has none to hand back.
    const { repository } = repositoryOf([withoutColumn(album('fresh'))], []);

    const created = await repository.create(OWNER, {
      id: 'fresh',
      workspace_id: 'workspace-1',
      name: 'fresh',
    });

    expect(created.item_count).toBe(0);
  });

  it('never writes a count a client sends', async () => {
    // Installed phones post `item_count: 0` with every album they create.
    const { repository, query } = repositoryOf([album('fresh')], []);

    await repository.create(OWNER, {
      id: 'fresh',
      workspace_id: 'workspace-1',
      name: 'fresh',
      item_count: 7,
    });
    await repository.update(OWNER, 'fresh', { name: 'renamed', item_count: 7 });

    const writes = query.mock.calls.filter(([sql]) => /^\s*(insert|update)\b/.test(sql));
    expect(writes).toHaveLength(2);
    for (const [sql, params] of writes) {
      expect(sql).not.toMatch(/item_count/);
      expect(params).not.toContain(7);
    }
  });
});
