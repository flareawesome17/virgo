import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import type { DatabaseService } from '../database/database.service';
import type { MailConfig } from '../mail/mail.config';
import type { NotifyService } from '../notifications/notify.service';
import {
  DOWNLOADS_PAUSED_MESSAGE,
  DownloadAllowanceService,
  FAIR_USE_MULTIPLE,
  filesReached,
  formatGb,
  isResumedRange,
  monthKey,
  nextMonthStart,
  rangeStart,
  resetsOn,
} from './download-allowance.service';
import { PLAN_CATALOGUE, PLAN_LIMITS } from './quota.config';

/**
 * The monthly client-download allowance.
 *
 * Two counts: deliveries (each file once a month) against the allowance, and
 * every byte sent against a fair-use ceiling ten times higher. Every client
 * download is gated by this, so the properties that matter most are the
 * failure ones: a counter that cannot be read or written lets the download
 * through, and nothing a client sees names the photographer's plan.
 */

const GB = 1024 ** 3;
const TB = 1024 ** 4;
const OWNER = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-10-17T08:30:00Z');
const MAIL = { appUrl: 'https://app.virgo.test' } as MailConfig;
const FREE = 45 * GB;

interface MonthRow {
  plan?: string | null;
  name?: string | null;
  delivered?: number;
  sent?: number;
  extra?: number;
}

/**
 * A service over one owner's month. `queryOne` answers the month's figures;
 * `query` answers the upserts with `upserted` (the row they hand back) and the
 * alert claims with `claimed`.
 */
function serviceOver(
  row: MonthRow | null,
  options: { upserted?: Record<string, unknown> | null; claimed?: boolean; notifyFails?: boolean } = {},
) {
  const queryOne = jest.fn(async (_sql: string, _params: unknown[]) =>
    row === null
      ? null
      : {
          plan: row.plan ?? 'free',
          name: row.name ?? 'Andrea Santos',
          delivered: String(row.delivered ?? 0),
          sent: String(row.sent ?? 0),
          extra: String(row.extra ?? 0),
        },
  );
  const query = jest.fn(async (sql: string, _params: unknown[]) => {
    if (/^\s*update download_usage/.test(sql)) return options.claimed === false ? [] : [{ '?column?': 1 }];
    return options.upserted ? [options.upserted] : [];
  });
  const notify = jest.fn(async (_userIds: readonly string[], _n: unknown) => {
    if (options.notifyFails) throw new Error('mail server down');
  });
  const service = new DownloadAllowanceService(
    { queryOne, query } as unknown as DatabaseService,
    { notify } as unknown as NotifyService,
    MAIL,
  );
  // The warning is the point of failing open; keep it out of the test output.
  jest
    .spyOn((service as unknown as { logger: { warn: () => void } }).logger, 'warn')
    .mockImplementation(() => undefined);
  const claims = () => query.mock.calls.filter(([sql]) => /^\s*update download_usage/.test(sql));
  return { service, query, queryOne, notify, claims };
}

function failingDb() {
  const boom = jest.fn(async () => {
    throw new Error('relation "download_usage" does not exist');
  });
  const service = new DownloadAllowanceService(
    { queryOne: boom, query: boom } as unknown as DatabaseService,
    { notify: jest.fn() } as unknown as NotifyService,
    MAIL,
  );
  jest
    .spyOn((service as unknown as { logger: { warn: () => void } }).logger, 'warn')
    .mockImplementation(() => undefined);
  return service;
}

type Sent = {
  topic: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  email: { subject: string; text: string };
};
const sent = (notify: jest.Mock) => notify.mock.calls[0][1] as Sent;

describe('plan download allowances', () => {
  it('gives every plan, Free included, three times its storage', () => {
    expect(PLAN_LIMITS.free.downloadBytesPerMonth).toBe(FREE);
    expect(PLAN_LIMITS.freelance.downloadBytesPerMonth).toBe(300 * GB);
    expect(PLAN_LIMITS.pro.downloadBytesPerMonth).toBe(300 * GB);
    expect(PLAN_LIMITS.studio.downloadBytesPerMonth).toBe(1500 * GB);
    expect(PLAN_LIMITS.business.downloadBytesPerMonth).toBe(6 * TB);
  });

  it('says so on every plan card', () => {
    const lines = Object.fromEntries(
      PLAN_CATALOGUE.map((p) => [p.name, p.features.find((f) => f.includes('downloads'))]),
    );
    expect(lines).toEqual({
      free: '45 GB of client downloads a month',
      freelance: '300 GB of client downloads a month',
      studio: '1.5 TB of client downloads a month',
      business: '6 TB of client downloads a month',
    });
  });
});

