import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, DeleteObjectsCommand, S3Client } from '@aws-sdk/client-s3';
import { StorageConfig } from './storage.config';
import { StorageService } from './storage.service';
import type { MediaLinkService } from './media-link.service';
import type { QuotaService } from '../quota/quota.service';
import type { WorkspaceActivityService } from '../workspaces/workspace-activity.service';

const OWNER = '11111111-1111-4111-8111-111111111111';

function storageConfig(): StorageConfig {
  const values: Record<string, string> = {
    B2_BUCKET_NAME: 'virgo-public',
    B2_MEDIA_BUCKET_NAME: 'virgo-media',
    B2_ENDPOINT: 's3.us-west-004.backblazeb2.com',
    B2_REGION: 'us-west-004',
    B2_KEY_ID: 'test-key-id',
    B2_APPLICATION_KEY: 'test-application-key',
    CDN_BASE_URL: 'https://cdn.example.test',
  };
  return new StorageConfig({
    get: (key: string, fallback?: string) => values[key] ?? fallback,
  } as unknown as ConfigService);
}

/** A store that answers DeleteObjects the way `bulk` says, and single deletes always. */
function world(bulk: 'refuse' | 'partly' | 'works', files = 3) {
  const keys = Array.from(
    { length: files },
    (_, n) => `users/${OWNER}/albums/2026/10/${String.fromCharCode(97 + (n % 26))}${n}.jpg`,
  );
  const rows = new Map(keys.map((key) => [key, { key, user_id: OWNER, album_id: 'album-1' }]));
  const calls = { bulk: 0, single: [] as string[] };

  jest.spyOn(S3Client.prototype, 'send').mockImplementation(async (command: unknown) => {
    if (command instanceof DeleteObjectsCommand) {
      calls.bulk += 1;
      const asked = (command.input.Delete?.Objects ?? []).map((o) => o.Key ?? '');
      if (bulk === 'refuse') {
        // What a store that wants Content-MD5 on DeleteObjects answers.
        throw Object.assign(new Error('Missing required header for this request: Content-MD5'), {
          name: 'InvalidRequest',
          $metadata: { httpStatusCode: 400 },
        });
      }
      if (bulk === 'partly') {
        return {
          Deleted: asked.slice(1).map((Key) => ({ Key })),
          Errors: [{ Key: asked[0], Code: 'InternalError' }],
        };
      }
      return { Deleted: asked.map((Key) => ({ Key })) };
    }
    if (command instanceof DeleteObjectCommand) {
      calls.single.push(command.input.Key ?? '');
      return {};
    }
    throw new Error('Only deletes are expected here');
  });

  const quota = {
    fileOwnership: jest.fn(async (asked: readonly string[]) =>
      asked.flatMap((key) => (rows.has(key) ? [rows.get(key)!] : [])),
    ),
    objectAndDerivedKeys: jest.fn(async (asked: readonly string[]) => [...asked]),
    accessForAlbum: jest.fn(async () => 'owner'),
    accessForKey: jest.fn(async () => 'owner'),
    forgetKeys: jest.fn(async (gone: readonly string[]) => {
      for (const key of gone) rows.delete(key);
      return gone.length;
    }),
    forgetFile: jest.fn(async (_userId: string, key: string) => {
      rows.delete(key);
    }),
  };
  const storage = new StorageService(
    storageConfig(),
    quota as unknown as QuotaService,
    { removeFor: jest.fn(async () => undefined) } as unknown as MediaLinkService,
    {} as unknown as WorkspaceActivityService,
  );
  return { storage, keys, rows, calls, quota };
}

afterEach(() => jest.restoreAllMocks());

describe('deleting when DeleteObjects is refused', () => {
  it('deletes a selection one object at a time, and forgets only what went', async () => {
    const { storage, keys, rows, calls } = world('refuse');
    const result = await storage.deleteMany(OWNER, keys);
    expect(result).toEqual({ deleted: 3, failed: 0 });
    expect(calls.single.sort()).toEqual([...keys].sort());
    expect(rows.size).toBe(0);
  });

  it('stops asking DeleteObjects once it has been refused', async () => {
    const { storage, keys, calls } = world('refuse');
    await storage.deleteMany(OWNER, keys.slice(0, 1));
    await storage.deleteMany(OWNER, keys.slice(1));
    expect(calls.bulk).toBe(1);
    expect(calls.single).toHaveLength(3);
  });

  it('deletes a single file too, which went through DeleteObjects as well', async () => {
    const { storage, keys, rows, calls } = world('refuse');
    await expect(storage.deleteObject(OWNER, keys[0])).resolves.toBeUndefined();
    expect(calls.single).toEqual([keys[0]]);
    expect(rows.has(keys[0])).toBe(false);
  });

  it('retries on its own only what DeleteObjects did not confirm', async () => {
    const { storage, keys, calls } = world('partly');
    const result = await storage.deleteMany(OWNER, keys);
    expect(result).toEqual({ deleted: 3, failed: 0 });
    expect(calls.single).toEqual([keys[0]]);
  });

  it('forgets a long selection a step at a time, so an early answer is not all or nothing', async () => {
    const { storage, keys, rows, quota } = world('refuse', 250);
    const result = await storage.deleteMany(OWNER, keys);
    expect(result).toEqual({ deleted: 250, failed: 0 });
    expect(rows.size).toBe(0);
    // 100, 100 and 50: each step's rows go as soon as its objects have.
    expect(quota.forgetKeys.mock.calls.map(([gone]) => gone.length)).toEqual([100, 100, 50]);
  });

  it('asks nothing more when DeleteObjects works', async () => {
    const { storage, keys, calls } = world('works');
    expect(await storage.deleteMany(OWNER, keys)).toEqual({ deleted: 3, failed: 0 });
    expect(calls.single).toEqual([]);
  });
});
