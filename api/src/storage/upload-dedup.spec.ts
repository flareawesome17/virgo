import {
  classifyUploadMatches,
  normaliseEtag,
  sourceModifiedAt,
  SAME_FILE_TOLERANCE_MS,
} from './upload-dedup';

/**
 * Which files in a batch are already in the album.
 *
 * Name and size alone are not proof: a camera's counter resets, and two
 * different photographs can both be IMG_0001.JPG at the same byte count. So
 * only a match the file's own modified time agrees with is called a
 * duplicate; every other name-and-size match is a "possible" one that the
 * person decides about, never something skipped behind their back.
 */
describe('classifyUploadMatches', () => {
  const AT = Date.UTC(2026, 9, 18, 14, 30, 0);

  it('calls a match a duplicate when the stored modified time agrees', () => {
    expect(
      classifyUploadMatches(
        [{ lastModified: AT }, { lastModified: AT }],
        [
          { index: 0, sourceModifiedMs: AT },
          { index: 1, sourceModifiedMs: AT + SAME_FILE_TOLERANCE_MS },
        ],
      ),
    ).toEqual([
      { index: 0, match: 'exact' },
      { index: 1, match: 'exact' },
    ]);
  });

  it('allows the two seconds a FAT-formatted card rounds a modified time to', () => {
    expect(SAME_FILE_TOLERANCE_MS).toBe(2_000);
    expect(
      classifyUploadMatches([{ lastModified: AT }], [{ index: 0, sourceModifiedMs: AT - 1_999 }]),
    ).toEqual([{ index: 0, match: 'exact' }]);
  });

  it('only suspects a match whose modified time differs', () => {
    expect(
      classifyUploadMatches(
        [{ lastModified: AT }],
        [{ index: 0, sourceModifiedMs: AT + 60 * 60 * 1000 }],
      ),
    ).toEqual([{ index: 0, match: 'possible', reason: 'different-date' }]);
  });

  it('only suspects a match when either side has no modified time to compare', () => {
    expect(
      classifyUploadMatches(
        [{ lastModified: AT }, {}, { lastModified: null }],
        [
          // Uploaded before the time was recorded.
          { index: 0, sourceModifiedMs: null },
          // The phone, which cannot say when a file was modified.
          { index: 1, sourceModifiedMs: AT },
          { index: 2, sourceModifiedMs: null },
        ],
      ),
    ).toEqual([
      { index: 0, match: 'possible', reason: 'unverified' },
      { index: 1, match: 'possible', reason: 'unverified' },
      { index: 2, match: 'possible', reason: 'unverified' },
    ]);
  });

  it('is a duplicate when any one of several stored copies agrees', () => {
    // The album already holds the file twice, once from before times were
    // recorded and once since.
    expect(
      classifyUploadMatches(
        [{ lastModified: AT }],
        [
          { index: 0, sourceModifiedMs: null },
          { index: 0, sourceModifiedMs: AT },
        ],
      ),
    ).toEqual([{ index: 0, match: 'exact' }]);
  });

  it('says nothing about a file with no match, and answers in batch order', () => {
    expect(
      classifyUploadMatches(
        [{ lastModified: AT }, { lastModified: AT }, { lastModified: AT }],
        [
          { index: 2, sourceModifiedMs: AT },
          { index: 0, sourceModifiedMs: null },
        ],
      ),
    ).toEqual([
      { index: 0, match: 'possible', reason: 'unverified' },
      { index: 2, match: 'exact' },
    ]);
  });

  it('ignores a candidate that names no file in the batch', () => {
    expect(classifyUploadMatches([{}], [{ index: 5, sourceModifiedMs: AT }])).toEqual([]);
  });
});

describe('sourceModifiedAt', () => {
  const NOW = Date.UTC(2026, 9, 20);

  it('keeps a plausible modified time as a Date', () => {
    const at = Date.UTC(2024, 2, 14, 16, 42, 5);
    expect(sourceModifiedAt(at, NOW)).toEqual(new Date(at));
  });

  it('drops anything a device could not mean: missing, not a whole number, before 1980, or in the future', () => {
    for (const value of [
      undefined,
      null,
      Number.NaN,
      1.5,
      '1700000000000',
      0,
      Date.UTC(1979, 11, 31),
      NOW + 2 * 24 * 60 * 60 * 1000,
    ]) {
      expect(sourceModifiedAt(value, NOW)).toBeNull();
    }
  });

  it('allows a clock a day ahead of the server', () => {
    expect(sourceModifiedAt(NOW + 60 * 60 * 1000, NOW)).toEqual(new Date(NOW + 60 * 60 * 1000));
  });
});

describe('normaliseEtag', () => {
  it('strips the quotes S3 wraps an ETag in', () => {
    expect(normaliseEtag('"9b2cf535f27731c974343645a3985328"')).toBe(
      '9b2cf535f27731c974343645a3985328',
    );
    // A multipart object's ETag names its part count.
    expect(normaliseEtag('"d41d8cd98f00b204e9800998ecf8427e-3"')).toBe(
      'd41d8cd98f00b204e9800998ecf8427e-3',
    );
  });

  it('is null for nothing, and for anything too long to be one', () => {
    expect(normaliseEtag(undefined)).toBeNull();
    expect(normaliseEtag('""')).toBeNull();
    expect(normaliseEtag(`"${'a'.repeat(200)}"`)).toBeNull();
  });
});