describe('the download month', () => {
  it('is keyed by its first day, UTC', () => {
    expect(monthKey(NOW)).toBe('2026-10-01');
    // Already November in Manila, still October in UTC.
    expect(monthKey(new Date('2026-10-31T23:59:59Z'))).toBe('2026-10-01');
  });

  it('resets at the start of next month, including over the year end', () => {
    expect(nextMonthStart(NOW).toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(nextMonthStart(new Date('2026-12-31T12:00:00Z')).toISOString()).toBe(
      '2027-01-01T00:00:00.000Z',
    );
  });
});

describe('DownloadAllowanceService.usage', () => {
  it("reads this month's deliveries against the plan's allowance", async () => {
    const { service, queryOne } = serviceOver({ plan: 'freelance', delivered: 1234, sent: 9999 });

    await expect(service.usage(OWNER, NOW)).resolves.toEqual({
      usedBytes: 1234,
      limitBytes: 300 * GB,
      resetsAt: '2026-11-01T00:00:00.000Z',
      paused: false,
      extraBytes: 0,
    });
    expect(queryOne.mock.calls[0][1]).toEqual([OWNER, '2026-10-01']);
  });

  it("adds staff's extra for the month to the allowance", async () => {
    const { service } = serviceOver({ delivered: 50 * GB, extra: 15 * GB });
    const usage = await service.usage(OWNER, NOW);
    expect(usage.limitBytes).toBe(60 * GB);
    expect(usage.extraBytes).toBe(15 * GB);
    expect(usage.paused).toBe(false);
  });

  it('treats an unknown plan, or a missing row, as Free', async () => {
    for (const row of [{ plan: 'platinum' }, null]) {
      const { service } = serviceOver(row);
      const usage = await service.usage(OWNER, NOW);
      expect(usage.limitBytes).toBe(FREE);
      expect(usage.usedBytes).toBe(0);
    }
  });
});

describe('DownloadAllowanceService.allows', () => {
  it('lets a download start while there is allowance left', async () => {
    const { service } = serviceOver({ delivered: FREE - 1 });
    await expect(service.allows(OWNER, NOW)).resolves.toBe(true);
  });

  it('refuses once the month is delivered, and past it', async () => {
    for (const delivered of [FREE, FREE + GB]) {
      const { service } = serviceOver({ delivered });
      await expect(service.allows(OWNER, NOW)).resolves.toBe(false);
    }
  });

  it('counts deliveries, not repeats: a gallery fetched over and over still downloads', async () => {
    // 12 GB delivered, sent five times over: well under the ceiling.
    const { service } = serviceOver({ delivered: 12 * GB, sent: 60 * GB });
    await expect(service.allows(OWNER, NOW)).resolves.toBe(true);
  });

  it('refuses at the fair-use ceiling, however little was delivered', async () => {
    const { service } = serviceOver({ delivered: 15 * GB, sent: FAIR_USE_MULTIPLE * FREE });
    await expect(service.allows(OWNER, NOW)).resolves.toBe(false);
  });

  it("lets downloads start again once staff add to the month", async () => {
    const { service } = serviceOver({ delivered: FREE, extra: 15 * GB });
    await expect(service.allows(OWNER, NOW)).resolves.toBe(true);
  });

  it('fails open when the counter cannot be read', async () => {
    await expect(failingDb().allows(OWNER, NOW)).resolves.toBe(true);
  });
});

describe('DownloadAllowanceService.recordSent', () => {
  it('adds what was sent to the month in one atomic upsert', async () => {
    const { service, query } = serviceOver(null);

    await service.recordSent(OWNER, 5_000_000.7, NOW);

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/on conflict \(user_id, month\)/);
    expect(sql).toMatch(/bytes = download_usage\.bytes \+ excluded\.bytes/);
    expect(params).toEqual([OWNER, '2026-10-01', 5_000_000]);
  });

  it('writes nothing for nothing sent', async () => {
    const { service, query } = serviceOver(null);
    for (const bytes of [0, -10, Number.NaN]) await service.recordSent(OWNER, bytes, NOW);
    expect(query).not.toHaveBeenCalled();
  });

  it('never throws, so a counter failure cannot fail a download', async () => {
    await expect(failingDb().recordSent(OWNER, 10, NOW)).resolves.toBeUndefined();
  });

  it('pauses and says why at the fair-use ceiling', async () => {
    const ceiling = FAIR_USE_MULTIPLE * FREE;
    const m = serviceOver(
      { delivered: 15 * GB, sent: ceiling },
      { upserted: { sent: String(ceiling), paused: false } },
    );

    await m.service.recordSent(OWNER, GB, NOW);

    expect(m.claims()).toHaveLength(1);
    expect(m.claims()[0][0]).toMatch(/set paused_at = now\(\)/);
    const n = sent(m.notify);
    expect(n.title).toBe('Client downloads are paused');
    expect(n.data).toEqual({ type: 'downloads', state: 'paused', reason: 'fair-use', month: '2026-10-01' });
    expect(n.body).toContain('have sent 450 GB this month, far more than delivering your galleries takes');
    expect(n.email.text).toContain('shared beyond your clients');
  });

  it('looks nothing up while what was sent is far from the ceiling', async () => {
    const m = serviceOver({ sent: 60 * GB }, { upserted: { sent: String(60 * GB), paused: false } });
    await m.service.recordSent(OWNER, GB, NOW);
    expect(m.queryOne).not.toHaveBeenCalled();
    expect(m.notify).not.toHaveBeenCalled();
  });
});

