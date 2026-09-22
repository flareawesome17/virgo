import { writeFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import type sharpFn from 'sharp';
import type { DatabaseService } from '../database/database.service';
import type { MediaLinkService } from './media-link.service';
import type { StorageService } from './storage.service';
import { ThumbnailsService, thumbKeyFor } from './thumbnails.service';

/**
 * An iPhone's HEIC, which the prebuilt sharp in the image cannot decode.
 *
 * ffmpeg makes the pixels instead, and its PNG is used only when it is the
 * size the file's own header says. The sharp here has no HEVC either, so a
 * real HEIC cannot be made in a test: its header is faked by wrapping sharp
 * for one marker buffer, and everything else goes to the real library. ffmpeg
 * is faked too, writing whatever PNG the test hands it where it was told to.
 */

/** What the fake sharp reads as an iPhone's HEIC: 4032 x 3024, HEVC inside. */
const HEIC = Buffer.from('fake heic container');
const HEIC_WIDTH = 4032;
const HEIC_HEIGHT = 3024;

/** One whose header claims 108 megapixels, which no camera makes. */
const HUGE_HEIC = Buffer.from('fake huge heic container');
const HUGE_WIDTH = 12_000;
const HUGE_HEIGHT = 9_000;

jest.mock('sharp', () => {
  const real = jest.requireActual<typeof import('sharp')>('sharp');
  const headers: Record<string, { width: number; height: number }> = {
    'fake heic container': { width: 4032, height: 3024 },
    'fake huge heic container': { width: 12_000, height: 9_000 },
  };
  const wrapped = (input?: unknown, options?: unknown) => {
    const header = Buffer.isBuffer(input) ? headers[input.toString('latin1')] : undefined;
    if (header) {
      return {
        metadata: async () => ({ format: 'heif', compression: 'hevc', ...header }),
      };
    }
    return (real as unknown as (i?: unknown, o?: unknown) => unknown)(input, options);
  };
  return Object.assign(wrapped, real);
});

/** What the fake ffmpeg writes. Set per test. */
let mockStill: Buffer | null = null;
/** When set, each decode waits here until a test lets it finish. */
let mockHeld: (() => void)[] | null = null;
const mockFfmpeg = jest.fn();

jest.mock('node:child_process', () => ({
  execFile: (
    file: string,
    args: string[],
    options: unknown,
    callback: (err: Error | null, stdout: string, stderr: string) => void,
  ) => {
    mockFfmpeg(file, args, options);
    const finish = () => {
      if (!mockStill) {
        callback(new Error('ffmpeg: could not decode'), '', '');
        return;
      }
      // The output path is the last argument, as the service passes it.
      writeFileSync(args[args.length - 1], mockStill);
      callback(null, '', '');
    };
    if (mockHeld) mockHeld.push(finish);
    else finish();
  },
}));

// Imported after the mocks, so this is the real library for making fixtures.
const realSharp = jest.requireActual<typeof sharpFn>('sharp');

function still(width: number, height: number): Promise<Buffer> {
  return realSharp({ create: { width, height, channels: 3, background: '#556677' } })
    .png()
    .toBuffer();
}

function harness(source: Buffer = HEIC) {
  const putDerived = jest.fn().mockResolvedValue(undefined);
  const query = jest.fn().mockResolvedValue([]);
  const queryOne = jest.fn().mockResolvedValue(null);
  const service = new ThumbnailsService(
    {
      readStream: async () => Readable.from([source]),
      readHead: async () => Buffer.alloc(0),
      putDerived,
    } as unknown as StorageService,
    { query, queryOne } as unknown as DatabaseService,
    { isConfigured: false, write: jest.fn() } as unknown as MediaLinkService,
  );
  const lastSql = () => (query.mock.calls.at(-1) as [string, unknown[]])[0];
  const lastParams = () => (query.mock.calls.at(-1) as [string, unknown[]])[1];
  return { service, putDerived, lastSql, lastParams };
}

const KEY = 'users/u/albums/2026/09/IMG_0001.heic';

/** Waits for something the real filesystem is in the middle of. */
async function until(condition: () => boolean, within = 4_000): Promise<void> {
  const deadline = Date.now() + within;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for a decode to start');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  mockStill = null;
  mockHeld = null;
  mockFfmpeg.mockClear();
});

