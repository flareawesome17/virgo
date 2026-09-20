import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import {
  MediaLinkService,
  displayKeyFor,
  hlsPrefixFor,
  proxyKeyFor,
} from './media-link.service';

/**
 * Keeps the rendition volume from growing without bound.
 *
 * Every rendition is reproducible from the original in B2, so the volume is a
 * cache and not data — losing an entry costs CPU, not customer work. That is
 * what makes eviction safe, and it is the property every player already
 * relies on: `hlsUrl` falls to `proxyUrl` falls to `url`.
 *
 * ## Why access time
 *
 * nginx serves renditions directly, so the API never sees a read and has no
 * per-file view count to sort by. The obvious alternative — recording which
 * gallery was opened — is deliberately not available: the share controller
 * records a visit with the token stripped, because the token IS the
 * credential to that gallery and must never be stored.
 *
 * The filesystem does know. `atime` is what nginx touched, which is exactly
 * the signal an LRU wants. Under `relatime`, the default for the ext4 volume
 * this runs on, it is updated at most once a day — coarse, and far finer than
 * the month-scale windows here.
 *
 * `mtime` is used as a floor, so a rendition written minutes ago is never
 * treated as cold even on a `noatime` mount. On such a mount this degrades to
 * eviction by age rather than by use, which is worse but not wrong.
 */

export type RenditionKind = 'ladder' | 'proxy' | 'display';

export interface Candidate {
  /** Path relative to the media root. A directory for a ladder. */
  path: string;
  kind: RenditionKind;
  bytes: number;
  /** Most recent of atime and mtime, in epoch ms. */
  lastUsed: number;
  /** The original this was derived from, for resetting its row. */
  source: string;
}

export interface SweepPlan {
  totalBytes: number;
  evict: Candidate[];
  freedBytes: number;
  /** Over budget but everything is inside the grace window. */
  stuck: boolean;
}

/**
 * Chooses what to evict, and nothing else.
 *
 * Pure so the policy can be tested without a filesystem — the part worth
 * getting right is the ordering and the refusal to touch recent work, and
 * neither needs real files to exercise.
 *
 * Coldest first. Ties break towards the larger item, because that frees more
 * per deletion and a tie means the two are equally cold anyway.
 */
export function planSweep(
  candidates: readonly Candidate[],
  opts: { maxBytes: number; minAgeMs: number; now: number },
): SweepPlan {
  const totalBytes = candidates.reduce((sum, item) => sum + item.bytes, 0);
  if (opts.maxBytes <= 0 || totalBytes <= opts.maxBytes) {
    return { totalBytes, evict: [], freedBytes: 0, stuck: false };
  }

  const cold = candidates
    .filter((item) => opts.now - item.lastUsed >= opts.minAgeMs)
    .sort((a, b) => a.lastUsed - b.lastUsed || b.bytes - a.bytes);

  const evict: Candidate[] = [];
  let remaining = totalBytes;
  for (const item of cold) {
    if (remaining <= opts.maxBytes) break;
    evict.push(item);
    remaining -= item.bytes;
  }

  return {
    totalBytes,
    evict,
    freedBytes: totalBytes - remaining,
    // Over budget with nothing old enough to take. Not an error — refusing to
    // evict work somebody is currently watching is the right call — but it
    // means the disk is not actually being bounded and somebody should know.
    stuck: remaining > opts.maxBytes,
  };
}

interface RenditionRow {
  key: string;
  proxy_key: string | null;
  display_widths: number[] | null;
  hls_prefix: string | null;
}

