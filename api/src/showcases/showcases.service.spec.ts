import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { DatabaseService } from '../database/database.service';
import type { HlsService } from '../storage/hls.service';
import type { MediaLinkService } from '../storage/media-link.service';
import type { StorageService } from '../storage/storage.service';
import { MAX_SOURCE_BYTES, type ThumbnailsService } from '../storage/thumbnails.service';
import { ShelvesService } from './shelves.service';
import { MAX_SHOWCASES, ShowcasesService, type Showcase } from './showcases.service';

/**
 * What a showcase refuses, and what a shelf refuses.
 *
 * The SQL that decides who may see a showcase is not exercised here — it is one
 * statement and a fake would only restate it. Migration 071's behaviour (the
 * kept_count trigger, both unique indexes, the cascade that takes a deleted
 * showcase off every shelf) was checked against a real PostgreSQL 18 cluster
 * with every migration applied in order.
 *
 * What is worth a test is everything decided in TypeScript: which files may go
 * in, how the pieces are ordered, and the two rules that protect the ranking
 * signal.
 */

const ME = 'me-1';
const OTHER = 'other-1';

interface FileRow {
  key: string;
  content_type: string | null;
  size_bytes: number;
  thumb_key: string | null;
  poster_key: string | null;
  display_widths: number[] | null;
  blur_data_url: string | null;
}

function make(files: FileRow[], opts: { showcaseCount?: number } = {}) {
  const inserts: { sql: string; params: unknown[] }[] = [];
  const generate = jest.fn(async () => ({ key: 'k', size: 1, contentType: 'image/webp' }));
  const enqueueKeys = jest.fn(async () => 0);

  const client = {
    query: jest.fn(async (sql: string, params: unknown[]) => {
      inserts.push({ sql, params });
      if (sql.includes('insert into showcases')) return { rows: [{ id: 'sc-1' }] };
      return { rows: [] };
    }),
  };

  const db = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('from user_files')) return files;
      if (sql.includes('from showcase_items')) return [];
      return [];
    }),
    queryOne: jest.fn(async (sql: string) => {
      if (sql.includes('count(*)')) {
        return { count: String(opts.showcaseCount ?? 0) };
      }
      if (sql.includes('from showcases')) {
        return {
          id: 'sc-1',
          user_id: ME,
          title: null,
          caption: null,
          craft_note: null,
          craft_tags: ['85mm'],
          category: null,
          location: null,
          visibility: 'public',
          allow_downloads: false,
          allow_comments: true,
          show_hire: true,
          published_at: null,
          kept_count: 0,
          created_at: new Date('2026-09-28T00:00:00Z'),
        };
      }
      return null;
    }),
    transaction: jest.fn(async (fn: (c: unknown) => Promise<unknown>) => fn(client)),
  } as unknown as DatabaseService;

  const service = new ShowcasesService(
    db,
    { mediaUrl: jest.fn(async () => 'https://cdn/x') } as unknown as StorageService,
    { displaySources: jest.fn(() => []) } as unknown as MediaLinkService,
    { generate } as unknown as ThumbnailsService,
    { enqueueKeys } as unknown as HlsService,
  );

  return { service, db, inserts, generate, enqueueKeys };
}

const film = (key: string, over: Partial<FileRow> = {}): FileRow => ({
  key,
  content_type: 'video/mp4',
  size_bytes: 40_000_000,
  thumb_key: null,
  poster_key: `${key}-poster.webp`,
  display_widths: null,
  blur_data_url: null,
  ...over,
});

const photo = (key: string, over: Partial<FileRow> = {}): FileRow => ({
  key,
  content_type: 'image/jpeg',
  size_bytes: 1_000,
  thumb_key: `${key}-thumb.webp`,
  poster_key: null,
  display_widths: [1024],
  blur_data_url: null,
  ...over,
});

