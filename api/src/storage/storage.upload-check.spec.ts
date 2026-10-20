import { ForbiddenException, Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { QuotaService } from '../quota/quota.service';
import type { WorkspaceActivityService } from '../workspaces/workspace-activity.service';
import { CheckUploadsDto, ConfirmUploadDto } from './dto/storage.dto';
import type { MediaLinkService } from './media-link.service';
import { StorageConfig } from './storage.config';
import { StorageService } from './storage.service';

/**
 * Re-uploading a batch skips what already arrived.
 *
 * A large drop that half-fails on a bad connection used to be sent again in
 * full, and every file that had made it the first time was stored a second
 * time under a new key, billed twice. The client now asks first, once per
 * batch, which of its files the album already holds.
 */
const ME = 'user-1';
const ALBUM = 'album-1';
const AT = Date.UTC(2026, 9, 18, 14, 30, 0);

function setup({
  access = 'owner',
  rows = [],
}: {
  access?: string | null;
  rows?: { idx: number; source_modified_ms: string | null }[];
} = {}) {
  const values: Record<string, string> = {
    B2_BUCKET_NAME: 'virgo-public',
    B2_MEDIA_BUCKET_NAME: 'virgo-media',
    B2_ENDPOINT: 's3.us-east-005.backblazeb2.com',
    B2_REGION: 'us-east-005',
    B2_KEY_ID: 'test-key-id',
    B2_APPLICATION_KEY: 'test-application-key',
  };
  const config = new StorageConfig({
    get: (key: string, fallback?: string) => values[key] ?? fallback,
  } as unknown as ConfigService);
  const quota = {
    accessForAlbum: jest.fn(async () => access),
    albumOwner: jest.fn(async () => 'owner-9'),
    findUploadMatches: jest.fn(async () => rows),
    recordFile: jest.fn(async () => true),
  };
  const feed = { recordInAlbum: jest.fn(async () => undefined) };
  const storage = new StorageService(
    config,
    quota as unknown as QuotaService,
    {} as unknown as MediaLinkService,
    feed as unknown as WorkspaceActivityService,
  );
  return { storage, quota };
}

afterEach(() => jest.restoreAllMocks());

describe('StorageService.checkUploads', () => {
  it('asks once for the whole batch, by cleaned name and size', async () => {
    const { storage, quota } = setup();

    await storage.checkUploads(ME, ALBUM, [
      { name: 'IMG_0001.JPG', size: 4_000_000, lastModified: AT },
      // The name is compared as confirm stored it: no folder, no control
      // characters, single spaces.
      { name: 'C:\\DCIM\\100CANON\\  IMG_0002 \u0007copy.JPG ', size: 5_000_000 },
    ]);

    expect(quota.findUploadMatches).toHaveBeenCalledTimes(1);
    expect(quota.findUploadMatches).toHaveBeenCalledWith(ALBUM, [
      { index: 0, name: 'IMG_0001.JPG', size: 4_000_000 },
      { index: 1, name: 'IMG_0002 copy.JPG', size: 5_000_000 },
    ]);
  });

  it('answers which files are already there, and how sure it is', async () => {
    const { storage } = setup({
      rows: [
        { idx: 0, source_modified_ms: String(AT) },
        { idx: 2, source_modified_ms: null },
      ],
    });

    await expect(
      storage.checkUploads(ME, ALBUM, [
        { name: 'a.jpg', size: 1, lastModified: AT },
        { name: 'b.jpg', size: 2, lastModified: AT },
        { name: 'c.jpg', size: 3, lastModified: AT },
      ]),
    ).resolves.toEqual({
      matches: [
        { index: 0, match: 'exact' },
        { index: 2, match: 'possible', reason: 'unverified' },
      ],
    });
  });

  it('treats a modified time no device could mean as unknown', async () => {
    const { storage } = setup({ rows: [{ idx: 0, source_modified_ms: '0' }] });

    await expect(
      storage.checkUploads(ME, ALBUM, [{ name: 'a.jpg', size: 1, lastModified: 0 }]),
    ).resolves.toEqual({ matches: [{ index: 0, match: 'possible', reason: 'unverified' }] });
  });

  it('needs upload access to the album, and asks nothing without it', async () => {
    // Album ids are guessable; a stranger must not learn what is in one.
    for (const access of [null, 'view', 'download']) {
      const { storage, quota } = setup({ access });
      await expect(
        storage.checkUploads(ME, ALBUM, [{ name: 'a.jpg', size: 1 }]),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(quota.findUploadMatches).not.toHaveBeenCalled();
    }
  });

  it('checks a shared album for a collaborator who may upload to it', async () => {
    const { storage, quota } = setup({ access: 'upload' });
    await storage.checkUploads(ME, ALBUM, [{ name: 'a.jpg', size: 1 }]);
    expect(quota.findUploadMatches).toHaveBeenCalledTimes(1);
  });

  it('does not query for an empty batch, or for files with no usable name', async () => {
    const { storage, quota } = setup();
    await expect(storage.checkUploads(ME, ALBUM, [])).resolves.toEqual({ matches: [] });
    await expect(
      storage.checkUploads(ME, ALBUM, [{ name: ' \u0000 ', size: 1 }]),
    ).resolves.toEqual({ matches: [] });
    expect(quota.findUploadMatches).not.toHaveBeenCalled();
  });
});

describe('StorageService.statObject records what identifies the file', () => {
  const KEY = `users/${ME}/albums/2026/10/44444444-4444-4444-8444-444444444444.jpg`;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(S3Client.prototype, 'send').mockImplementation((async (command: unknown) => {
      if (command instanceof HeadObjectCommand) {
        return { ContentLength: 4_000_000, ContentType: 'image/jpeg', ETag: '"9b2cf535f27731c9"' };
      }
      throw new Error('unexpected command');
    }) as never);
  });

  it('keeps the ETag B2 reported and the modified time the device did', async () => {
    const { storage, quota } = setup();

    await expect(storage.statObject(ME, KEY, ALBUM, 'IMG_0001.JPG', AT)).resolves.toEqual({
      exists: true,
      size: 4_000_000,
      contentType: 'image/jpeg',
    });

    expect(quota.recordFile).toHaveBeenCalledWith(
      ME,
      expect.objectContaining({
        key: KEY,
        sizeBytes: 4_000_000,
        originalName: 'IMG_0001.JPG',
        etag: '9b2cf535f27731c9',
        sourceModifiedAt: new Date(AT),
      }),
    );
  });

  it('records no modified time when the client sent none, as installed apps do not', async () => {
    const { storage, quota } = setup();

    await storage.statObject(ME, KEY, ALBUM, 'IMG_0001.JPG');

    expect(quota.recordFile).toHaveBeenCalledWith(
      ME,
      expect.objectContaining({ etag: '9b2cf535f27731c9', sourceModifiedAt: null }),
    );
  });
});

