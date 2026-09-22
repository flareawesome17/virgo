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
