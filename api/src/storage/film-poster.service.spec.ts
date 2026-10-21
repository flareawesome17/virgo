import { writeFileSync } from 'node:fs';
import type { DatabaseService } from '../database/database.service';
import { FilmPosterService, posterKeyFor } from './film-poster.service';
import type { StorageService } from './storage.service';

jest.mock('node:child_process', () => ({
  // ffmpeg, as far as the service can tell: the frame lands at the last argument.
  execFile: jest.fn(
    (_cmd: string, args: string[], _opts: unknown, done: (err: Error | null, out?: unknown) => void) => {
      writeFileSync(args[args.length - 1], 'frame');
      done(null, { stdout: '', stderr: '' });
    },
  ),
}));
jest.mock('./blur', () => ({ blurDataUrl: jest.fn(async () => 'data:blur') }));

interface Row {
  poster_key: string | null;
  content_type: string | null;
  duration_ms: number | null;
  processing_status: string | null;
}

function make(row: Row | null) {
  const writes: { sql: string; params: unknown[] }[] = [];
  const db = {
    queryOne: jest.fn(async () => row),
    query: jest.fn(async (sql: string, params: unknown[]) => {
      writes.push({ sql, params });
      return [];
    }),
  } as unknown as DatabaseService;
  const storage = {
    mediaUrl: jest.fn(async () => 'https://b2/clip.mp4'),
    putDerived: jest.fn(async () => undefined),
    deleteKeys: jest.fn(async (keys: string[]) => new Set(keys)),
  };
  const service = new FilmPosterService(db, storage as unknown as StorageService);
  return { service, db, storage, writes };
}

const film = (over: Partial<Row> = {}): Row => ({
  poster_key: null,
  content_type: 'video/mp4',
  duration_ms: 42_000,
  processing_status: 'ready',
  ...over,
});

describe('posterKeyFor', () => {
  it('places a poster beside its film without changing the ownership prefix', () => {
    expect(posterKeyFor('users/u/albums/2026/08/clip.mov')).toBe(
      'users/u/albums/2026/08/clip-poster.webp',
    );
  });
});

describe('FilmPosterService.ensure', () => {
  it('makes, stores and records the poster of a finished film', async () => {
    const { service, storage, writes } = make(film());

    await expect(service.ensure('users/u/clip.mp4')).resolves.toBe('users/u/clip-poster.webp');

    expect(storage.putDerived).toHaveBeenCalledWith(
      'users/u/clip-poster.webp',
      Buffer.from('frame'),
      'image/webp',
    );
    const saved = writes.find((w) => w.sql.includes('set poster_key = $2'));
    expect(saved?.params).toEqual(['users/u/clip.mp4', 'users/u/clip-poster.webp', 'data:blur']);
  });

  it('returns a poster that already exists without making another', async () => {
    const { service, storage } = make(film({ poster_key: 'users/u/clip-poster.webp' }));
    await expect(service.ensure('users/u/clip.mp4')).resolves.toBe('users/u/clip-poster.webp');
    expect(storage.putDerived).not.toHaveBeenCalled();
  });

  it('makes nothing for a film the media worker has not finished with', async () => {
    const { service, storage } = make(film({ processing_status: 'pending' }));
    await expect(service.ensure('users/u/clip.mp4')).resolves.toBeNull();
    expect(storage.mediaUrl).not.toHaveBeenCalled();
  });

  it('makes nothing for a photograph', async () => {
    const { service, storage } = make(film({ content_type: 'image/jpeg' }));
    await expect(service.ensure('users/u/a.jpg')).resolves.toBeNull();
    expect(storage.mediaUrl).not.toHaveBeenCalled();
  });

  it('answers null rather than throwing when the frame cannot be stored', async () => {
    const { service, storage, writes } = make(film());
    storage.putDerived.mockRejectedValueOnce(new Error('B2 is down'));
    await expect(service.ensure('users/u/clip.mp4')).resolves.toBeNull();
    expect(writes.some((w) => w.sql.includes('set poster_key = $2'))).toBe(false);
  });

  it('makes one poster for two posts of the same film at once', async () => {
    const { service, storage } = make(film());
    const [a, b] = await Promise.all([service.ensure('users/u/clip.mp4'), service.ensure('users/u/clip.mp4')]);
    expect(a).toBe(b);
    expect(storage.putDerived).toHaveBeenCalledTimes(1);
  });
});

describe('FilmPosterService.sweep', () => {
  function sweeping(taken: { key: string; poster_key: string; blur_data_url: string | null }[]) {
    const made = make(null);
    const query = made.db.query as jest.Mock;
    // The first statement takes a round of rows; the next round finds none.
    query.mockImplementation(async (sql: string, params: unknown[]) => {
      made.writes.push({ sql, params });
      if (sql.includes('set poster_key = null')) {
        return made.writes.filter((w) => w.sql.includes('set poster_key = null')).length === 1 ? taken : [];
      }
      return [];
    });
    return made;
  }

  it('deletes the posters it took and puts nothing back', async () => {
    const { service, storage, writes } = sweeping([
      { key: 'a.mp4', poster_key: 'a-poster.webp', blur_data_url: 'blur-a' },
      { key: 'b.mov', poster_key: 'b-poster.webp', blur_data_url: null },
    ]);

    await service.sweep();

    expect(storage.deleteKeys).toHaveBeenCalledWith(
      ['a-poster.webp', 'b-poster.webp'],
      'film posters no showcase uses',
    );
    expect(writes.some((w) => w.sql.includes('unnest'))).toBe(false);
  });

  it('puts back a poster B2 would not delete, so the next sweep tries again', async () => {
    const { service, storage, writes } = sweeping([
      { key: 'a.mp4', poster_key: 'a-poster.webp', blur_data_url: 'blur-a' },
      { key: 'b.mov', poster_key: 'b-poster.webp', blur_data_url: null },
    ]);
    storage.deleteKeys.mockResolvedValueOnce(new Set(['a-poster.webp']));

    await service.sweep();

    const restore = writes.find((w) => w.sql.includes('unnest'));
    expect(restore?.params).toEqual([['b.mov'], ['b-poster.webp'], [null]]);
  });

  it('never deletes an object that is not a poster, whatever the row says', async () => {
    const { service, storage, writes } = sweeping([
      { key: 'a.mp4', poster_key: 'users/u/a.mp4', blur_data_url: null },
    ]);

    await service.sweep();

    expect(storage.deleteKeys).toHaveBeenCalledWith([], 'film posters no showcase uses');
    const restore = writes.find((w) => w.sql.includes('unnest'));
    expect(restore?.params).toEqual([['a.mp4'], ['users/u/a.mp4'], [null]]);
  });

  it('leaves alone the poster of a film being posted right now', async () => {
    const { service, db, storage } = make(film());
    await service.ensure('users/u/clip.mp4');

    const query = db.query as jest.Mock;
    query.mockClear();
    query.mockResolvedValue([]);
    await service.sweep();

    const take = query.mock.calls.find(([sql]) => String(sql).includes('set poster_key = null'));
    expect(take?.[1]).toEqual([200, ['users/u/clip.mp4']]);
    expect(storage.deleteKeys).not.toHaveBeenCalled();
  });
});
