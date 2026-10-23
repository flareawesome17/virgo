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
          s.on('end', () => {
            // zipInto paces itself on this, as on the real archiver.
            this.emit('entry', {});
            resolve();
          });
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
    // One gate per zip, by the first letter of its keys, so the workers free
    // one at a time. Freed together, the two next builds start together, and
    // which one reaches its first open() is down to the disk checks each
    // awaits before it: the order they were picked in is all the scheduler
    // decides.
    const release: Record<string, () => void> = {};
    const gate = Object.fromEntries([...'fhgsx'].map((p) => [p, new Promise<void>((r) => (release[p] = r))]));
    const started: string[] = [];
    const open = async (k: string) => {
      started.push(k);
      await gate[k[0]];
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
    expect(svc.queuePosition(other)).toBeGreaterThan(0);
    // o1 still has a worker, so the other owner's zip goes first, biggest as it is.
    release.f();
    await waitFor(other, 'building');
    expect(smallSame.state).toBe('queued');
    expect(bigSame.state).toBe('queued');
    // Now the other owner holds a worker: o1's smallest goes next, ahead of its big one.
    release.h();
    await waitFor(smallSame, 'building');
    expect(bigSame.state).toBe('queued');
    Object.values(release).forEach((r) => r());
    await waitFor(other, 'ready');
    await waitFor(bigSame, 'ready');
    await waitFor(smallSame, 'ready');
    expect(started.indexOf('x0')).toBeLessThan(started.indexOf('s0'));
    expect(started.indexOf('s0')).toBeLessThan(started.indexOf('g0'));
    svc.onModuleDestroy();
  });

  it('tells a waiting client the place the scheduler will start their zip in', async () => {
    const svc = make({ DOWNLOAD_ZIP_BUILDS_MIN: '2', DOWNLOAD_ZIP_BUILDS_MAX: '2' });
    await svc.onModuleInit();
    let unblock!: () => void;
    const gate = new Promise<void>((r) => (unblock = r));
    const open = async (k: string) => {
      await gate;
      return Readable.from([Buffer.from(k)]);
    };
    const many = (p: string, n: number) => Array.from({ length: n }, (_, i) => ({ key: `${p}${i}`, name: `${p}${i}` }));
    const first = svc.request('o1', 'first.zip', many('f', 1), open);
    const second = svc.request('o1', 'second.zip', many('h', 1), open);
    const big = svc.request('o1', 'big.zip', many('g', 5), open);
    const small = svc.request('o1', 'small.zip', many('s', 2), open);
    const other = svc.request('o2', 'other.zip', many('x', 8), open);
    // o1 keeps a worker whichever of its builds finishes, so the other
    // owner's zip is next, biggest as it is; then o1's, smallest first.
    expect([other, small, big].map((e) => svc.queuePosition(e))).toEqual([1, 2, 3]);
    unblock();
    for (const e of [first, second, other, small, big]) await waitFor(e, 'ready');
    svc.onModuleDestroy();
  });

  it('places a waiting zip as if running builds finish in the order they started', async () => {
    const svc = make({ DOWNLOAD_ZIP_BUILDS_MIN: '2', DOWNLOAD_ZIP_BUILDS_MAX: '2' });
    await svc.onModuleInit();
    let unblock!: () => void;
    const gate = new Promise<void>((r) => (unblock = r));
    const open = async (k: string) => {
      await gate;
      return Readable.from([Buffer.from(k)]);
    };
    const many = (p: string, n: number) => Array.from({ length: n }, (_, i) => ({ key: `${p}${i}`, name: `${p}${i}` }));
    const older = svc.request('o1', 'older.zip', many('a', 1), open);
    const newer = svc.request('o2', 'newer.zip', many('b', 1), open);
    const o2Small = svc.request('o2', 'o2-small.zip', many('m', 1), open);
    const o1Bigger = svc.request('o1', 'o1-bigger.zip', many('t', 2), open);
    const o3Big = svc.request('o3', 'o3-big.zip', many('u', 10), open);
    // o1's build is taken to finish first. That frees o1 while o2 still has a
    // worker, so o1's zip goes ahead of o2's smaller one. o3 has nothing
    // running but stays last: fairness holds back a busy owner, it does not
    // put an idle one ahead of smaller zips.
    expect([o1Bigger, o2Small, o3Big].map((e) => svc.queuePosition(e))).toEqual([1, 2, 3]);
    unblock();
    for (const e of [older, newer, o2Small, o1Bigger, o3Big]) await waitFor(e, 'ready');
    svc.onModuleDestroy();
  });

  it('keeps a queued zip through a phone in the background, then drops it', async () => {
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
    try {
      // Ten minutes in Messenger: still in line.
      Date.now = () => realNow() + 10 * 60_000;
      svc.dropAbandoned();
      expect(svc.queuePosition(waiting)).toBe(1);
      Date.now = () => realNow() + 31 * 60_000;
      // The running ones are still being asked about; only the queued one is not.
      svc.request('o1', 'a.zip', files, open);
      svc.request('o1', 'f.zip', [{ key: 'd', name: 'd' }], open);
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

  it('counts progress in bytes when the sizes are known, and files only once written', async () => {
    const svc = make();
    await svc.onModuleInit();
    const { PassThrough } = await import('node:stream');
    const sources: InstanceType<typeof PassThrough>[] = [];
    const open = async () => {
      const s = new PassThrough();
      s.write(Buffer.alloc(2 * 1024 ** 2));
      sources.push(s);
      return s;
    };
    const sized = [
      { key: 'a', name: 'a.jpg', size: 2 * 1024 ** 2 },
      { key: 'b', name: 'b.jpg', size: 2 * 1024 ** 2 },
    ];
    const e = svc.request('o1', 'sized.zip', sized, open);
    expect(e.totalBytes).toBe(4 * 1024 ** 2);
    await waitFor(e, 'building');
    for (let i = 0; i < 100 && svc.progress(e).bytes < 2 * 1024 ** 2; i++) {
      await new Promise((r) => setTimeout(r, 10));
    }
    const p = svc.progress(e);
    expect(p.bytes).toBeGreaterThanOrEqual(2 * 1024 ** 2);
    expect(p.totalBytes).toBe(4 * 1024 ** 2);
    // Both files are open, but neither has finished: none is done.
    expect(p.done).toBe(0);
    sources.forEach((s) => s.end());
    await waitFor(e, 'ready');
    expect(e.done).toBe(2);
    svc.onModuleDestroy();
  });

  it('leaves the total in bytes unknown when any size is missing', async () => {
    const svc = make();
    await svc.onModuleInit();
    const e = svc.request('o1', 'partly.zip', [{ key: 'a', name: 'a', size: 10 }, { key: 'b', name: 'b' }], async () => Readable.from(['x']));
    expect(e.totalBytes).toBeUndefined();
    // request() starts a real build; let it finish before the temp dir is removed.
    await waitFor(e, 'ready');
    svc.onModuleDestroy();
  });

  it('stops a stalled build without taking the process down', async () => {
    const svc = make();
    await svc.onModuleInit();
    const { PassThrough } = await import('node:stream');
    // Storage that answers and then sends nothing more.
    const open = async () => {
      const s = new PassThrough();
      s.write('x');
      return s;
    };
    const e = svc.request('o1', 'stuck.zip', files, open);
    await waitFor(e, 'building');
    await new Promise((r) => setTimeout(r, 30));
    const realNow = Date.now;
    try {
      // The watchdog runs every minute: the first pass notes the bytes so far,
      // a pass more than three minutes later finds nothing has moved.
      Date.now = () => realNow() + 60_000;
      svc.dropAbandoned();
      Date.now = () => realNow() + 5 * 60_000;
      svc.dropAbandoned();
    } finally {
      Date.now = realNow;
    }
    // Before the fix the watchdog's destroy was an unhandled 'error' event:
    // an uncaught exception that ended the API, every download with it.
    await waitFor(e, 'failed');
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
