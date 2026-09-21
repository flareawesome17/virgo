import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { DeleteObjectsCommand, S3Client } from '@aws-sdk/client-s3';
import type { DatabaseService } from '../database/database.service';
import type { NotifyService } from '../notifications/notify.service';
import type { QuotaService, ResolvedAccess } from '../quota/quota.service';
import type { MediaLinkService } from '../storage/media-link.service';
import { StorageConfig } from '../storage/storage.config';
import { StorageService } from '../storage/storage.service';
import { AlbumRetentionService } from './album-retention.service';

/**
 * The sweep end to end, with the real StorageService underneath and only the
 * edges faked: the database, the bucket and the notifier.
 *
 * Deliberately not a mocked StorageService. The bug this guards against lived
 * in how the two fit together — the sweep handed the owner's id to a delete
 * that checked every key's prefix against it, and a collaborator's upload
 * keeps the collaborator's prefix.
 */

interface Album {
  id: string;
  name: string;
  ownerId: string;
}

/** A `user_files` row, as much of one as deleting it reads. */
interface FileRow {
  key: string;
  /** Who the storage is billed to: the album's owner, whoever uploaded it. */
  userId: string;
  albumId: string;
  thumbKey: string;
}

const OWNER = 'owner-1';
const SECOND_SHOOTER = 'collab-2';
const WEDDING: Album = { id: 'album-1', name: 'Santos Wedding', ownerId: OWNER };

