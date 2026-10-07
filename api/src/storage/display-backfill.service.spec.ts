import type { ConfigService } from '@nestjs/config';
import type { DatabaseService } from '../database/database.service';
import {
  CLAIM_SQL,
  DISPLAY_GAVE_UP,
  DisplayBackfillService,
  MAX_DISPLAY_ATTEMPTS,
  retryDelayMinutes,
  type DisplayBackfillRow,
} from './display-backfill.service';
import type { MediaLinkService } from './media-link.service';
import type { StorageConfig } from './storage.config';
import { MAX_SOURCE_BYTES, type ThumbnailsService } from './thumbnails.service';

function row(key: string, attempts = 1): DisplayBackfillRow {
  return {
    key,
    content_type: 'image/jpeg',
    size_bytes: '5242880',
    thumb_key: `${key}-thumb.webp`,
    display_widths: [1024, 2048],
    blur_data_url: 'data:image/webp;base64,AAAA',
    display_attempts: attempts,
  };
}

/**
 * The job over a queue of rows, with the database and the thumbnail service
 * faked. `claims` is what successive claims return; past its end, nothing.
 */
function harness({
  claims = [] as (DisplayBackfillRow | null)[],
  perMinute,
  mediaHost = true,
  refresh = jest.fn().mockResolvedValue([1024, 2048, 3072]),
  busy = false,
}: {
  claims?: (DisplayBackfillRow | null)[];
  perMinute?: string;
  mediaHost?: boolean;
  refresh?: jest.Mock;
  busy?: boolean;
} = {}) {
  const queue = [...claims];
  const queryOne = jest.fn(async () => queue.shift() ?? null);
  const query = jest.fn().mockResolvedValue([]);
  const thumbs = { refreshDisplayCopies: refresh, busy };
  const service = new DisplayBackfillService(
    { query, queryOne } as unknown as DatabaseService,
    thumbs as unknown as ThumbnailsService,
    { isConfigured: mediaHost } as unknown as MediaLinkService,
    {
      isConfigured: true,
      isPublicKey: (key: string) => /^users\/[^/]+\/(avatars|covers|showcases)\//.test(key),
    } as unknown as StorageConfig,
    {
      get: (key: string, fallback?: string) =>
        key === 'DISPLAY_BACKFILL_PER_MINUTE' && perMinute !== undefined ? perMinute : fallback,
    } as unknown as ConfigService,
  );
  /** The failure updates, by parameters. */
  const failures = () =>
    query.mock.calls.map(([, params]) => params as [string, boolean, number, number]);
  return { service, query, queryOne, refresh, thumbs, failures };
}

describe('the display backfill claim', () => {
  it('chooses only photographs still owed copies, and leases the one it takes', () => {
    // The predicates that keep it off everything else: new uploads still in
    // their confirm, avatars and covers, GIFs, files too large to decode
    // here, files given up on or leased to another tick.
    expect(CLAIM_SQL).toContain('display_version is null');
    expect(CLAIM_SQL).toContain("content_type like 'image/%'");
    expect(CLAIM_SQL).toContain("content_type <> 'image/gif'");
    expect(CLAIM_SQL).toContain("processing_status in ('ready', 'not_required')");
    expect(CLAIM_SQL).toContain('size_bytes <= $1');
    expect(CLAIM_SQL).toContain('display_attempts < $3');
    expect(CLAIM_SQL).toContain("coalesce(display_next_at, '-infinity') <= now()");
    expect(CLAIM_SQL).toContain("key !~ '^users/[^/]+/(avatars|covers|showcases)/'");
    // Oldest first, and never a row another process holds.
    expect(CLAIM_SQL).toMatch(/order by created_at, key\s+for update skip locked\s+limit 1/);
    expect(CLAIM_SQL).toContain('display_attempts = f.display_attempts + 1');
  });

  it('passes the decode ceiling the confirm path uses', async () => {
    const { service, queryOne } = harness();

    await service.refreshPending();

    const [, params] = queryOne.mock.calls[0] as unknown as [string, unknown[]];
    expect(params).toEqual([MAX_SOURCE_BYTES, 10, MAX_DISPLAY_ATTEMPTS]);
  });
});

