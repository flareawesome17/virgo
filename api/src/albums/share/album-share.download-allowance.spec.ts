import type { Request, Response } from 'express';
import type { DownloadAllowanceService } from '../../quota/download-allowance.service';
import type { DownloadCacheService } from '../../storage/download-cache.service';
import type { ZipCacheService } from '../../storage/zip-cache.service';
import { streamZip } from '../../storage/zip';
import type { VisitsService } from '../../visits/visits.service';
import { PublicAlbumController } from './album-share.controller';
import type { AlbumShareService } from './album-share.service';

// archiver ships as ESM, which this jest setup does not transform; the zip
// itself is not what is under test.
jest.mock('archiver', () => ({ ZipArchive: class {} }));
jest.mock('../../storage/zip', () => ({ streamZip: jest.fn(async () => undefined) }));

/**
 * The client-link download routes against the owner's monthly allowance.
 *
 * Over the allowance, a new download gets a page saying downloads are paused
 * — and nothing else about the photographer. Under it, or when the counter
 * cannot tell, the download goes ahead and is metered.
 */

const OWNER = '11111111-1111-4111-8111-111111111111';
const FILES = [{ key: `users/${OWNER}/albums/a.jpg`, name: 'Wedding - 001.jpg' }];

/** Enough of an Express response to see which answer a route gave. */
function response() {
  const res = {
    statusCode: 200,
    headersSent: false,
    body: undefined as unknown,
    redirectedTo: undefined as string | undefined,
  } as Record<string, unknown>;
  const chain = (fn: (...args: unknown[]) => void) =>
    jest.fn((...args: unknown[]) => {
      fn(...args);
      return res;
    });
  Object.assign(res, {
    status: chain((code) => (res.statusCode = code)),
    setHeader: chain(() => undefined),
    set: chain(() => undefined),
    type: chain(() => undefined),
    json: chain((body) => (res.body = body)),
    send: chain((body) => (res.body = body)),
    redirect: chain((_code, url) => (res.redirectedTo = url)),
    sendFile: jest.fn((_path: string, _opts: unknown, done: () => void) => done()),
  });
  return res as unknown as Response & {
    statusCode: number;
    body: unknown;
    redirectedTo?: string;
    sendFile: jest.Mock;
  };
}

function routes({ allowed = true, cacheEnabled = true } = {}) {
  const share = {
    filesForDownload: jest.fn(async () => ({ albumName: 'Wedding', files: FILES, ownerId: OWNER })),
    picksForDownload: jest.fn(async () => ({
      albumName: 'Wedding - picks',
      files: FILES,
      ownerId: OWNER,
    })),
    downloadTarget: jest.fn(async () => ({
      key: FILES[0].key,
      name: FILES[0].name,
      ownerId: OWNER,
      sizeBytes: 6_000_000,
    })),
    downloadLocation: jest.fn(async () => 'https://b2.test/signed'),
  };
  const cache = {
    enabled: cacheEnabled,
    lookup: jest.fn(async () => ({ path: '/srv/dlcache/ab/abc', size: 6_000_000 })),
    open: jest.fn(),
  };
  // Off here: these tests are about metering and the allowance check, which
  // are the same on the live-stream path. Building is covered by its own spec.
  const zips = { enabled: false };
  const allowance = {
    allows: jest.fn(async () => allowed),
    meter: jest.fn(),
    record: jest.fn(async () => undefined),
  };
  const controller = new PublicAlbumController(
    share as unknown as AlbumShareService,
    {} as unknown as VisitsService,
    cache as unknown as DownloadCacheService,
    zips as unknown as ZipCacheService,
    allowance as unknown as DownloadAllowanceService,
  );
  return { controller, share, cache, allowance };
}

function request(headers: Record<string, string> = {}) {
  return { headers } as unknown as Request;
}

function expectPaused(res: ReturnType<typeof response>) {
  expect(res.statusCode).toBe(429);
  expect(String(res.body)).toContain('Downloads for this gallery are paused');
  // Nothing that identifies the photographer reaches the client.
  expect(String(res.body)).not.toContain(OWNER);
  expect(String(res.body)).not.toMatch(/plan|allowance|quota/i);
}

beforeEach(() => jest.mocked(streamZip).mockClear());

describe.each([
  ['the whole album', 'downloadAll' as const],
  ['the picks', 'downloadPicks' as const],
])('a zip of %s', (_label, route) => {
  it('is refused while the owner is over their month', async () => {
    const { controller, allowance } = routes({ allowed: false });
    const res = response();

    await controller[route]('token', request(), res);

    expectPaused(res);
    expect(allowance.allows).toHaveBeenCalledWith(OWNER);
    expect(streamZip).not.toHaveBeenCalled();
    expect(allowance.meter).not.toHaveBeenCalled();
  });

  it('streams, metered to the owner, while there is allowance left', async () => {
    const { controller, allowance } = routes();
    const res = response();

    await controller[route]('token', request(), res);

    expect(allowance.meter).toHaveBeenCalledWith(OWNER, res);
    expect(streamZip).toHaveBeenCalledTimes(1);
  });
});

describe('a single file', () => {
  it('is refused while the owner is over their month', async () => {
    const { controller, cache, share } = routes({ allowed: false });
    const res = response();

    await controller.downloadOne('token', 'file-id', request(), res);

    expectPaused(res);
    expect(cache.lookup).not.toHaveBeenCalled();
    expect(share.downloadLocation).not.toHaveBeenCalled();
  });

  it('is served from the host and metered when allowed', async () => {
    const { controller, allowance } = routes();
    const res = response();

    await controller.downloadOne('token', 'file-id', request(), res);

    expect(res.sendFile).toHaveBeenCalledTimes(1);
    expect(allowance.meter).toHaveBeenCalledWith(OWNER, res);
  });

  it('still resumes a download that was already under way', async () => {
    const { controller, allowance } = routes({ allowed: false });
    const res = response();

    await controller.downloadOne('token', 'file-id', request({ range: 'bytes=3000000-' }), res);

    expect(res.statusCode).toBe(200);
    expect(res.sendFile).toHaveBeenCalledTimes(1);
    expect(allowance.meter).toHaveBeenCalledWith(OWNER, res);
  });

  it('does not treat a fresh ranged request as a resume', async () => {
    const { controller } = routes({ allowed: false });
    const res = response();

    await controller.downloadOne('token', 'file-id', request({ range: 'bytes=0-' }), res);

    expectPaused(res);
  });

  it("charges the file's size when storage serves it instead", async () => {
    const { controller, allowance } = routes({ cacheEnabled: false });
    const res = response();

    await controller.downloadOne('token', 'file-id', request(), res);

    expect(res.redirectedTo).toBe('https://b2.test/signed');
    expect(allowance.record).toHaveBeenCalledWith(OWNER, 6_000_000);
    expect(allowance.meter).not.toHaveBeenCalled();
  });
});
