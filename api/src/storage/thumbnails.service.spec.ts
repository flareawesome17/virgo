import type { ConfigService } from '@nestjs/config';
import {
  DISPLAY_WIDTHS,
  MediaLinkService,
  displayKeyFor,
  renditionKeysFor,
} from './media-link.service';

function link(values: Record<string, string> = {}): MediaLinkService {
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

describe('displayKeyFor', () => {
  it('swaps the extension for the width and keeps the ownership prefix', () => {
    expect(displayKeyFor('users/u/albums/2026/08/frame.jpg', 1024)).toBe(
      'users/u/albums/2026/08/frame-1024.webp',
    );
  });

  it('gives every width a distinct key', () => {
    const keys = DISPLAY_WIDTHS.map((w) => displayKeyFor('users/u/a/frame.jpg', w));
    expect(new Set(keys).size).toBe(DISPLAY_WIDTHS.length);
  });

  it('cannot collide with the thumbnail or the proxy', () => {
    // All four conventions write beside the source with a `-suffix`, so a
    // collision here would silently overwrite one rendition with another.
    const key = 'users/u/a/frame.jpg';
    const all = [...renditionKeysFor(key), `${key.replace(/\.[^./]+$/, '')}-thumb.webp`];
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('renditionKeysFor', () => {
  it('names every rendition type, so deletion collects all of them', () => {
    const keys = renditionKeysFor('users/u/a/clip.mov');
    expect(keys).toContain('users/u/a/clip-web.mp4');
    for (const width of DISPLAY_WIDTHS) {
      expect(keys).toContain(`users/u/a/clip-${width}.webp`);
    }
  });
});

describe('MediaLinkService.displaySources', () => {
  it('signs only the widths that were actually written', () => {
    // The widths come from the database, not from DISPLAY_WIDTHS: a source
    // too small for 2048 never had one made, and signing it anyway hands the
    // client a URL that 404s.
    const sources = link(CONFIGURED).displaySources('users/u/a/frame.jpg', [1024]);
    expect(sources).toHaveLength(1);
    expect(sources[0].width).toBe(1024);
    expect(sources[0].url).toContain('/users/u/a/frame-1024.webp');
  });

  it('returns them narrowest first whatever order they arrive in', () => {
    const sources = link(CONFIGURED).displaySources('users/u/a/frame.jpg', [2048, 1024]);
    expect(sources.map((s) => s.width)).toEqual([1024, 2048]);
  });

  it('is empty for no widths, so the client falls back to the original', () => {
    expect(link(CONFIGURED).displaySources('users/u/a/frame.jpg', null)).toEqual([]);
    expect(link(CONFIGURED).displaySources('users/u/a/frame.jpg', [])).toEqual([]);
  });

  it('is empty when the media host is not configured', () => {
    expect(link().displaySources('users/u/a/frame.jpg', [1024, 2048])).toEqual([]);
  });
});
