/**
 * When a photograph or film was taken, as the camera's wall clock.
 *
 * The result is always `YYYY-MM-DDTHH:MM:SS` with no zone — see migration 064
 * for why that is the right shape for grouping by day. Anything missing,
 * malformed or implausible comes back as null, never as an error: a date is a
 * nicety, and an upload must never fail over one.
 *
 * Hand-rolled rather than a dependency. The whole job is to walk two IFDs of a
 * TIFF structure and read one ASCII field, sharp already hands over the raw
 * block, and every read below is bounds-checked against it.
 */

/**
 * The zone a bare UTC instant is read in.
 *
 * Only films need it: EXIF gives the wall clock directly, but a QuickTime
 * `creation_time` is UTC and says nothing about where it was recorded. Virgo's
 * shoots are in the Philippines, which has one zone and no daylight saving, so
 * this is right for nearly everything and an hour out for the rest — which
 * only matters within an hour of midnight.
 *
 * Also the zone `created_at` is read in when a file has no capture time, so
 * the two sort on the same clock. It appears verbatim in migration 064's index
 * expression, which the listing query must match to use it.
 */
export const MEDIA_LOCAL_ZONE = 'Asia/Manila';

/**
 * What a file sorts by: when it was taken, else when it arrived. Must match
 * `user_files_album_sort_idx` character for character.
 */
export const SORT_AT_SQL = `coalesce(taken_at, created_at at time zone '${MEDIA_LOCAL_ZONE}')`;

const EXIF_IFD_POINTER = 0x8769;
/** IFD0's DateTime is when the file was last written — a fallback only. */
const DATE_TIME = 0x0132;
const DATE_TIME_ORIGINAL = 0x9003;
const DATE_TIME_DIGITIZED = 0x9004;
const TYPE_ASCII = 2;
const TYPE_LONG = 4;
const TYPE_IFD = 13;

/** A real IFD has dozens of entries. Thousands means we are reading noise. */
const MAX_ENTRIES = 1024;

/**
 * Clocks that were never set report the year 0, 1970 or 2000. The first two
 * are filtered here; 2000 cannot be told apart from a real photograph and is
 * shown as what the camera said.
 */
const EARLIEST_YEAR = 1990;

/** A camera clock a little fast is common; one days ahead is wrong. */
const FUTURE_TOLERANCE_MS = 2 * 86_400_000;

/** UTC+14 is the furthest ahead any wall clock on Earth can be. */
const MAX_ZONE_LEAD_MS = 14 * 3_600_000;

/**
 * From the EXIF block sharp reports as `metadata.exif`, with or without the
 * `Exif\0\0` preamble a JPEG's APP1 segment carries.
 */
export function takenAtFromExif(
  block: Buffer | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!block || block.length < 8) return null;
  const tiff =
    block.toString('latin1', 0, 6) === 'Exif\0\0' ? block.subarray(6) : block;
  return readTiff(tiff, now);
}

/**
 * From the first bytes of a file, for originals too large to decode.
 *
 * Covers JPEG, whose EXIF sits in an APP1 segment near the start, and TIFF,
 * which is the EXIF structure. Anything else is null — those formats either
 * go through sharp or carry no EXIF worth finding.
 */
export function takenAtFromHead(
  head: Buffer | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!head || head.length < 4) return null;
  if (head[0] === 0xff && head[1] === 0xd8) {
    const exif = findJpegExif(head);
    return exif ? takenAtFromExif(exif, now) : null;
  }
  return isTiffHeader(head) ? readTiff(head, now) : null;
}

/**
 * From ffprobe's format tags for a film.
 *
 * Apple's `com.apple.quicktime.creationdate` is local time with an offset —
 * the wall clock is simply its first nineteen characters. `creation_time` is
 * UTC and is read in MEDIA_LOCAL_ZONE. Some cameras write local time there and
 * label it UTC anyway; there is no way to tell, so it is taken at its word.
 */
export function takenAtFromVideoTags(
  tags: Record<string, string> | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!tags) return null;
  const lower = Object.fromEntries(
    Object.entries(tags).map(([key, value]) => [key.toLowerCase(), value]),
  );

  const apple = lower['com.apple.quicktime.creationdate'];
  const fromApple = apple ? parseWallClock(apple, now) : null;
  if (fromApple) return fromApple;

  const utc = lower['creation_time'];
  if (!utc) return null;
  const instant = new Date(utc);
  if (Number.isNaN(instant.getTime())) return null;
  return parseWallClock(wallClockIn(MEDIA_LOCAL_ZONE, instant), now);
}

