import { posterKeyFor } from './media-processing.service';

describe('media processing keys', () => {
  it('places posters beside their source without changing the ownership prefix', () => {
    expect(posterKeyFor('users/u/albums/2026/08/clip.mov')).toBe(
      'users/u/albums/2026/08/clip-poster.webp',
    );
  });
});
