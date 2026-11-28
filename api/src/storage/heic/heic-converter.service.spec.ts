import type { ConfigService } from '@nestjs/config';
import sharp, { type Metadata } from 'sharp';
import type { DatabaseService } from '../../database/database.service';
import type { DownloadCacheService } from '../download-cache.service';
import type { StorageConfig } from '../storage.config';
import type { StorageService } from '../storage.service';
import {
  HeicConverter,
  heicRetryDelayMinutes,
  isWholePicture,
  MAX_CONVERT_PIXELS,
  MAX_HEIC_ATTEMPTS,
} from './heic-converter.service';
import { decodeHeic } from './heic-decoder';

jest.mock('./heic-decoder', () => ({ decodeHeic: jest.fn() }));
const mockDecode = decodeHeic as jest.MockedFunction<typeof decodeHeic>;

const KEY = 'users/u1/albums/2026/11/abc.heic';
const SOURCE = Buffer.from('the heic bytes, as read from the bucket');

/** A TIFF block whose only tag is orientation 6: "turn it a quarter". */
function rotatedTiff(): Buffer {
  const b = Buffer.alloc(26);
  b.write('II', 0, 'latin1');
  b.writeUInt16LE(42, 2);
  b.writeUInt32LE(8, 4);
  b.writeUInt16LE(1, 8);
  b.writeUInt16LE(0x0112, 10);
  b.writeUInt16LE(3, 12);
  b.writeUInt32LE(1, 14);
  b.writeUInt16LE(6, 18);
  return b;
}

let p3: Buffer;
beforeAll(async () => {
  const tagged = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#777' } })
    .withIccProfile('p3')
    .jpeg()
    .toBuffer();
  p3 = (await sharp(tagged).metadata()).icc!;
});

/** Pixels as libheif hands them back: a gradient, so an encode can be seen to keep them. */
function pixels(width: number, height: number, channels: 3 | 4 = 3) {
  const data = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * channels;
      data[at] = (x * 4) % 256;
      data[at + 1] = (y * 5) % 256;
      data[at + 2] = 180;
      if (channels === 4) data[at + 3] = x < width / 2 ? 255 : 0;
    }
  }
  return { width, height, channels, pixels: data };
}

function header(overrides: Partial<Metadata> = {}): Metadata {
  return {
    format: 'heif',
    compression: 'hevc',
    width: 64,
    height: 48,
    exif: Buffer.concat([Buffer.from([0, 0, 0, 6]), Buffer.from('Exif\0\0', 'latin1'), rotatedTiff()]),
    icc: p3,
    ...overrides,
  } as Metadata;
}

function harness({
  row = { original_name: 'IMG_0001.HEIC' } as { original_name: string | null } | null,
  updated = 1,
  versionId = 'v-heic-1' as string | null,
  enabled = 'on',
  isPublic = false,
} = {}) {
  const replaceOriginal = jest.fn().mockResolvedValue({ previousVersionId: versionId, etag: 'jpeg-etag' });
  const deleteKeys = jest.fn().mockResolvedValue(new Set());
  const deleteVersion = jest.fn().mockResolvedValue(true);
  const clientQuery = jest.fn(async (sql: string) => ({ rowCount: sql.includes('update user_files') ? updated : 1 }));
  const query = jest.fn().mockResolvedValue([]);
  const queryOne = jest.fn().mockResolvedValue(row);
  const forget = jest.fn().mockResolvedValue(undefined);
  const converter = new HeicConverter(
    { replaceOriginal, deleteKeys, deleteVersion } as unknown as StorageService,
    {
      query,
      queryOne,
      transaction: async (fn: (client: { query: typeof clientQuery }) => Promise<unknown>) =>
        fn({ query: clientQuery }),
    } as unknown as DatabaseService,
    { forget } as unknown as DownloadCacheService,
    { isPublicKey: () => isPublic } as unknown as StorageConfig,
    { get: (_: string, fallback: string) => (enabled === undefined ? fallback : enabled) } as unknown as ConfigService,
  );
  return { converter, replaceOriginal, deleteKeys, deleteVersion, clientQuery, query, queryOne, forget };
}

beforeEach(() => mockDecode.mockReset());

