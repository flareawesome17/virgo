import { BadRequestException } from '@nestjs/common';
import { decodeFileCursor, encodeFileCursor } from './quota.service';

describe('file cursor', () => {
  it('round-trips a sort key to the microsecond, with its key', () => {
    const cursor = encodeFileCursor('2026-03-14T16:42:05.123456', 'users/u/albums/photo.jpg');
    expect(decodeFileCursor(cursor)).toEqual({
      sortAt: '2026-03-14T16:42:05.123456',
      key: 'users/u/albums/photo.jpg',
    });
  });

  it('refuses a cursor minted for the other direction', () => {
    const newest = encodeFileCursor('2026-03-14T16:42:05.000000', 'k', 'newest');
    expect(decodeFileCursor(newest, 'newest').key).toBe('k');
    expect(() => decodeFileCursor(newest, 'oldest')).toThrow(BadRequestException);
  });

  it('rejects malformed cursors, including the old created-at shape', () => {
    expect(() => decodeFileCursor('not-json')).toThrow(BadRequestException);
    const legacy = Buffer.from(
      JSON.stringify({ createdAt: '2026-08-19T10:30:00.000Z', key: 'k' }),
    ).toString('base64url');
    expect(() => decodeFileCursor(legacy)).toThrow(BadRequestException);
    const injected = encodeFileCursor("2026-03-14'; drop table user_files; --", 'k');
    expect(() => decodeFileCursor(injected)).toThrow(BadRequestException);
  });
});