describe('upload check and confirm validation', () => {
  const errors = async (cls: new () => object, body: object) =>
    (await validate(plainToInstance(cls, body) as object)).map((e) => e.property);

  const file = (i: number) => ({ name: `IMG_${i}.JPG`, size: 1_000 + i, lastModified: AT });

  it('takes up to 500 files for one album', async () => {
    expect(await errors(CheckUploadsDto, { albumId: ALBUM, files: [file(1)] })).toEqual([]);
    expect(
      await errors(CheckUploadsDto, {
        albumId: ALBUM,
        files: Array.from({ length: 500 }, (_, i) => file(i)),
      }),
    ).toEqual([]);
    expect(
      await errors(CheckUploadsDto, {
        albumId: ALBUM,
        files: Array.from({ length: 501 }, (_, i) => file(i)),
      }),
    ).toEqual(['files']);
  });

  it('does not refuse a batch over one file too large to upload', async () => {
    // The upload refuses that file on its own. Refusing the check instead
    // would leave the other 499 in its piece unchecked.
    expect(
      await errors(CheckUploadsDto, {
        albumId: ALBUM,
        files: [file(1), { name: 'FILM.MOV', size: 12 * 1024 ** 3 }],
      }),
    ).toEqual([]);
  });

  it('needs an album, and checks every file in the list', async () => {
    expect(await errors(CheckUploadsDto, { files: [file(1)] })).toEqual(['albumId']);
    expect(
      await errors(CheckUploadsDto, {
        albumId: ALBUM,
        files: [{ name: 5, size: 1 }, { name: 'a.jpg', size: -1 }, { name: 'b.jpg', size: 1.5 }],
      }),
    ).toEqual(['files']);
    expect(
      await errors(CheckUploadsDto, {
        albumId: ALBUM,
        files: [{ name: 'a.jpg', size: 1, lastModified: 'yesterday' }],
      }),
    ).toEqual(['files']);
    expect(
      await errors(CheckUploadsDto, { albumId: ALBUM, files: [{ name: 'x'.repeat(1025), size: 1 }] }),
    ).toEqual(['files']);
  });

  it('lets a confirm carry the file modified time, and still accepts one without', async () => {
    const key = `users/${ME}/albums/2026/10/x.jpg`;
    expect(await errors(ConfirmUploadDto, { key })).toEqual([]);
    expect(await errors(ConfirmUploadDto, { key, lastModified: AT })).toEqual([]);
    expect(await errors(ConfirmUploadDto, { key, lastModified: 'today' })).toEqual([
      'lastModified',
    ]);
  });
});
