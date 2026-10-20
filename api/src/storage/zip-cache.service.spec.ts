import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { ConfigService } from '@nestjs/config';

// archiver is ESM-only; what is under test here is the cache around it.
jest.mock('archiver', () => {
  const { PassThrough } = require('node:stream');
  class ZipArchive extends PassThrough {
    private pending: Promise<void>[] = [];
    append(s: NodeJS.ReadableStream) {
      this.pending.push(
        new Promise<void>((resolve) => {
          s.on('data', (c) => this.write(c));
          s.on('end', () => resolve());
        }),
      );
    }
    async finalize() {
      await Promise.all(this.pending);
      this.end();
    }
    abort() {
      this.destroy();
    }
  }
  return { ZipArchive };
});

import { ZipCacheService } from './zip-cache.service';

const files = [
  { key: 'a', name: 'a.jpg' },
  { key: 'b', name: 'b.jpg' },
];

async function waitFor(entry: { state: string }, state: string) {
  for (let i = 0; i < 200 && entry.state !== state; i++) await new Promise((r) => setTimeout(r, 10));
  expect(entry.state).toBe(state);
}

describe('ZipCacheService', () => {
  let dir: string;
  const make = (over: Record<string, string> = {}) => {
    const cfg: Record<string, string> = {
      DOWNLOAD_CACHE_DIR: dir,
      DOWNLOAD_ZIP_MIN_FREE_GB: '0',
      DOWNLOAD_ZIP_RETRY_DELAY_MS: '0',
      ...over,
    };
    const svc = new ZipCacheService({
      get: (k: string, d?: string) => cfg[k] ?? d,
    } as unknown as ConfigService);
    return svc;
  };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'zipcache-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('builds a zip on disk with a known size and reuses it for the same files', async () => {
    const svc = make();
    await svc.onModuleInit();
    const open = jest.fn(async (k: string) => Readable.from([Buffer.from(k.repeat(1000))]));
    const e1 = svc.request('o1', 'x.zip', files, open);
    await waitFor(e1, 'ready');
    expect((await stat(e1.path)).size).toBe(e1.size);
    expect(e1.size).toBeGreaterThan(0);
    const e2 = svc.request('o1', 'x.zip', files, open);
    expect(e2).toBe(e1);
    expect(open).toHaveBeenCalledTimes(2);
    svc.onModuleDestroy();
  });

  it('does not cache a zip that had an unreadable entry', async () => {
    const svc = make();
    await svc.onModuleInit();
    const open = jest.fn(async (k: string) => {
      if (k === 'b') throw new Error('gone');
      return Readable.from([Buffer.from('data')]);
    });
    const e = svc.request('o1', 'x.zip', files, open);
    await waitFor(e, 'failed');
    expect(await readdir(join(dir, '_zips'))).toEqual([]);
    svc.onModuleDestroy();
  });

  it('removes idle zips after their lifetime but keeps one being downloaded', async () => {
    const svc = make({ DOWNLOAD_ZIP_TTL_HOURS: '0.0000001' });
    await svc.onModuleInit();
    const open = async (k: string) => Readable.from([Buffer.from(k)]);
    const busy = svc.request('o1', 'busy.zip', files, open);
    const idle = svc.request('o1', 'idle.zip', [{ key: 'c', name: 'c' }], open);
    await waitFor(busy, 'ready');
    await waitFor(idle, 'ready');
    const release = svc.hold(busy);
    await new Promise((r) => setTimeout(r, 30));
    await svc.sweep();
    expect((await readdir(join(dir, '_zips'))).sort()).toEqual([`${busy.id}.zip`]);
    release();
    svc.onModuleDestroy();
  });

  it('queues beyond the limit, runs small zips first and spreads owners', async () => {
    const svc = make({ DOWNLOAD_ZIP_BUILDS_MIN: '2', DOWNLOAD_ZIP_BUILDS_MAX: '2' });
    await svc.onModuleInit();
    let unblock!: () => void;
    const gate = new Promise<void>((r) => (unblock = r));
    const started: string[] = [];
    const open = async (k: string) => {
      started.push(k);
      await gate;
      return Readable.from([Buffer.from(k)]);
    };
    const many = (p: string, n: number) => Array.from({ length: n }, (_, i) => ({ key: `${p}${i}`, name: `${p}${i}` }));
    const first = svc.request('o1', 'first.zip', many('f', 1), open);
    const second = svc.request('o1', 'second.zip', many('h', 1), open);
    const bigSame = svc.request('o1', 'big.zip', many('g', 5), open);
    const smallSame = svc.request('o1', 'small.zip', many('s', 2), open);
    const other = svc.request('o2', 'other.zip', many('x', 8), open);
    await waitFor(first, 'building');
    await waitFor(second, 'building');
    expect(svc.queued).toBe(3);
    // Both workers belong to o1, so the other owner's zip goes first, then the smallest.
    expect(svc.queuePosition(other)).toBeGreaterThan(0);
    unblock();
    await waitFor(other, 'ready');
    await waitFor(bigSame, 'ready');
    await waitFor(smallSame, 'ready');
    expect(started.indexOf('x0')).toBeLessThan(started.indexOf('s0'));
    expect(started.indexOf('s0')).toBeLessThan(started.indexOf('g0'));
    svc.onModuleDestroy();
  });

  it('drops a queued zip nobody is waiting for', async () => {
    const svc = make({ DOWNLOAD_ZIP_BUILDS_MIN: '2', DOWNLOAD_ZIP_BUILDS_MAX: '2' });
    await svc.onModuleInit();
    let unblock!: () => void;
    const gate = new Promise<void>((r) => (unblock = r));
    const open = async (k: string) => {
      await gate;
      return Readable.from([Buffer.from(k)]);
    };
    const running = svc.request('o1', 'a.zip', files, open);
    const filler = svc.request('o1', 'f.zip', [{ key: 'd', name: 'd' }], open);
    const waiting = svc.request('o2', 'b.zip', [{ key: 'c', name: 'c' }], open);
    const realNow = Date.now;
    Date.now = () => realNow() + 6 * 60_000;
    try {
      svc.dropAbandoned();
    } finally {
      Date.now = realNow;
    }
    expect(svc.queued).toBe(0);
    expect(svc.queuePosition(waiting)).toBe(0);
    unblock();
    await waitFor(running, 'ready');
    await waitFor(filler, 'ready');
    svc.onModuleDestroy();
  });

  it('cuts concurrency after a storage failure', async () => {
    const svc = make({ DOWNLOAD_ZIP_BUILDS_MIN: '1', DOWNLOAD_ZIP_BUILDS_MAX: '3' });
    await svc.onModuleInit();
    expect(svc.concurrency).toBe(2);
    const open = async () => {
      throw new Error('timeout');
    };
    const e = svc.request('o1', 'x.zip', files, open);
    await waitFor(e, 'failed');
    await new Promise((r) => setTimeout(r, 20));
    expect(svc.concurrency).toBe(1);
    svc.onModuleDestroy();
  });
});
