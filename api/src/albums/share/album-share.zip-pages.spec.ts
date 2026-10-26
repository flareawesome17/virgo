import type { Request, Response } from 'express';
import type { DownloadAllowanceService } from '../../quota/download-allowance.service';
import type { DownloadCacheService } from '../../storage/download-cache.service';
import type { ZipCacheService, ZipEntry, ZipProgress } from '../../storage/zip-cache.service';
import type { VisitsService } from '../../visits/visits.service';
import { PublicAlbumController } from './album-share.controller';
import type { AlbumShareService } from './album-share.service';

// archiver ships as ESM, which this jest setup does not transform; the zip
// itself is not what is under test.
jest.mock('archiver', () => ({ ZipArchive: class {} }));

/**
 * What a client's browser is shown on a zip's address while the zip is
 * prepared, once it is ready, and when it could not be built.
 */

const OWNER = '11111111-1111-4111-8111-111111111111';
const FILES = [{ key: `users/${OWNER}/albums/a.jpg`, name: 'Wedding - 001.jpg', size: 6_000_000 }];
const BROWSER = 'text/html,application/xhtml+xml';
const MESSENGER = 'Mozilla/5.0 (iPhone) [FBAN/MessengerForiOS;FBAV/450.0]';

function response() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    redirectedTo: undefined as string | undefined,
    headers: {} as Record<string, string>,
  } as Record<string, unknown>;
  const chain = (fn: (...args: unknown[]) => void) =>
    jest.fn((...args: unknown[]) => {
      fn(...args);
      return res;
    });
  Object.assign(res, {
    status: chain((code) => (res.statusCode = code)),
    setHeader: chain((k, v) => ((res.headers as Record<string, string>)[String(k).toLowerCase()] = String(v))),
    type: chain(() => undefined),
    json: chain((body) => (res.body = body)),
    send: chain((body) => (res.body = body)),
    redirect: chain((_code, url) => (res.redirectedTo = url)),
    on: jest.fn(),
    sendFile: jest.fn((_path: string, _opts: unknown, done: () => void) => done()),
  });
  return res as unknown as Response & {
    statusCode: number;
    body: unknown;
    redirectedTo?: string;
    headers: Record<string, string>;
    sendFile: jest.Mock;
  };
}

function request(query: Record<string, string> = {}, headers: Record<string, string> = {}) {
  return { headers: { accept: BROWSER, ...headers }, query, url: '/s/token/zip' } as unknown as Request;
}

function routes(entry: Partial<ZipEntry>, progress: Partial<ZipProgress> = {}) {
  const share = {
    filesForDownload: jest.fn(async () => ({ albumName: 'Wedding', files: FILES, ownerId: OWNER })),
    picksForDownload: jest.fn(async () => ({ albumName: 'Wedding - picks', files: FILES, ownerId: OWNER })),
  };
  const full: ZipEntry = {
    id: 'z',
    state: 'building',
    path: '/srv/dlcache/_zips/z.zip',
    size: 0,
    done: 0,
    total: 1,
    lastUsed: 0,
    inUse: 0,
    ...entry,
  };
  const zips = {
    enabled: true,
    request: jest.fn(() => full),
    hold: jest.fn(() => () => undefined),
    progress: jest.fn(() => ({ done: 0, total: 1, bytes: 0, position: 0, ...progress })),
  };
  const allowance = { allows: jest.fn(async () => true), meter: jest.fn(), record: jest.fn() };
  const controller = new PublicAlbumController(
    share as unknown as AlbumShareService,
    {} as unknown as VisitsService,
    { enabled: true } as unknown as DownloadCacheService,
    zips as unknown as ZipCacheService,
    allowance as unknown as DownloadAllowanceService,
  );
  return { controller, zips };
}

