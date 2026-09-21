import type { ConfigService } from '@nestjs/config';
import { MediaLinkService, proxyKeyFor } from './media-link.service';
import { PUBLISHED_URL_TTL_SECONDS, signingWindowFor } from './storage.config';

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
 * With the 24h TTL on its six-hour window this rounds down to exactly
 * 1789970400, which is the expiry the pinned signatures below were generated
 * against. (Under the old five-minute window it was 1789973100.)
 */
const FIXED_NOW = 1_789_886_700_000;

describe('MediaLinkService.url', () => {
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW));
  afterEach(() => jest.restoreAllMocks());

  /**
   * The contract test. This exact string is what nginx's `secure_link_md5`
   * computes for the same inputs, verified against the canonical recipe:
   *
   *   printf '%s' '1789970400/probe.txt secret123' \
   *     | openssl md5 -binary | openssl base64 | tr '+/' '-_' | tr -d '='
   *
   * Three implementations have to agree on it — this service,
   * deployment/media/nginx.conf.template, and scripts/sign-media-url.mjs.
   * A mismatch in any of them is a 403 with nothing in the log to explain
   * it, so the value is pinned rather than recomputed.
   */
  it('matches the signature nginx computes', () => {
    expect(service(CONFIGURED).url('probe.txt')).toBe(
      'https://media.virgo.ph/1789970400/_JGhNVQjgwPpAma3JwHFEQ/probe.txt',
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

  /**
   * The point of the six-hour window. Under five minutes the same rendition
   * came back under a new URL on every visit, so the `immutable` header nginx
   * sends never got to matter — no cache ever saw the same URL twice.
   */
  it('still hands out the same URL hours later, within its window', () => {
    const link = service(CONFIGURED);
    const first = link.url('probe.txt');
    jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW + 5 * 60 * 60_000);
    expect(link.url('probe.txt')).toBe(first);
  });

  it('changes once the window rolls', () => {
    const link = service(CONFIGURED);
    const first = link.url('probe.txt');
    const window = signingWindowFor(PUBLISHED_URL_TTL_SECONDS) * 1000;
    jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW + window);
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

describe('MediaLinkService.hlsUrl', () => {
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW));
  afterEach(() => jest.restoreAllMocks());

  /**
   * The contract test for the /h/ location, verified the same way as the
   * single-file one — `printf '%s' '1789973100/users/u/a/clip-hls secret123'`
   * through md5, base64, `tr '+/' '-_'`, strip padding.
   *
   * The signature covers the DIRECTORY, not the playlist. That is the whole
   * reason this method exists separately from `url`: a master playlist's
   * child URIs are relative, so signing the full key would refuse the first
   * segment the player asked for.
   */
  it('signs the ladder directory and serves it under /h/', () => {
    expect(service(CONFIGURED).hlsUrl('users/u/a/clip-hls')).toBe(
      'https://media.virgo.ph/h/1789970400/Pa4Pv1h31Rmw5gqZU8YcXQ/users/u/a/clip-hls/master.m3u8',
    );
  });

  it('signs the DIRECTORY, not the playlist inside it', () => {
    // The whole mistake this method exists to avoid. Signing the full path
    // to master.m3u8 would produce a token valid for that one file, and the
    // first segment the player asked for — a different path, same token —
    // would be refused with a 403 and nothing in the log to explain it.
    const link = service(CONFIGURED);
    const ladderSig = new URL(link.hlsUrl('users/u/a/clip-hls')!).pathname.split('/')[3];
    const fileSig = new URL(
      link.url('users/u/a/clip-hls/master.m3u8')!,
    ).pathname.split('/')[2];
    expect(ladderSig).not.toBe(fileSig);
  });

  it('produces the shape the /h/ location regex matches', () => {
    const url = new URL(service(CONFIGURED).hlsUrl('users/u/a/clip-hls')!);
    const [, h, expires, signature, ...rest] = url.pathname.split('/');
    expect(h).toBe('h');
    expect(expires).toHaveLength(10);
    expect(signature).toHaveLength(22);
    // The directory must still end in -hls after the token, or the
    // non-greedy `.+?-hls` capture has nothing to stop at.
    expect(rest.slice(0, -1).join('/')).toBe('users/u/a/clip-hls');
    expect(rest.at(-1)).toBe('master.m3u8');
  });

  it('tolerates a trailing slash on the prefix', () => {
    expect(service(CONFIGURED).hlsUrl('users/u/a/clip-hls/')).toBe(
      service(CONFIGURED).hlsUrl('users/u/a/clip-hls'),
    );
  });

  it('refuses a prefix that is not a ladder directory', () => {
    // Anything not ending in -hls cannot be matched by the /h/ location, so
    // signing it would hand out a URL that can only ever 404.
    expect(service(CONFIGURED).hlsUrl('users/u/a/clip-web.mp4')).toBeNull();
    expect(service(CONFIGURED).hlsUrl('users/u/../a-hls')).toBeNull();
  });

  it('returns null when there is no ladder or no media host', () => {
    expect(service(CONFIGURED).hlsUrl(null)).toBeNull();
    expect(service({}).hlsUrl('users/u/a/clip-hls')).toBeNull();
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
