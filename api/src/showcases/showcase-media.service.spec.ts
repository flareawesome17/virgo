import { Readable } from 'node:stream';
import sharp from 'sharp';
import type { DatabaseService } from '../database/database.service';
import type { StorageService } from '../storage/storage.service';
import {
  copyEdges,
  filmScale,
  pieceBase,
  ShowcaseMediaService,
  showcasePrefix,
} from './showcase-media.service';

const ME = '11111111-1111-4111-8111-111111111111';
const SHOWCASE = '22222222-2222-4222-8222-222222222222';
const ITEM = '33333333-3333-4333-8333-333333333333';
const FILE = `users/${ME}/albums/2026/10/a.jpg`;

describe('which web copies a photograph gets', () => {
  it('a large photograph: 1280 and 2560, never its full size', () => {
    expect(copyEdges(6000)).toEqual([1280, 2560]);
  });

  it('one between the sizes: 1280 and itself, so nothing is upscaled or lost', () => {
    expect(copyEdges(1800)).toEqual([1280, 1800]);
  });

  it('a small one: itself only', () => {
    expect(copyEdges(900)).toEqual([900]);
  });

  it('one exactly 2560: 1280 and 2560, not 2560 twice', () => {
    expect(copyEdges(2560)).toEqual([1280, 2560]);
  });

  it('nothing above the thumbnail when the photograph is no bigger than it', () => {
    expect(copyEdges(500)).toEqual([]);
  });
});

describe('a film copy', () => {
  it('caps the long edge at 1080p and keeps both sides even', () => {
    expect(filmScale(3840, 2160)).toEqual({ width: 1920, height: 1080 });
    expect(filmScale(1080, 1920)).toEqual({ width: 1080, height: 1920 });
    expect(filmScale(2160, 3841)).toEqual({ width: 1080, height: 1920 });
  });

  it('never enlarges a small one', () => {
    expect(filmScale(1280, 720)).toEqual({ width: 1280, height: 720 });
  });
});

describe('copying a photograph', () => {
  async function world(width: number, height: number, opts: { unreadable?: boolean } = {}) {
    const original = opts.unreadable
      ? Buffer.from('not an image at all')
      : await sharp({
          create: { width, height, channels: 3, background: { r: 180, g: 120, b: 90 } },
        })
          .jpeg({ quality: 90 })
          .toBuffer();
    const thumbnail = await sharp({
      create: { width: 640, height: 427, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .webp()
      .toBuffer();

    const written = new Map<string, Buffer>();
    const storage = {
      readStream: jest.fn(async (key: string) =>
        Readable.from([key === FILE ? original : thumbnail]),
      ),
      putDerived: jest.fn(async (key: string, body: Buffer) => {
        written.set(key, body);
      }),
      deleteKeys: jest.fn(async () => new Set<string>()),
    };

    const updates: unknown[][] = [];
    const piece = {
      id: ITEM,
      showcase_id: SHOWCASE,
      user_id: ME,
      file_key: FILE,
      copy_attempts: 0,
      content_type: 'image/jpeg',
      size_bytes: original.length,
      width_px: width,
      height_px: height,
      duration_ms: null,
      thumb_key: `users/${ME}/albums/2026/10/a-thumb.webp`,
      poster_key: null,
    };
    const db = {
      transaction: jest.fn(async (fn: (c: unknown) => Promise<unknown>) =>
        fn({
          query: jest.fn(async (sql: string) =>
            sql.includes('select i.id') ? { rows: [piece] } : { rows: [] },
          ),
        }),
      ),
      query: jest.fn(async (sql: string, params: unknown[]) => {
        updates.push(params);
        return sql.includes('returning id') ? [{ id: ITEM }] : [];
      }),
    };

    const service = new ShowcaseMediaService(
      db as unknown as DatabaseService,
      storage as unknown as StorageService,
    );
    return { service, written, updates, storage };
  }

  const base = pieceBase(ME, SHOWCASE, ITEM);

  it('writes a still and web copies named by real width, under the showcase', async () => {
    const { service, written, updates } = await world(3000, 2000);
    await service.copyShowcase(SHOWCASE);

    expect([...written.keys()].sort()).toEqual(
      [`${base}-thumb.webp`, `${base}-1280.webp`, `${base}-2560.webp`].sort(),
    );
    for (const key of written.keys()) expect(key.startsWith(showcasePrefix(ME, SHOWCASE))).toBe(true);

    const saved = updates.find((params) => params[0] === ITEM && params[1] === 'image');
    expect(saved).toBeDefined();
    // kind, thumb, poster, video, widths, width, height
    expect(saved!.slice(1, 9)).toEqual(['image', `${base}-thumb.webp`, null, null, [1280, 2560], 3000, 2000, null]);

    const big = await sharp(written.get(`${base}-2560.webp`)!).metadata();
    expect(big.width).toBe(2560);
    expect(big.format).toBe('webp');
  });

  it('labels a portrait by its width, not its long edge', async () => {
    const { service, updates } = await world(2000, 3000);
    await service.copyShowcase(SHOWCASE);
    const saved = updates.find((params) => params[0] === ITEM && params[1] === 'image');
    expect(saved![5]).toEqual([853, 1707]);
    expect(saved!.slice(6, 8)).toEqual([2000, 3000]);
  });

  it('keeps the album thumbnail when the original cannot be read here', async () => {
    const { service, written, updates } = await world(3000, 2000, { unreadable: true });
    await service.copyShowcase(SHOWCASE);
    expect([...written.keys()]).toEqual([`${base}-thumb.webp`]);
    const saved = updates.find((params) => params[0] === ITEM && params[1] === 'image');
    expect(saved![5]).toEqual([]);
  });
});
