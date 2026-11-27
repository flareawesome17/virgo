import type { ConfigService } from '@nestjs/config';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  ListPartsCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { QuotaService } from '../quota/quota.service';
import type { WorkspaceActivityService } from '../workspaces/workspace-activity.service';
import type { MediaLinkService } from './media-link.service';
import {
  HANDOFF_URL_TTL_SECONDS,
  MULTIPART_MAX_BYTES,
  MULTIPART_PART_BYTES,
  StorageConfig,
} from './storage.config';
import { StorageService } from './storage.service';

/**
 * Background uploads, the storage half (docs/BACKGROUND_UPLOADS.md): minting a
 * batch the phone can send with no further call, and finishing a file from what
 * B2 holds. The real StorageService and presigner; only B2's calls are faked.
 */
const ME = 'user-1';
const THEM = 'user-2';
const ALBUM = 'album-1';
const MB = 1024 * 1024;

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
    recordFile: jest.fn(async () => true),
  };
  const feed = { recordInAlbum: jest.fn(async () => undefined) };
  const storage = new StorageService(
    config,
    quota as unknown as QuotaService,
    {} as unknown as MediaLinkService,
    feed as unknown as WorkspaceActivityService,
  );
  return { storage, quota, feed };
}

const notFound = () =>
  Object.assign(new Error('NotFound'), { $metadata: { httpStatusCode: 404 } });

