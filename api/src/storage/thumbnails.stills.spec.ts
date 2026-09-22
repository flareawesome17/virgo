import { mkdtemp, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import type { DatabaseService } from '../database/database.service';
import type { MediaLinkService } from './media-link.service';
import type { StorageService } from './storage.service';
import { removeStaleStills, ThumbnailsService } from './thumbnails.service';

/**
 * What a process killed mid-decode leaves behind.
 *
 * A HEIC is unpacked into a folder in the temp directory, and the folder is
 * removed however the decode ends — but nothing runs for a container that is
 * killed, and each folder holds a whole photograph twice over. The next start
 * collects them.
 *
 * The temp directory is shared, so age is what tells leftovers from a decode
 * running right now: these tests check that a fresh folder survives.
 */

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

/** A folder as a decode leaves it, with a HEIC and a PNG inside. */
async function still(prefix: string, ageMs: number): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), prefix));
  await writeFile(join(folder, 'in.heic'), 'pretend photograph');
  if (ageMs > 0) {
    const when = new Date(Date.now() - ageMs);
    await utimes(folder, when, when);
  }
  return folder;
}

function service(): ThumbnailsService {
  return new ThumbnailsService(
    {} as unknown as StorageService,
    {} as unknown as DatabaseService,
    {} as unknown as MediaLinkService,
  );
}

describe('ThumbnailsService, starting up', () => {
  const leftovers: string[] = [];
  afterEach(async () => {
    for (const folder of leftovers.splice(0)) {
      await rm(folder, { recursive: true, force: true });
    }
    jest.restoreAllMocks();
  });

  it('collects abandoned stills, and leaves live ones and everything else', async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const abandoned = await still('virgo-still-', 60 * 60_000);
    const running = await still('virgo-still-', 0);
    const elsewhere = await still('virgo-poster-', 60 * 60_000);
    leftovers.push(running, elsewhere);

    await service().onModuleInit();

    expect(await exists(abandoned)).toBe(false);
    // A decode this one belongs to may be minutes from finishing.
    expect(await exists(running)).toBe(true);
    // Not this service's to collect.
    expect(await exists(elsewhere)).toBe(true);
  });

  it('says so and carries on when the temp folder cannot be read', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    await expect(
      removeStaleStills(join(tmpdir(), 'virgo-not-a-folder-here'), Date.now(), new Logger('spec')),
    ).resolves.toBe(0);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('for stale stills'));
  });
});
