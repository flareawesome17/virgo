import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { DownloadsService } from './downloads.service';

function service(): DownloadsService {
  const config = {
    get: (key: string, fallback?: string) =>
      ({ PUBLIC_API_URL: 'https://api.virgo.ph' })[key] ?? fallback ?? '',
  } as unknown as ConfigService;
  return new DownloadsService(config);
}

/**
 * A release as the desktop legs leave it: both architectures of everything,
 * and a `.sig` beside each thing the updater is allowed to apply.
 *
 * The `.dmg` files deliberately have no `.sig`. A disk image cannot be applied
 * over a running app, so nothing signs one, and a selector that reached for a
 * `.dmg` would find no signature and silently offer no update at all — the
 * failure this release shape exists to catch.
 *
 * The MSI is named the way Tauri's WiX bundler names it, with the installer
 * language on the end, which is how it appears on real releases.
 */
const RELEASE = {
  tag_name: 'v1.13.0',
  name: 'v1.13.0 — Macs can update themselves',
  published_at: '2026-09-21T00:00:00Z',
  draft: false,
  assets: [
    { id: 1, name: 'Virgo_1.13.0_x64-setup.exe', size: 1 },
    { id: 2, name: 'Virgo_1.13.0_x64-setup.exe.sig', size: 1 },
    { id: 3, name: 'Virgo_1.13.0_aarch64.dmg', size: 1 },
    { id: 4, name: 'Virgo_1.13.0_x64.dmg', size: 1 },
    { id: 5, name: 'Virgo_aarch64.app.tar.gz', size: 1 },
    { id: 6, name: 'Virgo_aarch64.app.tar.gz.sig', size: 1 },
    { id: 7, name: 'Virgo_x64.app.tar.gz', size: 1 },
    { id: 8, name: 'Virgo_x64.app.tar.gz.sig', size: 1 },
    { id: 9, name: 'Virgo_1.13.0_x64_en-US.msi', size: 1 },
    { id: 10, name: 'Virgo_1.13.0_x64_en-US.msi.sig', size: 1 },
  ],
};

/** Each signature is just its asset id, so a mismatch names the wrong file. */
function stub(subject: DownloadsService, release: unknown = RELEASE): void {
  jest
    .spyOn(subject as never, 'newestReleaseWithInstallers')
    .mockResolvedValue(release as never);
  jest
    .spyOn(subject as never, 'readAssetText')
    .mockImplementation(((id: number) => Promise.resolve(`sig-${id}`)) as never);
}

describe('DownloadsService.getUpdate', () => {
  afterEach(() => jest.restoreAllMocks());

  it('gives an Apple Silicon Mac the aarch64 tarball, never the dmg', async () => {
    const subject = service();
    stub(subject);

    const update = await subject.getUpdate('darwin', 'aarch64', '1.12.0');

    expect(update).not.toBeNull();
    expect(update?.url).toContain('Virgo_aarch64.app.tar.gz');
    expect(update?.url).not.toContain('.dmg');
    expect(update?.signature).toBe('sig-6');
  });

  /**
   * The one that matters most. Handing an Intel Mac the Apple Silicon build
   * installs something the machine cannot execute, and the person is left with
   * an app that will not open and no obvious way back.
   */
  it('gives an Intel Mac the x64 tarball', async () => {
    const subject = service();
    stub(subject);

    const update = await subject.getUpdate('darwin', 'x86_64', '1.12.0');

    expect(update?.url).toContain('Virgo_x64.app.tar.gz');
    expect(update?.url).not.toContain('aarch64');
    expect(update?.signature).toBe('sig-8');
  });

  it('still gives Windows the NSIS installer', async () => {
    const subject = service();
    stub(subject);

    const update = await subject.getUpdate('windows', 'x86_64', '1.12.0');

    expect(update?.url).toContain('x64-setup.exe');
    expect(update?.signature).toBe('sig-2');
  });

  it('offers nothing when the running version is already current', async () => {
    const subject = service();
    stub(subject);

    expect(await subject.getUpdate('darwin', 'aarch64', '1.13.0')).toBeNull();
  });

  /**
   * A release built before this shipped has `.dmg` files and no tarballs.
   * Offering an update whose payload does not exist would have the plugin
   * download a 404 and fail in front of the user; answering null leaves the
   * app quietly on the version it has.
   */
  it('offers nothing to a Mac when the release predates the tarballs', async () => {
    const subject = service();
    stub(subject, {
      ...RELEASE,
      assets: RELEASE.assets.filter((a) => !a.name.includes('.app.tar.gz')),
    });

    expect(await subject.getUpdate('darwin', 'aarch64', '1.12.0')).toBeNull();
    // Windows is unaffected by a missing macOS payload.
    expect(await subject.getUpdate('windows', 'x86_64', '1.12.0')).not.toBeNull();
  });

  it('offers nothing when the tarball has no signature beside it', async () => {
    const subject = service();
    stub(subject, {
      ...RELEASE,
      assets: RELEASE.assets.filter(
        (a) => a.name !== 'Virgo_aarch64.app.tar.gz.sig',
      ),
    });

    expect(await subject.getUpdate('darwin', 'aarch64', '1.12.0')).toBeNull();
  });

  it('ignores a platform nothing is built for', async () => {
    const subject = service();
    stub(subject);

    expect(await subject.getUpdate('linux', 'x86_64', '1.12.0')).toBeNull();
  });
});

