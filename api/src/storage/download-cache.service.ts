import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, rm, stat, statfs, utimes } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { StorageService } from './storage.service';

export interface CachedObject {
  /** Bytes to send. Reads from disk on a hit, tees from storage on a miss. */
  stream: Readable;
  /** Total size when known (always on a hit). */
  size?: number;
  hit: boolean;
}

/**
 * A bounded disk cache in front of B2 for client downloads.
 *
 * Backblaze has no Asia region and bills egress past the free allowance, but
 * the production host already owns a gigabit uplink inside the country. The
 * first download of an object pulls it from B2 once and tees it to local disk;
 * every later download (the second phone, the retry, the family opening the
 * same link) is served from here: fast, and no B2 egress.
 *
 * Fails open: any cache problem (disabled, unwritable volume, disk full)
 * degrades to a plain pass-through of the B2 stream, never an error for the
 * client. Size is capped by DOWNLOAD_CACHE_MAX_GB; least recently read objects
 * go first, so it can never fill the disk. A partial copy is never served: it
 * is written as `.part` and renamed only after the last byte arrived.
 */
@Injectable()
export class DownloadCacheService {
  private readonly logger = new Logger(DownloadCacheService.name);
  private readonly dir: string;
  private readonly maxBytes: number;
  private readonly maxObjectBytes: number;
  private readonly minFreeBytes: number;
  private evicting = false;
  private lastEvict = 0;

  constructor(
    private readonly storage: StorageService,
    config: ConfigService,
  ) {
    this.dir = config.get<string>('DOWNLOAD_CACHE_DIR', '/srv/dlcache');
    this.maxBytes = Number(config.get('DOWNLOAD_CACHE_MAX_GB', '20')) * 1024 ** 3;
    this.minFreeBytes = Number(config.get('DOWNLOAD_CACHE_MIN_FREE_GB', '15')) * 1024 ** 3;
    this.maxObjectBytes = Number(config.get('DOWNLOAD_CACHE_MAX_OBJECT_MB', '2048')) * 1024 ** 2;
  }

  get enabled(): boolean {
    return this.maxBytes > 0;
  }

  pathFor(key: string): string {
    const h = createHash('sha256').update(key).digest('hex');
    return join(this.dir, h.slice(0, 2), h);
  }

  /** The cached file if complete, touched so eviction sees the read. */
  async lookup(key: string): Promise<{ path: string; size: number } | null> {
    if (!this.enabled) return null;
    const path = this.pathFor(key);
    try {
      const info = await stat(path);
      if (!info.isFile()) return null;
      const now = new Date();
      utimes(path, now, now).catch(() => undefined);
      return { path, size: info.size };
    } catch {
      return null;
    }
  }

  /** Cached bytes, or a pass-through of B2 that fills the cache as it goes. */
  async open(key: string): Promise<CachedObject> {
    const hit = await this.lookup(key);
    if (hit) return { stream: createReadStream(hit.path), size: hit.size, hit: true };

    const { stream: source, size } = await this.storage.readStreamWithSize(key);
    if (!this.enabled || (size !== undefined && size > this.maxObjectBytes)) {
      return { stream: source, size, hit: false };
    }
    // Never let the cache be what fills the disk: below the free-space floor,
    // stop adding (and shed old objects) and just pass through.
    if (!(await this.hasRoom(size ?? 0))) {
      this.evictSoon(true);
      return { stream: source, size, hit: false };
    }
    return { stream: await this.tee(key, source), size, hit: false };
  }

  private async hasRoom(incoming: number): Promise<boolean> {
    try {
      await mkdir(this.dir, { recursive: true });
      const fs = await statfs(this.dir);
      return fs.bavail * fs.bsize - incoming >= this.minFreeBytes;
    } catch {
      return false;
    }
  }

  /** Copies `source` to the cache while passing it on; discards on any failure. */
  private async tee(key: string, source: Readable): Promise<Readable> {
    const final = this.pathFor(key);
    const part = `${final}.${randomBytes(6).toString('hex')}.part`;
    let file: ReturnType<typeof createWriteStream>;
    try {
      await mkdir(dirname(final), { recursive: true });
      file = createWriteStream(part);
    } catch (err) {
      this.logger.warn(`Download cache unavailable, passing through: ${String(err)}`);
      return source;
    }

    let written = 0;
    let broken = false;
    const abandon = () => {
      if (broken) return;
      broken = true;
      file.destroy();
      rm(part, { force: true }).catch(() => undefined);
    };
    file.on('error', (err) => {
      this.logger.warn(`Download cache write failed for ${key}: ${String(err)}`);
      abandon();
    });

    const out = new PassThrough();
    // B2 can reset mid-download. Without a listener, destroy(err) below would
    // be an unhandled 'error' event and crash the whole API process.
    out.on('error', (err) => {
      this.logger.warn(`Download stream aborted for ${key}: ${String(err)}`);
    });
    source.on('data', (chunk: Buffer) => {
      if (broken) return;
      written += chunk.length;
      if (written > this.maxObjectBytes) abandon();
      else file.write(chunk);
    });
    source.on('end', () => {
      if (broken) return;
      file.end(() => {
        rename(part, final)
          .then(() => this.evictSoon())
          .catch(() => rm(part, { force: true }).catch(() => undefined));
      });
    });
    source.on('error', (err) => {
      abandon();
      out.destroy(err);
    });
    // The client left before the end: stop pulling from B2 and drop the copy.
    out.on('close', () => {
      if (!source.readableEnded) {
        abandon();
        source.destroy();
      }
    });
    source.pipe(out);
    return out;
  }

  private evictSoon(force = false): void {
    if (this.evicting || (!force && Date.now() - this.lastEvict < 30_000)) return;
    this.evicting = true;
    this.evict()
      .catch((err) => this.logger.warn(`Cache eviction failed: ${String(err)}`))
      .finally(() => {
        this.evicting = false;
        this.lastEvict = Date.now();
      });
  }

  /** Deletes least recently read objects until under 90% of the cap. */
  async evict(): Promise<{ total: number; removed: number }> {
    const entries: { path: string; size: number; at: number }[] = [];
    let total = 0;
    for (const sub of await readdir(this.dir).catch(() => [] as string[])) {
      const subDir = join(this.dir, sub);
      for (const name of await readdir(subDir).catch(() => [] as string[])) {
        const path = join(subDir, name);
        const info = await stat(path).catch(() => null);
        if (!info?.isFile()) continue;
        if (name.endsWith('.part')) {
          if (Date.now() - info.mtimeMs > 3_600_000) await rm(path, { force: true });
          continue;
        }
        entries.push({ path, size: info.size, at: info.mtimeMs });
        total += info.size;
      }
    }
    const lowDisk = !(await this.hasRoom(0));
    if (total <= this.maxBytes && !lowDisk) return { total, removed: 0 };
    entries.sort((a, b) => a.at - b.at);
    // Low on disk: drop to half the cap so the host gets room back.
    const target = lowDisk ? this.maxBytes * 0.5 : this.maxBytes * 0.9;
    let removed = 0;
    for (const e of entries) {
      if (total <= target) break;
      await rm(e.path, { force: true });
      total -= e.size;
      removed++;
    }
    this.logger.log(`Download cache evicted ${removed} objects, now ${(total / 1024 ** 3).toFixed(1)} GB`);
    return { total, removed };
  }
}
