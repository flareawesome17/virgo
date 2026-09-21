import { Readable } from 'node:stream';
import type { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import type { DatabaseService } from '../database/database.service';
import {
  DISPLAY_WIDTHS,
  MediaLinkService,
  displayKeyFor,
  renditionKeysFor,
} from './media-link.service';
import type { StorageService } from './storage.service';
import { ThumbnailsService, thumbKeyFor } from './thumbnails.service';

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

describe('ThumbnailsService.generate', () => {
  const KEY = 'users/u/albums/2026/08/frame.jpg';
  // Stated rather than measured, so the "smaller than the original" guards
  // pass for a flat test image that compresses to almost nothing.
  const SIZE = 8 * 1024 * 1024;

  /** Wide enough to earn every display width. */
  function photograph(): Promise<Buffer> {
    return sharp({
      create: { width: 2400, height: 1600, channels: 3, background: { r: 180, g: 120, b: 90 } },
    })
      .jpeg()
      .toBuffer();
  }

  function harness(source: Buffer) {
    const putDerived = jest.fn().mockResolvedValue(undefined);
    const write = jest.fn().mockResolvedValue(undefined);
    const query = jest.fn().mockResolvedValue([]);
    const service = new ThumbnailsService(
      { readStream: async () => Readable.from([source]), putDerived } as unknown as StorageService,
      { query } as unknown as DatabaseService,
      { isConfigured: true, write } as unknown as MediaLinkService,
    );
    /** The statement that records the outcome, and its parameters. */
    const recorded = () => {
      const [sql, params] = query.mock.calls.at(-1) as [string, unknown[]];
      const [, thumbKey, width, height, displayWidths, blur] = params;
      return { sql, thumbKey, width, height, displayWidths, blur };
    };
    return { service, putDerived, write, recorded };
  }

  it('makes the thumbnail, the display copies and the preview for a new upload', async () => {
    const { service, putDerived, write, recorded } = harness(await photograph());

    await expect(service.generate(KEY, 'image/jpeg', SIZE)).resolves.toBe(thumbKeyFor(KEY));

    expect(putDerived).toHaveBeenCalledWith(thumbKeyFor(KEY), expect.any(Buffer), 'image/webp');
    expect(write.mock.calls.map(([key]) => key)).toEqual(
      DISPLAY_WIDTHS.map((width) => displayKeyFor(KEY, width)),
    );
    const row = recorded();
    expect(row.thumbKey).toBe(thumbKeyFor(KEY));
    expect([row.width, row.height]).toEqual([2400, 1600]);
    expect(row.displayWidths).toEqual([...DISPLAY_WIDTHS]);
    expect(row.blur).toMatch(/^data:image\/webp;base64,/);
  });

  it('keeps a thumbnail the row already has', async () => {
    const { service, putDerived, write, recorded } = harness(await photograph());

    await service.generate(KEY, 'image/jpeg', SIZE, { thumbKey: thumbKeyFor(KEY) });

    expect(putDerived).not.toHaveBeenCalled();
    expect(recorded().thumbKey).toBeNull();
    expect(recorded().sql).toContain('thumb_key = coalesce($2, thumb_key)');
    // Everything else is still made from the read that had to happen anyway.
    expect(write).toHaveBeenCalledTimes(DISPLAY_WIDTHS.length);
    expect(recorded().blur).toMatch(/^data:image\/webp;base64,/);
  });

  it('keeps display copies the row already has', async () => {
    // Recording an empty list here would hand the clients no srcset for
    // copies that are sitting on the volume.
    const { service, write, recorded } = harness(await photograph());

    await service.generate(KEY, 'image/jpeg', SIZE, { displayWidths: [...DISPLAY_WIDTHS] });

    expect(write).not.toHaveBeenCalled();
    expect(recorded().displayWidths).toBeNull();
    expect(recorded().sql).toContain('display_widths = coalesce($5, display_widths)');
  });

  it('tries display copies again when the recorded list is empty', async () => {
    // What a photograph confirmed before the media host was configured was
    // left with, and indistinguishable from "too small for any".
    const { service, write, recorded } = harness(await photograph());

    await service.generate(KEY, 'image/jpeg', SIZE, { displayWidths: [] });

    expect(write).toHaveBeenCalledTimes(DISPLAY_WIDTHS.length);
    expect(recorded().displayWidths).toEqual([...DISPLAY_WIDTHS]);
  });

  it('keeps a preview the row already has', async () => {
    const { service, recorded } = harness(await photograph());

    await service.generate(KEY, 'image/jpeg', SIZE, { blurDataUrl: 'data:image/webp;base64,AAAA' });

    expect(recorded().blur).toBeNull();
    expect(recorded().sql).toContain('blur_data_url = coalesce($6, blur_data_url)');
  });

  it('records a source it cannot decode as failed, without throwing', async () => {
    // The backfill tells a failure apart by this status, and sorts those rows
    // behind the ones it has not tried yet.
    const { service, putDerived, write, recorded } = harness(Buffer.from('not an image at all'));

    await expect(service.generate(KEY, 'image/jpeg', SIZE)).resolves.toBeNull();

    expect(putDerived).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(recorded().sql).toContain(`processing_status = 'failed'`);
  });
});