describe('HeicConverter.convert', () => {
  it('stores the whole photograph as a 4:4:4 JPEG with its colour profile and an upright EXIF', async () => {
    mockDecode.mockResolvedValue(pixels(64, 48));
    const h = harness();

    const result = await h.converter.convert(KEY, SOURCE, header(), 30_000);

    expect(result).not.toBeNull();
    const meta = await sharp(result!.jpeg).metadata();
    expect(meta.format).toBe('jpeg');
    expect([meta.width, meta.height]).toEqual([64, 48]);
    expect(meta.chromaSubsampling).toBe('4:4:4');
    expect(meta.icc).toEqual(p3);
    expect(meta.orientation).toBe(1);

    // Replaced in the bucket from the bytes that were read, under the same key.
    expect(h.replaceOriginal).toHaveBeenCalledWith(KEY, result!.jpeg, 'image/jpeg', SOURCE.length);

    // The row: JPEG type, the JPEG's size and name, and what it was before.
    const [sql, params] = h.clientQuery.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain("content_type = 'image/jpeg'");
    expect(sql).toContain('source_name = coalesce(source_name, original_name, $4)');
    expect(sql).toContain('source_size_bytes = coalesce(source_size_bytes, size_bytes)');
    expect(sql).toMatch(/where key = \$1\s+and content_type in \('image\/heic', 'image\/heif'\)/);
    expect(params).toEqual([KEY, result!.jpeg.length, 'jpeg-etag', 'abc.heic', 'IMG_0001.jpg']);

    // The HEIC it replaced is kept for a week, then deleted.
    const [versionSql, versionParams] = h.clientQuery.mock.calls[1] as unknown as [string, unknown[]];
    expect(versionSql).toContain('insert into replaced_versions');
    expect(versionParams).toEqual([KEY, 'v-heic-1', 7]);

    expect(h.forget).toHaveBeenCalledWith(KEY);
  });

  it('keeps every pixel it was given', async () => {
    const decoded = pixels(64, 48);
    mockDecode.mockResolvedValue(decoded);
    const h = harness();

    const { jpeg } = (await h.converter.convert(KEY, SOURCE, header({ icc: undefined }), 30_000))!;
    const back = await sharp(jpeg).raw().toBuffer();

    // A quality-95, full-colour JPEG of a gradient: no pixel more than a few
    // levels from what libheif decoded.
    let worst = 0;
    for (let i = 0; i < back.length; i++) worst = Math.max(worst, Math.abs(back[i] - decoded.pixels[i]));
    expect(worst).toBeLessThanOrEqual(6);
  });

  it('accepts a decode turned a quarter from the header, as libheif applies the rotation', async () => {
    mockDecode.mockResolvedValue(pixels(48, 64));
    const h = harness();
    const result = await h.converter.convert(KEY, SOURCE, header({ width: 64, height: 48 }), 30_000);
    expect([result!.width, result!.height]).toEqual([48, 64]);
  });

  it('refuses one tile of a grid rather than store a corner of the photograph', async () => {
    mockDecode.mockResolvedValue(pixels(32, 32));
    const h = harness();
    await expect(
      h.converter.convert(KEY, SOURCE, header({ width: 4032, height: 3024 }), 30_000),
    ).rejects.toThrow('not the 4032x3024 the file says');
    expect(h.replaceOriginal).not.toHaveBeenCalled();
    expect(h.clientQuery).not.toHaveBeenCalled();
  });

  it('does not decode a file larger than a conversion is allowed', async () => {
    const h = harness();
    await expect(
      h.converter.convert(KEY, SOURCE, header({ width: 12_000, height: 9_000 }), 30_000),
    ).rejects.toThrow('larger than a conversion is allowed');
    expect(12_000 * 9_000).toBeGreaterThan(MAX_CONVERT_PIXELS);
    expect(mockDecode).not.toHaveBeenCalled();
  });

  it('refuses a header with no size to check against', async () => {
    const h = harness();
    await expect(h.converter.convert(KEY, SOURCE, header({ width: undefined }), 30_000)).rejects.toThrow(
      'no size',
    );
    expect(mockDecode).not.toHaveBeenCalled();
  });

  it('lays a transparent photo on white, since a JPEG has no transparency', async () => {
    mockDecode.mockResolvedValue(pixels(64, 48, 4));
    const h = harness();
    const { jpeg } = (await h.converter.convert(KEY, SOURCE, header(), 30_000))!;
    const meta = await sharp(jpeg).metadata();
    expect(meta.channels).toBe(3);
    const right = await sharp(jpeg).extract({ left: 60, top: 20, width: 1, height: 1 }).raw().toBuffer();
    expect([...right].every((v) => v > 240)).toBe(true);
  });

  it('touches nothing when the row is no longer a HEIC', async () => {
    mockDecode.mockResolvedValue(pixels(64, 48));
    const h = harness({ row: null });
    expect(await h.converter.convert(KEY, SOURCE, header(), 30_000)).toBeNull();
    expect(h.replaceOriginal).not.toHaveBeenCalled();
  });

  it('takes the JPEG back when the row was deleted while it was written', async () => {
    mockDecode.mockResolvedValue(pixels(64, 48));
    const h = harness({ updated: 0 });
    expect(await h.converter.convert(KEY, SOURCE, header(), 30_000)).toBeNull();
    expect(h.deleteKeys).toHaveBeenCalledWith([KEY], expect.any(String));
    expect(h.deleteVersion).toHaveBeenCalledWith(KEY, 'v-heic-1');
    // No version kept for a file that is gone.
    expect(h.clientQuery).toHaveBeenCalledTimes(1);
  });

  it('records no version when the bucket gives none', async () => {
    mockDecode.mockResolvedValue(pixels(64, 48));
    const h = harness({ versionId: null });
    await h.converter.convert(KEY, SOURCE, header(), 30_000);
    expect(h.clientQuery).toHaveBeenCalledTimes(1);
  });

  it('names a file with no recorded name from its key', async () => {
    mockDecode.mockResolvedValue(pixels(64, 48));
    const h = harness({ row: { original_name: null } });
    await h.converter.convert(KEY, SOURCE, header(), 30_000);
    const [, params] = h.clientQuery.mock.calls[0] as unknown as [string, unknown[]];
    expect(params[4]).toBe('abc.jpg');
  });

  it('lets a decoder failure through for the caller to record, having changed nothing', async () => {
    mockDecode.mockRejectedValue(new Error('libheif could not decode it: bad hvcC'));
    const h = harness();
    await expect(h.converter.convert(KEY, SOURCE, header(), 30_000)).rejects.toThrow('bad hvcC');
    expect(h.replaceOriginal).not.toHaveBeenCalled();
  });
});

