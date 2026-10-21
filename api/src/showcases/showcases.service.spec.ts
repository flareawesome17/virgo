import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { DatabaseService } from '../database/database.service';
import type { FilmPosterService } from '../storage/film-poster.service';
import type { HlsService } from '../storage/hls.service';
import type { MediaLinkService } from '../storage/media-link.service';
import type { StorageService } from '../storage/storage.service';
import { MAX_SOURCE_BYTES, type ThumbnailsService } from '../storage/thumbnails.service';
import { CreateShowcaseDto, MAX_SHOWCASE_ITEMS, UpdateShowcaseDto } from './dto/showcase.dto';
import { ShelvesService } from './shelves.service';
import type { ShowcaseMediaService } from './showcase-media.service';
import {
  decodeShowcaseCursor,
  encodeShowcaseCursor,
  MAX_SHOWCASES,
  ShowcasesService,
  type Showcase,
} from './showcases.service';

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
  processing_status?: string | null;
}

/** A piece already in the showcase being edited, as the edit reads it. */
interface StoredRow {
  id: string;
  user_id: string;
  file_key: string | null;
  thumb_key: string | null;
  poster_key: string | null;
  video_key: string | null;
  display_widths: number[] | null;
  kind: string | null;
  content_type: string | null;
}

function make(files: FileRow[], opts: { showcaseCount?: number; stored?: StoredRow[] } = {}) {
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
      // The edit's read of the pieces it starts from, not hydrate's.
      if (sql.includes('where i.showcase_id = $1')) return opts.stored ?? [];
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

  const copyShowcase = jest.fn(async () => undefined);
  const eraseShowcase = jest.fn(async () => undefined);
  const erasePieces = jest.fn(async () => undefined);
  const ensurePoster = jest.fn(async (key: string): Promise<string | null> => `${key}-poster.webp`);
  const service = new ShowcasesService(
    db,
    { mediaUrl: jest.fn(async () => 'https://cdn/x') } as unknown as StorageService,
    { displaySources: jest.fn(() => []) } as unknown as MediaLinkService,
    { generate } as unknown as ThumbnailsService,
    { enqueueKeys } as unknown as HlsService,
    { copyShowcase, eraseShowcase, erasePieces } as unknown as ShowcaseMediaService,
    { ensure: ensurePoster } as unknown as FilmPosterService,
  );

  return { service, db, inserts, generate, enqueueKeys, copyShowcase, eraseShowcase, ensurePoster };
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

  it('refuses a film the media worker has not finished with', async () => {
    // Its length and playback copy come from the worker, and its poster is
    // taken from it after that. Posting before then would put a blank card on
    // everybody's feed, so it is refused with the one useful thing to say:
    // wait a moment.
    const { service, ensurePoster } = make([
      film('clip.mp4', { poster_key: null, processing_status: 'pending' }),
    ]);
    await expect(service.create(ME, { fileKeys: ['clip.mp4'] })).rejects.toMatchObject({
      response: { code: 'SHOWCASE_FILM_NOT_READY' },
    });
    expect(ensurePoster).not.toHaveBeenCalled();
  });

  it('makes the poster of a finished film that has none, then posts it', async () => {
    // Uploads no longer get a poster; the first post of a film makes it.
    const { service, inserts, ensurePoster } = make([
      film('clip.mp4', { poster_key: null, processing_status: 'ready' }),
    ]);

    await service.create(ME, { fileKeys: ['clip.mp4'] });

    expect(ensurePoster).toHaveBeenCalledWith('clip.mp4');
    const pieces = inserts.find((i) => i.sql.includes('insert into showcase_items'));
    expect(pieces?.params[2]).toEqual(['clip.mp4']);
  });

  it('refuses a finished film whose poster could not be made', async () => {
    const { service, inserts, ensurePoster } = make([
      film('clip.mp4', { poster_key: null, processing_status: 'ready' }),
    ]);
    ensurePoster.mockResolvedValueOnce(null);

    await expect(service.create(ME, { fileKeys: ['clip.mp4'] })).rejects.toMatchObject({
      response: { code: 'SHOWCASE_FILM_NOT_READY', fileKey: 'clip.mp4' },
    });
    expect(inserts.find((i) => i.sql.includes('insert into showcase_items'))).toBeUndefined();
  });

  it('takes a film that has one, and asks for a ladder without waiting for it', async () => {
    const { service, inserts, generate, enqueueKeys } = make([film('clip.mp4')]);

    await service.create(ME, { fileKeys: ['clip.mp4'] });

    const pieces = inserts.find((i) => i.sql.includes('insert into showcase_items'));
    expect(pieces?.params[2]).toEqual(['clip.mp4']);
    // A film is never put through the thumbnailer: its still already exists.
    expect(generate).not.toHaveBeenCalled();
    expect(enqueueKeys).toHaveBeenCalledWith(['clip.mp4']);
  });

  it('sends every key to the ladder queue, which decides for itself which are films', async () => {
    const { service, enqueueKeys } = make([photo('a.jpg'), photo('b.jpg')]);
    await service.create(ME, { fileKeys: ['a.jpg', 'b.jpg'] });
    expect(enqueueKeys).toHaveBeenCalledWith(['a.jpg', 'b.jpg']);
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

describe('step 4: what the apps are told', () => {
  it('names the piece at fault, so the app can point at it', async () => {
    const { service } = make([
      photo('ok.jpg'),
      photo('huge.tif', { thumb_key: null, size_bytes: MAX_SOURCE_BYTES + 1 }),
    ]);
    await expect(service.create(ME, { fileKeys: ['ok.jpg', 'huge.tif'] })).rejects.toMatchObject({
      response: { code: 'SHOWCASE_TOO_LARGE', fileKey: 'huge.tif' },
    });
  });

  it('gives the ceiling a code of its own', async () => {
    const { service } = make([photo('a.jpg')], { showcaseCount: MAX_SHOWCASES });
    await expect(service.create(ME, { fileKeys: ['a.jpg'] })).rejects.toMatchObject({
      response: { code: 'SHOWCASE_LIMIT' },
    });
  });

  it('sends an emptied field as empty, which clears it, and an absent one as null', async () => {
    const { service, inserts } = make([]);
    await service.update(ME, 'sc-1', { title: '   ', caption: 'New words' });
    const update = inserts.find((i) => i.sql.includes('update showcases set'))!;
    expect(update.sql).toContain("else nullif($3, '') end");
    // title emptied, caption changed, craft note not sent.
    expect(update.params.slice(2, 5)).toEqual(['', 'New words', null]);
  });

  it('keeps a cursor to the microsecond, and refuses one that is not a cursor', () => {
    const at = '2026-10-05 13:45:06.123456+08';
    const id = '11111111-1111-4111-8111-111111111111';
    expect(decodeShowcaseCursor(encodeShowcaseCursor(at, id))).toEqual({ at, id });
    // An older app's cursor, from toISOString, still reads.
    const old = Buffer.from(`2026-10-05T05:45:06.123Z|${id}`).toString('base64url');
    expect(decodeShowcaseCursor(old)).toEqual({ at: '2026-10-05T05:45:06.123Z', id });
    expect(decodeShowcaseCursor('not-a-cursor')).toBeNull();
    expect(decodeShowcaseCursor(Buffer.from(`yesterday|${id}`).toString('base64url'))).toBeNull();
    expect(decodeShowcaseCursor(Buffer.from(`${at}|1; drop table`).toString('base64url'))).toBeNull();
  });
});

describe('cards: twenty photographs, or one film on its own', () => {
  const FILM_ALONE = {
    code: 'SHOWCASE_FILM_ALONE',
    message: 'A film is posted on its own. Post your photos separately.',
  };
  const PIECE_ID = '22222222-2222-4222-8222-222222222222';

  const storedFilm = (over: Partial<StoredRow> = {}): StoredRow => ({
    id: PIECE_ID,
    user_id: ME,
    // Its album file is gone; it lives on its own copies, and says what it is.
    file_key: null,
    thumb_key: 'own-thumb.webp',
    poster_key: 'own-poster.webp',
    video_key: 'own-film.mp4',
    display_widths: null,
    kind: 'video',
    content_type: null,
    ...over,
  });
  const storedPhoto = (key: string, over: Partial<StoredRow> = {}): StoredRow => ({
    id: `33333333-3333-4333-8333-33333333333${key.length % 10}`,
    user_id: ME,
    file_key: key,
    thumb_key: null,
    poster_key: null,
    video_key: null,
    display_widths: null,
    // Not copied yet: only its album file says what it is.
    kind: null,
    content_type: 'image/jpeg',
    ...over,
  });

  it('allows twenty photographs, and the routes refuse a twenty-first', async () => {
    expect(MAX_SHOWCASE_ITEMS).toBe(20);
    const keys = Array.from({ length: 20 }, (_, i) => `p${i}.jpg`);
    const { service, inserts } = make(keys.map((key) => photo(key)));

    await service.create(ME, { fileKeys: keys });
    const pieces = inserts.find((i) => i.sql.includes('insert into showcase_items'));
    expect(pieces?.params[2]).toEqual(keys);

    const tooMany = plainToInstance(CreateShowcaseDto, { fileKeys: [...keys, 'p20.jpg'] });
    expect((await validate(tooMany)).map((e) => e.property)).toContain('fileKeys');
    const enough = plainToInstance(CreateShowcaseDto, { fileKeys: keys });
    expect(await validate(enough)).toEqual([]);
    const edit = plainToInstance(UpdateShowcaseDto, { fileKeys: [...keys, 'p20.jpg'] });
    expect((await validate(edit)).map((e) => e.property)).toContain('fileKeys');
  });

  it('refuses a film with photographs, before making any copy or writing anything', async () => {
    const { service, generate, inserts } = make([
      photo('raw.jpg', { thumb_key: null }),
      film('clip.mp4'),
    ]);

    await expect(service.create(ME, { fileKeys: ['raw.jpg', 'clip.mp4'] })).rejects.toMatchObject({
      response: { ...FILM_ALONE, fileKey: 'clip.mp4' },
    });
    // Asked before the thumbnailer: a set that cannot be posted costs no encode.
    expect(generate).not.toHaveBeenCalled();
    expect(inserts.some((i) => i.sql.includes('insert into showcases'))).toBe(false);
  });

  it('refuses two films, naming the first', async () => {
    const { service } = make([film('a.mp4'), film('b.mp4')]);
    await expect(service.create(ME, { fileKeys: ['a.mp4', 'b.mp4'] })).rejects.toMatchObject({
      response: { ...FILM_ALONE, fileKey: 'a.mp4' },
    });
  });

  it('still says a lone film is not ready when it is not', async () => {
    const { service } = make([film('clip.mp4', { poster_key: null })]);
    await expect(service.create(ME, { fileKeys: ['clip.mp4'] })).rejects.toMatchObject({
      response: { code: 'SHOWCASE_FILM_NOT_READY' },
    });
  });

  it('counts the pieces an edit keeps: a kept film and an added photograph', async () => {
    const { service, inserts } = make([photo('a.jpg')], { stored: [storedFilm()] });

    await expect(
      service.update(ME, 'sc-1', { fileKeys: [`item:${PIECE_ID}`, 'a.jpg'] }),
    ).rejects.toMatchObject({ response: { ...FILM_ALONE, fileKey: `item:${PIECE_ID}` } });
    // Refused before the transaction: nothing was changed.
    expect(inserts).toEqual([]);
  });

  it('reads a kept piece’s kind from its album file until it has a copy', async () => {
    const { service } = make([film('clip.mp4')], { stored: [storedPhoto('a.jpg')] });
    await expect(
      service.update(ME, 'sc-1', { fileKeys: ['a.jpg', 'clip.mp4'] }),
    ).rejects.toMatchObject({ response: { ...FILM_ALONE, fileKey: 'clip.mp4' } });
  });

  it('lets an older mixed post be edited without its pieces, and cut down to its film', async () => {
    const mixed = [storedFilm(), storedPhoto('a.jpg')];

    const words = make([], { stored: mixed });
    await expect(words.service.update(ME, 'sc-1', { caption: 'New words' })).resolves.toBeDefined();

    const cut = make([], { stored: mixed });
    await cut.service.update(ME, 'sc-1', { fileKeys: [`item:${PIECE_ID}`] });
    const deleted = cut.inserts.find((i) => i.sql.includes('delete from showcase_items'));
    expect(deleted?.params[0]).toEqual([mixed[1].id]);
  });

  it('lets a set of photographs be replaced by one film', async () => {
    const { service, inserts } = make([film('clip.mp4')], {
      stored: [storedPhoto('a.jpg'), storedPhoto('bb.jpg')],
    });
    await service.update(ME, 'sc-1', { fileKeys: ['clip.mp4'] });
    expect(inserts.some((i) => i.sql.includes('insert into showcase_items'))).toBe(true);
  });
});