/** Staged files older than this are from an encode that died. */
const STALE_PART_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class MediaSweepService {
  private readonly logger = new Logger(MediaSweepService.name);
  private running = false;

  private readonly maxBytes: number;
  private readonly minAgeMs: number;

  constructor(
    private readonly db: DatabaseService,
    private readonly mediaLink: MediaLinkService,
    config: ConfigService,
  ) {
    this.maxBytes = Number(config.get<string>('MEDIA_CACHE_MAX_BYTES', '0')) || 0;
    this.minAgeMs =
      (Number(config.get<string>('MEDIA_CACHE_MIN_AGE_DAYS', '30')) || 30) *
      24 * 60 * 60 * 1000;
  }

  /**
   * Nightly, at an hour when nobody is uploading.
   *
   * Runs even with no budget set, because reporting what the volume is
   * actually using is worth having from the first night — a budget cannot be
   * chosen sensibly without it.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async sweep(): Promise<void> {
    if (this.running || !this.mediaLink.isConfigured) return;
    this.running = true;
    try {
      await this.removeStaleStaging();

      const candidates = await this.collect();
      const plan = planSweep(candidates, {
        maxBytes: this.maxBytes,
        minAgeMs: this.minAgeMs,
        now: Date.now(),
      });

      const gb = (bytes: number) => (bytes / 1024 ** 3).toFixed(1);
      this.logger.log(
        `Renditions: ${gb(plan.totalBytes)} GB across ${candidates.length} item(s)` +
          (this.maxBytes > 0 ? `, budget ${gb(this.maxBytes)} GB` : ', no budget set'),
      );

      if (plan.stuck) {
        this.logger.warn(
          `Over budget by ${gb(plan.totalBytes - plan.freedBytes - this.maxBytes)} GB ` +
            'with nothing outside the grace window. Raise MEDIA_CACHE_MAX_BYTES, ' +
            'lower MEDIA_CACHE_MIN_AGE_DAYS, or add disk.',
        );
      }
      if (plan.evict.length === 0) return;

      for (const item of plan.evict) await this.evict(item);
      this.logger.log(
        `Evicted ${plan.evict.length} rendition(s), freeing ${gb(plan.freedBytes)} GB`,
      );
    } catch (error) {
      this.logger.error(
        `Sweep failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
  }

  /**
   * Every rendition this database believes exists, with its size and age.
   *
   * Driven from `user_files` rather than by walking the volume, because a
   * rendition path cannot be reversed to its original: `clip-web.mp4` does
   * not say whether it came from `clip.mov` or `clip.mp4`, and the row has to
   * be found to be reset. Going forwards from the row gives both for free.
   *
   * The cost is that orphans — renditions whose row is gone — are invisible
   * here. `removeFor` and `removeTree` are what prevent them, and stale
   * staging is handled separately.
   */
  private async collect(): Promise<Candidate[]> {
    const rows = await this.db.query<RenditionRow>(
      `select key, proxy_key, display_widths, hls_prefix
         from user_files
        where proxy_key is not null
           or display_widths is not null
           or hls_prefix is not null`,
    );

    const candidates: Candidate[] = [];
    for (const row of rows) {
      if (row.proxy_key) {
        const found = await this.measureFile(proxyKeyFor(row.key));
        if (found) candidates.push({ ...found, kind: 'proxy', source: row.key });
      }
      for (const width of row.display_widths ?? []) {
        const found = await this.measureFile(displayKeyFor(row.key, width));
        if (found) candidates.push({ ...found, kind: 'display', source: row.key });
      }
      if (row.hls_prefix) {
        const found = await this.measureTree(hlsPrefixFor(row.key));
        if (found) candidates.push({ ...found, kind: 'ladder', source: row.key });
      }
    }
    return candidates;
  }

  private async measureFile(
    path: string,
  ): Promise<{ path: string; bytes: number; lastUsed: number } | null> {
    try {
      const info = await stat(join(this.mediaLink.root, path));
      return {
        path,
        bytes: info.size,
        lastUsed: Math.max(info.atimeMs, info.mtimeMs),
      };
    } catch {
      // Already gone. The row will be reset the next time something notices;
      // a missing rendition is a fallback, not a fault.
      return null;
    }
  }

  /** A ladder measured as one unit: total size, most recent touch anywhere. */
  private async measureTree(
    path: string,
  ): Promise<{ path: string; bytes: number; lastUsed: number } | null> {
    const absolute = join(this.mediaLink.root, path);
    try {
      const entries = await readdir(absolute, {
        withFileTypes: true,
        recursive: true,
      });
      let bytes = 0;
      let lastUsed = 0;
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const info = await stat(join(entry.parentPath ?? absolute, entry.name));
        bytes += info.size;
        lastUsed = Math.max(lastUsed, info.atimeMs, info.mtimeMs);
      }
      return bytes > 0 ? { path, bytes, lastUsed } : null;
    } catch {
      return null;
    }
  }

  /**
   * Deletes a rendition and forgets it, in that order.
   *
   * The row is only cleared once the bytes are gone, so a failed delete
   * leaves the database still pointing at something that exists rather than
   * handing players a URL for a file that does not.
   */
  private async evict(item: Candidate): Promise<void> {
    try {
      if (item.kind === 'ladder') await this.mediaLink.removeTree(item.path);
      else await rm(join(this.mediaLink.root, item.path), { force: true });
    } catch (error) {
      this.logger.warn(
        `Could not evict ${item.path}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }

    if (item.kind === 'ladder') {
      // Back to 'none', not 'failed': this film has nothing wrong with it and
      // should get a new ladder the next time somebody actually watches it.
      await this.db.query(
        `update user_files set hls_prefix = null, hls_status = 'none', hls_next_at = null
          where key = $1`,
        [item.source],
      );
    } else if (item.kind === 'proxy') {
      await this.db.query('update user_files set proxy_key = null where key = $1', [
        item.source,
      ]);
    } else {
      // Display copies go as a set. Evicting one width and leaving the row
      // claiming both would hand a client a srcset entry that 404s, and the
      // browser picks by width rather than by what loads.
      const widths = (
        await this.db.query<{ display_widths: number[] | null }>(
          'select display_widths from user_files where key = $1',
          [item.source],
        )
      )[0]?.display_widths;
      for (const width of widths ?? []) {
        await rm(join(this.mediaLink.root, displayKeyFor(item.source, width)), {
          force: true,
        }).catch(() => undefined);
      }
      await this.db.query(
        'update user_files set display_widths = null where key = $1',
        [item.source],
      );
    }
  }

  /**
   * Removes staging left behind by an encode that died.
   *
   * `<key>.part` and `<prefix>-hls.part` are cleaned up by their producers on
   * a normal failure, but not by a container that was killed mid-encode. They
   * are invisible to `collect`, since no row ever referenced them.
   */
  private async removeStaleStaging(): Promise<void> {
    const cutoff = Date.now() - STALE_PART_MS;
    let removed = 0;
    try {
      const entries = await readdir(this.mediaLink.root, {
        withFileTypes: true,
        recursive: true,
      });
      for (const entry of entries) {
        if (!entry.name.endsWith('.part')) continue;
        const absolute = join(entry.parentPath ?? this.mediaLink.root, entry.name);
        const info = await stat(absolute).catch(() => null);
        if (!info || info.mtimeMs > cutoff) continue;
        await rm(absolute, { recursive: true, force: true }).catch(() => undefined);
        removed += 1;
      }
    } catch {
      // An unreadable volume is the sweep's problem, not this method's.
      return;
    }
    if (removed > 0) this.logger.log(`Removed ${removed} abandoned staging entr(ies)`);
  }
}
