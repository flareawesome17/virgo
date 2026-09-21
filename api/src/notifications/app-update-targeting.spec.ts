import {
  appliesTo,
  compareVersions,
  normalizeVersion,
  parseClient,
  type Client,
  type Target,
} from './app-update-targeting';

const target = (t: Partial<Target> & Pick<Target, 'platforms'>): Target => ({
  minVersion: null,
  maxVersion: null,
  ...t,
});
const client = (platform: Client['platform'], version: string | null): Client => ({
  platform,
  version,
});

describe('normalizeVersion', () => {
  it('drops the v the web image is stamped with', () => {
    expect(normalizeVersion('v1.12.9')).toBe('1.12.9');
    expect(normalizeVersion('1.3.4')).toBe('1.3.4');
  });

  it('refuses anything that is not a plain release number', () => {
    // A development or pre-release build must not be matched against a bound
    // as though it were the release of the same number.
    for (const raw of ['dev', '', '1.3.4-beta', 'latest', '1..2', null, undefined]) {
      expect(normalizeVersion(raw)).toBeNull();
    }
  });
});

describe('compareVersions', () => {
  it('compares numerically, so 1.10 is newer than 1.9', () => {
    // The release where a string comparison would quietly stop matching.
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareVersions('1.12.9', '1.12.10')).toBeLessThan(0);
  });

  it('treats missing parts as zero', () => {
    expect(compareVersions('1.3', '1.3.0')).toBe(0);
  });
});

describe('parseClient', () => {
  it('shows nothing to a client that cannot say what it is', () => {
    expect(parseClient(undefined, '1.3.4')).toBeNull();
    expect(parseClient('blackberry', '1.3.4')).toBeNull();
  });

  it('keeps the platform when only the version is unusable', () => {
    expect(parseClient('ios', 'dev')).toEqual({ platform: 'ios', version: null });
  });
});

describe('appliesTo', () => {
  it('never shows one platform another platform’s update', () => {
    const macFix = target({ platforms: ['macos'] });
    expect(appliesTo(macFix, client('macos', '1.12.9'))).toBe(true);
    for (const other of ['windows', 'web', 'ios', 'android'] as const) {
      expect(appliesTo(macFix, client(other, '1.12.9'))).toBe(false);
    }
  });

  it('shows the same update everywhere only when it targets everywhere', () => {
    const everywhere = target({
      platforms: ['web', 'windows', 'macos', 'ios', 'android'],
    });
    for (const p of ['web', 'windows', 'macos', 'ios', 'android'] as const) {
      expect(appliesTo(everywhere, client(p, '1.0.0'))).toBe(true);
    }
  });

  it('shows an unbounded update to a client whatever its version', () => {
    const webChange = target({ platforms: ['web'] });
    expect(appliesTo(webChange, client('web', null))).toBe(true);
    expect(appliesTo(webChange, client('web', '1.12.9'))).toBe(true);
  });

  /**
   * An OTA reaches exactly one native version. Telling a phone on 1.3.3 about
   * it would promise an update that phone is never going to receive.
   */
  it('shows an over-the-air update only to the build it reaches', () => {
    const ota = target({ platforms: ['ios', 'android'], minVersion: '1.3.4', maxVersion: '1.3.4' });
    expect(appliesTo(ota, client('ios', '1.3.4'))).toBe(true);
    expect(appliesTo(ota, client('android', '1.3.4'))).toBe(true);
    expect(appliesTo(ota, client('ios', '1.3.3'))).toBe(false);
    expect(appliesTo(ota, client('ios', '1.3.5'))).toBe(false);
  });

  it('shows a new build only to the versions below it', () => {
    const newBuild = target({ platforms: ['ios', 'android'], maxVersion: '1.3.4' });
    expect(appliesTo(newBuild, client('ios', '1.3.3'))).toBe(true);
    expect(appliesTo(newBuild, client('ios', '1.3.4'))).toBe(true);
    expect(appliesTo(newBuild, client('ios', '1.3.5'))).toBe(false);
  });

  /**
   * A bound exists because the update does not apply everywhere, so a client
   * that cannot say its version is left out rather than assumed to match.
   */
  it('leaves out a client of unknown version when the update is bounded', () => {
    const ota = target({ platforms: ['ios'], minVersion: '1.3.4', maxVersion: '1.3.4' });
    expect(appliesTo(ota, client('ios', null))).toBe(false);
  });

  it('matches the web image’s v-prefixed tag against a bare bound', () => {
    const web = target({ platforms: ['web'], minVersion: '1.12.9' });
    const parsed = parseClient('web', 'v1.12.9')!;
    expect(appliesTo(web, parsed)).toBe(true);
  });

  it('compares bounds numerically, not as text', () => {
    const upTo19 = target({ platforms: ['windows'], maxVersion: '1.9.0' });
    expect(appliesTo(upTo19, client('windows', '1.10.0'))).toBe(false);
  });
});
