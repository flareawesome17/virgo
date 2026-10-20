import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, rm, stat, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { ZIPS_SUBDIR } from './download-cache.service';
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

/** What the scheduler tracks beyond what a client is told about a zip. */
interface Job {
  entry: ZipEntry;
  owner: string;
  zipName: string;
  files: readonly ZipFile[];
  open: (key: string) => Promise<Readable>;
  queuedAt: number;
  startedAt: number;
  /** Last time a client asked for this zip; nobody asking means nobody waiting. */
  lastPolled: number;
  out?: Writable;
  abandoned: boolean;
  storageFailed: boolean;
}

/** A queued job nobody has asked about for this long is dropped. */
const QUEUED_ABANDON_MS = 5 * 60_000;
/** A build nobody has asked about for this long is stopped, saving storage egress. */
const BUILDING_ABANDON_MS = 10 * 60_000;
/** After waiting this long a job goes ahead of smaller, newer ones. */
const AGING_MS = 10 * 60_000;

/**
 * Zips built ahead of the download, on this host's disk.
 *
 * A zip streamed live has no size and cannot be resumed, so one storage
 * hiccup in the middle of a 5 GB wedding ended the whole download. A finished
 * zip on disk is an ordinary file: it has a length, it honours Range, a
 * download manager can split it and Chrome's Resume works.
 *
 * Bounded so it can never be what fills the disk: a total cap, a lifetime
 * after the last download, one copy per distinct album and file set, and a
 * zip that is being downloaded is never evicted. A zip with any unreadable
 * entry is thrown away rather than cached, so a client is never handed a
 * quietly incomplete album.
 *
 * Builds are scheduled rather than simply queued, because every one of them
 * reads from a distant, slow storage link:
 * - Fair: while others are waiting, one owner runs one build at a time, so a
 *   photographer with ten albums cannot take every worker.
 * - Short first: smaller zips go ahead of big ones, since a small album
 *   finishing in a minute should not wait behind a 10 GB one. Anything that has
 *   waited ten minutes goes first regardless, so a big one is never starved.
 * - Adaptive: the number of builds at once rises while builds succeed and
 *   drops when storage starts failing or the disk runs low, within
 *   DOWNLOAD_ZIP_BUILDS_MIN..MAX.
 * - No wasted work: a build whose client has gone (nobody has opened the link
 *   for minutes) is dropped, and a running one is stopped.
 */