/**
 * An MSI install and an NSIS install live in different folders, so updating
 * one with the other's installer leaves two copies of the app on the machine.
 * The shell names its installer with `?bundle={{bundle_type}}`.
 */
describe('DownloadsService.getUpdate for an MSI install', () => {
  afterEach(() => jest.restoreAllMocks());

  it('gives an MSI install the MSI and its signature', async () => {
    const subject = service();
    stub(subject);

    const update = await subject.getUpdate('windows', 'x86_64', '1.12.0', 'msi');

    expect(update?.url).toBe(
      'https://api.virgo.ph/downloads/v1.13.0/Virgo_1.13.0_x64_en-US.msi',
    );
    expect(update?.signature).toBe('sig-10');
  });

  /**
   * Every copy installed before the query string existed sends no `bundle`
   * at all, and an unpatched binary sends `unknown`. They must go on getting
   * what they were getting. The value is the caller's, so nothing short of
   * the exact word changes the answer.
   */
  it.each([
    undefined,
    'nsis',
    'unknown',
    '',
    'MSI',
    ' msi',
    'msi ',
    'msi,nsis',
    '../msi',
  ])('gives the NSIS installer when bundle is %p', async (bundle) => {
    const subject = service();
    stub(subject);

    const update = await subject.getUpdate('windows', 'x86_64', '1.12.0', bundle);

    expect(update?.url).toContain('x64-setup.exe');
    expect(update?.signature).toBe('sig-2');
  });

  it('offers an MSI install nothing, not the NSIS installer, when the release has no MSI', async () => {
    const subject = service();
    stub(subject, {
      ...RELEASE,
      assets: RELEASE.assets.filter((a) => !a.name.includes('.msi')),
    });
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    expect(await subject.getUpdate('windows', 'x86_64', '1.12.0', 'msi')).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no signed MSI'));
    // An NSIS install is unaffected by the missing MSI.
    expect(
      (await subject.getUpdate('windows', 'x86_64', '1.12.0', 'nsis'))?.signature,
    ).toBe('sig-2');
  });

  it('offers an MSI install nothing when the MSI has no signature beside it', async () => {
    const subject = service();
    stub(subject, {
      ...RELEASE,
      assets: RELEASE.assets.filter((a) => a.name !== 'Virgo_1.13.0_x64_en-US.msi.sig'),
    });
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    expect(await subject.getUpdate('windows', 'x86_64', '1.12.0', 'msi')).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no signed MSI'));
    expect(
      (await subject.getUpdate('windows', 'x86_64', '1.12.0'))?.signature,
    ).toBe('sig-2');
  });

  it('offers an MSI install nothing when it is already current', async () => {
    const subject = service();
    stub(subject);

    expect(await subject.getUpdate('windows', 'x86_64', '1.13.0', 'msi')).toBeNull();
  });

  it('changes nothing on a Mac', async () => {
    const subject = service();
    stub(subject);

    const update = await subject.getUpdate('darwin', 'aarch64', '1.12.0', 'msi');

    expect(update?.url).toContain('Virgo_aarch64.app.tar.gz');
    expect(update?.signature).toBe('sig-6');
  });
});

