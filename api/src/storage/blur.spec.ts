import sharp from 'sharp';
import { blurDataUrl } from './blur';

/** A recognisable source: red on the left half, blue on the right. */
async function swatch(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 30, b: 30 } },
  })
    .composite([
      {
        input: await sharp({
          create: {
            width: Math.max(1, Math.floor(width / 2)),
            height,
            channels: 3,
            background: { r: 30, g: 30, b: 200 },
          },
        })
          .png()
          .toBuffer(),
        left: Math.max(0, Math.floor(width / 2)),
        top: 0,
      },
    ])
    .jpeg()
    .toBuffer();
}

describe('blurDataUrl', () => {
  it('produces a WebP data URI', async () => {
    const url = await blurDataUrl(await swatch(1200, 800));
    expect(url).toMatch(/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/);
  });

  it('stays small enough to ride in a listing of hundreds', async () => {
    // The whole point is that it costs no request. A preview that bloated the
    // album response would have traded one problem for another: a two-hundred
    // photograph gallery carries two hundred of these.
    const url = await blurDataUrl(await swatch(4000, 3000));
    expect(url!.length).toBeLessThan(1400);
  });

  it('really is tiny — twenty pixels on the long edge', async () => {
    const url = await blurDataUrl(await swatch(1200, 800));
    const meta = await sharp(Buffer.from(url!.split(',')[1], 'base64')).metadata();
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(20);
  });

  it('keeps the source aspect, so the preview is not a stretched smear', async () => {
    const url = await blurDataUrl(await swatch(800, 1600));
    const meta = await sharp(Buffer.from(url!.split(',')[1], 'base64')).metadata();
    expect(meta.height!).toBeGreaterThan(meta.width!);
  });

  it('never enlarges a source already smaller than the cap', async () => {
    const url = await blurDataUrl(await swatch(8, 6));
    const meta = await sharp(Buffer.from(url!.split(',')[1], 'base64')).metadata();
    expect(meta.width).toBe(8);
    expect(meta.height).toBe(6);
  });

  it('returns null rather than throwing on something undecodable', async () => {
    // It runs inside the confirm path, next to work that matters more. A
    // missing preview costs a grey box for a moment; a thrown one would cost
    // the upload.
    await expect(blurDataUrl(Buffer.from('not an image at all'))).resolves.toBeNull();
    await expect(blurDataUrl(Buffer.alloc(0))).resolves.toBeNull();
  });
});
