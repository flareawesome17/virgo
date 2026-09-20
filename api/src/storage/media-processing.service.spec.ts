import { proxyKeyFor } from './media-link.service';
import { posterKeyFor, proxyScale } from './media-processing.service';

describe('media processing keys', () => {
  it('places posters beside their source without changing the ownership prefix', () => {
    expect(posterKeyFor('users/u/albums/2026/08/clip.mov')).toBe(
      'users/u/albums/2026/08/clip-poster.webp',
    );
  });

  it('places proxies beside their source without changing the ownership prefix', () => {
    expect(proxyKeyFor('users/u/albums/2026/08/clip.mov')).toBe(
      'users/u/albums/2026/08/clip-web.mp4',
    );
  });

  it('gives a proxy and its poster distinct keys', () => {
    const key = 'users/u/albums/2026/08/clip.mp4';
    expect(proxyKeyFor(key)).not.toBe(posterKeyFor(key));
  });
});

describe('proxyScale', () => {
  it('caps a landscape source on its long edge', () => {
    expect(proxyScale(1920, 1080)).toEqual({ width: 1280, height: 720 });
  });

  it('caps a PORTRAIT source on its long edge, not its width', () => {
    // The regression this exists for: capping width leaves a 1080x1920 phone
    // film at 1080x1920 — larger than the source it was meant to shrink.
    expect(proxyScale(1080, 1920)).toEqual({ width: 720, height: 1280 });
  });

  it('leaves a source smaller than the cap alone', () => {
    expect(proxyScale(640, 480)).toEqual({ width: 640, height: 480 });
  });

  it('always returns even dimensions, because libx264 refuses odd ones', () => {
    for (const [w, h] of [[1919, 1079], [1081, 1921], [999, 333], [3, 7]]) {
      const scaled = proxyScale(w, h);
      expect(scaled.width % 2).toBe(0);
      expect(scaled.height % 2).toBe(0);
    }
  });

  it('never returns a zero dimension for a very thin source', () => {
    // 2 is the floor: rounding 1280/8000 * 4 lands on 0 without it, and
    // ffmpeg fails the encode rather than clamping.
    const scaled = proxyScale(8000, 4);
    expect(scaled.width).toBeGreaterThanOrEqual(2);
    expect(scaled.height).toBeGreaterThanOrEqual(2);
  });
});
