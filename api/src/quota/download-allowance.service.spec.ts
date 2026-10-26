import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import type { DatabaseService } from '../database/database.service';
import type { MailConfig } from '../mail/mail.config';
import type { NotifyService } from '../notifications/notify.service';
import {
  DOWNLOADS_PAUSED_MESSAGE,
  DownloadAllowanceService,
  formatGb,
  isResumedRange,
  monthKey,
  nextMonthStart,
  resetsOn,
} from './download-allowance.service';
import { PLAN_CATALOGUE, PLAN_LIMITS } from './quota.config';

/**
 * The monthly client-download allowance.
 *
 * Every client download is gated by this, so the properties that matter most
 * are the failure ones: a counter that cannot be read or written lets the
 * download through, and nothing a client sees names the photographer's plan.
 */

const GB = 1024 ** 3;
const TB = 1024 ** 4;
const OWNER = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-10-17T08:30:00Z');

const MAIL = { appUrl: 'https://app.virgo.test' } as MailConfig;

function quietNotifier() {
  const notify = jest.fn(async (_userIds: readonly string[], _n: unknown) => undefined);
  return { notify, notifier: { notify } as unknown as NotifyService };
}

function allowanceOver(row: { plan: string | null; used: string } | null) {
  const queryOne = jest.fn(async (_sql: string, _params: unknown[]) => row);
  const query = jest.fn(async (_sql: string, _params: unknown[]) => []);
  const service = new DownloadAllowanceService(
    { queryOne, query } as unknown as DatabaseService,
    quietNotifier().notifier,
    MAIL,
  );
  return { service, queryOne, query };
}

function failingDb() {
  const boom = jest.fn(async () => {
    throw new Error('relation "download_usage" does not exist');
  });
  const service = new DownloadAllowanceService(
    { queryOne: boom, query: boom } as unknown as DatabaseService,
    quietNotifier().notifier,
    MAIL,
  );
  // The warning is the point of failing open; keep it out of the test output.
  jest
    .spyOn((service as unknown as { logger: { warn: () => void } }).logger, 'warn')
    .mockImplementation(() => undefined);
  return service;
}