describe('background-upload handoffs', () => {
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

  describe('createHandoffs', () => {
    it('signs a small file as one PUT and a large one in parts, every URL for a day', async () => {
      respond = (c) => (c instanceof CreateMultipartUploadCommand ? { UploadId: 'up-1' } : {});
      const { storage } = setup();

      const [photo, film] = await storage.createHandoffs(ME, ALBUM, [
        { contentType: 'image/jpeg', contentLength: 4 * MB, originalName: 'IMG_1.JPG' },
        { contentType: 'video/quicktime', contentLength: 300 * MB + 5 },
      ]);

      expect(photo.single?.uploadUrl).toContain(`X-Amz-Expires=${HANDOFF_URL_TTL_SECONDS}`);
      expect(photo.single?.requiredHeaders).toEqual({
        'Content-Type': 'image/jpeg',
        'Content-Length': String(4 * MB),
      });
      expect(photo.multipart).toBeUndefined();
      expect(photo.key).toMatch(new RegExp(`^users/${ME}/albums/`));

      expect(film.single).toBeUndefined();
      expect(film.multipart?.uploadId).toBe('up-1');
      expect(film.multipart?.partCount).toBe(19);
      expect(film.multipart?.parts).toHaveLength(19);
      expect(film.multipart?.parts[0].uploadUrl).toContain('partNumber=1');
      expect(film.multipart?.parts[0].uploadUrl).toContain(`X-Amz-Expires=${HANDOFF_URL_TTL_SECONDS}`);
      expect(film.multipart?.parts[18].requiredHeaders['Content-Length']).toBe(
        String(300 * MB + 5 - 18 * MULTIPART_PART_BYTES),
      );
      // One B2 call: opening the film. Everything else is signing.
      expect(sent).toHaveLength(1);
    });

    it('checks the album and the whole batch against storage, once', async () => {
      const { storage, quota } = setup();
      quota.accessForAlbum.mockResolvedValue('upload' as never);
      quota.albumOwner.mockResolvedValue(THEM as never);

      await storage.createHandoffs(ME, ALBUM, [
        { contentType: 'image/jpeg', contentLength: 4 * MB },
        { contentType: 'image/heic', contentLength: 6 * MB },
      ]);

      expect(quota.assertCanStore).toHaveBeenCalledTimes(1);
      expect(quota.assertCanStore).toHaveBeenCalledWith(THEM, 10 * MB, 'album-owner');
    });

    it('refuses the whole batch for one bad file, before anything is opened', async () => {
      const { storage, quota } = setup();
      await expect(
        storage.createHandoffs(ME, ALBUM, [
          { contentType: 'image/jpeg', contentLength: 4 * MB },
          { contentType: 'text/html', contentLength: 1 },
        ]),
      ).rejects.toThrow('Unsupported content type');
      await expect(
        storage.createHandoffs(ME, ALBUM, [
          { contentType: 'video/mp4', contentLength: MULTIPART_MAX_BYTES + 1 },
        ]),
      ).rejects.toThrow('too large');
      expect(sent).toHaveLength(0);
      expect(quota.assertCanStore).not.toHaveBeenCalled();
    });

    it('refuses without upload access to the album', async () => {
      const { storage, quota } = setup();
      quota.accessForAlbum.mockResolvedValue('view' as never);
      await expect(
        storage.createHandoffs(ME, ALBUM, [{ contentType: 'image/jpeg', contentLength: 4 * MB }]),
      ).rejects.toThrow('You cannot add media to that album');
      expect(sent).toHaveLength(0);
    });

    it('releases the uploads it opened when a later file cannot be opened', async () => {
      let opened = 0;
      respond = (c) => {
        if (c instanceof CreateMultipartUploadCommand) {
          opened++;
          return opened === 1 ? { UploadId: 'up-1' } : {};
        }
        return {};
      };
      const { storage } = setup();

      await expect(
        storage.createHandoffs(ME, ALBUM, [
          { contentType: 'video/mp4', contentLength: 200 * MB },
          { contentType: 'video/mp4', contentLength: 200 * MB },
        ]),
      ).rejects.toThrow('Could not reach storage');

      const aborts = sent.filter((c) => c instanceof AbortMultipartUploadCommand);
      expect(aborts).toHaveLength(1);
      expect((aborts[0] as AbortMultipartUploadCommand).input.UploadId).toBe('up-1');
    });
  });

  describe('finishHandoff', () => {
    const key = `users/${ME}/albums/2026/11/abc.jpg`;
    const single = {
      key,
      userId: ME,
      albumId: ALBUM,
      originalName: 'IMG_1.JPG',
      lastModified: null,
      uploadId: null,
      partCount: null,
    };

    it('waits while a single PUT has not landed', async () => {
      respond = (c) => {
        if (c instanceof HeadObjectCommand) throw notFound();
        return {};
      };
      const { storage, quota } = setup();
      await expect(storage.finishHandoff(single)).resolves.toEqual({ state: 'waiting' });
      expect(quota.recordFile).not.toHaveBeenCalled();
    });

    it('files a single PUT that landed in its album, with its name', async () => {
      respond = (c) =>
        c instanceof HeadObjectCommand ? { ContentLength: 4 * MB, ContentType: 'image/jpeg' } : {};
      const { storage, quota, feed } = setup();

      await expect(storage.finishHandoff(single)).resolves.toEqual({
        state: 'filed',
        size: 4 * MB,
        contentType: 'image/jpeg',
      });
      expect(quota.recordFile).toHaveBeenCalledWith(
        ME,
        expect.objectContaining({ key, sizeBytes: 4 * MB, albumId: ALBUM, originalName: 'IMG_1.JPG' }),
      );
      expect(feed.recordInAlbum).toHaveBeenCalledWith(ALBUM, ME, 'upload');
    });

    const film = { ...single, key: `users/${ME}/albums/2026/11/abc.mov`, uploadId: 'up-1', partCount: 3 };

    it('waits while parts are still missing, and assembles nothing', async () => {
      respond = (c) =>
        c instanceof ListPartsCommand
          ? { Parts: [{ PartNumber: 1, ETag: '"a"' }, { PartNumber: 3, ETag: '"c"' }] }
          : {};
      const { storage } = setup();
      await expect(storage.finishHandoff(film)).resolves.toEqual({ state: 'waiting' });
      expect(sent.some((c) => c instanceof CompleteMultipartUploadCommand)).toBe(false);
    });

    it('assembles a complete film from its parts, in order, checks it, and files it', async () => {
      respond = (c) => {
        if (c instanceof ListPartsCommand) {
          return {
            Parts: [
              { PartNumber: 3, ETag: '"c"' },
              { PartNumber: 1, ETag: '"a"' },
              { PartNumber: 2, ETag: '"b"' },
            ],
          };
        }
        if (c instanceof HeadObjectCommand) return { ContentLength: 40 * MB, ContentType: 'video/quicktime' };
        return {};
      };
      const { storage, quota } = setup();

      await expect(storage.finishHandoff(film)).resolves.toEqual({
        state: 'filed',
        size: 40 * MB,
        contentType: 'video/quicktime',
      });
      const complete = sent.find(
        (c) => c instanceof CompleteMultipartUploadCommand,
      ) as CompleteMultipartUploadCommand;
      expect(complete.input.UploadId).toBe('up-1');
      expect(complete.input.MultipartUpload?.Parts?.map((p) => p.ETag)).toEqual(['"a"', '"b"', '"c"']);
      expect(quota.assertCanStore).toHaveBeenCalledWith(ME, 40 * MB, 'yours');
      expect(quota.recordFile).toHaveBeenCalled();
    });

    it('reads every page of parts', async () => {
      respond = (c) => {
        if (c instanceof ListPartsCommand) {
          return c.input.PartNumberMarker
            ? { Parts: [{ PartNumber: 3, ETag: '"c"' }] }
            : {
                Parts: [
                  { PartNumber: 1, ETag: '"a"' },
                  { PartNumber: 2, ETag: '"b"' },
                ],
                IsTruncated: true,
                NextPartNumberMarker: 2,
              };
        }
        if (c instanceof HeadObjectCommand) return { ContentLength: 40 * MB };
        return {};
      };
      const { storage } = setup();
      await expect(storage.finishHandoff(film)).resolves.toMatchObject({ state: 'filed' });
    });

    it('finds a film already assembled elsewhere by its object', async () => {
      respond = (c) => {
        if (c instanceof ListPartsCommand) throw notFound();
        if (c instanceof HeadObjectCommand) return { ContentLength: 40 * MB };
        return {};
      };
      const { storage } = setup();
      await expect(storage.finishHandoff(film)).resolves.toMatchObject({ state: 'filed' });
    });

    it('calls a film gone when its parts were released and nothing landed', async () => {
      respond = (c) => {
        if (c instanceof ListPartsCommand || c instanceof HeadObjectCommand) throw notFound();
        return {};
      };
      const { storage } = setup();
      await expect(storage.finishHandoff(film)).resolves.toEqual({ state: 'gone' });
    });

    it('deletes an assembled film the storage it is billed to has no room for', async () => {
      respond = (c) => {
        if (c instanceof ListPartsCommand) {
          return {
            Parts: [
              { PartNumber: 1, ETag: '"a"' },
              { PartNumber: 2, ETag: '"b"' },
              { PartNumber: 3, ETag: '"c"' },
            ],
          };
        }
        if (c instanceof HeadObjectCommand) return { ContentLength: 40 * MB };
        if (c instanceof DeleteObjectsCommand) return { Deleted: [{ Key: film.key }] };
        return {};
      };
      const { storage, quota } = setup();
      quota.assertCanStore.mockRejectedValueOnce(new Error('Storage full'));

      await expect(storage.finishHandoff(film)).rejects.toThrow('Storage full');
      expect(sent.some((c) => c instanceof DeleteObjectsCommand)).toBe(true);
      expect(quota.recordFile).not.toHaveBeenCalled();
    });
  });
});
