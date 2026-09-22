import type { ConfigService } from '@nestjs/config';
import {
  DISPLAY_URL_TTL_SECONDS,
  DISPLAY_URL_WINDOW_SECONDS,
  DOWNLOAD_URL_TTL_SECONDS,
  MEDIA_URL_WINDOW_SECONDS,
  PUBLISHED_URL_TTL_SECONDS,
  StorageConfig,
  UPLOAD_SCOPES,
  UPLOAD_URL_TTL_SECONDS,
  signingWindowFor,
} from './storage.config';

describe('signingWindowFor', () => {
  it('leaves downloads on the five-minute window they always had', () => {
    // The link that hands over an original. Nothing about how long it stays
    // stable was meant to change when display links got longer.
    expect(signingWindowFor(DOWNLOAD_URL_TTL_SECONDS)).toBe(MEDIA_URL_WINDOW_SECONDS);
    expect(MEDIA_URL_WINDOW_SECONDS).toBe(5 * 60);
  });

  it('holds display and published links for six hours', () => {
    expect(signingWindowFor(DISPLAY_URL_TTL_SECONDS)).toBe(DISPLAY_URL_WINDOW_SECONDS);
    expect(signingWindowFor(PUBLISHED_URL_TTL_SECONDS)).toBe(DISPLAY_URL_WINDOW_SECONDS);
    expect(DISPLAY_URL_WINDOW_SECONDS).toBe(6 * 60 * 60);
  });

  /**
   * The property that makes the rest safe.
   *
   * A URL is handed out at any moment inside its window, so the latest one
   * issued has `ttl - window` left. If the window ever reached the lifetime,
   * the API would start giving out links that had already expired — and the
   * symptom would be pictures failing to load at the end of every window, with
   * nothing in the log to connect them.
   *
   * Every lifetime this module signs for, checked against the window it gets.
   */
  it.each([
    ['upload', UPLOAD_URL_TTL_SECONDS],
    ['download', DOWNLOAD_URL_TTL_SECONDS],
    ['display', DISPLAY_URL_TTL_SECONDS],
    ['published', PUBLISHED_URL_TTL_SECONDS],
  ])('always leaves a %s link at least half its lifetime', (_name, ttl) => {
    const window = signingWindowFor(ttl);
    expect(window).toBeLessThanOrEqual(ttl / 2);
    expect(ttl - window).toBeGreaterThanOrEqual(ttl / 2);
  });

  it('gives a display link at least six hours when it arrives', () => {
    const left = DISPLAY_URL_TTL_SECONDS - signingWindowFor(DISPLAY_URL_TTL_SECONDS);
    expect(left).toBeGreaterThanOrEqual(6 * 60 * 60);
  });
});

describe('StorageConfig bucket routing', () => {
  function config(): StorageConfig {
    const values: Record<string, string> = {
      B2_BUCKET_NAME: 'virgo-public',
      B2_MEDIA_BUCKET_NAME: 'virgo-media',
    };
    return new StorageConfig({
      get: (key: string, fallback?: string) => values[key] ?? fallback,
    } as unknown as ConfigService);
  }

  it('keeps covers in the public bucket beside avatars, and everything else private', () => {
    // A cover is stored as a whole URL in users.cover_url, which has to keep
    // resolving. The HEAD at confirm, the re-encode and every delete all go
    // through this, so a cover routed privately would be looked for, and
    // deleted from, the wrong bucket.
    const storage = config();
    expect(storage.bucketForKey('users/u1/covers/2026/09/x.jpg')).toBe('virgo-public');
    expect(storage.bucketForKey('users/u1/avatars/2026/09/x.jpg')).toBe('virgo-public');
    expect(storage.bucketForKey('users/u1/albums/2026/09/x.jpg')).toBe('virgo-media');
    expect(storage.bucketForScope('covers')).toBe('virgo-public');
    expect(storage.bucketForScope('avatars')).toBe('virgo-public');
    expect(storage.bucketForScope('albums')).toBe('virgo-media');
  });

  it('tells a cover from an avatar, and both from the rest', () => {
    const storage = config();
    expect(storage.isCoverKey('users/u1/covers/2026/09/x.jpg')).toBe(true);
    expect(storage.isCoverKey('users/u1/avatars/2026/09/x.jpg')).toBe(false);
    expect(storage.isAvatarKey('users/u1/covers/2026/09/x.jpg')).toBe(false);
    expect(storage.isPublicKey('users/u1/covers/2026/09/x.jpg')).toBe(true);
    expect(storage.isPublicKey('users/u1/avatars/2026/09/x.jpg')).toBe(true);
    expect(storage.isPublicKey('users/u1/albums/2026/09/x.jpg')).toBe(false);
  });

  it('accepts covers as a scope', () => {
    expect(UPLOAD_SCOPES).toContain('covers');
  });
});
