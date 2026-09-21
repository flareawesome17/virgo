import {
  DISPLAY_URL_TTL_SECONDS,
  DISPLAY_URL_WINDOW_SECONDS,
  DOWNLOAD_URL_TTL_SECONDS,
  MEDIA_URL_WINDOW_SECONDS,
  PUBLISHED_URL_TTL_SECONDS,
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
