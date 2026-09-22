import { Logger, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { DeleteObjectsCommand, S3Client } from '@aws-sdk/client-s3';
import * as bcrypt from 'bcryptjs';
import { AccountService } from '../auth/account.service';
import type { UsersRepository } from '../auth/users.repository';
import type { MailConfig } from '../mail/mail.config';
import type { MailService } from '../mail/mail.service';
import type { QuotaService } from '../quota/quota.service';
import type { MediaLinkService } from './media-link.service';
import { StorageConfig } from './storage.config';
import type { WorkspaceActivityService } from '../workspaces/workspace-activity.service';
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

const CDN = 'https://cdn.virgo.test';

function storageConfig(): StorageConfig {
  const values: Record<string, string> = {
    B2_BUCKET_NAME: 'virgo-public',
    B2_MEDIA_BUCKET_NAME: 'virgo-media',
    B2_ENDPOINT: 's3.us-west-004.backblazeb2.com',
    B2_REGION: 'us-west-004',
    B2_KEY_ID: 'test-key-id',
    B2_APPLICATION_KEY: 'test-application-key',
    CDN_BASE_URL: CDN,
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
  /** What `users.cover_url` holds for the account being wiped. */
  coverUrl?: string | null;
  /** A cover another request saves while the bucket is still deleting. */
  savedDuringWipe?: string;
}) {
  const rows = new Map(world.files.map((row) => [row.key, row]));
  const billedTo = (userId: string) =>
    [...rows.values()].filter((row) => row.userId === userId);
  let coverUrl = world.coverUrl ?? null;

  const quota = {
    coverUrl: jest.fn(async () => coverUrl),
    // Compare-and-set, as the SQL is: only while it still names that URL.
    forgetCover: jest.fn(async (_userId: string, url: string) => {
      if (coverUrl === url) coverUrl = null;
    }),
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
  /** Which bucket each key's delete was sent to. */
  const bucketOf = new Map<string, string>();
  jest.spyOn(S3Client.prototype, 'send').mockImplementation(async (command: unknown) => {
    if (!(command instanceof DeleteObjectsCommand)) {
      throw new Error('A wipe should never ask the bucket for anything but a delete');
    }
    const keys = (command.input.Delete?.Objects ?? []).map((object) => object.Key ?? '');
    batches.push(keys);
    for (const key of keys) bucketOf.set(key, command.input.Bucket ?? '');
    if (world.savedDuringWipe) coverUrl = world.savedDuringWipe;
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
      { recordInAlbum: async () => undefined } as unknown as WorkspaceActivityService,
    ),
    batches,
    askedToDelete: () => batches.flat(),
    bucketOf,
    mediaLink,
    quota,
    /** Rows still in `user_files`, and so still listed and still counted. */
    remaining: () => [...rows.keys()],
    /** What `users.cover_url` holds now. */
    coverUrl: () => coverUrl,
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

  describe('and the profile cover', () => {
    const COVER = `users/${PHOTOGRAPHER}/covers/2026/09/11111111-1111-4111-8111-111111111111.webp`;

    it('deletes the cover the profile names when no row tracks it any more', async () => {
      // The rollback orphan: an API image from before covers deleted the row
      // through the file list, sent the object's delete to the private
      // bucket, and left it public. Only users.cover_url still names it.
      const own = upload(PHOTOGRAPHER, 'ceremony');
      const world = wipeOf({ files: [own], coverUrl: `${CDN}/${COVER}` });

      await expect(world.storage.wipeAll(PHOTOGRAPHER)).resolves.toEqual({
        deleted: 3,
        failed: 0,
        freedBytes: 1_000,
      });

      expect(world.askedToDelete()).toContain(COVER);
      expect(world.bucketOf.get(COVER)).toBe('virgo-public');
      // Gone from the bucket, so gone from the profile.
      expect(world.coverUrl()).toBeNull();
      expect(world.quota.forgetCover).toHaveBeenCalledWith(PHOTOGRAPHER, `${CDN}/${COVER}`);
    });

    it('deletes it when it is all the account has left', async () => {
      const world = wipeOf({ files: [], coverUrl: `${CDN}/${COVER}` });

      await expect(world.storage.wipeAll(PHOTOGRAPHER)).resolves.toEqual({
        deleted: 1,
        failed: 0,
        freedBytes: 0,
      });
      expect(world.askedToDelete()).toEqual([COVER]);
      expect(world.coverUrl()).toBeNull();
    });

    it('asks once for a cover a row still tracks', async () => {
      const tracked: FileRow = { key: COVER, userId: PHOTOGRAPHER, thumbKey: null, sizeBytes: 90_000 };
      const world = wipeOf({ files: [tracked], coverUrl: `${CDN}/${COVER}` });

      await expect(world.storage.wipeAll(PHOTOGRAPHER)).resolves.toEqual({
        deleted: 1,
        failed: 0,
        freedBytes: 90_000,
      });
      expect(world.askedToDelete()).toEqual([COVER]);
      expect(world.remaining()).toEqual([]);
      expect(world.coverUrl()).toBeNull();
    });

    it('keeps the cover on the profile while the bucket refuses to delete it', async () => {
      // Taken off, it would be a public object nothing names. Kept, the next
      // wipe tries it again — and account deletion, which counts it failed,
      // stops rather than removing the one column that knows of it.
      const world = wipeOf({ files: [], coverUrl: `${CDN}/${COVER}`, refused: [COVER] });

      await expect(world.storage.wipeAll(PHOTOGRAPHER)).resolves.toEqual({
        deleted: 0,
        failed: 1,
        freedBytes: 0,
      });
      expect(world.coverUrl()).toBe(`${CDN}/${COVER}`);
      expect(world.quota.forgetCover).not.toHaveBeenCalled();
    });

    it('never deletes what a cover URL names outside the account’s own covers', async () => {
      // Nothing setCover could have stored. Nothing to delete either, and
      // the profile does not keep it.
      for (const url of [
        `${CDN}/users/${STUDIO}/covers/2026/09/theirs.webp`,
        `${CDN}/users/${PHOTOGRAPHER}/avatars/2026/09/face.webp`,
        `https://elsewhere.test/users/${PHOTOGRAPHER}/covers/2026/09/cover.webp`,
      ]) {
        const own = upload(PHOTOGRAPHER, 'ceremony');
        const withFiles = wipeOf({ files: [own], coverUrl: url });
        await withFiles.storage.wipeAll(PHOTOGRAPHER);
        expect(withFiles.askedToDelete()).toEqual([own.key, own.thumbKey]);
        expect(withFiles.coverUrl()).toBeNull();

        const alone = wipeOf({ files: [], coverUrl: url });
        await expect(alone.storage.wipeAll(PHOTOGRAPHER)).resolves.toEqual({
          deleted: 0,
          failed: 0,
          freedBytes: 0,
        });
        expect(alone.askedToDelete()).toEqual([]);
        expect(alone.coverUrl()).toBeNull();
      }
    });

    it('does not clear a cover saved while the wipe was running', async () => {
      // A save lands between the wipe reading the cover and the bucket
      // answering. The wipe clears only the URL it started from.
      const newer = `${CDN}/users/${PHOTOGRAPHER}/covers/2026/09/22222222-2222-4222-8222-222222222222.webp`;
      const world = wipeOf({
        files: [],
        coverUrl: `${CDN}/${COVER}`,
        savedDuringWipe: newer,
      });

      await world.storage.wipeAll(PHOTOGRAPHER);

      expect(world.askedToDelete()).toEqual([COVER]);
      expect(world.quota.forgetCover).toHaveBeenCalledWith(PHOTOGRAPHER, `${CDN}/${COVER}`);
      expect(world.coverUrl()).toBe(newer);
    });
  });
});

/**
 * Account deletion runs the same wipe, and stops on the same failures: the
 * profile cover included, whether or not a row still tracks it.
 */
describe('AccountService.remove and the profile cover', () => {
  const COVER = `users/${PHOTOGRAPHER}/covers/2026/09/11111111-1111-4111-8111-111111111111.webp`;
  const PASSWORD = 'correct horse';

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  function accountOver(world: Parameters<typeof wipeOf>[0]) {
    const wipe = wipeOf(world);
    const users = {
      findById: jest.fn(async () => ({
        id: PHOTOGRAPHER,
        email: 'ana@example.com',
        display_name: 'Ana',
        password_hash: bcrypt.hashSync(PASSWORD, 4),
      })),
      remove: jest.fn(async () => true),
    };
    const account = new AccountService(
      users as unknown as UsersRepository,
      wipe.storage,
      { send: jest.fn(async () => undefined) } as unknown as MailService,
      { appUrl: 'https://app.virgo.test' } as unknown as MailConfig,
    );
    return { account, users, wipe };
  }

  it('deletes an untracked cover along with everything else', async () => {
    const { account, users, wipe } = accountOver({
      files: [upload(PHOTOGRAPHER, 'ceremony')],
      coverUrl: `${CDN}/${COVER}`,
    });

    await expect(account.remove(PHOTOGRAPHER, PASSWORD)).resolves.toEqual({
      deleted: true,
      filesDeleted: 3,
    });
    expect(wipe.askedToDelete()).toContain(COVER);
    expect(users.remove).toHaveBeenCalledWith(PHOTOGRAPHER);
  });

  it('leaves the account in place when the cover would not delete', async () => {
    const { account, users } = accountOver({
      files: [],
      coverUrl: `${CDN}/${COVER}`,
      refused: [COVER],
    });

    await expect(account.remove(PHOTOGRAPHER, PASSWORD)).rejects.toThrow(
      'Your files could not be deleted, so the account was left untouched.',
    );
    expect(users.remove).not.toHaveBeenCalled();
  });
});

/**
 * What an upload ticket may be for.
 *
 * A profile photo lands in the public bucket and is re-encoded in place on
 * confirm, so its scope is held to what that re-encode can take — before any
 * bytes go up, and before anything is billed to an album.
 */
describe('StorageService.createUploadUrl', () => {
  const ME = 'user-1';

  function ticketsFor({ cdn = 'https://cdn.virgo.test' }: { cdn?: string } = {}) {
    const values: Record<string, string> = {
      B2_BUCKET_NAME: 'virgo-public',
      B2_MEDIA_BUCKET_NAME: 'virgo-media',
      B2_ENDPOINT: 's3.us-west-004.backblazeb2.com',
      B2_REGION: 'us-west-004',
      B2_KEY_ID: 'test-key-id',
      B2_APPLICATION_KEY: 'test-application-key',
      CDN_BASE_URL: cdn,
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

  /** The bucket a presigned PUT writes to, from its virtual-host URL. */
  const bucketOf = (uploadUrl: string) => new URL(uploadUrl).hostname.split('.')[0];

  const MB = 1024 * 1024;

  it.each(['video/mp4', 'image/gif', 'application/pdf', 'image/heic'])(
    'refuses a %s cover before signing anything',
    async (contentType) => {
      const { storage, quota } = ticketsFor();
      await expect(
        storage.createUploadUrl(ME, { contentType, scope: 'covers', contentLength: MB }),
      ).rejects.toThrow('A cover has to be a JPEG, PNG, WebP or AVIF photo.');
      expect(quota.assertCanStore).not.toHaveBeenCalled();
    },
  );

  it('refuses a cover over 15 MB', async () => {
    const { storage } = ticketsFor();
    await expect(
      storage.createUploadUrl(ME, {
        contentType: 'image/jpeg',
        scope: 'covers',
        contentLength: 16 * MB,
      }),
    ).rejects.toThrow('That photo is too large for a cover. Choose one under 15 MB.');
  });

  it('will not sign a cover without a CDN to serve it from', async () => {
    // Otherwise the bytes go up and only then does setCover find there is no
    // URL to store: a public object nothing can ever point at.
    const { storage, quota } = ticketsFor({ cdn: '' });
    await expect(
      storage.createUploadUrl(ME, { contentType: 'image/jpeg', scope: 'covers', contentLength: MB }),
    ).rejects.toEqual(new ServiceUnavailableException('Covers are not available right now.'));
    expect(quota.assertCanStore).not.toHaveBeenCalled();
  });

  it('signs a cover into the public bucket, billed to the caller whatever album it names', async () => {
    const { storage, quota } = ticketsFor();

    const ticket = await storage.createUploadUrl(ME, {
      contentType: 'image/jpeg',
      scope: 'covers',
      contentLength: 5 * MB,
      albumId: 'album-1',
    });

    expect(ticket.key).toMatch(new RegExp(`^users/${ME}/covers/\\d{4}/\\d{2}/[0-9a-f-]{36}\\.jpg$`));
    expect(bucketOf(ticket.uploadUrl)).toBe('virgo-public');
    expect(quota.accessForAlbum).not.toHaveBeenCalled();
    expect(quota.assertCanStore).toHaveBeenCalledWith(ME, 5 * MB);
  });

  it('holds an avatar to still images of at most 40 MB', async () => {
    const { storage } = ticketsFor();
    await expect(
      storage.createUploadUrl(ME, { contentType: 'video/mp4', scope: 'avatars', contentLength: MB }),
    ).rejects.toThrow('A profile photo has to be an image file.');
    await expect(
      storage.createUploadUrl(ME, {
        contentType: 'image/jpeg',
        scope: 'avatars',
        contentLength: 41 * MB,
      }),
    ).rejects.toThrow('That photo is too large for a profile photo. Choose one under 40 MB.');

    const ticket = await storage.createUploadUrl(ME, {
      contentType: 'image/heic',
      scope: 'avatars',
      contentLength: 3 * MB,
    });
    expect(bucketOf(ticket.uploadUrl)).toBe('virgo-public');
  });

  it('leaves album uploads as they were: private, and checked against the album', async () => {
    const { storage, quota } = ticketsFor();

    const ticket = await storage.createUploadUrl(ME, {
      contentType: 'video/mp4',
      scope: 'albums',
      contentLength: 400 * MB,
      albumId: 'album-1',
    });

    expect(bucketOf(ticket.uploadUrl)).toBe('virgo-media');
    expect(quota.accessForAlbum).toHaveBeenCalledWith(ME, 'album-1');
    expect(quota.assertCanStore).toHaveBeenCalledWith(ME, 400 * MB, 'yours');
  });
});
