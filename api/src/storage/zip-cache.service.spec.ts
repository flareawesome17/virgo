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
    const e1 = svc.request('x.zip', files, open);
    await waitFor(e1, 'ready');
    expect((await stat(e1.path)).size).toBe(e1.size);
    expect(e1.size).toBeGreaterThan(0);
    const e2 = svc.request('x.zip', files, open);
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
    const e = svc.request('x.zip', files, open);
    await waitFor(e, 'failed');
    expect(await readdir(join(dir, '_zips'))).toEqual([]);
    svc.onModuleDestroy();
  });

  it('removes idle zips after their lifetime but keeps one being downloaded', async () => {
    const svc = make({ DOWNLOAD_ZIP_TTL_HOURS: '0.0000001' });
    await svc.onModuleInit();
    const open = async (k: string) => Readable.from([Buffer.from(k)]);
    const busy = svc.request('busy.zip', files, open);
    const idle = svc.request('idle.zip', [{ key: 'c', name: 'c' }], open);
    await waitFor(busy, 'ready');
    await waitFor(idle, 'ready');
    const release = svc.hold(busy);
    await new Promise((r) => setTimeout(r, 30));
    await svc.sweep();
    expect((await readdir(join(dir, '_zips'))).sort()).toEqual([`${busy.id}.zip`]);
    release();
    svc.onModuleDestroy();
  });

  it('queues builds beyond the limit', async () => {
    const svc = make({ DOWNLOAD_ZIP_BUILDS: '1' });
    await svc.onModuleInit();
    let unblock!: () => void;
    const gate = new Promise<void>((r) => (unblock = r));
    const open = async (k: string) => {
      await gate;
      return Readable.from([Buffer.from(k)]);
    };
    const first = svc.request('one.zip', files, open);
    const second = svc.request('two.zip', [{ key: 'c', name: 'c' }], open);
    await new Promise((r) => setTimeout(r, 30));
    expect(first.state).toBe('building');
    expect(second.state).toBe('queued');
    expect(svc.queued).toBe(1);
    unblock();
    await waitFor(second, 'ready');
    svc.onModuleDestroy();
  });
});
