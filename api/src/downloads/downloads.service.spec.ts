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