describe('DownloadAllowanceService.recordDelivered', () => {
  it('counts the files in one statement that skips any already delivered this month', async () => {
    const { service, query } = serviceOver(null);

    await service.recordDelivered(
      OWNER,
      [
        { key: 'users/u/a.jpg', bytes: 12_000_000.4 },
        { key: 'users/u/b.jpg', bytes: 9_000_000 },
        // The same file twice in one batch counts once.
        { key: 'users/u/a.jpg', bytes: 12_000_000 },
      ],
      NOW,
    );

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/insert into download_deliveries/);
    expect(sql).toMatch(/on conflict \(user_id, month, file_key\) do nothing/);
    expect(sql).toMatch(/delivered_bytes = download_usage\.delivered_bytes \+ excluded\.delivered_bytes/);
    expect(params).toEqual([
      OWNER,
      '2026-10-01',
      ['users/u/a.jpg', 'users/u/b.jpg'],
      [12_000_000, 9_000_000],
    ]);
  });

  it('writes nothing for no files, and never throws', async () => {
    const { service, query } = serviceOver(null);
    await service.recordDelivered(OWNER, [], NOW);
    expect(query).not.toHaveBeenCalled();
    await expect(failingDb().recordDelivered(OWNER, [{ key: 'k', bytes: 1 }], NOW)).resolves.toBeUndefined();
  });

  it('says nothing, and looks nothing up, while the month is far from any line', async () => {
    const m = serviceOver({ delivered: 5 * GB }, { upserted: { delivered: String(5 * GB), paused: false } });
    await m.service.recordDelivered(OWNER, [{ key: 'k', bytes: GB }], NOW);
    expect(m.queryOne).not.toHaveBeenCalled();
    expect(m.notify).not.toHaveBeenCalled();
  });

  it('warns the owner once 80% of the month is delivered', async () => {
    const m = serviceOver(
      { delivered: 36 * GB, sent: 80 * GB },
      { upserted: { delivered: String(36 * GB), paused: false } },
    );
    await m.service.recordDelivered(OWNER, [{ key: 'k', bytes: GB }], NOW);

    expect(m.claims()).toHaveLength(1);
    expect(m.claims()[0][0]).toMatch(/warned_at is null and paused_at is null/);
    const n = sent(m.notify);
    expect(n.topic).toBe('billing');
    expect(n.data).toEqual({ type: 'downloads', state: 'warning', reason: null, month: '2026-10-01' });
    expect(n.body).toBe(
      'Your client links have delivered 36 GB of your 45 GB this month. At 45 GB, new downloads pause until November 1.',
    );
    expect(n.email.subject).toBe('Most of this month’s client downloads are used');
    expect(n.email.text).toContain('Each file counts once a month');
    expect(n.email.text).toContain('https://app.virgo.test/settings/storage');
  });

  it('tells the owner when the delivered month pauses downloads', async () => {
    const m = serviceOver({ delivered: FREE }, { upserted: { delivered: String(FREE), paused: false } });
    await m.service.recordDelivered(OWNER, [{ key: 'k', bytes: GB }], NOW);

    expect(m.claims()[0][0]).toMatch(/set paused_at = now\(\), warned_at = coalesce\(warned_at, now\(\)\)/);
    const n = sent(m.notify);
    expect(n.title).toBe('Client downloads are paused');
    expect(n.data).toEqual({ type: 'downloads', state: 'paused', reason: 'allowance', month: '2026-10-01' });
    expect(n.body).toContain('have delivered your 45 GB for this month');
    expect(n.email.text).toContain('Nothing has been deleted.');
  });

  it("measures against the month's line with staff's extra in it", async () => {
    // 50 GB delivered is past Free's 45 but short of 45 + 30, and under 80% of it.
    const m = serviceOver(
      { delivered: 50 * GB, extra: 30 * GB },
      { upserted: { delivered: String(50 * GB), paused: false } },
    );
    await m.service.recordDelivered(OWNER, [{ key: 'k', bytes: GB }], NOW);
    expect(m.notify).not.toHaveBeenCalled();
  });

  it('sends nothing when another download already claimed the alert', async () => {
    const m = serviceOver(
      { delivered: 40 * GB },
      { upserted: { delivered: String(40 * GB), paused: false }, claimed: false },
    );
    await m.service.recordDelivered(OWNER, [{ key: 'k', bytes: GB }], NOW);
    expect(m.claims()).toHaveLength(1);
    expect(m.notify).not.toHaveBeenCalled();
  });

  it('has nothing more to say once the month is paused, or when nothing new was delivered', async () => {
    for (const upserted of [{ delivered: String(50 * GB), paused: true }, null]) {
      const m = serviceOver({ delivered: 50 * GB }, { upserted });
      await m.service.recordDelivered(OWNER, [{ key: 'k', bytes: GB }], NOW);
      expect(m.queryOne).not.toHaveBeenCalled();
      expect(m.notify).not.toHaveBeenCalled();
    }
  });

  it('never lets a failed alert fail the download', async () => {
    const m = serviceOver(
      { delivered: FREE },
      { upserted: { delivered: String(FREE), paused: false }, notifyFails: true },
    );
    await expect(m.service.recordDelivered(OWNER, [{ key: 'k', bytes: GB }], NOW)).resolves.toBeUndefined();
    expect(m.notify).toHaveBeenCalledTimes(1);
  });
});