/** An instant as the wall clock in `zone`: `2026-03-14T23:30:00`. */
export function wallClockIn(zone: string, instant: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '00';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}`;
}

/**
 * `2026:03:14 16:42:05` (EXIF) or `2026-03-14T16:42:05…` (ISO), checked for
 * being a real, plausible moment and normalised to the ISO wall-clock form.
 */
export function parseWallClock(value: string, now: Date = new Date()): string | null {
  const match =
    /^\s*(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  if (
    year < EARLIEST_YEAR ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }

  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  // Rolls over for 30 February rather than failing, so check it came back.
  const check = new Date(asUtc);
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;

  // The wall clock has no zone, so compare it generously: read as the most
  // eastern zone there is, it is the earliest instant it could possibly be.
  if (asUtc - MAX_ZONE_LEAD_MS > now.getTime() + FUTURE_TOLERANCE_MS) return null;

  const [, y, mo, d, h, mi, s] = match;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}`;
}

function isTiffHeader(bytes: Buffer): boolean {
  return (
    bytes.length >= 4 &&
    ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00) ||
      (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a))
  );
}

/** The APP1 `Exif\0\0` payload of a JPEG, possibly truncated by a short read. */
function findJpegExif(jpeg: Buffer): Buffer | null {
  let pos = 2;
  while (pos + 4 <= jpeg.length) {
    if (jpeg[pos] !== 0xff) return null;
    const marker = jpeg[pos + 1];
    // Fill bytes before a marker are legal and mean nothing.
    if (marker === 0xff) {
      pos += 1;
      continue;
    }
    // Start of scan or end of image: the metadata segments are behind us.
    if (marker === 0xda || marker === 0xd9) return null;
    // Markers that stand alone, with no length after them.
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      pos += 2;
      continue;
    }
    const length = jpeg.readUInt16BE(pos + 2);
    if (length < 2) return null;
    const start = pos + 4;
    const end = pos + 2 + length;
    if (marker === 0xe1 && jpeg.toString('latin1', start, start + 6) === 'Exif\0\0') {
      return jpeg.subarray(start, Math.min(end, jpeg.length));
    }
    pos = end;
  }
  return null;
}

function readTiff(tiff: Buffer, now: Date): string | null {
  if (tiff.length < 8 || !isTiffHeader(tiff)) return null;
  const little = tiff[0] === 0x49;
  const u16 = (at: number) =>
    at >= 0 && at + 2 <= tiff.length ? (little ? tiff.readUInt16LE(at) : tiff.readUInt16BE(at)) : -1;
  const u32 = (at: number) =>
    at >= 0 && at + 4 <= tiff.length ? (little ? tiff.readUInt32LE(at) : tiff.readUInt32BE(at)) : -1;

  /** Tag → offset of its 12-byte entry, for the IFD at `offset`. */
  const entries = (offset: number): Map<number, number> => {
    const found = new Map<number, number>();
    if (offset < 8 || offset + 2 > tiff.length) return found;
    const count = u16(offset);
    if (count <= 0 || count > MAX_ENTRIES) return found;
    for (let i = 0; i < count; i++) {
      const at = offset + 2 + i * 12;
      if (at + 12 > tiff.length) break;
      found.set(u16(at), at);
    }
    return found;
  };

  const ascii = (entry: number | undefined): string | null => {
    if (entry === undefined || u16(entry + 2) !== TYPE_ASCII) return null;
    const count = u32(entry + 4);
    if (count <= 0 || count > 256) return null;
    const start = count <= 4 ? entry + 8 : u32(entry + 8);
    if (start < 0 || start + count > tiff.length) return null;
    const raw = tiff.toString('latin1', start, start + count);
    const nul = raw.indexOf('\0');
    return (nul === -1 ? raw : raw.slice(0, nul)).trim() || null;
  };

  const root = entries(u32(4));
  const pointer = root.get(EXIF_IFD_POINTER);
  const pointerType = pointer === undefined ? -1 : u16(pointer + 2);
  const exif =
    pointer !== undefined && (pointerType === TYPE_LONG || pointerType === TYPE_IFD)
      ? entries(u32(pointer + 8))
      : new Map<number, number>();

  for (const entry of [
    exif.get(DATE_TIME_ORIGINAL),
    exif.get(DATE_TIME_DIGITIZED),
    root.get(DATE_TIME),
  ]) {
    const value = ascii(entry);
    const parsed = value ? parseWallClock(value, now) : null;
    if (parsed) return parsed;
  }
  return null;
}
