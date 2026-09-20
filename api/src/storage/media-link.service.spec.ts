import type { ConfigService } from '@nestjs/config';
import { MediaLinkService, proxyKeyFor } from './media-link.service';

function service(values: Record<string, string>): MediaLinkService {
  const config = {
    get: (key: string, fallback?: string) => values[key] ?? fallback ?? '',
  } as unknown as ConfigService;
  return new MediaLinkService(config);
}

const CONFIGURED = {
  MEDIA_HOST: 'media.virgo.ph',
  MEDIA_LINK_SECRET: 'secret123',
  MEDIA_ROOT: '/srv/media',
};

/**
 * Chosen so the 24h TTL rounds down to exactly 1789973100, which is the
 * expiry the pinned signature below was generated against.
 */
const FIXED_NOW = 1_789_886_700_000;

describe('MediaLinkService.url', () => {
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW));
  afterEach(() => jest.restoreAllMocks());

  /**
   * The contract test. This exact string is what nginx's `secure_link_md5`
   * computes for the same inputs, verified against the canonical recipe:
   *
   *   printf '%s' '1789973100/probe.txt secret123' \
   *     | openssl md5 -binary | openssl base64 | tr '+/' '-_' | tr -d '='
   *
   * Three implementations have to agree on it — this service,
   * deployment/media/nginx.conf.template, and scripts/sign-media-url.mjs.
   * A mismatch in any of them is a 403 with nothing in the log to explain
   * it, so the value is pinned rather than recomputed.
   */
  it('matches the signature nginx computes', () => {
    expect(service(CONFIGURED).url('probe.txt')).toBe(
      'https://media.virgo.ph/1789973100/oia-pXM5NkN922WEJ3KEpQ/probe.txt',
    );
  });

  it('signs a nested rendition key', () => {
    const url = service(CONFIGURED).url('users/u/albums/2026/08/clip-web.mp4');
    expect(url).toMatch(
      /^https:\/\/media\.virgo\.ph\/\d{10}\/[A-Za-z0-9_-]{22}\/users\/u\/albums\/2026\/08\/clip-web\.mp4$/,
    );
  });

  it('produces the shape the nginx location regex matches', () => {
    // 10 digits of unix time, 22 characters of base64url md5. The location in
    // the template is anchored on both, so a change to either here is a 404
    // there rather than a visible failure.
    const url = service(CONFIGURED).url('probe.txt')!;
    const [, expires, signature] = new URL(url).pathname.split('/');
    expect(expires).toHaveLength(10);
    expect(signature).toHaveLength(22);
    expect(signature).not.toMatch(/[+/=]/);
  });

  it('is byte-identical inside a window, so the browser can reuse it', () => {
    const link = service(CONFIGURED);
    const first = link.url('probe.txt');
    jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW + 60_000);
    expect(link.url('probe.txt')).toBe(first);
  });

  it('changes once the window rolls', () => {
    const link = service(CONFIGURED);
    const first = link.url('probe.txt');
    jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW + 5 * 60_000);
    expect(link.url('probe.txt')).not.toBe(first);
  });

  it('returns null when the media host is not configured', () => {
    // The whole feature is off in this state and every player falls back to
    // the B2 original. It must not throw, or a deployment without a media
    // host cannot list an album.
    expect(service({}).url('probe.txt')).toBeNull();
    expect(service({}).isConfigured).toBe(false);
  });

  it('returns null for a null key rather than signing the root', () => {
    expect(service(CONFIGURED).url(null)).toBeNull();
    expect(service(CONFIGURED).url(undefined)).toBeNull();
  });

  it('refuses to sign a key that would not survive the round trip', () => {
    // nginx matches its location against the DECODED uri, so a key needing
    // percent-encoding would be signed as one string and verified as
    // another. Traversal is refused for the obvious reason.
    expect(service(CONFIGURED).url('users/u/../../etc/passwd')).toBeNull();
    expect(service(CONFIGURED).url('users/u/my film.mp4')).toBeNull();
    expect(service(CONFIGURED).url('users/u/clip?x=1.mp4')).toBeNull();
  });
});

describe('MediaLinkService.origin', () => {
  it('is a bare origin, for a Content-Security-Policy source list', () => {
    expect(service(CONFIGURED).origin()).toBe('https://media.virgo.ph');
  });

  it('is empty when unconfigured, so it filters out of a directive', () => {
    expect(service({}).origin()).toBe('');
  });

  it('tolerates a host written with a scheme', () => {
    expect(service({ ...CONFIGURED, MEDIA_HOST: 'https://media.virgo.ph' }).origin()).toBe(
      'https://media.virgo.ph',
    );
  });
});

describe('proxyKeyFor', () => {
  it('swaps the extension and keeps the ownership prefix', () => {
    expect(proxyKeyFor('users/u/albums/2026/08/clip.mov')).toBe(
      'users/u/albums/2026/08/clip-web.mp4',
    );
  });
});