describe('DisplayBackfillService.refreshPending', () => {
  it('works through the queue one file at a time until it is empty', async () => {
    const { service, refresh, queryOne } = harness({
      claims: [row('users/u/albums/2024/01/a.jpg'), row('users/u/albums/2024/01/b.jpg')],
    });

    await service.refreshPending();

    expect(refresh.mock.calls.map(([file]) => file.key)).toEqual([
      'users/u/albums/2024/01/a.jpg',
      'users/u/albums/2024/01/b.jpg',
    ]);
    // Two files and the claim that found nothing.
    expect(queryOne).toHaveBeenCalledTimes(3);
    // The row as the claim read it, and the size as a number.
    const [file, size, options] = refresh.mock.calls[0];
    expect(file).toEqual({
      key: 'users/u/albums/2024/01/a.jpg',
      contentType: 'image/jpeg',
      thumbKey: 'users/u/albums/2024/01/a.jpg-thumb.webp',
      displayWidths: [1024, 2048],
      blurDataUrl: 'data:image/webp;base64,AAAA',
    });
    expect(size).toBe(5_242_880);
    expect(options).toEqual({ stillDecodeTimeoutMs: 60_000 });
  });

  it('stops at the per-minute limit', async () => {
    const claims = Array.from({ length: 12 }, (_, i) => row(`users/u/albums/2024/01/${i}.jpg`));
    const { service, refresh } = harness({ claims });

    await service.refreshPending();

    expect(refresh).toHaveBeenCalledTimes(10);
  });

  it('follows DISPLAY_BACKFILL_PER_MINUTE, and does nothing at 0', async () => {
    const claims = () => Array.from({ length: 5 }, (_, i) => row(`users/u/albums/2024/01/${i}.jpg`));

    const two = harness({ claims: claims(), perMinute: '2' });
    await two.service.refreshPending();
    expect(two.refresh).toHaveBeenCalledTimes(2);

    const off = harness({ claims: claims(), perMinute: '0' });
    await off.service.refreshPending();
    expect(off.queryOne).not.toHaveBeenCalled();
  });

  it('claims nothing without the media host', async () => {
    // A file claimed now would only use up one of its tries.
    const { service, queryOne } = harness({ claims: [row('k.jpg')], mediaHost: false });

    await service.refreshPending();

    expect(queryOne).not.toHaveBeenCalled();
  });

  it('waits while an upload is being processed', async () => {
    const { service, queryOne } = harness({ claims: [row('k.jpg')], busy: true });

    await service.refreshPending();

    expect(queryOne).not.toHaveBeenCalled();
  });

  it('does not start a second run on top of one still going', async () => {
    let finish: () => void = () => undefined;
    const refresh = jest.fn(
      () => new Promise<number[]>((resolve) => (finish = () => resolve([1024]))),
    );
    const { service } = harness({ claims: [row('a.jpg'), row('b.jpg')], refresh });

    const first = service.refreshPending();
    await new Promise((resolve) => setImmediate(resolve));
    await service.refreshPending();
    expect(refresh).toHaveBeenCalledTimes(1);

    finish();
    await new Promise((resolve) => setImmediate(resolve));
    finish();
    await first;
  });

  it('marks nothing when a file was deleted while it was read', async () => {
    // refreshDisplayCopies says so with null and has cleaned up after itself.
    const refresh = jest.fn().mockResolvedValue(null);
    const { service, query } = harness({ claims: [row('gone.jpg')], refresh });

    await expect(service.refreshPending()).resolves.toBeUndefined();

    expect(query).not.toHaveBeenCalled();
  });

  it('puts a failed file back for later, later each time', async () => {
    const refresh = jest.fn().mockRejectedValue(new Error('NoSuchKey'));
    const { service, failures } = harness({
      claims: [row('a.jpg', 1), row('b.jpg', 2)],
      refresh,
    });

    await service.refreshPending();

    expect(failures()).toEqual([
      ['a.jpg', false, DISPLAY_GAVE_UP, 30],
      ['b.jpg', false, DISPLAY_GAVE_UP, 120],
    ]);
  });

  it('gives up on a file after its last try, rather than reading it for ever', async () => {
    const refresh = jest.fn().mockRejectedValue(new Error('unsupported image format'));
    const { service, query, failures } = harness({
      claims: [row('bad.tif', MAX_DISPLAY_ATTEMPTS)],
      refresh,
    });

    await service.refreshPending();

    expect(failures()).toEqual([['bad.tif', true, DISPLAY_GAVE_UP, 480]]);
    const [sql] = query.mock.calls[0] as [string];
    expect(sql).toContain('display_version = case when $2 then $3::smallint else display_version end');
    expect(sql).toContain('display_next_at = case when $2 then null');
  });

  it('carries on with the next file after one fails', async () => {
    const refresh = jest
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce([1024]);
    const { service } = harness({ claims: [row('a.jpg'), row('b.jpg')], refresh });

    await service.refreshPending();

    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('gives up at once on a public key the claim let through', async () => {
    const { service, refresh, failures } = harness({
      claims: [row('users/u/avatars/2024/01/me.jpg', 1)],
    });

    await service.refreshPending();

    expect(refresh).not.toHaveBeenCalled();
    expect(failures()[0].slice(0, 2)).toEqual(['users/u/avatars/2024/01/me.jpg', true]);
  });

  it('survives a claim that fails, and runs again next minute', async () => {
    const { service, queryOne, refresh } = harness({ claims: [row('a.jpg')] });
    queryOne.mockRejectedValueOnce(new Error('connection terminated'));

    await expect(service.refreshPending()).resolves.toBeUndefined();
    await service.refreshPending();

    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe('retryDelayMinutes', () => {
  it('waits half an hour, then two, then eight', () => {
    expect([1, 2, 3].map(retryDelayMinutes)).toEqual([30, 120, 480]);
  });
});
