import { BadRequestException } from '@nestjs/common';
import { decodeFileCursor, encodeFileCursor } from './quota.service';

describe('file cursor', () => {
  it('round-trips a stable created-at and key pair', () => {
    const createdAt = new Date('2026-08-19T10:30:00.000Z');
    const cursor = encodeFileCursor(createdAt, 'users/u/albums/photo.jpg');
    expect(decodeFileCursor(cursor)).toEqual({
      createdAt: createdAt.toISOString(),
      key: 'users/u/albums/photo.jpg',
    });
  });

  it('rejects malformed cursors', () => {
    expect(() => decodeFileCursor('not-json')).toThrow(BadRequestException);
  });
});
