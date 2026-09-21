import sharp from 'sharp';
import {
  parseWallClock,
  takenAtFromExif,
  takenAtFromHead,
  takenAtFromVideoTags,
  wallClockIn,
} from './capture-time';

const NOW = new Date('2026-09-21T04:00:00Z');

/**
 * A minimal EXIF TIFF block: IFD0 (optionally with DateTime) pointing at an
 * Exif IFD holding DateTimeOriginal and/or DateTimeDigitized.
 */
function exifBlock(opts: {
  little?: boolean;
  original?: string;
  digitized?: string;
  modified?: string;
  withPointer?: boolean;
}): Buffer {
  const little = opts.little ?? true;
  const ifd0: [number, string][] = [];
  if (opts.modified) ifd0.push([0x0132, opts.modified]);
  if (opts.withPointer !== false) ifd0.push([0x8769, 'PTR']);
  const exif: [number, string][] = [];
  if (opts.original) exif.push([0x9003, opts.original]);
  if (opts.digitized) exif.push([0x9004, opts.digitized]);

  const ifd0At = 8;
  const exifAt = ifd0At + 2 + ifd0.length * 12 + 4;
  let dataAt = exifAt + 2 + exif.length * 12 + 4;
  const buf = Buffer.alloc(dataAt + (ifd0.length + exif.length) * 20);
  const w16 = (value: number, at: number) =>
    little ? buf.writeUInt16LE(value, at) : buf.writeUInt16BE(value, at);
  const w32 = (value: number, at: number) =>
    little ? buf.writeUInt32LE(value, at) : buf.writeUInt32BE(value, at);

  buf.write(little ? 'II' : 'MM', 0, 'latin1');
  w16(42, 2);
  w32(ifd0At, 4);

  const writeIfd = (at: number, tags: [number, string][]) => {
    w16(tags.length, at);
    tags.forEach(([tag, value], i) => {
      const entry = at + 2 + i * 12;
      w16(tag, entry);
      if (value === 'PTR') {
        w16(4, entry + 2);
        w32(1, entry + 4);
        w32(exifAt, entry + 8);
      } else {
        w16(2, entry + 2);
        w32(20, entry + 4);
        w32(dataAt, entry + 8);
        buf.write(`${value}\0`, dataAt, 'latin1');
        dataAt += 20;
      }
    });
    w32(0, at + 2 + tags.length * 12);
  };
  writeIfd(ifd0At, ifd0);
  writeIfd(exifAt, exif);
  return buf;
}

/** SOI, a JFIF APP0, an APP1 holding `exif`, then EOI. */
function jpegAround(exif: Buffer): Buffer {
  const app0 = Buffer.from([
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00,
    0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  ]);
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), exif]);
  const app1 = Buffer.alloc(4);
  app1.writeUInt16BE(0xffe1, 0);
  app1.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    app0,
    app1,
    payload,
    Buffer.from([0xff, 0xd9]),
  ]);
}

describe('takenAtFromExif', () => {
  it('reads DateTimeOriginal from a little-endian block', () => {
    const block = exifBlock({ original: '2026:03:14 16:42:05' });
    expect(takenAtFromExif(block, NOW)).toBe('2026-03-14T16:42:05');
  });

  it('reads a big-endian block the same way', () => {
    const block = exifBlock({ little: false, original: '2026:03:14 16:42:05' });
    expect(takenAtFromExif(block, NOW)).toBe('2026-03-14T16:42:05');
  });

  it('accepts the Exif preamble a JPEG APP1 segment carries', () => {
    const block = Buffer.concat([
      Buffer.from('Exif\0\0', 'latin1'),
      exifBlock({ original: '2026:03:14 16:42:05' }),
    ]);
    expect(takenAtFromExif(block, NOW)).toBe('2026-03-14T16:42:05');
  });

  it('prefers the original over the digitized and modified times', () => {
    const block = exifBlock({
      original: '2026:03:13 09:00:00',
      digitized: '2026:03:14 09:00:00',
      modified: '2026:03:20 21:08:00',
    });
    expect(takenAtFromExif(block, NOW)).toBe('2026-03-13T09:00:00');
  });

  it('falls back through blank and implausible values', () => {
    // Blank is how many cameras write "not set".
    const blank = exifBlock({
      original: '    :  :     :  :  ',
      digitized: '2026:03:14 09:00:00',
    });
    expect(takenAtFromExif(blank, NOW)).toBe('2026-03-14T09:00:00');

    const noExifIfd = exifBlock({ withPointer: false, modified: '2026:03:20 21:08:00' });
    expect(takenAtFromExif(noExifIfd, NOW)).toBe('2026-03-20T21:08:00');
  });

  it('is null rather than an error for anything malformed', () => {
    expect(takenAtFromExif(null, NOW)).toBeNull();
    expect(takenAtFromExif(Buffer.alloc(0), NOW)).toBeNull();
    expect(takenAtFromExif(Buffer.from('not exif at all', 'latin1'), NOW)).toBeNull();

    // A valid header whose IFD offset points past the end of the block.
    const truncated = exifBlock({ original: '2026:03:14 16:42:05' }).subarray(0, 20);
    expect(takenAtFromExif(truncated, NOW)).toBeNull();

    // An IFD claiming 65k entries.
    const noisy = exifBlock({ original: '2026:03:14 16:42:05' });
    noisy.writeUInt16LE(0xffff, 8);
    expect(() => takenAtFromExif(noisy, NOW)).not.toThrow();
  });
});

