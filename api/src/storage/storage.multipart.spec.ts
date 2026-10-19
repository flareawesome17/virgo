import type { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { QuotaService } from '../quota/quota.service';
import type { WorkspaceActivityService } from '../workspaces/workspace-activity.service';
import {
  CompleteMultipartDto,
  PartUrlDto,
  StartMultipartDto,
} from './dto/storage.dto';
import type { MediaLinkService } from './media-link.service';
import {
  MULTIPART_MAX_BYTES,
  MULTIPART_PART_BYTES,
  StorageConfig,
} from './storage.config';
import { StorageService } from './storage.service';

/**
 * Multipart upload (docs/LARGE_UPLOADS.md), with the real StorageService and the
 * real presigner. Only B2's network calls are faked, so what is asserted is what
 * a client would actually be handed: URLs that name the right bucket, key,
 * upload and part, and refusals that happen before anything is signed.
 */
const ME = 'user-1';
const THEM = 'user-2';
const MB = 1024 * 1024;
const GB = 1024 * MB;

function setup() {
  const values: Record<string, string> = {
    B2_BUCKET_NAME: 'virgo-public',
    B2_MEDIA_BUCKET_NAME: 'virgo-media',
    B2_ENDPOINT: 's3.us-east-005.backblazeb2.com',
    B2_REGION: 'us-east-005',
    B2_KEY_ID: 'test-key-id',
    B2_APPLICATION_KEY: 'test-application-key',
    CDN_BASE_URL: 'https://cdn.virgo.test',
  };
  const config = new StorageConfig({
    get: (key: string, fallback?: string) => values[key] ?? fallback,
  } as unknown as ConfigService);
  const quota = {
    assertCanStore: jest.fn(async () => undefined),
    accessForAlbum: jest.fn(async () => 'owner'),
    albumOwner: jest.fn(async () => null),
  };
  const storage = new StorageService(
    config,
    quota as unknown as QuotaService,
    {} as unknown as MediaLinkService,
    {} as unknown as WorkspaceActivityService,
  );
  return { storage, quota };
}

describe('multipart upload', () => {
  let sent: unknown[];
  let respond: (command: unknown) => unknown;

  beforeEach(() => {
    sent = [];
    respond = () => ({});
    jest.spyOn(S3Client.prototype, 'send').mockImplementation((async (command: unknown) => {
      sent.push(command);
      return respond(command);
    }) as never);
  });

  afterEach(() => jest.restoreAllMocks());

  const input = (over: Record<string, unknown> = {}) => ({
    contentType: 'video/mp4',
    scope: 'albums' as const,
    contentLength: 4 * GB,
    ...over,
  });

  describe('start', () => {
    it('opens an upload in the media bucket and splits the file into 16 MB parts', async () => {
      respond = (c) => (c instanceof CreateMultipartUploadCommand ? { UploadId: 'up-1' } : {});
      const { storage } = setup();

      const start = await storage.startMultipart(ME, input());

      expect(start.uploadId).toBe('up-1');
      expect(start.partSize).toBe(MULTIPART_PART_BYTES);
      // 4 GiB / 16 MiB
      expect(start.partCount).toBe(256);
      expect(start.key).toMatch(new RegExp(`^users/${ME}/albums/\\d{4}/\\d{2}/[0-9a-f-]{36}\\.mp4$`));

      const create = sent[0] as CreateMultipartUploadCommand;
      expect(create.input.Bucket).toBe('virgo-media');
      expect(create.input.Key).toBe(start.key);
      expect(create.input.ContentType).toBe('video/mp4');
    });

    it('rounds the last, shorter part up', async () => {
      respond = () => ({ UploadId: 'up-1' });
      const { storage } = setup();
      const start = await storage.startMultipart(ME, input({ contentLength: 17 * MB }));
      expect(start.partCount).toBe(2);
    });

    it('refuses what a single PUT would, before touching storage', async () => {
      const { storage, quota } = setup();

      await expect(storage.startMultipart(ME, input({ contentType: 'text/html' }))).rejects.toThrow(
        'Unsupported content type',
      );
      await expect(
        storage.startMultipart(ME, input({ contentLength: MULTIPART_MAX_BYTES + 1 })),
      ).rejects.toThrow('File size must be between');
      await expect(storage.startMultipart(ME, input({ contentLength: 0 }))).rejects.toThrow(
        'File size must be between',
      );
      expect(sent).toHaveLength(0);
      expect(quota.assertCanStore).not.toHaveBeenCalled();
    });

    it.each(['avatars', 'covers'] as const)('never sends a %s in parts', async (scope) => {
      const { storage } = setup();
      await expect(
        storage.startMultipart(ME, input({ scope, contentType: 'image/jpeg', contentLength: 200 * MB })),
      ).rejects.toThrow('A profile photo is not sent in parts.');
      expect(sent).toHaveLength(0);
    });

    it('checks the owner has room for the whole file before opening anything', async () => {
      const { storage, quota } = setup();
      quota.assertCanStore.mockRejectedValueOnce(new Error('Storage full'));
      await expect(storage.startMultipart(ME, input())).rejects.toThrow('Storage full');
      expect(quota.assertCanStore).toHaveBeenCalledWith(ME, 4 * GB);
      expect(sent).toHaveLength(0);
    });

    it("bills a collaborator's upload to the album owner, and refuses without upload access", async () => {
      respond = () => ({ UploadId: 'up-1' });
      const { storage, quota } = setup();
      quota.accessForAlbum.mockResolvedValue('view' as never);
      await expect(storage.startMultipart(ME, input({ albumId: 'a1' }))).rejects.toThrow(
        'You cannot add media to that album',
      );

      quota.accessForAlbum.mockResolvedValue('upload' as never);
      quota.albumOwner.mockResolvedValue(THEM as never);
      await storage.startMultipart(ME, input({ albumId: 'a1' }));
      expect(quota.assertCanStore).toHaveBeenCalledWith(THEM, 4 * GB, 'album-owner');
    });

    it('says storage is unreachable when B2 gives no upload id', async () => {
      respond = () => ({});
      const { storage } = setup();
      await expect(storage.startMultipart(ME, input())).rejects.toThrow('Could not reach storage');
    });
  });

  describe('part urls', () => {
    const key = `users/${ME}/albums/2026/10/abc.mp4`;

    it('signs one part against the right bucket, key, upload and number', async () => {
      const { storage } = setup();
      const ticket = await storage.createPartUrl(ME, {
        key,
        uploadId: 'up-1',
        partNumber: 7,
        contentLength: MULTIPART_PART_BYTES,
      });

      const url = new URL(ticket.uploadUrl);
      expect(url.hostname.split('.')[0]).toBe('virgo-media');
      expect(url.pathname).toBe(`/${key}`);
      expect(url.searchParams.get('uploadId')).toBe('up-1');
      expect(url.searchParams.get('partNumber')).toBe('7');
      expect(url.searchParams.get('X-Amz-Signature')).toBeTruthy();
      expect(ticket.requiredHeaders['Content-Length']).toBe(String(MULTIPART_PART_BYTES));
    });

    it("will not sign into another account's prefix or a traversal", async () => {
      const { storage } = setup();
      const base = { uploadId: 'up-1', partNumber: 1, contentLength: MB };
      await expect(
        storage.createPartUrl(ME, { ...base, key: `users/${THEM}/albums/2026/10/x.mp4` }),
      ).rejects.toThrow('You do not have access to that object');
      await expect(
        storage.createPartUrl(ME, { ...base, key: `users/${ME}/../${THEM}/x.mp4` }),
      ).rejects.toThrow('Invalid object key');
    });

    it.each([0, -1, 10_001, 1.5])('refuses part number %s', async (partNumber) => {
      const { storage } = setup();
      await expect(
        storage.createPartUrl(ME, { key, uploadId: 'up-1', partNumber, contentLength: MB }),
      ).rejects.toThrow('Invalid part number');
    });

    it.each([0, MULTIPART_PART_BYTES + 1])('refuses a part of %s bytes', async (contentLength) => {
      const { storage } = setup();
      await expect(
        storage.createPartUrl(ME, { key, uploadId: 'up-1', partNumber: 1, contentLength }),
      ).rejects.toThrow('Invalid part size');
    });
  });

  describe('complete', () => {
    const key = `users/${ME}/albums/2026/10/abc.mp4`;
    const parts = [
      { partNumber: 2, etag: '"b"' },
      { partNumber: 1, etag: '"a"' },
    ];

    function b2(size: number) {
      respond = (c) => (c instanceof HeadObjectCommand ? { ContentLength: size } : {});
    }

    it('assembles the parts in order and reports the size B2 actually holds', async () => {
      b2(20 * MB);
      const { storage, quota } = setup();

      const done = await storage.completeMultipart(ME, { key, uploadId: 'up-1', parts });

      expect(done).toEqual({ key, size: 20 * MB });
      const complete = sent.find(
        (c) => c instanceof CompleteMultipartUploadCommand,
      ) as CompleteMultipartUploadCommand;
      expect(complete.input.UploadId).toBe('up-1');
      expect(complete.input.MultipartUpload?.Parts).toEqual([
        { PartNumber: 1, ETag: '"a"' },
        { PartNumber: 2, ETag: '"b"' },
      ]);
      expect(quota.assertCanStore).toHaveBeenCalledWith(ME, 20 * MB, 'yours');
    });

    it.each([
      ['no parts', []],
      ['a gap', [{ partNumber: 1, etag: 'a' }, { partNumber: 3, etag: 'c' }]],
      ['not starting at 1', [{ partNumber: 2, etag: 'b' }]],
      ['a repeated number', [{ partNumber: 1, etag: 'a' }, { partNumber: 1, etag: 'b' }]],
    ])('refuses %s without calling B2', async (_name, bad) => {
      const { storage } = setup();
      await expect(
        storage.completeMultipart(ME, { key, uploadId: 'up-1', parts: bad }),
      ).rejects.toThrow('The parts are incomplete');
      expect(sent).toHaveLength(0);
    });

    it('deletes an object that turns out bigger than the ceiling, and bills nothing', async () => {
      b2(MULTIPART_MAX_BYTES + 1);
      const { storage, quota } = setup();

      await expect(
        storage.completeMultipart(ME, { key, uploadId: 'up-1', parts }),
      ).rejects.toThrow('That file is too large to upload.');

      const removed = sent.find((c) => c instanceof DeleteObjectsCommand) as DeleteObjectsCommand;
      expect(removed.input.Delete?.Objects).toEqual([{ Key: key }]);
      expect(quota.assertCanStore).not.toHaveBeenCalled();
    });

    it('deletes an object the owner has no room for, rather than leave it unbilled', async () => {
      b2(5 * GB);
      const { storage, quota } = setup();
      quota.assertCanStore.mockRejectedValueOnce(new Error('Storage full'));

      await expect(
        storage.completeMultipart(ME, { key, uploadId: 'up-1', parts }),
      ).rejects.toThrow('Storage full');
      expect(sent.some((c) => c instanceof DeleteObjectsCommand)).toBe(true);
    });

    it('turns a B2 rejection of the parts into a retryable 400, not a 500', async () => {
      respond = (c) => {
        if (c instanceof CompleteMultipartUploadCommand) {
          throw Object.assign(new Error('InvalidPart'), { $metadata: { httpStatusCode: 400 } });
        }
        return {};
      };
      const { storage } = setup();
      await expect(
        storage.completeMultipart(ME, { key, uploadId: 'up-1', parts }),
      ).rejects.toThrow('The upload could not be assembled');
    });

    it("refuses another account's key", async () => {
      const { storage } = setup();
      await expect(
        storage.completeMultipart(ME, {
          key: `users/${THEM}/albums/2026/10/x.mp4`,
          uploadId: 'up-1',
          parts,
        }),
      ).rejects.toThrow('You do not have access to that object');
      expect(sent).toHaveLength(0);
    });
  });

  describe('abort', () => {
    const key = `users/${ME}/albums/2026/10/abc.mp4`;

    it('releases the parts', async () => {
      const { storage } = setup();
      await storage.abortMultipart(ME, { key, uploadId: 'up-1' });
      const abort = sent[0] as AbortMultipartUploadCommand;
      expect(abort).toBeInstanceOf(AbortMultipartUploadCommand);
      expect(abort.input).toMatchObject({ Bucket: 'virgo-media', Key: key, UploadId: 'up-1' });
    });

    it('counts an upload that is already gone as aborted', async () => {
      respond = () => {
        throw Object.assign(new Error('NoSuchUpload'), { $metadata: { httpStatusCode: 404 } });
      };
      const { storage } = setup();
      await expect(storage.abortMultipart(ME, { key, uploadId: 'up-1' })).resolves.toBeUndefined();
    });

    it("refuses another account's key", async () => {
      const { storage } = setup();
      await expect(
        storage.abortMultipart(ME, { key: `users/${THEM}/albums/2026/10/x.mp4`, uploadId: 'u' }),
      ).rejects.toThrow('You do not have access to that object');
      expect(sent).toHaveLength(0);
    });
  });

  describe('request validation', () => {
    const errors = async (cls: new () => object, body: object) =>
      (await validate(plainToInstance(cls, body) as object)).map((e) => e.property);

    it('accepts a 4 GB start and refuses one over the ceiling', async () => {
      const ok = { contentType: 'video/mp4', scope: 'albums', contentLength: 4 * GB };
      expect(await errors(StartMultipartDto, ok)).toEqual([]);
      expect(
        await errors(StartMultipartDto, { ...ok, contentLength: MULTIPART_MAX_BYTES + 1 }),
      ).toEqual(['contentLength']);
    });

    it('holds a part to 16 MB and a number to 1..10000', async () => {
      const ok = { key: 'k', uploadId: 'u', partNumber: 1, contentLength: MULTIPART_PART_BYTES };
      expect(await errors(PartUrlDto, ok)).toEqual([]);
      expect(await errors(PartUrlDto, { ...ok, contentLength: MULTIPART_PART_BYTES + 1 })).toEqual([
        'contentLength',
      ]);
      expect(await errors(PartUrlDto, { ...ok, partNumber: 10_001 })).toEqual(['partNumber']);
    });

    it('validates every part inside a complete request', async () => {
      const ok = { key: 'k', uploadId: 'u', parts: [{ partNumber: 1, etag: '"a"' }] };
      expect(await errors(CompleteMultipartDto, ok)).toEqual([]);
      expect(
        await errors(CompleteMultipartDto, { ...ok, parts: [{ partNumber: 0, etag: '' }, { etag: 5 }] }),
      ).toEqual(['parts']);
    });
  });
});