@Injectable()
export class ZipCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ZipCacheService.name);
  private readonly dir: string;
  private readonly maxBytes: number;
  private readonly minFreeBytes: number;
  private readonly ttlMs: number;
  private readonly retryDelayMs: number;
  private readonly minBuilds: number;
  private readonly maxBuilds: number;
  private limit: number;
  private cleanStreak = 0;
  private readonly entries = new Map<string, ZipEntry>();
  private readonly jobs = new Map<string, Job>();
  private readonly pending: Job[] = [];
  private readonly running = new Set<Job>();
  private timer?: NodeJS.Timeout;
  private watchdog?: NodeJS.Timeout;

  constructor(config: ConfigService) {
    this.dir = join(config.get<string>('DOWNLOAD_CACHE_DIR', '/srv/dlcache'), ZIPS_SUBDIR);
    this.maxBytes = Number(config.get('DOWNLOAD_ZIP_MAX_GB', '30')) * 1024 ** 3;
    this.minFreeBytes = Number(config.get('DOWNLOAD_ZIP_MIN_FREE_GB', '15')) * 1024 ** 3;
    this.ttlMs = Number(config.get('DOWNLOAD_ZIP_TTL_HOURS', '6')) * 3_600_000;
    this.retryDelayMs = Number(config.get('DOWNLOAD_ZIP_RETRY_DELAY_MS', '1500'));
    this.minBuilds = Math.max(1, Number(config.get('DOWNLOAD_ZIP_BUILDS_MIN', '1')));
    this.maxBuilds = Math.max(
      this.minBuilds,
      Number(config.get('DOWNLOAD_ZIP_BUILDS_MAX', config.get('DOWNLOAD_ZIP_BUILDS', '3'))),
    );
    this.limit = Math.min(this.maxBuilds, Math.max(this.minBuilds, 2));
  }

  get enabled(): boolean {
    return this.maxBytes > 0;
  }

  /** How many builds may run at once right now. */
  get concurrency(): number {
    return this.limit;
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
    this.watchdog = setInterval(() => this.dropAbandoned(), 60_000);
    this.watchdog.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.watchdog) clearInterval(this.watchdog);
  }

  /** How many builds are waiting behind the ones running. */
  get queued(): number {
    return this.pending.length;
  }

  /** 1 for the next to start; 0 when the zip is not waiting. */
  queuePosition(entry: ZipEntry): number {
    const i = this.ordered(this.pending, Date.now()).findIndex((j) => j.entry === entry);
    return i + 1;
  }

  /** Rough seconds left for a running build, from its own pace; undefined until known. */
  etaSeconds(entry: ZipEntry): number | undefined {
    const job = this.jobs.get(entry.id);
    if (!job || entry.state !== 'building' || entry.done < 2) return undefined;
    const elapsed = (Date.now() - job.startedAt) / 1000;
    return Math.round((elapsed / entry.done) * (entry.total - entry.done));
  }

  /**
   * The entry for this zip, starting a build if there is none. A recent
   * failure is returned as is for a minute so a client's refresh loop does not
   * hammer a broken storage link; after that the next request tries again.
   * `owner` is whose album it is, for fair scheduling.
   */
  request(
    owner: string,
    zipName: string,
    files: readonly ZipFile[],
    open: (key: string) => Promise<Readable>,
  ): ZipEntry {
    const id = ZipCacheService.idFor(zipName, files);
    const now = Date.now();
    const existing = this.entries.get(id);
    if (existing && !(existing.state === 'failed' && now - (existing.failedAt ?? 0) > 60_000)) {
      existing.lastUsed = now;
      const job = this.jobs.get(id);
      if (job) job.lastPolled = now;
      return existing;
    }
    const entry: ZipEntry = {
      id,
      state: 'queued',
      path: join(this.dir, `${id}.zip`),
      size: 0,
      done: 0,
      total: files.length,
      lastUsed: now,
      inUse: 0,
    };
    const job: Job = {
      entry,
      owner,
      zipName,
      files,
      open,
      queuedAt: now,
      startedAt: 0,
      lastPolled: now,
      abandoned: false,
      storageFailed: false,
    };
    this.entries.set(id, entry);
    this.jobs.set(id, job);
    this.pending.push(job);
    this.schedule();
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

  /** The order waiting jobs would start in. */
  private ordered(jobs: readonly Job[], now: number): Job[] {
    return [...jobs].sort((a, b) => {
      const aged = (j: Job) => (now - j.queuedAt > AGING_MS ? 0 : 1);
      return aged(a) - aged(b) || a.files.length - b.files.length || a.queuedAt - b.queuedAt;
    });
  }

  private pickNext(now: number): Job | undefined {
    const order = this.ordered(this.pending, now);
    const busyOwners = new Set([...this.running].map((j) => j.owner));
    // An owner who already has a build running waits for others first; if
    // nobody else is waiting they are free to use every worker.
    return order.find((j) => !busyOwners.has(j.owner)) ?? order[0];
  }

  private schedule(): void {
    while (this.running.size < this.limit && this.pending.length > 0) {
      const job = this.pickNext(Date.now());
      if (!job) return;
      this.pending.splice(this.pending.indexOf(job), 1);
      this.running.add(job);
      void this.build(job).finally(() => {
        this.running.delete(job);
        this.adapt(job);
        this.schedule();
      });
    }
  }

  /**
   * Grow the number of simultaneous builds slowly while they succeed, and cut
   * it at once when storage fails or the disk is short: more workers on a
   * struggling link only make every build slower and likelier to time out.
   */
  private adapt(job: Job): void {
    if (job.abandoned) return;
    if (job.entry.state === 'failed' && job.storageFailed) {
      this.cleanStreak = 0;
      if (this.limit > this.minBuilds) {
        this.limit -= 1;
        this.logger.warn(`Zip builds cut to ${this.limit} at once after a storage failure`);
      }
    } else if (job.entry.state === 'ready') {
      if (++this.cleanStreak >= 3 && this.limit < this.maxBuilds && this.pending.length > 0) {
        this.limit += 1;
        this.cleanStreak = 0;
        this.logger.log(`Zip builds raised to ${this.limit} at once`);
      }
    }
  }

  /** Forgets builds nobody is waiting for any more. */
  dropAbandoned(): void {
    const now = Date.now();
    for (const job of [...this.pending]) {
      if (now - job.lastPolled > QUEUED_ABANDON_MS) {
        this.pending.splice(this.pending.indexOf(job), 1);
        this.entries.delete(job.entry.id);
        this.jobs.delete(job.entry.id);
        this.logger.log(`Dropped queued zip "${job.zipName}": nobody waiting`);
      }
    }
    for (const job of this.running) {
      if (!job.abandoned && now - job.lastPolled > BUILDING_ABANDON_MS) {
        job.abandoned = true;
        job.out?.destroy(new Error('nobody waiting'));
        this.logger.log(`Stopped building zip "${job.zipName}": nobody waiting`);
      }
    }
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
    this.jobs.delete(e.id);
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

  private async build(job: Job): Promise<void> {
    const { entry, zipName, files, open } = job;
    const part = `${entry.path}.${Date.now()}.part`;
    const fail = async (why: string) => {
      await rm(part, { force: true }).catch(() => undefined);
      if (job.abandoned) {
        // Nobody asked for this any more; leave no trace so a later visit starts fresh.
        this.entries.delete(entry.id);
        this.jobs.delete(entry.id);
        return;
      }
      this.logger.error(`Zip "${zipName}" not built: ${why}`);
      entry.state = 'failed';
      entry.failedAt = Date.now();
    };
    try {
      await mkdir(this.dir, { recursive: true });
      if ((await this.freeBytes()) < this.minFreeBytes) {
        this.limit = this.minBuilds;
        this.sweep().catch(() => undefined);
        return await fail('host disk is below the free-space floor');
      }
      entry.state = 'building';
      job.startedAt = Date.now();
      const out = createWriteStream(part);
      job.out = out;
      const guard = (done: number) => {
        entry.done = done;
        // The final size is not known ahead of time, so check as it grows.
        if (this.othersBytes(entry) + out.bytesWritten > this.maxBytes) {
          void this.makeRoom(entry, out.bytesWritten).then((ok) => {
            if (!ok) out.destroy(new Error('zip cache is full'));
          });
        }
      };
      const skipped = await zipInto(
        out,
        zipName,
        files,
        open,
        this.logger,
        { attempts: 3, delayMs: this.retryDelayMs },
        guard,
      );
      await finished(out);
      if (skipped > 0) {
        job.storageFailed = true;
        return await fail(`${skipped} entr${skipped === 1 ? 'y' : 'ies'} unreadable`);
      }
      await rename(part, entry.path);
      entry.size = (await stat(entry.path)).size;
      entry.done = entry.total;
      entry.state = 'ready';
      entry.lastUsed = Date.now();
      this.jobs.delete(entry.id);
      this.logger.log(`Zip "${zipName}" ready: ${(entry.size / 1024 ** 3).toFixed(2)} GB`);
      if (this.othersBytes(entry) + entry.size > this.maxBytes) {
        await this.makeRoom(entry, entry.size);
      }
    } catch (err) {
      // A storage outage aborts the zip with this message (see zipInto).
      if (String(err).includes('Storage unavailable')) job.storageFailed = true;
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
        this.jobs.delete(e.id);
      }
    }
    for (const name of await readdir(this.dir).catch(() => [] as string[])) {
      if (!name.endsWith('.part')) continue;
      const info = await stat(join(this.dir, name)).catch(() => null);
      if (info && now - info.mtimeMs > 3_600_000) await rm(join(this.dir, name), { force: true });
    }
  }
}
