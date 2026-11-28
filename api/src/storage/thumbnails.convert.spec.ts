import { writeFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import type sharpFn from 'sharp';
import type { DatabaseService } from '../database/database.service';
import type { HeicConverter } from './heic/heic-converter.service';
import type { MediaLinkService } from './media-link.service';
import type { StorageService } from './storage.service';
import { ThumbnailsService, thumbKeyFor } from './thumbnails.service';

/**
 * A HEIC on its way through `generate`: converted to a JPEG first, and its
 * previews made from that JPEG — or, when it cannot be converted now, made
 * as they always were, from the still ffmpeg decodes.
 *
 * The HEIC's header is faked as in thumbnails.heic.spec.ts, since the sharp
 * here cannot read HEVC; the converter is faked too, and its own spec covers
 * what it does with the bytes.
 *
 * The fake answers as libheif does for a real iPhone photo: with its default
 * safety limits it refuses the tile grid's 54 item references, so the header
 * is only read when those limits are lifted. That refusal is what kept every
 * HEIC in production from converting after 117.
 */

const HEIC = Buffer.from('fake heic container');
/** A HEIC whose header cannot be read at all. */
const BROKEN = Buffer.from('broken heic container');
const LIMIT =
  'Input buffer has corrupt header: heif: Invalid input: Security limit exceeded: ' +
  'Number of references in iref box (54) exceeds the security limits of 16 references. (2.1000)';

jest.mock('sharp', () => {
  const real = jest.requireActual<typeof import('sharp')>('sharp');
  const wrapped = (input?: unknown, options?: { unlimited?: boolean }) => {
    const text = Buffer.isBuffer(input) ? input.toString('latin1') : '';
    if (text === 'fake heic container') {
      return {
        metadata: async () => {
          if (!options?.unlimited) throw new Error(LIMIT);
          return { format: 'heif', compression: 'hevc', width: 400, height: 300 };
        },
      };
    }
    if (text === 'broken heic container') {
      return { metadata: async () => { throw new Error('Input buffer contains unsupported image format'); } };
    }
    return (real as unknown as (i?: unknown, o?: unknown) => unknown)(input, options);
  };
  return Object.assign(wrapped, real);
});

let mockStill: Buffer | null = null;
const mockFfmpeg = jest.fn();
jest.mock('node:child_process', () => ({
  execFile: (
    file: string,
    args: string[],
    options: unknown,
    callback: (err: Error | null, stdout: string, stderr: string) => void,
  ) => {
    mockFfmpeg(file, args, options);
    if (!mockStill) {
      callback(new Error('ffmpeg: could not decode'), '', '');
      return;
    }
    writeFileSync(args[args.length - 1], mockStill);
    callback(null, '', '');
  },
}));

const realSharp = jest.requireActual<typeof sharpFn>('sharp');
const KEY = 'users/u/albums/2026/11/IMG_0001.heic';

function picture(width: number, height: number, as: 'jpeg' | 'png'): Promise<Buffer> {
  const made = realSharp({ create: { width, height, channels: 3, background: '#3366aa' } });
  return as === 'jpeg' ? made.jpeg({ quality: 95 }).toBuffer() : made.png().toBuffer();
}

function harness(heic: Partial<HeicConverter>, stored: Buffer = HEIC) {
  const putDerived = jest.fn().mockResolvedValue(undefined);
  const readStream = jest.fn(async () => Readable.from([stored]));
  const query = jest.fn().mockResolvedValue([]);
  const queryOne = jest.fn().mockResolvedValue(null);
  const converter = {
    wants: jest.fn(() => true),
    claim: jest.fn().mockResolvedValue({ attempts: 1 }),
    convert: jest.fn(),
    fail: jest.fn().mockResolvedValue(undefined),
    ...heic,
  };
  const service = new ThumbnailsService(
    { readStream, readHead: async () => Buffer.alloc(0), putDerived } as unknown as StorageService,
    { query, queryOne } as unknown as DatabaseService,
    { isConfigured: false, write: jest.fn() } as unknown as MediaLinkService,
    converter as unknown as HeicConverter,
  );
  const recorded = () => (query.mock.calls.at(-1) as [string, unknown[]])[1];
  return { service, converter, putDerived, readStream, recorded };
}

beforeEach(() => {
  mockStill = null;
  mockFfmpeg.mockClear();
});

describe('ThumbnailsService.generate and a HEIC it converts', () => {
  it('stores it as a JPEG first, then makes the previews from the JPEG without ffmpeg', async () => {
    const jpeg = await picture(400, 300, 'jpeg');
    const h = harness({ convert: jest.fn().mockResolvedValue({ jpeg, width: 400, height: 300 }) });

    await expect(h.service.generate(KEY, 'image/heic', 2_000_000)).resolves.toBe(thumbKeyFor(KEY));

    expect(h.converter.claim).toHaveBeenCalledWith(KEY);
    expect(h.converter.convert).toHaveBeenCalledWith(
      KEY,
      HEIC,
      expect.objectContaining({ format: 'heif', width: 400, height: 300 }),
      60_000,
    );
    expect(mockFfmpeg).not.toHaveBeenCalled();
    // Read from the bucket once, for the HEIC; the JPEG was already in hand.
    expect(h.readStream).toHaveBeenCalledTimes(1);
    const thumb = await realSharp(h.putDerived.mock.calls[0][1] as Buffer).metadata();
    expect(thumb.format).toBe('webp');
    const [, , width, height] = h.recorded();
    expect([width, height]).toEqual([400, 300]);
  });

  it("reads an iPhone photo's header past libheif's default limit on item references", async () => {
    const jpeg = await picture(400, 300, 'jpeg');
    const h = harness({ convert: jest.fn().mockResolvedValue({ jpeg, width: 400, height: 300 }) });

    await h.service.generate(KEY, 'image/heic', 2_000_000);
    // Read with the default limits, the fake refuses the header as libheif
    // refused every iPhone photo, and nothing would have been claimed.
    expect(h.converter.claim).toHaveBeenCalledWith(KEY);
    expect(h.converter.convert).toHaveBeenCalled();
    expect(h.converter.fail).not.toHaveBeenCalled();
  });

  it('leaves a HEIC whose header cannot be read to the usual failure, unclaimed', async () => {
    mockStill = await picture(400, 300, 'png');
    const h = harness({}, BROKEN);

    // No previews can come of it either way; it is recorded as failed, as it
    // was before conversion existed, rather than thrown out of the confirm.
    await expect(h.service.generate(KEY, 'image/heic', 2_000_000)).resolves.toBeNull();
    expect(h.converter.claim).not.toHaveBeenCalled();
    expect(h.converter.convert).not.toHaveBeenCalled();
  });

  it('falls back to the still ffmpeg decodes when another process holds the file', async () => {
    mockStill = await picture(400, 300, 'png');
    const h = harness({ claim: jest.fn().mockResolvedValue(null) });

    await expect(h.service.generate(KEY, 'image/heic', 2_000_000)).resolves.toBe(thumbKeyFor(KEY));
    expect(h.converter.convert).not.toHaveBeenCalled();
    expect(mockFfmpeg).toHaveBeenCalled();
  });

  it('records a failed conversion for the sweep and still makes the previews', async () => {
    mockStill = await picture(400, 300, 'png');
    const h = harness({ convert: jest.fn().mockRejectedValue(new Error('libheif could not decode it')) });

    await expect(h.service.generate(KEY, 'image/heic', 2_000_000)).resolves.toBe(thumbKeyFor(KEY));
    expect(h.converter.fail).toHaveBeenCalledWith(KEY, 1, 'libheif could not decode it');
    expect(mockFfmpeg).toHaveBeenCalled();
    expect(h.putDerived).toHaveBeenCalled();
  });

  it('makes nothing for a file deleted while its JPEG was written', async () => {
    const h = harness({ convert: jest.fn().mockResolvedValue(null) });
    await expect(h.service.generate(KEY, 'image/heic', 2_000_000)).resolves.toBeNull();
    expect(h.putDerived).not.toHaveBeenCalled();
  });

  it('leaves a HEIC alone when conversion is switched off', async () => {
    mockStill = await picture(400, 300, 'png');
    const h = harness({ wants: jest.fn(() => false) });
    await h.service.generate(KEY, 'image/heic', 2_000_000);
    expect(h.converter.claim).not.toHaveBeenCalled();
    expect(mockFfmpeg).toHaveBeenCalled();
  });
});

describe('ThumbnailsService.convertStored', () => {
  const stored = {
    key: KEY,
    contentType: 'image/heic',
    thumbKey: null,
    displayWidths: null,
    blurDataUrl: null,
  };

  it('converts a claimed HEIC and makes the previews it lacks from the JPEG in hand', async () => {
    const jpeg = await picture(400, 300, 'jpeg');
    const h = harness({ convert: jest.fn().mockResolvedValue({ jpeg, width: 400, height: 300 }) });

    await expect(h.service.convertStored(stored, 120_000)).resolves.toBe(true);
    // The sweep has claimed it already, so it is not claimed a second time.
    expect(h.converter.claim).not.toHaveBeenCalled();
    expect(h.converter.convert).toHaveBeenCalledWith(KEY, HEIC, expect.any(Object), 120_000);
    expect(h.readStream).toHaveBeenCalledTimes(1);
    expect(h.putDerived).toHaveBeenCalledWith(thumbKeyFor(KEY), expect.any(Buffer), 'image/webp');
    expect(mockFfmpeg).not.toHaveBeenCalled();
  });

  it('keeps the thumbnail a file already has', async () => {
    const jpeg = await picture(400, 300, 'jpeg');
    const h = harness({ convert: jest.fn().mockResolvedValue({ jpeg, width: 400, height: 300 }) });
    await h.service.convertStored({ ...stored, thumbKey: thumbKeyFor(KEY) }, 120_000);
    expect(h.putDerived).not.toHaveBeenCalled();
  });

  it('throws for a HEIC whose header cannot be read, for the sweep to count', async () => {
    const h = harness({}, BROKEN);
    await expect(h.service.convertStored(stored, 120_000)).rejects.toThrow('unsupported image format');
    expect(h.converter.convert).not.toHaveBeenCalled();
  });

  it('throws for a conversion that failed, for the sweep to count', async () => {
    const h = harness({ convert: jest.fn().mockRejectedValue(new Error('took longer than 120 s')) });
    await expect(h.service.convertStored(stored, 120_000)).rejects.toThrow('took longer');
  });

  it('says so when the row went while it worked', async () => {
    const h = harness({ convert: jest.fn().mockResolvedValue(null) });
    await expect(h.service.convertStored(stored, 120_000)).resolves.toBe(false);
  });
});
