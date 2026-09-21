import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { DeleteObjectsCommand, S3Client } from '@aws-sdk/client-s3';
import type { QuotaService } from '../quota/quota.service';
import type { MediaLinkService } from './media-link.service';
import { StorageConfig } from './storage.config';
import { StorageService } from './storage.service';

/**
 * The wipe end to end, with the real StorageService and only the edges faked:
 * `user_files`, the bucket and the media volume.
 *
 * Deliberately not a mocked StorageService. The bug this guards against lived
 * in how the parts fit together: the wipe takes its keys from rows billed to
 * the user, a collaborator's upload into their album is one of those rows
 * while keeping the collaborator's prefix, and a prefix check refused it —
 * between batches, after earlier ones were already gone from the bucket and
 * before a single row had been forgotten.
 */

/** The account being wiped. */
const PHOTOGRAPHER = 'photographer-1';
/** Shoots second in the photographer's albums, uploading under their own prefix. */
const SECOND_SHOOTER = 'second-shooter-2';
/** Another account, whose album the photographer has uploaded into. */
const STUDIO = 'studio-3';

/** A `user_files` row, as much of one as a wipe reads. */
interface FileRow {
  key: string;
  /** Who the storage is billed to: the album's owner, whoever uploaded it. */
  userId: string;
  thumbKey: string | null;
  sizeBytes: number;
}

/** An upload keyed under `uploader`'s prefix and billed to `billedTo`. */
function upload(uploader: string, name: string, billedTo = uploader): FileRow {
  const stem = `users/${uploader}/albums/2026/03/${name}`;
  return {
    key: `${stem}.jpg`,
    userId: billedTo,
    thumbKey: `${stem}-thumb.webp`,
    sizeBytes: 1_000,
  };
}

function storageConfig(): StorageConfig {
  const values: Record<string, string> = {
    B2_BUCKET_NAME: 'virgo-public',
    B2_MEDIA_BUCKET_NAME: 'virgo-media',
    B2_ENDPOINT: 's3.us-west-004.backblazeb2.com',
    B2_REGION: 'us-west-004',
    B2_KEY_ID: 'test-key-id',
    B2_APPLICATION_KEY: 'test-application-key',
  };
  return new StorageConfig({
    get: (key: string, fallback?: string) => values[key] ?? fallback,
  } as unknown as ConfigService);
}

function wipeOf(world: {
  /** The whole of `user_files`. */
  files: FileRow[];
  /** Keys the bucket reports as errors instead of deleting. */
  refused?: string[];
}) {
  const rows = new Map(world.files.map((row) => [row.key, row]));
  const billedTo = (userId: string) =>
    [...rows.values()].filter((row) => row.userId === userId);

  const quota = {
    allFiles: jest.fn(async (userId: string) =>
      billedTo(userId).map((row) => ({
        key: row.key,
        thumb_key: row.thumbKey,
        poster_key: null,
      })),
    ),
    storageUsed: jest.fn(async (userId: string) =>
      billedTo(userId).reduce((sum, row) => sum + row.sizeBytes, 0),
    ),
    hasUploadsBilledToOthers: jest.fn(async (userId: string) =>
      [...rows.values()].some(
        (row) => row.userId !== userId && row.key.startsWith(`users/${userId}/`),
      ),
    ),
    forgetFiles: jest.fn(async (userId: string, keys: string[]) => {
      let forgotten = 0;
      for (const key of keys) {
        if (rows.get(key)?.userId === userId && rows.delete(key)) forgotten += 1;
      }
      return forgotten;
    }),
  };

  const refused = new Set(world.refused ?? []);
  /** Every DeleteObjects call, in order. */
  const batches: string[][] = [];
  jest.spyOn(S3Client.prototype, 'send').mockImplementation(async (command: unknown) => {
    if (!(command instanceof DeleteObjectsCommand)) {
      throw new Error('A wipe should never ask the bucket for anything but a delete');
    }
    const keys = (command.input.Delete?.Objects ?? []).map((object) => object.Key ?? '');
    batches.push(keys);
    return {
      Deleted: keys.filter((Key) => !refused.has(Key)).map((Key) => ({ Key })),
      Errors: keys
        .filter((Key) => refused.has(Key))
        .map((Key) => ({ Key, Code: 'AccessDenied' })),
    };
  });

  const mediaLink = {
    removeFor: jest.fn(async () => undefined),
    removeTree: jest.fn(async () => undefined),
  };

  return {
    storage: new StorageService(
      storageConfig(),
      quota as unknown as QuotaService,
      mediaLink as unknown as MediaLinkService,
    ),
    batches,
    askedToDelete: () => batches.flat(),
    mediaLink,
    /** Rows still in `user_files`, and so still listed and still counted. */
    remaining: () => [...rows.keys()],
  };
}

