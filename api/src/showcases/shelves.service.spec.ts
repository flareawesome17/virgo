import type { DatabaseService } from '../database/database.service';
import type { StorageService } from '../storage/storage.service';
import { MyKeptController } from './showcases.controller';
import { MAX_ALL_KEPT, SHELF_COVER_TILES, ShelvesService } from './shelves.service';
import type { ShowcasesService } from './showcases.service';

/**
 * Shelf faces and the All kept collection, as far as TypeScript decides them.
 *
 * Who may see what is SQL — keptVisibleTo, asked in the statement — and was
 * checked against a real PostgreSQL 18 with every migration applied: four
 * stills at most, newest kept first, nothing the viewer may not see, one entry
 * per showcase. What is here is the mapping and the shape of the statements.
 */

const ME = 'me-1';

function make(rows: unknown[], mediaUrl?: (key: string | null) => string | null) {
  const db = {
    query: jest.fn(async () => rows),
    queryOne: jest.fn(async () => ({ user_id: ME })),
  } as unknown as DatabaseService;
  const storage = {
    mediaUrl: jest.fn(async (key: string | null) =>
      mediaUrl ? mediaUrl(key) : key ? `cdn:${key}` : null,
    ),
  } as unknown as StorageService;
  const service = new ShelvesService(db, storage, {} as ShowcasesService);
  return { service, db, storage };
}

const sqlOf = (db: DatabaseService): string =>
  ((db.query as jest.Mock).mock.calls[0] as [string])[0];

describe('a shelf’s face', () => {
  it('draws up to four stills, in the order the statement gave them, the first as the cover', async () => {
    const { service } = make([
      {
        id: 'shelf-1',
        name: 'Light',
        is_public: true,
        count: '6',
        cover_keys: ['d.webp', 'c.webp', 'b.webp', 'a.webp'],
        holds: null,
      },
    ]);

    const [shelf] = await service.list(ME, ME);

    expect(shelf.coverUrls).toEqual(['cdn:d.webp', 'cdn:c.webp', 'cdn:b.webp', 'cdn:a.webp']);
    // An app from before the mosaic draws this one, and it is the newest.
    expect(shelf.coverUrl).toBe('cdn:d.webp');
    expect(shelf.count).toBe(6);
    expect(shelf).not.toHaveProperty('holds');
  });

  it('answers an empty shelf with no stills and no cover', async () => {
    const { service } = make([
      { id: 'shelf-1', name: 'Empty', is_public: false, count: '0', cover_keys: [], holds: false },
    ]);
    const [shelf] = await service.list(ME, ME, 'sc-1');
    expect(shelf).toMatchObject({ coverUrls: [], coverUrl: null, holds: false });
  });

  it('leaves out a still that has no address rather than drawing a gap', async () => {
    const { service } = make(
      [{ id: 's', name: 'n', is_public: true, count: '2', cover_keys: ['gone', 'ok'], holds: null }],
      (key) => (key === 'ok' ? 'cdn:ok' : null),
    );
    const [shelf] = await service.list(ME, ME);
    expect(shelf.coverUrls).toEqual(['cdn:ok']);
    expect(shelf.coverUrl).toBe('cdn:ok');
  });

  it('asks for them in the one statement, newest kept first and four at most', async () => {
    const { service, db } = make([]);
    await service.list('viewer-1', ME);

    expect(db.query).toHaveBeenCalledTimes(1);
    const sql = sqlOf(db);
    expect(SHELF_COVER_TILES).toBe(4);
    expect(sql).toContain('array(');
    expect(sql).toContain('cross join lateral');
    expect(sql).toContain('order by li.created_at desc, li.id desc');
    expect(sql).toContain(`limit ${SHELF_COVER_TILES}`);
    // The same still as a shelf entry's: the first piece that has one.
    expect(sql).toContain('coalesce(si.thumb_key, f.thumb_key, f.poster_key)');
    // Asked as the viewer, not the owner.
    expect(sql).toContain('sc.visibility');
    expect((db.query as jest.Mock).mock.calls[0][1]).toEqual([ME, false, 'viewer-1', null]);
  });
});

describe('All kept', () => {
  const row = (showcaseId: string, thumb: string | null, at: string) => ({
    showcase_id: showcaseId,
    note: `why ${showcaseId}`,
    created_at: new Date(at),
    maker_id: `maker-${showcaseId}`,
    display_name: null,
    handle: 'mika',
    title: `Work ${showcaseId}`,
    craft_tags: null,
    thumb_key: thumb,
  });

  it('is the shelf entry shape, in the order the statement gave', async () => {
    const { service } = make([
      row('sc-2', 'two.webp', '2026-10-07T10:00:00Z'),
      row('sc-1', 'one.webp', '2026-10-06T10:00:00Z'),
    ]);

    const kept = await service.allKept(ME);

    expect(kept).toEqual([
      {
        showcaseId: 'sc-2',
        note: 'why sc-2',
        keptAt: '2026-10-07T10:00:00.000Z',
        maker: { id: 'maker-sc-2', displayName: 'Someone', handle: 'mika' },
        title: 'Work sc-2',
        craftTags: [],
        url: 'cdn:two.webp',
      },
      expect.objectContaining({ showcaseId: 'sc-1', url: 'cdn:one.webp' }),
    ]);
  });

  it('drops a kept showcase with nothing left to draw', async () => {
    const { service } = make([row('sc-1', null, '2026-10-06T10:00:00Z')]);
    expect(await service.allKept(ME)).toEqual([]);
  });

  it('reads once per showcase, newest keep first, across the caller’s own shelves only', async () => {
    const { service, db } = make([]);
    await service.allKept(ME);

    const sql = sqlOf(db);
    expect(sql).toContain('distinct on (k.showcase_id)');
    expect(sql).toContain('order by k.showcase_id, k.created_at desc');
    expect(sql).toContain('k.user_id = $1 and sh.user_id = $1');
    expect(sql).toContain('order by i.created_at desc');
    expect(sql).toContain(`limit ${MAX_ALL_KEPT}`);
    expect(MAX_ALL_KEPT).toBe(500);
    // The same gates as a shelf, asked as the caller.
    expect(sql).toContain('s.hidden_at is null');
    expect((db.query as jest.Mock).mock.calls[0][1]).toEqual([ME]);
  });

  it('answers GET /me/kept as { data, total }', async () => {
    const shelves = {
      allKept: jest.fn(async () => [{ showcaseId: 'sc-1' }, { showcaseId: 'sc-2' }]),
    } as unknown as ShelvesService;
    const controller = new MyKeptController(shelves);

    await expect(controller.list(ME)).resolves.toEqual({
      data: [{ showcaseId: 'sc-1' }, { showcaseId: 'sc-2' }],
      total: 2,
    });
    expect(shelves.allKept).toHaveBeenCalledWith(ME);
  });
});
