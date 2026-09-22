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
import { MAX_COVER_BYTES } from './storage.config';
import {
  animatesThumbnail,
  MAX_SOURCE_BYTES,
  ThumbnailsService,
  thumbKeyFor,
} from './thumbnails.service';

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

/** Wide enough to earn every display width. */
function photograph(): Promise<Buffer> {
  return sharp({
    create: { width: 2400, height: 1600, channels: 3, background: { r: 180, g: 120, b: 90 } },
  })
    .jpeg()
    .toBuffer();
}

/** Three frames, each 1200 x 800: a GIF that moves. */
async function animation(): Promise<Buffer> {
  const frame = (r: number, g: number, b: number) =>
    sharp({ create: { width: 1200, height: 800, channels: 3, background: { r, g, b } } })
      .png()
      .toBuffer();
  const frames = [await frame(255, 0, 0), await frame(0, 255, 0), await frame(0, 0, 255)];
  return sharp(frames, { join: { animated: true } })
    .gif({ delay: [200, 200, 200], loop: 0 })
    .toBuffer();
}

/**
 * A GIF of `frames` tiny frames, the shape of the ones that cost minutes.
 *
 * Built as one tall strip with a page per frame, alternating colour so the
 * encoder cannot merge a frame into its neighbour.
 */
function flicker(frames: number, edge = 16): Promise<Buffer> {
  const raw = Buffer.alloc(edge * edge * 3 * frames);
  for (let frame = 0; frame < frames; frame++) {
    const [r, g, b] = frame % 2 ? [250, 20, 20] : [20, 20, 250];
    for (let pixel = 0; pixel < edge * edge; pixel++) {
      const at = (frame * edge * edge + pixel) * 3;
      raw[at] = r;
      raw[at + 1] = g;
      raw[at + 2] = b;
    }
  }
  return sharp(raw, {
    raw: { width: edge, height: edge * frames, channels: 3, pageHeight: edge },
  })
    .gif({ delay: 20, loop: 0 })
    .toBuffer();
}

/**
 * A camera JPEG as a phone would upload it: a make, a copyright and a
 * position, all of which must be gone from anything the public is served.
 */
function withCameraMetadata(): Promise<Buffer> {
  return sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#888888' } })
    .jpeg()
    .withExif({
      IFD0: { Make: 'SecretCam', Copyright: 'Secret' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '14/1 35/1 0/1' },
    })
    .toBuffer();
}

/**
 * The service over one stored object, with the bucket, the database and the
 * media volume faked. `stored` is the row a normalise reads first.
 */
function harness(source: Buffer, stored: Record<string, unknown> | null = null) {
  const putDerived = jest.fn().mockResolvedValue(undefined);
  const write = jest.fn().mockResolvedValue(undefined);
  const readStream = jest.fn(async () => Readable.from([source]));
  const readHead = jest.fn(async () => Buffer.alloc(0));
  const query = jest.fn().mockResolvedValue([]);
  const queryOne = jest.fn().mockResolvedValue(stored);
  const service = new ThumbnailsService(
    { readStream, readHead, putDerived } as unknown as StorageService,
    { query, queryOne } as unknown as DatabaseService,
    { isConfigured: true, write } as unknown as MediaLinkService,
  );
  /** The statement that records the outcome, and its parameters. */
  const recorded = () => {
    const [sql, params] = query.mock.calls.at(-1) as [string, unknown[]];
    const [, thumbKey, width, height, displayWidths, blur] = params;
    return { sql, thumbKey, width, height, displayWidths, blur, params };
  };
  /** The bytes of the one object written back. */
  const written = (): Buffer => putDerived.mock.calls.at(-1)?.[1] as Buffer;
  return { service, putDerived, write, readStream, query, queryOne, recorded, written };
}