describe('HeicConverter.wants', () => {
  it('is HEIC and HEIF in the private bucket, while switched on', () => {
    expect(harness().converter.wants(KEY, 'image/heic')).toBe(true);
    expect(harness().converter.wants(KEY, 'image/heif')).toBe(true);
    expect(harness().converter.wants(KEY, 'image/jpeg')).toBe(false);
    expect(harness({ isPublic: true }).converter.wants(KEY, 'image/heic')).toBe(false);
    expect(harness({ enabled: 'off' }).converter.wants(KEY, 'image/heic')).toBe(false);
    expect(harness({ enabled: ' OFF ' }).converter.wants(KEY, 'image/heic')).toBe(false);
  });
});

describe('HeicConverter.claim and fail', () => {
  it('leases a file only while it is a HEIC nobody else holds and has tries left', async () => {
    const h = harness();
    h.queryOne.mockResolvedValueOnce({ attempts: 1 });
    expect(await h.converter.claim(KEY)).toEqual({ attempts: 1 });
    const [sql, params] = h.queryOne.mock.calls.at(-1) as unknown as [string, unknown[]];
    expect(sql).toContain("content_type in ('image/heic', 'image/heif')");
    expect(sql).toContain('heic_attempts < $3');
    expect(sql).toContain("coalesce(heic_next_at, '-infinity') <= now()");
    expect(params).toEqual([KEY, 15, MAX_HEIC_ATTEMPTS]);
  });

  it('backs off after a failure and gives up after the last try', async () => {
    const h = harness();
    await h.converter.fail(KEY, 1, 'x');
    expect((h.query.mock.calls.at(-1) as unknown as [string, unknown[]])[1]).toEqual([KEY, false, 10, 'x']);
    await h.converter.fail(KEY, MAX_HEIC_ATTEMPTS, 'y');
    expect((h.query.mock.calls.at(-1) as unknown as [string, unknown[]])[1][1]).toBe(true);
    expect([1, 2, 3, 4].map(heicRetryDelayMinutes)).toEqual([10, 40, 160, 640]);
  });

  it('never throws when the failure cannot be recorded', async () => {
    const h = harness();
    h.query.mockRejectedValueOnce(new Error('db down'));
    await expect(h.converter.fail(KEY, 2, 'z')).resolves.toBeUndefined();
  });
});

describe('isWholePicture', () => {
  it('is the header\'s size, either way round, and nothing else', () => {
    expect(isWholePicture({ width: 4032, height: 3024 }, { width: 4032, height: 3024 })).toBe(true);
    expect(isWholePicture({ width: 3024, height: 4032 }, { width: 4032, height: 3024 })).toBe(true);
    expect(isWholePicture({ width: 512, height: 512 }, { width: 4032, height: 3024 })).toBe(false);
    expect(isWholePicture({ width: 4032, height: 3024 }, {})).toBe(false);
  });
});
