import { ConfigService } from '@nestjs/config';
import { mkdtemp, readdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { DownloadCacheService } from './download-cache.service';
import { StorageService } from './storage.service';

async function drain(s: Readable): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const c of s) parts.push(c as Buffer);
  return Buffer.concat(parts);
}
const settle = () => new Promise((r) => setTimeout(r, 80));

describe('DownloadCacheService', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dlcache-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function make(env: Record<string, string>, body: Buffer | Error = Buffer.from('hello world')) {
    const readStreamWithSize = jest.fn(async () => {
      if (body instanceof Error) throw body;
      return { stream: Readable.from([body]), size: body.length };
    });
    const config = { get: (k: string, d?: string) => env[k] ?? d } as unknown as ConfigService;
    const svc = new DownloadCacheService({ readStreamWithSize } as unknown as StorageService, config);
    return { svc, readStreamWithSize };
  }
  const base = () => ({ DOWNLOAD_CACHE_DIR: dir, DOWNLOAD_CACHE_MAX_GB: '1', DOWNLOAD_CACHE_MIN_FREE_GB: '0' });

  it('miss streams from storage and fills the cache; the next read is a hit with no storage call', async () => {
    const { svc, readStreamWithSize } = make(base());
    const first = await svc.open('users/u/a.jpg');
    expect(first.hit).toBe(false);
    expect((await drain(first.stream)).toString()).toBe('hello world');
    await settle();

    const second = await svc.open('users/u/a.jpg');
    expect(second.hit).toBe(true);
    expect(second.size).toBe(11);
    expect((await drain(second.stream)).toString()).toBe('hello world');
    expect(readStreamWithSize).toHaveBeenCalledTimes(1);
  });

  it('never keeps a partial copy when the reader leaves early', async () => {
    const src = new PassThrough();
    const config = { get: (k: string, d?: string) => base()[k as keyof ReturnType<typeof base>] ?? d } as unknown as ConfigService;
    const svc = new DownloadCacheService(
      { readStreamWithSize: async () => ({ stream: src, size: 100 }) } as unknown as StorageService,
      config,
    );
    const { stream } = await svc.open('k');
    src.write('partial');
    stream.destroy();
    await settle();
    expect(await svc.lookup('k')).toBeNull();
    const all = await readdir(dir, { recursive: true });
    expect(all.filter((f) => String(f).endsWith('.part'))).toEqual([]);
  });

  it('is a plain pass-through when disabled', async () => {
    const { svc } = make({ ...base(), DOWNLOAD_CACHE_MAX_GB: '0' });
    const o = await svc.open('k');
    expect((await drain(o.stream)).toString()).toBe('hello world');
    await settle();
    expect(await readdir(dir)).toEqual([]);
  });

  it('fails open when the cache directory cannot be written', async () => {
    const blocker = join(dir, 'file');
    await writeFile(blocker, 'x');
    const { svc } = make({ DOWNLOAD_CACHE_DIR: join(blocker, 'sub'), DOWNLOAD_CACHE_MAX_GB: '1' });
    const o = await svc.open('k');
    expect((await drain(o.stream)).toString()).toBe('hello world');
  });

  it('skips objects over the per-object cap', async () => {
    const { svc } = make({ ...base(), DOWNLOAD_CACHE_MAX_OBJECT_MB: '0.00001' });
    await drain((await svc.open('big')).stream);
    await settle();
    expect(await svc.lookup('big')).toBeNull();
  });

  it('propagates a storage failure so the caller can fall back', async () => {
    const { svc } = make(base(), new Error('B2 down'));
    await expect(svc.open('k')).rejects.toThrow('B2 down');
  });

  it('evicts the least recently read objects first', async () => {
    const { svc } = make({ DOWNLOAD_CACHE_DIR: dir, DOWNLOAD_CACHE_MAX_GB: String(15 / 1024 ** 3), DOWNLOAD_CACHE_MIN_FREE_GB: '0' });
    for (const [k, age] of [['old', 300], ['mid', 200], ['new', 100]] as const) {
      const p = svc.pathFor(k);
      await (await import('node:fs/promises')).mkdir(join(p, '..'), { recursive: true });
      await writeFile(p, Buffer.alloc(10));
      const t = new Date(Date.now() - age * 1000);
      await utimes(p, t, t);
    }
    const r = await svc.evict();
    expect(r.removed).toBe(2);
    expect(await svc.lookup('old')).toBeNull();
    expect(await svc.lookup('mid')).toBeNull();
    expect(await svc.lookup('new')).not.toBeNull();
    expect((await stat(svc.pathFor('new'))).size).toBe(10);
    void readFile;
  });
});

describe('DownloadCacheService free-space floor', () => {
  it('passes through without caching when the disk is below the floor', async () => {
    const d = await mkdtemp(join(tmpdir(), 'dlcache-'));
    const config = {
      get: (k: string, def?: string) =>
        ({ DOWNLOAD_CACHE_DIR: d, DOWNLOAD_CACHE_MAX_GB: '1', DOWNLOAD_CACHE_MIN_FREE_GB: '99999999' })[k] ?? def,
    } as unknown as ConfigService;
    const svc = new DownloadCacheService(
      { readStreamWithSize: async () => ({ stream: Readable.from([Buffer.from('abc')]), size: 3 }) } as unknown as StorageService,
      config,
    );
    expect((await drain((await svc.open('k')).stream)).toString()).toBe('abc');
    await settle();
    expect(await svc.lookup('k')).toBeNull();
    await rm(d, { recursive: true, force: true });
  });
});
