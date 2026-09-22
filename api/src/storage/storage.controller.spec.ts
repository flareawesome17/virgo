import { BadRequestException, ConflictException, Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { WipeStorageDto } from './dto/storage.dto';
import { StorageConfig } from './storage.config';
import { StorageController } from './storage.controller';
import type { StorageService } from './storage.service';
import type { ThumbnailsService } from './thumbnails.service';

// The controller also streams zips, and archiver ships as ESM, which this jest
// setup does not transform. Nothing here zips anything.
jest.mock('archiver', () => ({ ZipArchive: class {} }));

/**
 * What confirming an upload does with it, by where it is going.
 *
 * A profile photo sits at a permanent public URL, so the re-encode that
 * strips its EXIF is not optional for it the way a thumbnail is for an album
 * upload: one that cannot be re-encoded is deleted and the confirm refused.
 */

const ME = '11111111-1111-4111-8111-111111111111';
const COVER = `users/${ME}/covers/2026/09/22222222-2222-4222-8222-222222222222.jpg`;
const AVATAR = `users/${ME}/avatars/2026/09/33333333-3333-4333-8333-333333333333.jpg`;
const PHOTO = `users/${ME}/albums/2026/09/44444444-4444-4444-8444-444444444444.jpg`;

function controllerOver({
  exists = true,
  cover = { size: 90_000, contentType: 'image/webp', width: 2048, height: 1024 },
  avatar = { size: 20_000, contentType: 'image/webp' },
  deleteFails = false,
  coverInUse = null,
}: {
  exists?: boolean;
  cover?: { size: number; contentType: string; width: number; height: number } | null;
  avatar?: { size: number; contentType: string } | null;
  deleteFails?: boolean;
  /** The object users.cover_url names, as StorageService works it out. */
  coverInUse?: string | null;
} = {}) {
  const storage = {
    statObject: jest.fn(async () =>
      exists
        ? { exists: true, size: 4_000_000, contentType: 'image/jpeg' }
        : { exists: false, size: 0 },
    ),
    deleteObject: jest.fn(async () => {
      if (deleteFails) throw new Error('bucket unreachable');
    }),
    deleteMany: jest.fn(async (_id: string, keys: string[]) => ({
      deleted: keys.length,
      failed: 0,
    })),
    coverKeyOf: jest.fn(async () => coverInUse),
    wipeAll: jest.fn(async () => ({ deleted: 3, failed: 0, freedBytes: 9_000 })),
  };
  const thumbs = {
    normaliseCover: jest.fn(async () => cover),
    normaliseAvatar: jest.fn(async () => avatar),
    generateOnce: jest.fn(async () => null),
    generate: jest.fn(async () => null),
  };
  const values: Record<string, string> = { CDN_BASE_URL: 'https://cdn.virgo.test' };
  const config = new StorageConfig({
    get: (key: string, fallback?: string) => values[key] ?? fallback,
  } as unknown as ConfigService);
  const controller = new StorageController(
    storage as unknown as StorageService,
    thumbs as unknown as ThumbnailsService,
    config,
  );
  return { controller, storage, thumbs };
}

beforeEach(() => {
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

const refusal = (code: string) =>
  expect.objectContaining({ response: expect.objectContaining({ statusCode: 400, code }) });

describe('StorageController.confirm', () => {
  it('re-encodes a cover and never makes it a thumbnail', async () => {
    const { controller, thumbs } = controllerOver();

    await expect(controller.confirm(ME, { key: COVER })).resolves.toEqual({
      exists: true,
      size: 90_000,
      contentType: 'image/webp',
    });
    expect(thumbs.normaliseCover).toHaveBeenCalledWith(COVER, 'image/jpeg', 4_000_000);
    expect(thumbs.generate).not.toHaveBeenCalled();
    expect(thumbs.normaliseAvatar).not.toHaveBeenCalled();
  });

  it('deletes a cover it could not re-encode, and says so', async () => {
    const { controller, storage } = controllerOver({ cover: null });

    const confirming = controller.confirm(ME, { key: COVER });
    await expect(confirming).rejects.toBeInstanceOf(BadRequestException);
    await expect(confirming).rejects.toEqual(refusal('COVER_UNUSABLE'));
    expect(storage.deleteObject).toHaveBeenCalledWith(ME, COVER);
  });

  it('still refuses when that delete fails', async () => {
    const { controller } = controllerOver({ cover: null, deleteFails: true });

    await expect(controller.confirm(ME, { key: COVER })).rejects.toEqual(
      refusal('COVER_UNUSABLE'),
    );
  });

  it('resizes an avatar as before, and deletes and refuses one it cannot', async () => {
    const made = controllerOver();
    await expect(made.controller.confirm(ME, { key: AVATAR })).resolves.toEqual({
      exists: true,
      size: 20_000,
      contentType: 'image/webp',
    });
    expect(made.thumbs.normaliseAvatar).toHaveBeenCalledWith(AVATAR, 'image/jpeg', 4_000_000);
    expect(made.thumbs.generate).not.toHaveBeenCalled();

    const refused = controllerOver({ avatar: null });
    await expect(refused.controller.confirm(ME, { key: AVATAR })).rejects.toEqual(
      refusal('AVATAR_UNUSABLE'),
    );
    expect(refused.storage.deleteObject).toHaveBeenCalledWith(ME, AVATAR);
  });

  it('thumbnails an album upload once, and keeps the album it was filed under', async () => {
    // generateOnce, not generate: a confirm the app sends again must not read
    // and decode the same original a second time.
    const { controller, storage, thumbs } = controllerOver();

    await controller.confirm(ME, { key: PHOTO, albumId: 'album-1' });

    expect(thumbs.generateOnce).toHaveBeenCalledWith(PHOTO, 'image/jpeg', 4_000_000);
    expect(thumbs.generate).not.toHaveBeenCalled();
    expect(storage.statObject).toHaveBeenCalledWith(ME, PHOTO, 'album-1', undefined);
  });

  it('files no profile photo into an album, whatever the client sends', async () => {
    // An album can be deleted or swept by retention, and a cover filed into
    // one would go with it. Ignored rather than refused, so no installed app
    // that sends one breaks.
    const { controller, storage } = controllerOver();

    await controller.confirm(ME, { key: COVER, albumId: 'album-1' });
    await controller.confirm(ME, { key: AVATAR, albumId: 'album-1' });

    expect(storage.statObject).toHaveBeenNthCalledWith(1, ME, COVER, undefined, undefined);
    expect(storage.statObject).toHaveBeenNthCalledWith(2, ME, AVATAR, undefined, undefined);
  });

  it('does nothing more for an upload that never landed', async () => {
    const { controller, thumbs } = controllerOver({ exists: false });

    await expect(controller.confirm(ME, { key: COVER })).resolves.toEqual({
      exists: false,
      size: 0,
    });
    expect(thumbs.normaliseCover).not.toHaveBeenCalled();
    expect(thumbs.generateOnce).not.toHaveBeenCalled();
  });
});

describe('StorageController.wipe', () => {
  it('wipes everything, cover included', async () => {
    // The cover goes with the rest inside wipeAll, so account deletion gets
    // the same treatment as this route.
    const { controller, storage } = controllerOver();

    await expect(
      controller.wipe(ME, Object.assign(new WipeStorageDto(), { confirm: 'DELETE' })),
    ).resolves.toEqual({ deleted: 3, failed: 0, freedBytes: 9_000 });
    expect(storage.wipeAll).toHaveBeenCalledWith(ME);
  });
});

/**
 * Deleting the photo the profile is using as its cover.
 *
 * The app deletes a cover it has just uploaded when the save is refused, and
 * a save whose answer was lost looks refused while having landed. Deleting
 * then would leave the profile pointing at an object that is gone.
 */
describe('StorageController.remove and removeMany', () => {
  const OTHER = `users/${ME}/albums/2026/09/55555555-5555-4555-8555-555555555555.jpg`;
  const inUse = expect.objectContaining({
    response: expect.objectContaining({ statusCode: 409, code: 'COVER_IN_USE' }),
  });

  it('refuses to delete the cover in use, and says why', async () => {
    const { controller, storage } = controllerOver({ coverInUse: COVER });

    const deleting = controller.remove(ME, { key: COVER });
    await expect(deleting).rejects.toBeInstanceOf(ConflictException);
    await expect(deleting).rejects.toEqual(inUse);
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('refuses a whole selection that holds it', async () => {
    const { controller, storage } = controllerOver({ coverInUse: COVER });

    await expect(controller.removeMany(ME, { keys: [OTHER, COVER] })).rejects.toEqual(inUse);
    expect(storage.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes anything else, including a cover that is no longer the one in use', async () => {
    const replaced = `users/${ME}/covers/2026/08/66666666-6666-4666-8666-666666666666.webp`;
    const { controller, storage } = controllerOver({ coverInUse: COVER });

    await controller.remove(ME, { key: OTHER });
    await controller.remove(ME, { key: replaced });
    await expect(controller.removeMany(ME, { keys: [OTHER, replaced] })).resolves.toEqual({
      deleted: 2,
      failed: 0,
    });

    expect(storage.deleteObject).toHaveBeenNthCalledWith(1, ME, OTHER);
    expect(storage.deleteObject).toHaveBeenNthCalledWith(2, ME, replaced);
    expect(storage.deleteMany).toHaveBeenCalledWith(ME, [OTHER, replaced]);
  });

  it('deletes as before for an account with no cover', async () => {
    const { controller, storage } = controllerOver();

    await controller.remove(ME, { key: OTHER });

    expect(storage.coverKeyOf).toHaveBeenCalledWith(ME);
    expect(storage.deleteObject).toHaveBeenCalledWith(ME, OTHER);
  });
});