describe('ThumbnailsService and an iPhone HEIC', () => {
  it('makes the thumbnail from the still ffmpeg decoded, sized by the still', async () => {
    mockStill = await still(HEIC_WIDTH, HEIC_HEIGHT);
    const { service, putDerived, lastParams } = harness();

    await expect(service.generate(KEY, 'image/heic', 3_000_000)).resolves.toBe(thumbKeyFor(KEY));

    expect(mockFfmpeg).toHaveBeenCalledWith(
      'ffmpeg',
      expect.arrayContaining(['-frames:v', '1', '-y']),
      expect.any(Object),
    );
    expect(putDerived).toHaveBeenCalledWith(thumbKeyFor(KEY), expect.any(Buffer), 'image/webp');
    const thumbnail = await realSharp(putDerived.mock.calls[0][1] as Buffer).metadata();
    expect([thumbnail.width, thumbnail.height]).toEqual([640, 480]);
    const [, , width, height] = lastParams();
    expect([width, height]).toEqual([HEIC_WIDTH, HEIC_HEIGHT]);
  });

  it('refuses a still that is not the whole photograph, and records it failed', async () => {
    // One 512 px tile of a gridded HEIC, which an older ffmpeg returns in
    // place of the image. A thumbnail of one corner is worse than none.
    mockStill = await still(512, 512);
    const { service, putDerived, lastSql } = harness();

    await expect(service.generate(KEY, 'image/heic', 3_000_000)).resolves.toBeNull();

    expect(putDerived).not.toHaveBeenCalled();
    expect(lastSql()).toContain(`processing_status = 'failed'`);
  });

  it('records it failed when ffmpeg cannot decode it either', async () => {
    const { service, putDerived, lastSql } = harness();

    await expect(service.generate(KEY, 'image/heic', 3_000_000)).resolves.toBeNull();

    expect(putDerived).not.toHaveBeenCalled();
    expect(lastSql()).toContain(`processing_status = 'failed'`);
  });

  it('gives a request fifteen seconds and the backfill two minutes', async () => {
    // A request path cannot wait two minutes on one photograph: the app gives
    // up long before, and the work goes on anyway. The backfill has nobody
    // waiting, so it keeps the longer one.
    mockStill = await still(HEIC_WIDTH, HEIC_HEIGHT);
    const { service } = harness();

    await service.generate(KEY, 'image/heic', 3_000_000);
    expect(mockFfmpeg).toHaveBeenLastCalledWith(
      'ffmpeg',
      expect.any(Array),
      // Killed outright at the deadline, so it is a bound even mid-frame.
      expect.objectContaining({ timeout: 15_000, killSignal: 'SIGKILL' }),
    );

    await service.generate(KEY, 'image/heic', 3_000_000, {}, { stillDecodeTimeoutMs: 120_000 });
    expect(mockFfmpeg).toHaveBeenLastCalledWith(
      'ffmpeg',
      expect.any(Array),
      expect.objectContaining({ timeout: 120_000 }),
    );
  });

  it('never starts ffmpeg on a header claiming more than a hundred megapixels', async () => {
    // Nothing has been unpacked at this point: the refusal is read from the
    // header, before a decoder holds the image three times over.
    mockStill = await still(HUGE_WIDTH, HUGE_HEIGHT);
    const photo = harness(HUGE_HEIC);

    await expect(
      photo.service.generate('users/u/albums/2026/09/huge.heic', 'image/heic', 3_000_000),
    ).resolves.toBeNull();

    expect(mockFfmpeg).not.toHaveBeenCalled();
    expect(photo.putDerived).not.toHaveBeenCalled();
    expect(photo.lastSql()).toContain(`processing_status = 'failed'`);

    const avatar = harness(HUGE_HEIC);
    await expect(
      avatar.service.normaliseAvatar('users/u/avatars/2026/09/me.heic', 'image/heic', 3_000_000),
    ).resolves.toBeNull();
    expect(mockFfmpeg).not.toHaveBeenCalled();
  });

  it('runs two decodes at a time and holds the rest until a slot is free', async () => {
    // Each one is a whole image in memory and seconds of CPU, on a box that
    // also runs Postgres and the web servers. Uploads arrive in bursts.
    mockStill = await still(HEIC_WIDTH, HEIC_HEIGHT);
    const held: (() => void)[] = [];
    mockHeld = held;
    const { service } = harness();
    const keys = [1, 2, 3, 4].map((n) => `users/u/albums/2026/09/IMG_000${n}.heic`);
    const started = () => mockFfmpeg.mock.calls.length;

    const all = Promise.all(
      keys.map((key) => service.generate(key, 'image/heic', 3_000_000)),
    );

    await until(() => started() === 2);
    await pause(60);
    expect(started()).toBe(2);

    held.shift()!();
    await until(() => started() === 3);
    await pause(60);
    expect(started()).toBe(3);

    // Let everything through, however far the queue has moved on.
    while (started() < 4 || held.length > 0) {
      const next = held.shift();
      if (next) next();
      else await pause(5);
    }

    await expect(all).resolves.toEqual(keys.map((key) => thumbKeyFor(key)));
    expect(started()).toBe(4);
  });

  it('decodes a HEIC avatar the same way, and declines one it cannot', async () => {
    const avatar = 'users/u/avatars/2026/09/me.heic';

    mockStill = await still(HEIC_WIDTH, HEIC_HEIGHT);
    const made = harness();
    await expect(made.service.normaliseAvatar(avatar, 'image/heic', 3_000_000)).resolves.toEqual({
      size: expect.any(Number),
      contentType: 'image/webp',
    });
    expect(made.putDerived).toHaveBeenCalledWith(avatar, expect.any(Buffer), 'image/webp');

    mockStill = await still(512, 512);
    const refused = harness();
    await expect(refused.service.normaliseAvatar(avatar, 'image/heic', 3_000_000)).resolves.toBeNull();
    expect(refused.putDerived).not.toHaveBeenCalled();
  });
});