describe('the zip waiting page', () => {
  it('shows progress in bytes and refreshes itself to the same address', async () => {
    const { controller } = routes(
      { state: 'building' },
      { bytes: 600 * 1024 ** 2, totalBytes: 1024 ** 3, etaSeconds: 300 },
    );
    const res = response();
    await controller.downloadAll('token', request(), res);
    const html = String(res.body);
    expect(res.statusCode).toBe(200);
    expect(html).toContain('58% done: 600 MB of 1.0 GB. About 5 minutes left.');
    // The next page is told how far this one's ring got.
    expect(html).toContain('<meta http-equiv="refresh" content="3;url=zip?wait=1&amp;p=58">');
    expect(html).not.toContain('class="note"');
  });

  describe('its progress ring', () => {
    /** The dash offset that leaves `pct` of the ring showing. */
    const offset = (pct: number) => (2 * Math.PI * 40 * (1 - pct / 100)).toFixed(2);
    const halfway = { bytes: 600 * 1024 ** 2, totalBytes: 1024 ** 3 };

    it('fills on from where the last page left it, by the next refresh', async () => {
      const { controller } = routes({ state: 'building' }, halfway);
      const res = response();
      await controller.downloadAll('token', request({ wait: '1', p: '40' }), res);
      const html = String(res.body);
      expect(html).toContain('role="progressbar"');
      expect(html).toContain('aria-valuenow="58"');
      expect(html).toContain('<b>58%</b>');
      expect(html).toContain(`@keyframes ring-fill{from{stroke-dashoffset:${offset(40)}}to{stroke-dashoffset:${offset(58)}}}`);
      // Linear, and done a little before the 3 s refresh.
      expect(html).toContain('animation:ring-fill 2800ms linear both');
    });

    it('starts where it stands when there was no page before, or a p that is not a percentage', async () => {
      for (const p of [undefined, '999', 'abc', '-5']) {
        const { controller } = routes({ state: 'building' }, halfway);
        const res = response();
        await controller.downloadAll('token', request(p === undefined ? {} : { wait: '1', p }), res);
        expect(String(res.body)).toContain(`from{stroke-dashoffset:${offset(58)}}`);
      }
    });

    it('never runs backwards', async () => {
      const { controller } = routes({ state: 'building' }, halfway);
      const res = response();
      await controller.downloadAll('token', request({ wait: '1', p: '70' }), res);
      expect(String(res.body)).toContain(`from{stroke-dashoffset:${offset(58)}}`);
    });

    it('goes round instead while the download waits in line, or nothing is written yet', async () => {
      const cases: [Partial<ZipEntry>, Partial<ZipProgress>][] = [
        [{ state: 'queued' }, { position: 2, bytes: 0, totalBytes: 1024 ** 3 }],
        [{ state: 'building' }, { bytes: 0, totalBytes: 3 * 1024 ** 2 }],
      ];
      for (const [entry, progress] of cases) {
        const { controller } = routes(entry, progress);
        const res = response();
        await controller.downloadAll('token', request({ wait: '1', p: '30' }), res);
        const html = String(res.body);
        expect(html).toContain('class="spin"');
        expect(html).not.toContain('aria-valuenow');
        // Phased off the clock, so a refresh does not send it back to the top.
        expect(html).toMatch(/animation:ring-spin 1400ms linear -\d\.\d{3}s infinite/);
        // A spinner has no figure for the next page to carry on from.
        expect(html).toContain('content="3;url=zip?wait=1"');
      }
    });

    it('closes the ring on the ready page, from where the last page left it', async () => {
      const { controller } = routes({ state: 'ready', size: 1_073_818_239 });
      const res = response();
      await controller.downloadAll('token', request({ wait: '1', p: '99' }), res);
      const html = String(res.body);
      expect(html).toContain('aria-valuenow="100"');
      expect(html).toContain(`@keyframes ring-fill{from{stroke-dashoffset:${offset(99)}}to{stroke-dashoffset:${offset(100)}}}`);
      expect(html).toContain('class="done"');
    });
  });

  it('says where the client is in line', async () => {
    const { controller } = routes({ state: 'queued' }, { position: 2 });
    const res = response();
    await controller.downloadAll('token', request(), res);
    expect(String(res.body)).toContain('You are number 2 in line.');
  });

  it('warns a client in Messenger that the download will not save there', async () => {
    const { controller } = routes({ state: 'building' });
    const res = response();
    await controller.downloadAll('token', request({}, { 'user-agent': MESSENGER }), res);
    expect(String(res.body)).toContain('Open in Safari');
  });

  it('turns into a Download button when the zip is ready, instead of a silent download', async () => {
    const { controller, zips } = routes({ state: 'ready', size: 1_073_818_239 });
    const res = response();
    await controller.downloadAll('token', request({ wait: '1' }), res);
    const html = String(res.body);
    expect(html).toContain('Your download is ready');
    expect(html).toContain('One zip file, 1.0 GB.');
    expect(html).toContain('<a class="btn" href="zip">');
    expect(html).not.toContain('http-equiv="refresh"');
    expect(res.sendFile).not.toHaveBeenCalled();
    expect(zips.hold).not.toHaveBeenCalled();
  });

  it('sends the file itself to the button, the gallery link and a resume', async () => {
    for (const req of [request(), request({}, { range: 'bytes=5000-' }), request({ wait: '1' }, { accept: '*/*' })]) {
      const { controller } = routes({ state: 'ready', size: 1_073_818_239 });
      const res = response();
      await controller.downloadAll('token', req, res);
      expect(res.sendFile).toHaveBeenCalledTimes(1);
    }
  });

  it('tries again by itself a few times when the build failed, then stops', async () => {
    const { controller } = routes({ state: 'failed' });
    const first = response();
    await controller.downloadAll('token', request(), first);
    expect(first.statusCode).toBe(503);
    expect(String(first.body)).toContain('content="65;url=zip?wait=1&amp;try=1"');

    const last = response();
    await controller.downloadAll('token', request({ wait: '1', try: '3' }), last);
    expect(String(last.body)).not.toContain('http-equiv="refresh"');
    expect(String(last.body)).toContain('open the link again');
  });

  it('keeps the retry count through the waiting page', async () => {
    const { controller } = routes({ state: 'building' });
    const res = response();
    await controller.downloadAll('token', request({ wait: '1', try: '2' }), res);
    expect(String(res.body)).toContain('content="3;url=zip?wait=1&amp;try=2"');
  });

  it('builds with a way to carry on a broken read', async () => {
    const { controller, zips } = routes({ state: 'building' });
    await controller.downloadAll('token', request(), response());
    const call = zips.request.mock.calls[0] as unknown[];
    expect(typeof call[4]).toBe('function');
  });
});

describe('the old .zip addresses', () => {
  it('send the client on to the new ones, keeping the query', () => {
    const { controller } = routes({});
    const all = response();
    controller.legacyDownloadAll('tok', { url: '/s/tok/download.zip?wait=1' } as Request, all);
    expect(all.redirectedTo).toBe('/s/tok/zip?wait=1');

    const picks = response();
    controller.legacyDownloadPicks('tok', { url: '/s/tok/picks.zip' } as Request, picks);
    expect(picks.redirectedTo).toBe('/s/tok/picks/zip');
  });
});