describe('takenAtFromHead', () => {
  it('finds the EXIF segment of a JPEG after other APP segments', () => {
    const jpeg = jpegAround(exifBlock({ original: '2026:03:14 16:42:05' }));
    expect(takenAtFromHead(jpeg, NOW)).toBe('2026-03-14T16:42:05');
  });

  it('reads a TIFF directly, since a TIFF is the EXIF structure', () => {
    expect(takenAtFromHead(exifBlock({ original: '2026:03:14 16:42:05' }), NOW)).toBe(
      '2026-03-14T16:42:05',
    );
  });

  it('is null for a JPEG with no EXIF, and for other formats', () => {
    expect(
      takenAtFromHead(Buffer.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9]), NOW),
    ).toBeNull();
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(takenAtFromHead(png, NOW)).toBeNull();
  });
});

describe('the real encoder', () => {
  // Synthetic blocks prove the parser; this proves it agrees with what sharp
  // actually writes and reports, which is the path uploads take.
  it('round-trips DateTimeOriginal through a JPEG sharp wrote', async () => {
    const jpeg = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#886655' },
    })
      .jpeg()
      .withExif({ IFD2: { DateTimeOriginal: '2026:03:14 16:42:05' } })
      .toBuffer();

    const { exif } = await sharp(jpeg).metadata();
    expect(takenAtFromExif(exif, NOW)).toBe('2026-03-14T16:42:05');
    expect(takenAtFromHead(jpeg, NOW)).toBe('2026-03-14T16:42:05');
  });
});

describe('parseWallClock', () => {
  it('normalises both the EXIF and ISO spellings', () => {
    expect(parseWallClock('2026:03:14 16:42:05', NOW)).toBe('2026-03-14T16:42:05');
    expect(parseWallClock('2026-03-14T16:42:05+0800', NOW)).toBe('2026-03-14T16:42:05');
  });

  it('refuses dates that cannot be real', () => {
    expect(parseWallClock('0000:00:00 00:00:00', NOW)).toBeNull();
    expect(parseWallClock('1970:01:01 00:00:00', NOW)).toBeNull();
    expect(parseWallClock('2026:02:30 12:00:00', NOW)).toBeNull();
    expect(parseWallClock('2026:03:14 24:00:00', NOW)).toBeNull();
  });

  it('allows a fast clock but not one days ahead', () => {
    // Local evening in Manila is already "tomorrow" relative to UTC now.
    expect(parseWallClock('2026-09-21T23:00:00', NOW)).toBe('2026-09-21T23:00:00');
    expect(parseWallClock('2026-09-30T12:00:00', NOW)).toBeNull();
  });
});

describe('takenAtFromVideoTags', () => {
  it('takes the wall clock straight from Apple’s creation date', () => {
    const tags = { 'com.apple.quicktime.creationdate': '2026-03-14T23:30:00+0800' };
    expect(takenAtFromVideoTags(tags, NOW)).toBe('2026-03-14T23:30:00');
  });

  it('reads a UTC creation_time in Manila', () => {
    expect(
      takenAtFromVideoTags({ creation_time: '2026-03-14T15:30:00.000000Z' }, NOW),
    ).toBe('2026-03-14T23:30:00');
  });

  it('ignores tag case, and an unset QuickTime epoch', () => {
    expect(
      takenAtFromVideoTags({ CREATION_TIME: '2026-03-14T15:30:00Z' }, NOW),
    ).toBe('2026-03-14T23:30:00');
    expect(
      takenAtFromVideoTags({ creation_time: '1904-01-01T00:00:00.000000Z' }, NOW),
    ).toBeNull();
    expect(takenAtFromVideoTags(undefined, NOW)).toBeNull();
  });
});

describe('wallClockIn', () => {
  it('formats an instant as a zone’s wall clock', () => {
    expect(wallClockIn('Asia/Manila', new Date('2026-03-14T16:00:00Z'))).toBe(
      '2026-03-15T00:00:00',
    );
  });
});
