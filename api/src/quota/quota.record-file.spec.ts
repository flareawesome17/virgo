import type { DatabaseService } from '../database/database.service';
import { QuotaService } from './quota.service';

/**
 * Which confirmed uploads the media worker is asked to probe.
 *
 * Avatars and covers are re-encoded in place inside confirm, which records
 * their size, type and dimensions itself. A worker probing the same key could
 * only race that rewrite and write back the dimensions of an original that is
 * no longer there, so those rows start as not_required.
 */
function recorder() {
  const query = jest.fn(async () => [{ inserted: true }]);
  const quota = new QuotaService({ query } as unknown as DatabaseService);
  /** The processing status the insert was given. */
  const status = () => (query.mock.calls.at(-1) as unknown as [string, unknown[]])[1][7];
  return { quota, status };
}

describe('QuotaService.recordFile', () => {
  it.each(['avatars', 'covers'])('leaves an image in %s to confirm', async (scope) => {
    const { quota, status } = recorder();

    await quota.recordFile('user-1', {
      key: `users/user-1/${scope}/2026/09/photo.jpg`,
      sizeBytes: 4_000_000,
      contentType: 'image/jpeg',
      scope,
    });

    expect(status()).toBe('not_required');
  });

  it('stores the ETag and the device modified time a re-upload is matched by', async () => {
    const query = jest.fn(async () => [{ inserted: true }]);
    const quota = new QuotaService({ query } as unknown as DatabaseService);
    const at = new Date(Date.UTC(2026, 9, 18, 14, 30));

    await quota.recordFile('user-1', {
      key: 'users/user-1/albums/2026/10/a.jpg',
      sizeBytes: 4_000_000,
      contentType: 'image/jpeg',
      scope: 'albums',
      albumId: 'album-1',
      originalName: 'IMG_0001.JPG',
      etag: '9b2cf535f27731c9',
      sourceModifiedAt: at,
    });

    const [sql, params] = query.mock.calls.at(-1) as unknown as [string, unknown[]];
    expect(params.slice(8)).toEqual(['9b2cf535f27731c9', at]);
    expect(sql).toMatch(/original_name, processing_status, next_processing_at, etag, source_modified_at\)/);
    // A confirm sent again without them (an older app retrying) keeps what
    // the first one recorded.
    expect(sql).toContain('etag = coalesce(excluded.etag, user_files.etag)');
    expect(sql).toContain(
      'source_modified_at = coalesce(excluded.source_modified_at, user_files.source_modified_at)',
    );
  });

  it('records neither when they are not known', async () => {
    const query = jest.fn(async () => [{ inserted: true }]);
    const quota = new QuotaService({ query } as unknown as DatabaseService);

    await quota.recordFile('user-1', { key: 'k', sizeBytes: 1 });

    const [, params] = query.mock.calls.at(-1) as unknown as [string, unknown[]];
    expect(params.slice(8)).toEqual([null, null]);
  });

  it('still queues an album photograph, film or recording for the worker', async () => {
    const { quota, status } = recorder();

    for (const contentType of ['image/jpeg', 'video/mp4', 'audio/mp4']) {
      await quota.recordFile('user-1', {
        key: `users/user-1/albums/2026/09/file`,
        sizeBytes: 4_000_000,
        contentType,
        scope: 'albums',
      });
      expect(status()).toBe('pending');
    }
  });
});
