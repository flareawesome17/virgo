import sharp from 'sharp';
import { isHeifType, jpegName, tiffFromExif, uprightTiff, withJpegMetadata } from './jpeg-metadata';

/** A TIFF block whose first directory holds one tag: orientation. */
function tiffWithOrientation(value: number, little = true): Buffer {
  const b = Buffer.alloc(8 + 2 + 12 + 4);
  if (little) {
    b.write('II', 0, 'latin1');
    b.writeUInt16LE(42, 2);
    b.writeUInt32LE(8, 4);
    b.writeUInt16LE(1, 8);
    b.writeUInt16LE(0x0112, 10);
    b.writeUInt16LE(3, 12);
    b.writeUInt32LE(1, 14);
    b.writeUInt16LE(value, 18);
  } else {
    b.write('MM', 0, 'latin1');
    b.writeUInt16BE(42, 2);
    b.writeUInt32BE(8, 4);
    b.writeUInt16BE(1, 8);
    b.writeUInt16BE(0x0112, 10);
    b.writeUInt16BE(3, 12);
    b.writeUInt32BE(1, 14);
    b.writeUInt16BE(value, 18);
  }
  return b;
}

/** A small JPEG with no metadata, as the converter's encode makes one. */
function plainJpeg(): Promise<Buffer> {
  return sharp({ create: { width: 48, height: 32, channels: 3, background: { r: 200, g: 40, b: 90 } } })
    .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
    .toBuffer();
}

/** The Display P3 profile sharp ships, as raw bytes. */
async function p3Profile(): Promise<Buffer> {
  const tagged = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#808080' } })
    .withIccProfile('p3')
    .jpeg()
    .toBuffer();
  const { icc } = await sharp(tagged).metadata();
  if (!icc) throw new Error('sharp gave no P3 profile');
  return icc;
}

/** Everything from the first non-application segment on: the image itself. */
function imageData(jpeg: Buffer): Buffer {
  let at = 2;
  while (jpeg[at] === 0xff && ((jpeg[at + 1] >= 0xe0 && jpeg[at + 1] <= 0xef) || jpeg[at + 1] === 0xfe)) {
    at += 2 + jpeg.readUInt16BE(at + 2);
  }
  return jpeg.subarray(at);
}

describe('tiffFromExif', () => {
  const tiff = tiffWithOrientation(6);

  it('finds the TIFF header bare, after "Exif\\0\\0", and after HEIF\'s offset as well', () => {
    expect(tiffFromExif(tiff)).toEqual(tiff);
    expect(tiffFromExif(Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]))).toEqual(tiff);
    const heifItem = Buffer.concat([Buffer.from([0, 0, 0, 6]), Buffer.from('Exif\0\0', 'latin1'), tiff]);
    expect(tiffFromExif(heifItem)).toEqual(tiff);
    expect(tiffFromExif(tiffWithOrientation(6, false))).toEqual(tiffWithOrientation(6, false));
  });

  it('gives nothing for a block with no TIFF header near its start', () => {
    expect(tiffFromExif(Buffer.alloc(64, 7))).toBeNull();
    expect(tiffFromExif(null)).toBeNull();
    expect(tiffFromExif(Buffer.from('II*'))).toBeNull();
  });
});

describe('uprightTiff', () => {
  it('sets a camera\'s rotation to upright, in either byte order, and leaves the input alone', () => {
    for (const little of [true, false]) {
      const rotated = tiffWithOrientation(6, little);
      const upright = uprightTiff(rotated);
      expect(upright).not.toBeNull();
      const read = little ? upright!.readUInt16LE(18) : upright!.readUInt16BE(18);
      expect(read).toBe(1);
      expect(little ? rotated.readUInt16LE(18) : rotated.readUInt16BE(18)).toBe(6);
    }
  });

  it('keeps a block that has no orientation as it is', () => {
    const noOrientation = tiffWithOrientation(6);
    noOrientation.writeUInt16LE(0x010f, 10); // Make, not orientation
    expect(uprightTiff(noOrientation)).toEqual(noOrientation);
  });

  it('refuses a directory that runs off the end rather than half-patching it', () => {
    const broken = tiffWithOrientation(6);
    broken.writeUInt16LE(40, 8); // claims forty entries
    expect(uprightTiff(broken)).toBeNull();
    const badOffset = tiffWithOrientation(6);
    badOffset.writeUInt32LE(5000, 4);
    expect(uprightTiff(badOffset)).toBeNull();
  });
});