describe('DownloadAllowanceService.setExtra', () => {
  it("replaces this month's extra, clears the alert stamps, and answers the new standing", async () => {
    const m = serviceOver({ delivered: FREE, extra: 30 * GB });

    const usage = await m.service.setExtra(OWNER, 30 * GB + 0.5, 'admin-1', NOW);

    const [sql, params] = m.query.mock.calls[0];
    expect(sql).toMatch(/extra_bytes = excluded\.extra_bytes/);
    expect(sql).toMatch(/warned_at = null,\s+paused_at = null/);
    expect(params).toEqual([OWNER, '2026-10-01', 30 * GB, 'admin-1']);
    expect(usage).toMatchObject({ limitBytes: 75 * GB, paused: false, extraBytes: 30 * GB });
  });
});

describe('which files a zip download reached', () => {
  // Three files in zip order, about 128 bytes of entry overhead before each.
  const FILES = [
    { key: 'a', size: 1_000 },
    { key: 'b', size: 1_000 },
    { key: 'c', size: 1_000 },
  ];

  it('counts the files whose bytes went out, and none after', () => {
    expect(filesReached(FILES, 0, 500).map((f) => f.key)).toEqual(['a']);
    // Into b's entry, not yet to c.
    expect(filesReached(FILES, 0, 1_300).map((f) => f.key)).toEqual(['a', 'b']);
    expect(filesReached(FILES, 0, 10_000).map((f) => f.key)).toEqual(['a', 'b', 'c']);
  });

  it('counts a resume from where it starts', () => {
    // From the middle of b's bytes to the end.
    expect(filesReached(FILES, 1_700, 2_000).map((f) => f.key)).toEqual(['b', 'c']);
  });

  it('gives each file its own size, and nothing for nothing sent', () => {
    expect(filesReached(FILES, 0, 10_000)).toEqual([
      { key: 'a', bytes: 1_000 },
      { key: 'b', bytes: 1_000 },
      { key: 'c', bytes: 1_000 },
    ]);
    expect(filesReached(FILES, 0, 0)).toEqual([]);
  });
});

