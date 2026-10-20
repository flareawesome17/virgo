import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, rm, stat, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { ZIPS_SUBDIR } from './download-cache.service';
import { Semaphore } from './semaphore';
import { zipInto } from './zip';

export type ZipFile = { key: string; name: string };

export interface ZipEntry {
  id: string;
  state: 'queued' | 'building' | 'ready' | 'failed';
  path: string;
  size: number;
  done: number;
  total: number;
  lastUsed: number;
  inUse: number;
  failedAt?: number;
}

/**
 * Zips built ahead of the download, on this host's disk.
 *
 * A zip streamed live has no size and cannot be resumed, so one storage
 * hiccup in the middle of a 5 GB wedding ended the whole download. A finished
 * zip on disk is an ordinary file: it has a length, it honours Range, a
 * download manager can split it and Chrome's Resume works.
 *
 * Bounded so it can never be what fills the disk: a total cap, a lifetime
 * after the last download, at most DOWNLOAD_ZIP_BUILDS building at once (the
 * rest queue, which keeps each build fast enough to finish over a slow link to
 * storage), one copy per distinct album and file set, and a zip that is being
 * downloaded is never evicted. A zip with any unreadable entry is thrown away
 * rather than cached, so a client is never handed a quietly incomplete album.
 */
@Injectable()
export class ZipCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ZipCacheService.name);
  private readonly dir: string;
  private readonly maxBytes: number;
  private readonly minFreeBytes: number;
  private readonly ttlMs: number;
  private readonly retryDelayMs: number;
  private readonly entries = new Map<string, ZipEntry>();
  private readonly builds: Semaphore;
  private timer?: NodeJS.Timeout;

  constructor(config: ConfigService) {
    this.dir = join(config.get<string>('DOWNLOAD_CACHE_DIR', '/srv/dlcache'), ZIPS_SUBDIR);
    this.maxBytes = Number(config.get('DOWNLOAD_ZIP_MAX_GB', '30')) * 1024 ** 3;
    this.minFreeBytes = Number(config.get('DOWNLOAD_ZIP_MIN_FREE_GB', '15')) * 1024 ** 3;
    this.ttlMs = Number(config.get('DOWNLOAD_ZIP_TTL_HOURS', '6')) * 3_600_000;
    this.retryDelayMs = Number(config.get('DOWNLOAD_ZIP_RETRY_DELAY_MS', '1500'));
    this.builds = new Semaphore(Number(config.get('DOWNLOAD_ZIP_BUILDS', '2')));
  }

  get enabled(): boolean {
    return this.maxBytes > 0;
  }

  /** Same album, same files, same zip. */
  static idFor(zipName: string, files: readonly ZipFile[]): string {
    const h = createHash('sha256').update(zipName);
    for (const f of files) h.update('\0').update(f.key).update('\0').update(f.name);
    return h.digest('hex').slice(0, 40);
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) return;
    // Anything on disk from a previous run is unindexed and possibly partial.
    await rm(this.dir, { recursive: true, force: true }).catch(() => undefined);
    await mkdir(this.dir, { recursive: true }).catch(() => undefined);
    this.timer = setInterval(() => void this.sweep(), 600_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** How many builds are waiting behind the ones running. */
  get queued(): number {
    return this.builds.queued;
  }

  /**
   * The entry for this zip, starting a build if there is none. A recent
   * failure is returned as is for a minute so a client's refresh loop does not
   * hammer a broken storage link; after that the next request tries again.
   */
  request(
    zipName: string,
    files: readonly ZipFile[],
    open: (key: string) => Promise<Readable>,
  ): ZipEntry {
    const id = ZipCacheService.idFor(zipName, files);
    const existing = this.entries.get(id);
    if (
      existing &&
      !(existing.state === 'failed' && Date.now() - (existing.failedAt ?? 0) > 60_000)
    ) {
      existing.lastUsed = Date.now();
      return existing;
    }
    const entry: ZipEntry = {
      id,
      state: 'queued',
      path: join(this.dir, `${id}.zip`),
      size: 0,
      done: 0,
      total: files.length,
      lastUsed: Date.now(),
      inUse: 0,
    };
    this.entries.set(id, entry);
    void this.builds.run(() => this.build(entry, zipName, files, open));
    return entry;
  }

  /** Marks a zip as being sent; call the returned function when the response closes. */
  hold(entry: ZipEntry): () => void {
    entry.inUse += 1;
    entry.lastUsed = Date.now();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      entry.inUse -= 1;
      entry.lastUsed = Date.now();
    };
  }

  private othersBytes(except: ZipEntry): number {
    let total = 0;
    for (const e of this.entries.values()) {
      if (e !== except && e.state === 'ready') total += e.size;
    }
    return total;
  }

  /** Drops idle ready zips, least recently used first, until `need` fits. */
  private async makeRoom(except: ZipEntry, need: number): Promise<boolean> {
    const idle = [...this.entries.values()]
      .filter((e) => e !== except && e.state === 'ready' && e.inUse === 0)
      .sort((a, b) => a.lastUsed - b.lastUsed);
    let used = this.othersBytes(except);
    for (const e of idle) {
      if (used + need <= this.maxBytes) break;
      await this.drop(e);
      used -= e.size;
    }
    return used + need <= this.maxBytes;
  }

  private async drop(e: ZipEntry): Promise<void> {
    this.entries.delete(e.id);
    await rm(e.path, { force: true }).catch(() => undefined);
  }

  private async freeBytes(): Promise<number> {
    try {
      const fs = await statfs(this.dir);
      return Number(fs.bavail) * Number(fs.bsize);
    } catch {
      return Number.POSITIVE_INFINITY;
    }
  }

  private async build(
    entry: ZipEntry,
    zipName: string,
    files: readonly ZipFile[],
    open: (key: string) => Promise<Readable>,
  ): Promise<void> {
    const part = `${entry.path}.${Date.now()}.part`;
    const fail = async (why: string) => {
      this.logger.error(`Zip "${zipName}" not built: ${why}`);
      entry.state = 'failed';
      entry.failedAt = Date.now();
      await rm(part, { force: true }).catch(() => undefined);
    };
    try {
      await mkdir(this.dir, { recursive: true });
      if ((await this.freeBytes()) < this.minFreeBytes) {
        this.sweep().catch(() => undefined);
        return await fail('host disk is below the free-space floor');
      }
      entry.state = 'building';
      const out = createWriteStream(part);
      const guard = (done: number) => {
        entry.done = done;
        // The final size is not known ahead of time, so check as it grows.
        if (this.othersBytes(entry) + out.bytesWritten > this.maxBytes) {
          void this.makeRoom(entry, out.bytesWritten).then((ok) => {
            if (!ok) out.destroy(new Error('zip cache is full'));
          });
        }
      };
      const skipped = await zipInto(out, zipName, files, open, this.logger, { attempts: 3, delayMs: this.retryDelayMs }, guard);
      await finished(out);
      if (skipped > 0) {
        return await fail(`${skipped} entr${skipped === 1 ? 'y' : 'ies'} unreadable`);
      }
      await rename(part, entry.path);
      entry.size = (await stat(entry.path)).size;
      entry.done = entry.total;
      entry.state = 'ready';
      entry.lastUsed = Date.now();
      this.logger.log(`Zip "${zipName}" ready: ${(entry.size / 1024 ** 3).toFixed(2)} GB`);
      if (this.othersBytes(entry) + entry.size > this.maxBytes) {
        await this.makeRoom(entry, entry.size);
      }
    } catch (err) {
      await fail(String(err));
    }
  }

  /** Removes zips nobody has downloaded for a while, and stray partials. */
  async sweep(): Promise<void> {
    const now = Date.now();
    for (const e of [...this.entries.values()]) {
      if (e.state === 'ready' && e.inUse === 0 && now - e.lastUsed > this.ttlMs) {
        await this.drop(e);
      } else if (e.state === 'failed' && now - (e.failedAt ?? 0) > 600_000) {
        this.entries.delete(e.id);
      }
    }
    for (const name of await readdir(this.dir).catch(() => [] as string[])) {
      if (!name.endsWith('.part')) continue;
      const info = await stat(join(this.dir, name)).catch(() => null);
      if (info && now - info.mtimeMs > 3_600_000) await rm(join(this.dir, name), { force: true });
    }
  }
}