describe('ThumbnailsService.generate', () => {
  const KEY = 'users/u/albums/2026/08/frame.jpg';
  // Stated rather than measured, so the display copies' "smaller than the
  // original" guard passes for a flat test image that compresses to almost
  // nothing.
  const SIZE = 8 * 1024 * 1024;

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

  it('writes the thumbnail even when it is no smaller than the original', async () => {
    // It used to be skipped then, and a photograph without one is left off a
    // public profile. The display copies keep the guard: they only save
    // bandwidth, and here they would not.
    const { service, putDerived, write, recorded } = harness(await photograph());

    await expect(service.generate(KEY, 'image/jpeg', 10)).resolves.toBe(thumbKeyFor(KEY));

    expect(putDerived).toHaveBeenCalledWith(thumbKeyFor(KEY), expect.any(Buffer), 'image/webp');
    expect(write).not.toHaveBeenCalled();
    expect(recorded().displayWidths).toEqual([]);
  });

  it('gives a GIF an animated thumbnail, and no display copies', async () => {
    const gif = 'users/u/albums/2026/08/loop.gif';
    const { service, write, written, recorded } = harness(await animation());

    await expect(service.generate(gif, 'image/gif', SIZE)).resolves.toBe(thumbKeyFor(gif));

    const thumbnail = await sharp(written(), { animated: true }).metadata();
    expect(thumbnail.format).toBe('webp');
    expect(thumbnail.pages).toBeGreaterThan(1);
    expect([thumbnail.width, thumbnail.pageHeight]).toEqual([640, 427]);
    expect(write).not.toHaveBeenCalled();
    expect(recorded().displayWidths).toEqual([]);
    expect([recorded().width, recorded().height]).toEqual([1200, 800]);
  });

  it('keeps the motion of a GIF up to the frame cap', async () => {
    const gif = 'users/u/albums/2026/08/three-hundred.gif';
    const { service, written } = harness(await flicker(300));

    await expect(service.generate(gif, 'image/gif', SIZE)).resolves.toBe(thumbKeyFor(gif));

    const thumbnail = await sharp(written(), { animated: true }).metadata();
    expect(thumbnail.pages).toBe(300);
  });

  it('stills a GIF with more frames than that, without decoding them', async () => {
    // Measured on this sharp before the cap: 30,000 tiny frames took ten
    // seconds of a confirm, 60,000 took fifty, and 100,000 took four and a
    // half minutes — for a 2.5 MB upload. The still is cut from the first
    // frame, so none of the rest is decoded at all, and it still describes
    // the whole picture: the recorded size is the GIF's own canvas.
    const gif = 'users/u/albums/2026/08/flicker.gif';
    const { service, written, recorded, write } = harness(await flicker(301));

    await expect(service.generate(gif, 'image/gif', SIZE)).resolves.toBe(thumbKeyFor(gif));

    const thumbnail = await sharp(written(), { animated: true }).metadata();
    expect(thumbnail.format).toBe('webp');
    expect(thumbnail.pages ?? 1).toBe(1);
    expect([recorded().width, recorded().height]).toEqual([16, 16]);
    expect(recorded().blur).toMatch(/^data:image\/webp;base64,/);
    // A GIF never gets display copies, moving or not.
    expect(write).not.toHaveBeenCalled();
    expect(recorded().displayWidths).toEqual([]);
  });

  it('leaves a source over the ceiling unread, unless told it may go higher', async () => {
    // The portfolio backfill raises it: one file at a time in a container of
    // its own, rather than on a serving API's confirm path.
    const over = MAX_SOURCE_BYTES + 1;
    const skipped = harness(await photograph());
    await expect(skipped.service.generate(KEY, 'image/jpeg', over)).resolves.toBeNull();
    expect(skipped.readStream).not.toHaveBeenCalled();
    expect(skipped.putDerived).not.toHaveBeenCalled();

    const raised = harness(await photograph());
    await expect(
      raised.service.generate(KEY, 'image/jpeg', over, {}, { maxSourceBytes: 256 * 1024 * 1024 }),
    ).resolves.toBe(thumbKeyFor(KEY));
    expect(raised.readStream).toHaveBeenCalledTimes(1);
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

/**
 * The rule the two caps make, on numbers rather than on files: a GIF of the
 * shape the pixel cap exists for is gigabytes of fixture.
 */
describe('animatesThumbnail', () => {
  it('moves only for a GIF small enough to decode whole', () => {
    expect(animatesThumbnail({ pages: 3, width: 1200, height: 800 })).toBe(true);
    expect(animatesThumbnail({ pages: 300, width: 16, height: 16 })).toBe(true);
    expect(animatesThumbnail({ pages: 301, width: 16, height: 16 })).toBe(false);
    // Twenty-six frames of 2000 x 2000 is 104 megapixels: inside the frame
    // cap, past the pixel one.
    expect(animatesThumbnail({ pages: 25, width: 2000, height: 2000 })).toBe(true);
    expect(animatesThumbnail({ pages: 26, width: 2000, height: 2000 })).toBe(false);
    // A GIF of one frame is a still, and a size sharp did not report cannot
    // be checked against either cap.
    expect(animatesThumbnail({ pages: 1, width: 640, height: 480 })).toBe(false);
    expect(animatesThumbnail({ pages: 3 })).toBe(false);
    expect(animatesThumbnail({})).toBe(false);
  });
});

/**
 * A confirm the app sends twice.
 *
 * It waits for the thumbnail, so an app that gives up on a slow one and tries
 * again would have the same original read out of B2 and decoded a second
 * time — and that one is no faster.
 */
describe('ThumbnailsService.generateOnce', () => {
  const KEY = 'users/u/albums/2026/08/frame.jpg';
  const SIZE = 8 * 1024 * 1024;

  it('leaves a photograph that has been through this alone', async () => {
    const { service, readStream, putDerived, query } = harness(await photograph(), {
      thumb_key: thumbKeyFor(KEY),
      processing_status: 'ready',
    });

    await expect(service.generateOnce(KEY, 'image/jpeg', SIZE)).resolves.toBe(thumbKeyFor(KEY));

    expect(readStream).not.toHaveBeenCalled();
    expect(putDerived).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    ['nothing made yet', { thumb_key: null, processing_status: 'pending' }],
    ['no thumbnail, though it has been tried', { thumb_key: null, processing_status: 'ready' }],
    ['a thumbnail, but not finished', { thumb_key: thumbKeyFor(KEY), processing_status: 'pending' }],
    ['no row at all yet', null],
  ])('makes one when the row says %s', async (_case, row) => {
    const { service, readStream, putDerived } = harness(await photograph(), row);

    await expect(service.generateOnce(KEY, 'image/jpeg', SIZE)).resolves.toBe(thumbKeyFor(KEY));

    expect(readStream).toHaveBeenCalledTimes(1);
    expect(putDerived).toHaveBeenCalledTimes(1);
  });

  it('makes one when the row cannot be read, as it did before there was a check', async () => {
    const { service, queryOne, readStream } = harness(await photograph());
    queryOne.mockRejectedValue(new Error('database unreachable'));

    await expect(service.generateOnce(KEY, 'image/jpeg', SIZE)).resolves.toBe(thumbKeyFor(KEY));
    expect(readStream).toHaveBeenCalledTimes(1);
  });

  it('shares the one already running with a confirm that arrives during it', async () => {
    const { service, readStream, putDerived } = harness(await photograph());

    const both = await Promise.all([
      service.generateOnce(KEY, 'image/jpeg', SIZE),
      service.generateOnce(KEY, 'image/jpeg', SIZE),
    ]);

    expect(both).toEqual([thumbKeyFor(KEY), thumbKeyFor(KEY)]);
    expect(readStream).toHaveBeenCalledTimes(1);
    expect(putDerived).toHaveBeenCalledTimes(1);
  });

  it('lets the next one through once that has finished', async () => {
    // Nothing is remembered beyond the request: a file whose row still has no
    // thumbnail is tried again next time.
    const { service, readStream } = harness(await photograph());

    await service.generateOnce(KEY, 'image/jpeg', SIZE);
    await service.generateOnce(KEY, 'image/jpeg', SIZE);

    expect(readStream).toHaveBeenCalledTimes(2);
  });
});

describe('ThumbnailsService.normaliseCover', () => {
  const KEY = 'users/u/covers/2026/09/cover.jpg';

  it('always rewrites, even when the WebP is larger, and records what it wrote', async () => {
    // The re-encode is what drops the camera's EXIF and GPS, so "not
    // smaller" is no reason to leave an original at a public URL.
    const { service, putDerived, query, written } = harness(await photograph());

    const result = await service.normaliseCover(KEY, 'image/jpeg', 10);

    expect(putDerived).toHaveBeenCalledWith(KEY, expect.any(Buffer), 'image/webp');
    const body = written();
    expect(result).toEqual({ size: body.length, contentType: 'image/webp', width: 2048, height: 1365 });
    // Type and dimensions in one statement: setCover reads them together.
    const [sql, params] = query.mock.calls.at(-1) as [string, unknown[]];
    expect(sql).toMatch(/set size_bytes = \$2, content_type = \$3, width_px = \$4, height_px = \$5/);
    expect(params).toEqual([KEY, body.length, 'image/webp', 2048, 1365]);
  });

  it('declines garbage, an oversized file and a GIF without writing anything', async () => {
    const garbage = harness(Buffer.from('not an image at all'));
    await expect(garbage.service.normaliseCover(KEY, 'image/jpeg', 100)).resolves.toBeNull();
    expect(garbage.putDerived).not.toHaveBeenCalled();

    const large = harness(await photograph());
    await expect(
      large.service.normaliseCover(KEY, 'image/jpeg', MAX_COVER_BYTES + 1),
    ).resolves.toBeNull();
    expect(large.readStream).not.toHaveBeenCalled();

    const gif = harness(await animation());
    await expect(gif.service.normaliseCover(KEY, 'image/gif', 100)).resolves.toBeNull();
    expect(gif.readStream).not.toHaveBeenCalled();
    expect(gif.putDerived).not.toHaveBeenCalled();
  });

  it('refuses to decode more than fifty megapixels', async () => {
    // A small file can claim a canvas that fills the container's memory.
    // The controller deletes whatever this declines.
    const huge = await sharp({
      create: { width: 10_000, height: 5_001, channels: 3, background: '#808080' },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    const { service, putDerived } = harness(huge);

    await expect(service.normaliseCover(KEY, 'image/png', huge.length)).resolves.toBeNull();
    expect(putDerived).not.toHaveBeenCalled();
  });

  it('returns what an earlier confirm stored rather than encoding it again', async () => {
    // A repeated confirm must not rewrite a key a cache may already hold.
    const { service, readStream, putDerived } = harness(await photograph(), {
      content_type: 'image/webp',
      width_px: 2048,
      height_px: 1024,
      size_bytes: '123456',
    });

    await expect(service.normaliseCover(KEY, 'image/webp', 123_456)).resolves.toEqual({
      size: 123_456,
      contentType: 'image/webp',
      width: 2048,
      height: 1024,
    });
    expect(readStream).not.toHaveBeenCalled();
    expect(putDerived).not.toHaveBeenCalled();
  });

  it('still normalises a row that only claims to be WebP', async () => {
    // A client may declare image/webp for anything. The dimensions stay null
    // until a normalise writes them, and that is what marks one as done.
    const { service, putDerived } = harness(await photograph(), {
      content_type: 'image/webp',
      width_px: null,
      height_px: null,
      size_bytes: '5000',
    });

    await service.normaliseCover(KEY, 'image/webp', 5_000);

    expect(putDerived).toHaveBeenCalledTimes(1);
  });
});

describe('ThumbnailsService.normaliseAvatar', () => {
  const KEY = 'users/u/avatars/2026/09/me.jpg';

  it('rewrites even when the WebP is not smaller, with its dimensions', async () => {
    // The skip that used to happen here is what left a camera's EXIF on a
    // picture shown on every public profile.
    const { service, putDerived, query, written } = harness(await photograph());

    const result = await service.normaliseAvatar(KEY, 'image/jpeg', 10);

    expect(putDerived).toHaveBeenCalledWith(KEY, expect.any(Buffer), 'image/webp');
    expect(result).toEqual({ size: written().length, contentType: 'image/webp' });
    const [, params] = query.mock.calls.at(-1) as [string, unknown[]];
    expect(params).toEqual([KEY, written().length, 'image/webp', 512, 341]);
  });

  it('returns a row an earlier confirm normalised without reading it', async () => {
    const { service, readStream, putDerived } = harness(await photograph(), {
      content_type: 'image/webp',
      width_px: 512,
      height_px: 512,
      size_bytes: 20_000,
    });

    await expect(service.normaliseAvatar(KEY, 'image/webp', 20_000)).resolves.toEqual({
      size: 20_000,
      contentType: 'image/webp',
    });
    expect(readStream).not.toHaveBeenCalled();
    expect(putDerived).not.toHaveBeenCalled();
  });

  it('declines what it cannot decode, for the controller to delete', async () => {
    const { service, putDerived } = harness(Buffer.from('not an image at all'));

    await expect(service.normaliseAvatar(KEY, 'image/jpeg', 100)).resolves.toBeNull();
    expect(putDerived).not.toHaveBeenCalled();
  });
});

/**
 * The guarantee the public profile rests on, with real sharp: nothing served
 * in place of an original carries its metadata.
 *
 * The other specs here use flat images and never look inside what was
 * written. This one uploads a JPEG carrying a camera make, a copyright and a
 * GPS position, and reads every copy back.
 */
describe('What a public copy keeps of the camera file', () => {
  async function expectClean(body: Buffer): Promise<void> {
    const meta = await sharp(body, { animated: true }).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.iptc).toBeUndefined();
  }

  it('starts from a source that really does carry it', async () => {
    expect((await sharp(await withCameraMetadata()).metadata()).exif).toBeDefined();
  });

  it('is nothing, in the thumbnail', async () => {
    const { service, written } = harness(await withCameraMetadata());
    await service.generate('users/u/albums/2026/09/shot.jpg', 'image/jpeg', 8 * 1024 * 1024);
    await expectClean(written());
  });

  it('is nothing, in the display copies', async () => {
    // Strangers get these too: as displaySources on a profile, and as the
    // photograph itself in the gallery a portfolio album card opens.
    const { service, write } = harness(await withCameraMetadata());
    await service.generate('users/u/albums/2026/09/shot.jpg', 'image/jpeg', 8 * 1024 * 1024);
    expect(write).toHaveBeenCalledTimes(DISPLAY_WIDTHS.length);
    for (const [, body] of write.mock.calls) await expectClean(body as Buffer);
  });

  it('is nothing, in a normalised cover', async () => {
    const { service, written } = harness(await withCameraMetadata());
    await service.normaliseCover('users/u/covers/2026/09/shot.jpg', 'image/jpeg', 10);
    await expectClean(written());
  });

  it('is nothing, in a normalised avatar', async () => {
    const { service, written } = harness(await withCameraMetadata());
    await service.normaliseAvatar('users/u/avatars/2026/09/shot.jpg', 'image/jpeg', 10);
    await expectClean(written());
  });

  it("is nothing, in a GIF's animated thumbnail", async () => {
    const { service, written } = harness(await animation());
    await service.generate('users/u/albums/2026/09/loop.gif', 'image/gif', 8 * 1024 * 1024);
    await expectClean(written());
  });
});
