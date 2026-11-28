import type { ConfigService } from '@nestjs/config';
import type { DatabaseService } from '../../database/database.service';
import type { DownloadCacheService } from '../download-cache.service';
import type { StorageConfig } from '../storage.config';
import type { StorageService } from '../storage.service';
import type { ThumbnailsService } from '../thumbnails.service';
import type { HeicConverter } from './heic-converter.service';
import { HEIC_CLAIM_SQL, HeicSweepService, type HeicSweepRow } from './heic-sweep.service';

function row(key: string, attempts = 1): HeicSweepRow {
  return {
    key,
    content_type: 'image/heic',
    thumb_key: null,
    display_widths: null,
    blur_data_url: null,
    heic_attempts: attempts,
  };
}

function harness({
  claims = [] as HeicSweepRow[],
  due = [] as { key: string; version_id: string }[],
  recent = [] as { key: string; size_bytes: string }[],
  perMinute = '12',
  enabled = true,
  busy = false,
} = {}) {
  const queue = [...claims];
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('from replaced_versions')) return due;
    if (sql.includes('converted_at >')) return recent;
    return [];
  });
  const queryOne = jest.fn(async (sql: string) => (sql === HEIC_CLAIM_SQL ? (queue.shift() ?? null) : null));
  const convertStored = jest.fn().mockResolvedValue(true);
  const fail = jest.fn().mockResolvedValue(undefined);
  const deleteVersion = jest.fn().mockResolvedValue(true);
  const cachedSize = jest.fn().mockResolvedValue(null);
  const forget = jest.fn().mockResolvedValue(undefined);
  const sweep = new HeicSweepService(
    { query, queryOne } as unknown as DatabaseService,
    { convertStored, busy } as unknown as ThumbnailsService,
    { enabled, fail } as unknown as HeicConverter,
    { deleteVersion } as unknown as StorageService,
    { cachedSize, forget } as unknown as DownloadCacheService,
    { isConfigured: true, isPublicKey: (k: string) => k.includes('/avatars/') } as unknown as StorageConfig,
    { get: () => perMinute } as unknown as ConfigService,
  );
  return { sweep, query, queryOne, convertStored, fail, deleteVersion, cachedSize, forget };
}

describe('HeicSweepService.tick', () => {
  it('converts what it can claim until there is nothing left', async () => {
    const h = harness({ claims: [row('users/u/albums/a.heic'), row('users/u/albums/b.heic')] });
    await h.sweep.tick();
    expect(h.convertStored.mock.calls.map(([file]) => file.key)).toEqual([
      'users/u/albums/a.heic',
      'users/u/albums/b.heic',
    ]);
    expect(h.convertStored).toHaveBeenCalledWith(expect.objectContaining({ contentType: 'image/heic' }), 120_000);
  });

  it('records a failed conversion against the file and carries on', async () => {
    const h = harness({ claims: [row('users/u/albums/a.heic', 3), row('users/u/albums/b.heic')] });
    h.convertStored.mockRejectedValueOnce(new Error('libheif could not decode it'));
    await h.sweep.tick();
    expect(h.fail).toHaveBeenCalledWith('users/u/albums/a.heic', 3, 'libheif could not decode it');
    expect(h.convertStored).toHaveBeenCalledTimes(2);
  });

  it('never converts a public key, and gives it up at once', async () => {
    const h = harness({ claims: [row('users/u/avatars/me.heic')] });
    await h.sweep.tick();
    expect(h.convertStored).not.toHaveBeenCalled();
    expect(h.fail).toHaveBeenCalledWith('users/u/avatars/me.heic', 5, 'a public key');
  });

  it('claims nothing while switched off or set to none a minute, but still tidies up', async () => {
    for (const h of [harness({ enabled: false, claims: [row('k')] }), harness({ perMinute: '0', claims: [row('k')] })]) {
      await h.sweep.tick();
      expect(h.convertStored).not.toHaveBeenCalled();
      expect(h.query).toHaveBeenCalledWith(expect.stringContaining('from replaced_versions'), [100]);
    }
  });

  it('waits while an upload\'s own previews are being made', async () => {
    const h = harness({ busy: true, claims: [row('k')] });
    await h.sweep.tick();
    expect(h.queryOne).not.toHaveBeenCalled();
  });

  it('claims the newest first, past their confirm, leased, and with tries left', () => {
    expect(HEIC_CLAIM_SQL).toContain("content_type in ('image/heic', 'image/heif')");
    expect(HEIC_CLAIM_SQL).toContain("processing_status in ('ready', 'failed', 'not_required')");
    expect(HEIC_CLAIM_SQL).toContain('order by created_at desc, key');
    expect(HEIC_CLAIM_SQL).toContain('for update skip locked');
  });
});

describe('HeicSweepService.purgeReplaced', () => {
  it('deletes each replaced HEIC whose week is over, and forgets it', async () => {
    const h = harness({ due: [{ key: 'k1', version_id: 'v1' }] });
    await expect(h.sweep.purgeReplaced()).resolves.toBe(1);
    expect(h.deleteVersion).toHaveBeenCalledWith('k1', 'v1');
    expect(h.query).toHaveBeenCalledWith('delete from replaced_versions where key = $1 and version_id = $2', ['k1', 'v1']);
  });

  it('tries a deletion that failed again a day later, not every minute', async () => {
    const h = harness({ due: [{ key: 'k1', version_id: 'v1' }] });
    h.deleteVersion.mockRejectedValueOnce(new Error('503'));
    await expect(h.sweep.purgeReplaced()).resolves.toBe(0);
    expect(h.query).toHaveBeenCalledWith(expect.stringContaining("purge_at = now() + interval '1 day'"), ['k1', 'v1']);
  });
});

describe('HeicSweepService.recheckCache', () => {
  it('drops a cached copy that is not the size of the JPEG now stored', async () => {
    const h = harness({
      recent: [
        { key: 'stale', size_bytes: '5000000' },
        { key: 'fresh', size_bytes: '5000000' },
        { key: 'uncached', size_bytes: '5000000' },
      ],
    });
    h.cachedSize.mockImplementation(async (key: string) =>
      key === 'stale' ? 2_000_000 : key === 'fresh' ? 5_000_000 : null,
    );
    await expect(h.sweep.recheckCache()).resolves.toBe(1);
    expect(h.forget).toHaveBeenCalledWith('stale');
    expect(h.forget).toHaveBeenCalledTimes(1);
  });
});