describe('posting a showcase', () => {
  it('keeps the order it was given, and makes the first piece the cover', async () => {
    const { service, inserts } = make([photo('a.jpg'), photo('b.jpg'), photo('c.jpg')]);

    await service.create(ME, { fileKeys: ['c.jpg', 'a.jpg', 'b.jpg'] });

    const pieces = inserts.find((i) => i.sql.includes('insert into showcase_items'));
    // position comes from `with ordinality`, so the array order is the order,
    // and nothing needs a separate "is the cover" column.
    expect(pieces?.params[2]).toEqual(['c.jpg', 'a.jpg', 'b.jpg']);
  });

  it('drops a repeat of the same photograph rather than refusing the post', async () => {
    const { service, inserts } = make([photo('a.jpg'), photo('b.jpg')]);

    await service.create(ME, { fileKeys: ['a.jpg', 'b.jpg', 'a.jpg'] });

    const pieces = inserts.find((i) => i.sql.includes('insert into showcase_items'));
    expect(pieces?.params[2]).toEqual(['a.jpg', 'b.jpg']);
  });

  it('refuses a profile photograph, without asking the database about it', async () => {
    const { service, db } = make([]);

    await expect(
      service.create(ME, { fileKeys: ['users/me-1/avatars/2026/09/me.jpg'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('answers the same for somebody else’s file as for one that is not there', async () => {
    const { service } = make([]);
    await expect(service.create(ME, { fileKeys: ['theirs.jpg'] })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('refuses a film whose poster frame has not been made yet', async () => {
    // The poster is the only still a feed has to draw. Posting before the media
    // worker has written one would put a blank card on everybody's feed, so it
    // is refused with the one useful thing to say: wait a moment.
    const { service } = make([film('clip.mp4', { poster_key: null })]);
    await expect(service.create(ME, { fileKeys: ['clip.mp4'] })).rejects.toMatchObject({
      response: { code: 'SHOWCASE_FILM_NOT_READY' },
    });
  });

  it('takes a film that has one, and asks for a ladder without waiting for it', async () => {
    const { service, inserts, generate, enqueueKeys } = make([film('clip.mp4'), photo('a.jpg')]);

    await service.create(ME, { fileKeys: ['clip.mp4', 'a.jpg'] });

    const pieces = inserts.find((i) => i.sql.includes('insert into showcase_items'));
    expect(pieces?.params[2]).toEqual(['clip.mp4', 'a.jpg']);
    // A film is never put through the thumbnailer: its still already exists.
    expect(generate).not.toHaveBeenCalled();
    // Both keys go to the queue; it decides for itself which are films.
    expect(enqueueKeys).toHaveBeenCalledWith(['clip.mp4', 'a.jpg']);
  });

  it('refuses a file that is neither', async () => {
    const { service } = make([photo('notes.pdf', { content_type: 'application/pdf' })]);
    await expect(service.create(ME, { fileKeys: ['notes.pdf'] })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('makes the web copy a photograph is missing rather than posting one that cannot be shown', async () => {
    const { service, generate } = make([photo('raw.jpg', { thumb_key: null })]);

    await service.create(ME, { fileKeys: ['raw.jpg'] });

    expect(generate).toHaveBeenCalledWith('raw.jpg', 'image/jpeg', 1_000, {
      displayWidths: [1024],
      blurDataUrl: null,
    });
  });

  it('names the size when one is too large to make a copy from', async () => {
    const { service, generate } = make([
      photo('huge.tif', { thumb_key: null, size_bytes: MAX_SOURCE_BYTES + 1 }),
    ]);

    await expect(service.create(ME, { fileKeys: ['huge.tif'] })).rejects.toMatchObject({
      response: { code: 'SHOWCASE_TOO_LARGE' },
    });
    // Refused on the recorded size, before anything is read out of B2.
    expect(generate).not.toHaveBeenCalled();
  });

  it('says a photograph cannot be shown when no copy could be made', async () => {
    const { service } = make([photo('odd.gif', { thumb_key: null })]);
    (
      (service as unknown as { thumbs: { generate: jest.Mock } }).thumbs.generate as jest.Mock
    ).mockResolvedValueOnce(null);

    await expect(service.create(ME, { fileKeys: ['odd.gif'] })).rejects.toMatchObject({
      response: { code: 'SHOWCASE_NO_WEB_COPY' },
    });
  });

  it('stops at the ceiling', async () => {
    const { service } = make([photo('a.jpg')], { showcaseCount: MAX_SHOWCASES });
    await expect(service.create(ME, { fileKeys: ['a.jpg'] })).rejects.toThrow(
      `up to ${MAX_SHOWCASES} showcases`,
    );
  });
});

describe('keeping somebody’s work', () => {
  function shelves(showcaseOwner: string) {
    const db = {
      query: jest.fn(async () => []),
      queryOne: jest.fn(async (sql: string) =>
        sql.includes('from shelves') ? { id: 'shelf-1', user_id: ME } : null,
      ),
    } as unknown as DatabaseService;

    const showcases = {
      one: jest.fn(
        async (): Promise<Showcase> =>
          ({ id: 'sc-1', userId: showcaseOwner, pieces: [] }) as unknown as Showcase,
      ),
    } as unknown as ShowcasesService;

    const service = new ShelvesService(
      db,
      { mediaUrl: jest.fn(async () => 'https://cdn/x') } as unknown as StorageService,
      showcases,
    );
    return { service, db, showcases };
  }

  it('reads the showcase as the viewer first, so one they may not see cannot be kept', async () => {
    const { service, showcases } = shelves(OTHER);

    await service.keep(ME, 'shelf-1', { showcaseId: 'sc-1' });

    // Everything that hides a showcase — unpublished, taken down,
    // connections-only, a block either way — lives in that read.
    expect(showcases.one).toHaveBeenCalledWith(ME, 'sc-1');
  });

  it('refuses your own work: kept_count ranks the feed', async () => {
    const { service, db } = shelves(ME);

    await expect(service.keep(ME, 'shelf-1', { showcaseId: 'sc-1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(db.query).not.toHaveBeenCalled();
  });

  it('refuses a shelf that is not yours', async () => {
    const { service, db } = shelves(OTHER);
    (db.queryOne as jest.Mock).mockResolvedValueOnce(null);

    await expect(service.keep(ME, 'shelf-9', { showcaseId: 'sc-1' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