/** A published web release with no files (the web app ships images, not installers). */
const web = (n: number) => ({ tag_name: `v1.${n}.0`, published_at: '2026-10-01T00:00:00Z', draft: false, prerelease: false, assets: [] });

/** A mobile release, with its APK unless told otherwise. */
const mobile = (version: string, apk = true) => ({
  tag_name: `mobile-v${version}`,
  published_at: '2026-09-20T23:22:53Z',
  draft: false,
  prerelease: false,
  assets: apk ? [{ id: 90, name: `Virgo_${version}.apk`, size: 112_498_150 }] : [],
});

/** Serves each page of the release list in turn; any path past the last page fails. */
function pages(subject: DownloadsService, ...lists: unknown[][]): jest.SpyInstance {
  return jest.spyOn(subject as never, 'github').mockImplementation(((path: string) => {
    const page = Number(/[?&]page=(\d+)/.exec(path)?.[1] ?? 1);
    const list = lists[page - 1];
    return Promise.resolve(list ? new Response(JSON.stringify(list), { status: 200 }) : new Response('', { status: 503 }));
  }) as never);
}

/**
 * The release list is walked a page of 100 at a time, not just its first 20.
 * The web app is released several times a day and the phone app rarely; on
 * 2026-10-05 mobile-v1.3.4 sat 38th, and the Android download disappeared.
 */
describe('DownloadsService: finding the phone app among web releases', () => {
  afterEach(() => jest.restoreAllMocks());

  it('finds the Android build behind 37 web releases, in one request', async () => {
    const subject = service();
    const github = pages(subject, [...Array.from({ length: 37 }, (_, i) => web(50 - i)), mobile('1.3.4')]);

    const build = await subject.getAndroid();

    expect(build?.version).toBe('1.3.4');
    expect(build?.filename).toBe('Virgo_1.3.4.apk');
    expect(build?.url).toBe('https://api.virgo.ph/downloads/mobile-v1.3.4/Virgo_1.3.4.apk');
    expect(github).toHaveBeenCalledTimes(1);
    expect(github.mock.calls[0][0]).toContain('per_page=100&page=1');
  });

  it('reads on to the next page when the first holds none', async () => {
    const subject = service();
    const github = pages(subject, Array.from({ length: 100 }, (_, i) => web(200 - i)), [mobile('1.3.4')]);

    expect((await subject.getAndroid())?.version).toBe('1.3.4');
    expect(github).toHaveBeenCalledTimes(2);
  });

  it('stops at a short page instead of asking for the next', async () => {
    const subject = service();
    const github = pages(subject, [web(3), web(2), web(1)]);

    expect(await subject.getAndroid()).toBeNull();
    expect(github).toHaveBeenCalledTimes(1);
  });

  it('tells installed apps about a newer mobile release that has no APK, while the page keeps the last APK', async () => {
    const subject = service();
    pages(subject, [web(9), mobile('1.4.0', false), web(8), mobile('1.3.4')]);

    expect((await subject.getMobileLatest())?.version).toBe('1.4.0');
    expect((await subject.getAndroid())?.version).toBe('1.3.4');
  });

  it('keeps the last good Android build when GitHub fails', async () => {
    const subject = service();
    const now = jest.spyOn(Date, 'now').mockReturnValue(0);
    pages(subject, [mobile('1.3.4')]);
    expect((await subject.getAndroid())?.version).toBe('1.3.4');

    // Past the cache, and GitHub down.
    now.mockReturnValue(10 * 60_000);
    pages(subject);
    expect((await subject.getAndroid())?.version).toBe('1.3.4');
  });
});