describe('plan download allowances', () => {
  it('gives Free twice its storage and every paid tier three times', () => {
    expect(PLAN_LIMITS.free.downloadBytesPerMonth).toBe(30 * GB);
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
      free: '30 GB of client downloads a month',
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
  it("reads this month's count against the plan's allowance", async () => {
    const { service, queryOne } = allowanceOver({ plan: 'freelance', used: '1234' });

    await expect(service.usage(OWNER, NOW)).resolves.toEqual({
      usedBytes: 1234,
      limitBytes: 300 * GB,
      resetsAt: '2026-11-01T00:00:00.000Z',
    });
    expect(queryOne.mock.calls[0][1]).toEqual([OWNER, '2026-10-01']);
  });

  it('treats an unknown plan, or a missing row, as Free', async () => {
    for (const row of [{ plan: 'platinum', used: '0' }, null]) {
      const { service } = allowanceOver(row);
      const usage = await service.usage(OWNER, NOW);
      expect(usage.limitBytes).toBe(30 * GB);
      expect(usage.usedBytes).toBe(0);
    }
  });
});

describe('DownloadAllowanceService.allows', () => {
  it('lets a download start while there is allowance left', async () => {
    const { service } = allowanceOver({ plan: 'free', used: String(30 * GB - 1) });
    await expect(service.allows(OWNER, NOW)).resolves.toBe(true);
  });

  it('refuses once the month is used, and past it', async () => {
    for (const used of [30 * GB, 31 * GB]) {
      const { service } = allowanceOver({ plan: 'free', used: String(used) });
      await expect(service.allows(OWNER, NOW)).resolves.toBe(false);
    }
  });

  it('fails open when the counter cannot be read', async () => {
    await expect(failingDb().allows(OWNER, NOW)).resolves.toBe(true);
  });
});

describe('DownloadAllowanceService.record', () => {
  it('adds to the month in one atomic upsert', async () => {
    const { service, query } = allowanceOver(null);

    await service.record(OWNER, 5_000_000.7, NOW);

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/on conflict \(user_id, month\)/);
    expect(sql).toMatch(/bytes = download_usage\.bytes \+ excluded\.bytes/);
    expect(params).toEqual([OWNER, '2026-10-01', 5_000_000]);
  });

  it('writes nothing for nothing sent', async () => {
    const { service, query } = allowanceOver(null);
    for (const bytes of [0, -10, Number.NaN]) await service.record(OWNER, bytes, NOW);
    expect(query).not.toHaveBeenCalled();
  });

  it('never throws, so a counter failure cannot fail a download', async () => {
    await expect(failingDb().record(OWNER, 10, NOW)).resolves.toBeUndefined();
  });
});

describe('telling the photographer', () => {
  /**
   * A month that stands at `total` once this download is added. `claimed`
   * is whether this download wins the alert's stamp, which it loses to one
   * that crossed the line a moment earlier.
   */
  function month(options: {
    total: number;
    paused?: boolean;
    plan?: string;
    claimed?: boolean;
    notifyFails?: boolean;
  }) {
    const query = jest.fn(async (sql: string, _params: unknown[]) => {
      if (/insert into download_usage/.test(sql)) {
        return [{ bytes: String(options.total), paused: options.paused ?? false }];
      }
      return options.claimed === false ? [] : [{ '?column?': 1 }];
    });
    const queryOne = jest.fn(async (_sql: string, _params: unknown[]) => ({
      plan: options.plan ?? 'free',
      name: 'Andrea Santos',
    }));
    const notify = jest.fn(async (_userIds: readonly string[], _n: unknown) => {
      if (options.notifyFails) throw new Error('mail server down');
    });
    const service = new DownloadAllowanceService(
      { query, queryOne } as unknown as DatabaseService,
      { notify } as unknown as NotifyService,
      MAIL,
    );
    jest
      .spyOn((service as unknown as { logger: { warn: () => void } }).logger, 'warn')
      .mockImplementation(() => undefined);
    const claims = () => query.mock.calls.filter(([sql]) => /^\s*update download_usage/.test(sql));
    return { service, query, queryOne, notify, claims };
  }

  type Sent = { topic: string; title: string; body: string; data: Record<string, unknown>; email: { subject: string; text: string } };
  const sent = (notify: jest.Mock) => notify.mock.calls[0][1] as Sent;

  it('says nothing, and looks nothing up, while the month is far from any line', async () => {
    const m = month({ total: 5 * GB });
    await m.service.record(OWNER, 1_000_000, NOW);
    expect(m.queryOne).not.toHaveBeenCalled();
    expect(m.notify).not.toHaveBeenCalled();
  });

  it('says nothing between the lines on a bigger plan', async () => {
    const m = month({ total: 25 * GB, plan: 'freelance' });
    await m.service.record(OWNER, 1_000_000, NOW);
    expect(m.claims()).toHaveLength(0);
    expect(m.notify).not.toHaveBeenCalled();
  });

  it('warns the owner once 80% of the month is used', async () => {
    const m = month({ total: 25 * GB });
    await m.service.record(OWNER, 1_000_000, NOW);

    expect(m.claims()).toHaveLength(1);
    expect(m.claims()[0][0]).toMatch(/set warned_at = now\(\)/);
    expect(m.claims()[0][0]).toMatch(/warned_at is null and paused_at is null/);
    expect(m.claims()[0][1]).toEqual([OWNER, '2026-10-01']);

    expect(m.notify).toHaveBeenCalledTimes(1);
    expect(m.notify.mock.calls[0][0]).toEqual([OWNER]);
    const n = sent(m.notify);
    expect(n.topic).toBe('billing');
    expect(n.data).toEqual({ type: 'downloads', state: 'warning', month: '2026-10-01' });
    expect(n.body).toBe(
      'Your clients have downloaded 25 GB of your 30 GB this month. At 30 GB, new downloads from your client links pause until November 1.',
    );
    expect(n.email.subject).toBe('Most of this month’s client downloads are used');
    expect(n.email.text).toContain('Hi Andrea Santos');
    expect(n.email.text).toContain('https://app.virgo.test/settings/storage');
  });

  it('tells the owner when downloads pause, stamping the warning too', async () => {
    const m = month({ total: 30 * GB });
    await m.service.record(OWNER, 1_000_000, NOW);

    expect(m.claims()).toHaveLength(1);
    expect(m.claims()[0][0]).toMatch(/set paused_at = now\(\), warned_at = coalesce\(warned_at, now\(\)\)/);
    const n = sent(m.notify);
    expect(n.title).toBe('Client downloads are paused');
    expect(n.data).toEqual({ type: 'downloads', state: 'paused', month: '2026-10-01' });
    expect(n.body).toContain('paused until November 1');
    expect(n.email.text).toContain('Nothing has been deleted.');
  });

  it('sends nothing when another download already claimed the alert', async () => {
    const m = month({ total: 26 * GB, claimed: false });
    await m.service.record(OWNER, 1_000_000, NOW);
    expect(m.claims()).toHaveLength(1);
    expect(m.notify).not.toHaveBeenCalled();
  });

  it('has nothing more to say once the month is paused', async () => {
    const m = month({ total: 40 * GB, paused: true });
    await m.service.record(OWNER, 1_000_000, NOW);
    expect(m.queryOne).not.toHaveBeenCalled();
    expect(m.notify).not.toHaveBeenCalled();
  });

  it('never lets a failed alert fail the download', async () => {
    const m = month({ total: 30 * GB, notifyFails: true });
    await expect(m.service.record(OWNER, 1_000_000, NOW)).resolves.toBeUndefined();
    expect(m.notify).toHaveBeenCalledTimes(1);
  });

  it('writes sizes and the reset day the way the apps do', () => {
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
    const { service } = allowanceOver(null);
    const record = jest.spyOn(service, 'record').mockResolvedValue();
    const { res, socket, emit } = response(10_000);

    service.meter(OWNER, res);
    socket.bytesWritten += 7_000_000;
    emit();

    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(OWNER, 7_000_000);
  });

  it('reports a long download as it goes, without counting a byte twice', () => {
    jest.useFakeTimers();
    const { service } = allowanceOver(null);
    const record = jest.spyOn(service, 'record').mockResolvedValue();
    const { res, socket, emit } = response(0);

    service.meter(OWNER, res);
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

    expect(record.mock.calls.map((c) => c[1])).toEqual([100, 150, 50]);
  });

  it('does nothing for a response with no socket', () => {
    const { service } = allowanceOver(null);
    const record = jest.spyOn(service, 'record');
    const res = Object.assign(new EventEmitter(), { socket: null }) as unknown as Response;

    service.meter(OWNER, res);
    res.emit('close');

    expect(record).not.toHaveBeenCalled();
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