describe('withJpegMetadata', () => {
  it('writes a colour profile and an upright EXIF that sharp reads back, without touching the image', async () => {
    const jpeg = await plainJpeg();
    const icc = await p3Profile();
    const tiff = uprightTiff(tiffWithOrientation(6))!;

    const out = withJpegMetadata(jpeg, { tiff, icc });
    const meta = await sharp(out).metadata();

    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(48);
    expect(meta.height).toBe(32);
    expect(meta.orientation).toBe(1);
    expect(meta.icc).toEqual(icc);
    expect(meta.chromaSubsampling).toBe('4:4:4');
    expect(imageData(out)).toEqual(imageData(jpeg));
  });

  it('splits a large profile across numbered APP2 chunks that reassemble to it', async () => {
    const jpeg = await plainJpeg();
    const icc = Buffer.alloc(150_000);
    for (let i = 0; i < icc.length; i++) icc[i] = (i * 7) % 251;

    const out = withJpegMetadata(jpeg, { icc });
    const chunks: Buffer[] = [];
    let at = 2;
    while (out[at] === 0xff && out[at + 1] >= 0xe0 && out[at + 1] <= 0xef) {
      const length = out.readUInt16BE(at + 2);
      if (out[at + 1] === 0xe2) {
        const payload = out.subarray(at + 4, at + 2 + length);
        expect(payload.subarray(0, 12).toString('latin1')).toBe('ICC_PROFILE\0');
        expect(payload[12]).toBe(chunks.length + 1);
        expect(payload[13]).toBe(3);
        chunks.push(payload.subarray(14));
      }
      at += 2 + length;
    }
    expect(chunks).toHaveLength(3);
    expect(Buffer.concat(chunks)).toEqual(icc);
  });

  it('leaves out EXIF too large for one segment instead of cutting it short', async () => {
    const jpeg = await plainJpeg();
    const huge = Buffer.concat([tiffWithOrientation(1), Buffer.alloc(70_000)]);
    const out = withJpegMetadata(jpeg, { tiff: huge });
    expect((await sharp(out).metadata()).exif).toBeUndefined();
    expect(imageData(out)).toEqual(imageData(jpeg));
  });

  it('replaces the encoder\'s own JFIF and any earlier profile, keeping one of each', async () => {
    const jpeg = await plainJpeg();
    const icc = await p3Profile();
    const once = withJpegMetadata(jpeg, { tiff: tiffWithOrientation(1), icc });
    const twice = withJpegMetadata(once, { tiff: tiffWithOrientation(1), icc });
    expect(twice).toEqual(once);
  });

  it('refuses anything that is not a JPEG', () => {
    expect(() => withJpegMetadata(Buffer.from('not a jpeg at all'), {})).toThrow(/Not a JPEG/);
  });
});

describe('jpegName', () => {
  it('turns a HEIF name into the JPEG one, keeping the stem', () => {
    expect(jpegName('IMG_1234.HEIC')).toBe('IMG_1234.jpg');
    expect(jpegName('beach.heif')).toBe('beach.jpg');
    expect(jpegName('DSC_0001.HIF')).toBe('DSC_0001.jpg');
    expect(jpegName('a.b.heic')).toBe('a.b.jpg');
  });

  it('never gives a JPEG a HEIF name or no extension at all', () => {
    expect(jpegName('photo')).toBe('photo.jpg');
    expect(jpegName('already.jpg')).toBe('already.jpg');
    expect(jpegName('already.JPEG')).toBe('already.JPEG');
    expect(jpegName('   ')).toBe('photo.jpg');
  });
});

describe('isHeifType', () => {
  it('is HEIC and HEIF only', () => {
    expect(isHeifType('image/heic')).toBe(true);
    expect(isHeifType('image/heif')).toBe(true);
    expect(isHeifType('image/jpeg')).toBe(false);
    expect(isHeifType('image/avif')).toBe(false);
    expect(isHeifType(null)).toBe(false);
  });
});