describe('rangeStart', () => {
  it('reads where a Range request starts', () => {
    expect(rangeStart('bytes=500-', 2_000)).toBe(500);
    expect(rangeStart('bytes=500-999', 2_000)).toBe(500);
    expect(rangeStart('bytes=-500', 2_000)).toBe(1_500);
    for (const range of [undefined, '', 'items=5-']) expect(rangeStart(range, 2_000)).toBe(0);
  });
});

describe('sizes and the reset day', () => {
  it('writes them the way the apps do', () => {
    expect(formatGb(30 * GB)).toBe('30 GB');
    expect(formatGb(24.4 * GB)).toBe('24 GB');
    expect(formatGb(7.46 * GB)).toBe('7.5 GB');
    // 04:00 on November 1 in Manila is still October in UTC, so the count
    // starts again later that same morning.
    expect(resetsOn(new Date('2026-10-31T20:00:00Z'))).toBe('November 1');
    expect(resetsOn(new Date('2026-12-15T00:00:00Z'))).toBe('January 1');
  });
});

describe('DownloadAllowanceService.meter', () => {
  /** A response whose socket has sent `bytesWritten` so far. */
  function response(bytesWritten: number) {
    const socket = { bytesWritten };
    const res = Object.assign(new EventEmitter(), { socket });
    return { res: res as unknown as Response, socket, emit: () => res.emit('close') };
  }

  afterEach(() => jest.useRealTimers());

  it('charges what this response sent, not what the connection sent before it', async () => {
    const { service } = serviceOver(null);
    const recordSent = jest.spyOn(service, 'recordSent').mockResolvedValue();
    const { res, socket, emit } = response(10_000);

    service.meter(OWNER, res);
    socket.bytesWritten += 7_000_000;
    emit();

    expect(recordSent).toHaveBeenCalledTimes(1);
    expect(recordSent).toHaveBeenCalledWith(OWNER, 7_000_000);
  });

  it('reports a long download as it goes, without counting a byte or a file twice', () => {
    jest.useFakeTimers();
    const { service } = serviceOver(null);
    const recordSent = jest.spyOn(service, 'recordSent').mockResolvedValue();
    const recordDelivered = jest.spyOn(service, 'recordDelivered').mockResolvedValue();
    const files = [
      { key: 'a', size: 100 },
      { key: 'b', size: 100 },
    ];
    const { res, socket, emit } = response(0);

    service.meter(OWNER, res, (n) => filesReached(files, 0, n));
    socket.bytesWritten = 100;
    jest.advanceTimersByTime(30_000);
    socket.bytesWritten = 250;
    jest.advanceTimersByTime(30_000);
    // Nothing new since the last report: no write.
    jest.advanceTimersByTime(30_000);
    socket.bytesWritten = 300;
    emit();
    // And nothing after the response has closed.
    socket.bytesWritten = 10_000;
    jest.advanceTimersByTime(60_000);

    expect(recordSent.mock.calls.map((c) => c[1])).toEqual([100, 150, 50]);
    expect(recordDelivered.mock.calls.map((c) => c[1].map((f) => f.key))).toEqual([['a'], ['b']]);
  });

  it('does nothing for a response with no socket', () => {
    const { service } = serviceOver(null);
    const recordSent = jest.spyOn(service, 'recordSent');
    const res = Object.assign(new EventEmitter(), { socket: null }) as unknown as Response;

    service.meter(OWNER, res);
    res.emit('close');

    expect(recordSent).not.toHaveBeenCalled();
  });
});

describe('isResumedRange', () => {
  it('recognises a browser picking a download back up', () => {
    expect(isResumedRange('bytes=1048576-')).toBe(true);
    expect(isResumedRange('bytes=500-999')).toBe(true);
  });

  it('does not let a fresh download through as a resume', () => {
    for (const range of [undefined, '', 'bytes=0-', 'bytes=0-1023', 'bytes=-500', 'items=5-']) {
      expect(isResumedRange(range)).toBe(false);
    }
  });
});

describe('what a paused client is told', () => {
  it('names no plan, allowance or account', () => {
    expect(DOWNLOADS_PAUSED_MESSAGE).toBe(
      'Downloads for this gallery are paused. Ask the photographer to send it again later.',
    );
    expect(DOWNLOADS_PAUSED_MESSAGE).not.toMatch(/plan|limit|allowance|quota|GB|account/i);
  });
});