/** An upload into `album`, keyed under whoever uploaded it. */
function upload(uploader: string, name: string, album: Album): FileRow {
  const stem = `users/${uploader}/albums/2026/03/${name}`;
  return {
    key: `${stem}.jpg`,
    userId: album.ownerId,
    albumId: album.id,
    thumbKey: `${stem}-thumb.webp`,
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

function sweepOf(world: {
  /** Every album any file below is in. */
  albums: Album[];
  /** The whole of `user_files`. */
  files: FileRow[];
  /** What the sweep's query returns. Every file, in its own album, by default. */
  expiring?: { key: string; album: Album }[];
  /** Keys the bucket reports as errors instead of deleting. */
  refused?: string[];
}) {
  const rows = new Map(world.files.map((row) => [row.key, row]));
  const owners = new Map(world.albums.map((album) => [album.id, album.ownerId]));
  const expiring =
    world.expiring ??
    world.files.map((row) => ({
      key: row.key,
      album: world.albums.find((album) => album.id === row.albumId)!,
    }));

  const quota = {
    fileOwnership: jest.fn(async (keys: readonly string[]) =>
      keys.flatMap((key) => {
        const row = rows.get(key);
        return row ? [{ key, user_id: row.userId, album_id: row.albumId }] : [];
      }),
    ),
    // Owners only: nobody in these tests holds a grant on anyone else's album.
    accessForAlbum: jest.fn(
      async (userId: string, albumId: string): Promise<ResolvedAccess> =>
        owners.get(albumId) === userId ? 'owner' : null,
    ),
    objectAndDerivedKeys: jest.fn(async (keys: readonly string[]) =>
      keys.flatMap((key) => {
        const row = rows.get(key);
        return row ? [row.key, row.thumbKey] : [];
      }),
    ),
    forgetKeys: jest.fn(async (keys: readonly string[]) => {
      for (const key of keys) rows.delete(key);
      return keys.length;
    }),
  };

  const refused = new Set(world.refused ?? []);
  const askedToDelete: string[] = [];
  jest.spyOn(S3Client.prototype, 'send').mockImplementation(async (command: unknown) => {
    if (!(command instanceof DeleteObjectsCommand)) {
      throw new Error('The sweep should never ask the bucket for anything but a delete');
    }
    const keys = (command.input.Delete?.Objects ?? []).map((object) => object.Key ?? '');
    askedToDelete.push(...keys);
    return {
      Deleted: keys.filter((Key) => !refused.has(Key)).map((Key) => ({ Key })),
      Errors: keys
        .filter((Key) => refused.has(Key))
        .map((Key) => ({ Key, Code: 'AccessDenied' })),
    };
  });

  const mediaLink = { removeFor: jest.fn(async () => undefined) };
  const storage = new StorageService(
    storageConfig(),
    quota as unknown as QuotaService,
    mediaLink as unknown as MediaLinkService,
  );
  const db = {
    query: jest.fn(async () =>
      expiring.map(({ key, album }) => ({
        owner_id: album.ownerId,
        album_id: album.id,
        album_name: album.name,
        key,
      })),
    ),
  };
  const notifier = { notify: jest.fn(async () => undefined) };

  return {
    sweep: new AlbumRetentionService(
      db as unknown as DatabaseService,
      storage,
      notifier as unknown as NotifyService,
    ),
    askedToDelete,
    mediaLink,
    notifier,
    /** Rows still in `user_files`, and so still counted against a quota. */
    remaining: () => [...rows.keys()],
  };
}

describe('AlbumRetentionService.deleteExpired', () => {
  beforeEach(() => {
    // The failure paths below log on purpose.
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it("deletes a collaborator's upload along with the owner's own", async () => {
    // The second shooter's frame is in the owner's album and billed to the
    // owner, but its key keeps the second shooter's prefix. Checked against
    // the owner, that prefix was refused, and the throw ended the sweep.
    const own = upload(OWNER, 'ceremony', WEDDING);
    const theirs = upload(SECOND_SHOOTER, 'reception', WEDDING);
    const world = sweepOf({ albums: [WEDDING], files: [own, theirs] });

    await expect(world.sweep.deleteExpired()).resolves.toEqual({
      albums: 1,
      deleted: 2,
      failed: 0,
    });

    expect(world.askedToDelete).toEqual(
      expect.arrayContaining([own.key, own.thumbKey, theirs.key, theirs.thumbKey]),
    );
    expect(world.remaining()).toEqual([]);
    expect(world.mediaLink.removeFor).toHaveBeenCalledWith(
      expect.arrayContaining([own.key, theirs.key]),
    );
    expect(world.notifier.notify).toHaveBeenCalledWith(
      [OWNER],
      expect.objectContaining({
        body: '2 files removed from “Santos Wedding” as scheduled.',
      }),
    );
  });

  it("still refuses a file that is not in the owner's album, and sweeps the rest", async () => {
    // The query's join is what says a file sits in an album its owner put a
    // retention window on. The delete asks again, from the file's own row, so
    // that a wrong answer there ends in a refusal rather than in deleting
    // somebody else's work — and that refusal must not stop the next album.
    const stranger: Album = { id: 'album-9', name: 'Not Theirs', ownerId: 'stranger-9' };
    const debut: Album = { id: 'album-2', name: 'Reyes Debut', ownerId: 'owner-2' };
    const foreign = upload('stranger-9', 'private', stranger);
    const due = upload('owner-2', 'cotillion', debut);
    const world = sweepOf({
      albums: [WEDDING, debut, stranger],
      files: [foreign, due],
      // Listed first, so an unguarded failure would have ended the sweep
      // before it reached the debut.
      expiring: [
        { key: foreign.key, album: WEDDING },
        { key: due.key, album: debut },
      ],
    });

    await expect(world.sweep.deleteExpired()).resolves.toEqual({
      albums: 2,
      deleted: 1,
      failed: 1,
    });

    expect(world.askedToDelete).not.toContain(foreign.key);
    expect(world.remaining()).toEqual([foreign.key]);
    expect(world.notifier.notify).toHaveBeenCalledTimes(1);
    expect(world.notifier.notify).toHaveBeenCalledWith(
      ['owner-2'],
      expect.objectContaining({
        body: '1 file removed from “Reyes Debut” as scheduled.',
      }),
    );
  });

  it('receipts what the bucket confirmed gone, not what was due', async () => {
    const stuck = upload(OWNER, 'ceremony', WEDDING);
    const cleared = upload(SECOND_SHOOTER, 'reception', WEDDING);
    const world = sweepOf({
      albums: [WEDDING],
      files: [stuck, cleared],
      refused: [stuck.key],
    });

    await expect(world.sweep.deleteExpired()).resolves.toEqual({
      albums: 1,
      deleted: 1,
      failed: 1,
    });

    // Still in the bucket, so still counted, and tomorrow's sweep tries again.
    expect(world.remaining()).toEqual([stuck.key]);
    expect(world.notifier.notify).toHaveBeenCalledWith(
      [OWNER],
      expect.objectContaining({
        body: '1 file removed from “Santos Wedding” as scheduled.',
      }),
    );
  });
});