describe('StorageService.wipeAll', () => {
  beforeEach(() => {
    // The failure paths below log on purpose.
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it("deletes a collaborator's upload into the user's album along with their own", async () => {
    // Billed to the photographer and in their album, so the wipe's to delete,
    // but keyed under the second shooter's prefix. Checked against the
    // photographer, that prefix made wiping their own library a 403.
    const own = upload(PHOTOGRAPHER, 'ceremony');
    const theirs = upload(SECOND_SHOOTER, 'reception', PHOTOGRAPHER);
    const world = wipeOf({ files: [own, theirs] });

    await expect(world.storage.wipeAll(PHOTOGRAPHER)).resolves.toEqual({
      deleted: 4,
      failed: 0,
      freedBytes: 2_000,
    });

    expect(world.askedToDelete()).toEqual(
      expect.arrayContaining([own.key, own.thumbKey, theirs.key, theirs.thumbKey]),
    );
    expect(world.remaining()).toEqual([]);
    // The photographer's rendition tree goes whole. The second shooter's
    // renditions sit under their own prefix, out of its reach, so they go by
    // name.
    expect(world.mediaLink.removeTree).toHaveBeenCalledWith(`users/${PHOTOGRAPHER}`);
    expect(world.mediaLink.removeFor).toHaveBeenCalledWith([theirs.key]);
  });

  it('leaves no row behind when the collaborator key is past the first batch', async () => {
    // The failure as it happened. 2,002 objects is three DeleteObjects calls,
    // and the second shooter's frame falls in the last. The check threw
    // there: the first two calls had already emptied the bucket of every one
    // of the photographer's own frames, and no row had been forgotten — a
    // thousand listed files that 404, all still counted against the quota.
    const own = Array.from({ length: 1_000 }, (_, i) =>
      upload(PHOTOGRAPHER, `frame-${i}`),
    );
    const theirs = upload(SECOND_SHOOTER, 'reception', PHOTOGRAPHER);
    const world = wipeOf({ files: [...own, theirs] });

    await expect(world.storage.wipeAll(PHOTOGRAPHER)).resolves.toEqual({
      deleted: 2_002,
      failed: 0,
      freedBytes: 1_001_000,
    });

    expect(world.batches.map((batch) => batch.length)).toEqual([1_000, 1_000, 2]);
    expect(world.batches[2]).toEqual([theirs.key, theirs.thumbKey]);
    expect(world.remaining()).toEqual([]);
  });

  it('counts a malformed key as failed and wipes everything else', async () => {
    // Listed first, so a check that threw would have ended the wipe before
    // anything else was reached.
    const malformed: FileRow = {
      key: `users/${SECOND_SHOOTER}/../${STUDIO}/albums/2026/03/private.jpg`,
      userId: PHOTOGRAPHER,
      thumbKey: null,
      sizeBytes: 1_000,
    };
    const own = upload(PHOTOGRAPHER, 'ceremony');
    const world = wipeOf({ files: [malformed, own] });

    await expect(world.storage.wipeAll(PHOTOGRAPHER)).resolves.toEqual({
      deleted: 2,
      failed: 1,
      freedBytes: 1_000,
    });

    // Sent neither to the bucket nor to the media volume, so its row stays.
    // Counting it as a failure is what stops account deletion from cascading
    // that row away while whatever it names is still in the bucket.
    expect(world.askedToDelete()).not.toContain(malformed.key);
    expect(world.mediaLink.removeFor).not.toHaveBeenCalledWith(
      expect.arrayContaining([malformed.key]),
    );
    expect(world.remaining()).toEqual([malformed.key]);
  });

  it('forgets only what the bucket confirmed deleted', async () => {
    const stuck = upload(SECOND_SHOOTER, 'reception', PHOTOGRAPHER);
    const cleared = upload(PHOTOGRAPHER, 'ceremony');
    const world = wipeOf({ files: [stuck, cleared], refused: [stuck.key] });

    await expect(world.storage.wipeAll(PHOTOGRAPHER)).resolves.toEqual({
      deleted: 3,
      failed: 1,
      freedBytes: 1_000,
    });

    // Still in the bucket, so still counted, and the next wipe tries again.
    expect(world.remaining()).toEqual([stuck.key]);
  });

  it("keeps the renditions of the user's uploads into someone else's album", async () => {
    // The photographer shot second for a studio. Those frames carry the
    // photographer's prefix but are billed to the studio, so they outlive
    // this wipe, and their renditions share the tree it used to take whole.
    const own = upload(PHOTOGRAPHER, 'ceremony');
    const theirs = upload(SECOND_SHOOTER, 'reception', PHOTOGRAPHER);
    const lent = upload(PHOTOGRAPHER, 'portrait', STUDIO);
    const world = wipeOf({ files: [own, theirs, lent] });

    await expect(world.storage.wipeAll(PHOTOGRAPHER)).resolves.toEqual({
      deleted: 4,
      failed: 0,
      freedBytes: 2_000,
    });

    expect(world.askedToDelete()).not.toContain(lent.key);
    expect(world.remaining()).toEqual([lent.key]);
    // File by file instead, for exactly what was wiped.
    expect(world.mediaLink.removeTree).not.toHaveBeenCalled();
    expect(world.mediaLink.removeFor).toHaveBeenCalledTimes(1);
    expect(world.mediaLink.removeFor).toHaveBeenCalledWith([own.key, theirs.key]);
  });
});
