import { Injectable, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { DatabaseService } from '../database/database.service';
import { limitsFor, toJsonLimit } from './quota.config';

/** What the owner's usage screen shows for client downloads. */
export interface DownloadUsage {
  /** Bytes served through the owner's client links this month. */
  usedBytes: number;
  /** The plan's monthly allowance. null means unlimited. */
  limitBytes: number | null;
  /** When the count starts again: the first instant of next month, UTC. */
  resetsAt: string;
}

/**
 * What a client is told when the gallery's owner has used their month.
 *
 * Deliberately says nothing about the owner — not their plan, not that there
 * is an allowance, not how much was used. The client did nothing wrong and the
 * photographer's account is not their business; what they need is the next
 * step.
 */
export const DOWNLOADS_PAUSED_MESSAGE =
  'Downloads for this gallery are paused. Ask the photographer to send it again later.';

/** How often a long download reports what it has sent so far. */
const FLUSH_EVERY_MS = 30_000;

/** `2026-10-01` for any instant in October 2026, UTC. */
export function monthKey(now: Date): string {
  return monthStart(now).toISOString().slice(0, 10);
}

/** Midnight on the first of `now`'s month, UTC. */
export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Midnight on the first of the following month, UTC. Date.UTC rolls December over. */
export function nextMonthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/**
 * Picks up a single-file download where an earlier one stopped.
 *
 * A browser resuming a dropped download asks for `bytes=<n>-` from where it
 * got to. That request is the tail of a download that was already allowed, so
 * it is let through even once the allowance is used: the owner's rule is that
 * a download in progress is never cut off. It is still metered.
 */
export function isResumedRange(range: string | undefined): boolean {
  const match = /^bytes=(\d+)-/.exec(range?.trim() ?? '');
  return match !== null && Number(match[1]) > 0;
}

/**
 * The monthly client-download allowance: metering and the check.
 *
 * Counted against the album owner, never the client — the photographer's plan
 * is what pays for the egress. Only the public client-link routes are metered;
 * the owner fetching their own files through the app is not a delivery.
 *
 * Fails open everywhere. A broken counter must cost the photographer some
 * accuracy, never their client's delivery: any database error here is logged
 * and the download goes ahead.
 */
@Injectable()
export class DownloadAllowanceService {
  private readonly logger = new Logger(DownloadAllowanceService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * This month's downloads against the plan's allowance. Throws on a database
   * error; `allows` is the caller that must not.
   *
   * The plan's allowance only: claimed promos add storage, workspaces and
   * albums, and none of them were sold as extra downloads.
   */
  async usage(ownerId: string, now = new Date()): Promise<DownloadUsage> {
    const row = await this.db.queryOne<{ plan: string | null; used: string }>(
      `select u.plan, coalesce(d.bytes, 0)::text as used
         from users u
         left join download_usage d
           on d.user_id = u.id and d.month = $2::date
        where u.id = $1`,
      [ownerId, monthKey(now)],
    );
    return {
      usedBytes: Number(row?.used ?? 0),
      limitBytes: toJsonLimit(limitsFor(row?.plan ?? 'free').downloadBytesPerMonth),
      resetsAt: nextMonthStart(now).toISOString(),
    };
  }

  /**
   * Whether a new download may start. False only when the owner is known to
   * be at or past their allowance; an error answers true.
   *
   * Checked before a download, never during one. Whatever is already being
   * sent finishes, so the last download of the month can take the count past
   * the allowance — by at most what was in flight at the time.
   */
  async allows(ownerId: string, now = new Date()): Promise<boolean> {
    try {
      const { usedBytes, limitBytes } = await this.usage(ownerId, now);
      return limitBytes === null || usedBytes < limitBytes;
    } catch (err) {
      this.logger.warn(`Download allowance unchecked, allowing: ${String(err)}`);
      return true;
    }
  }

  /**
   * Adds `bytes` to the owner's month. Never throws.
   *
   * An upsert, so concurrent downloads add to the same row rather than each
   * reading a total and writing back their own.
   */
  async record(ownerId: string, bytes: number, now = new Date()): Promise<void> {
    const amount = Math.floor(bytes);
    if (!Number.isFinite(amount) || amount <= 0) return;
    try {
      await this.db.query(
        `insert into download_usage (user_id, month, bytes)
         values ($1, $2::date, $3)
         on conflict (user_id, month)
         do update set bytes = download_usage.bytes + excluded.bytes,
                       updated_at = now()`,
        [ownerId, monthKey(now), amount],
      );
    } catch (err) {
      this.logger.warn(`Download of ${amount} bytes not metered: ${String(err)}`);
    }
  }

  /**
   * Counts what this response actually puts on the wire, to the owner.
   *
   * Measured at the socket rather than by wrapping each file's stream, so one
   * rule covers the three ways a delivery leaves: a zip assembled from many
   * objects, a cache hit sent by `res.sendFile` (which handles Range itself
   * and offers no hook), and a pass-through from storage. A client who
   * cancels is charged for what they received, not the whole file; a Range
   * request for the last 10 MB is charged 10 MB. Response headers are counted
   * too, a few hundred bytes against files measured in megabytes.
   *
   * Long downloads report every FLUSH_EVERY_MS rather than only at the end,
   * so a second download started meanwhile is checked against a count that
   * includes the first.
   *
   * One response per socket at a time is what makes the delta this response's
   * alone: Node's HTTP/1.1 server does not interleave responses on a
   * connection.
   */
  meter(ownerId: string, res: Response): void {
    const socket = res.socket;
    if (!socket) return;
    const start = socket.bytesWritten;
    let counted = 0;
    const flush = () => {
      const sent = Math.max(0, socket.bytesWritten - start);
      const delta = sent - counted;
      counted = sent;
      if (delta > 0) void this.record(ownerId, delta);
    };
    const timer = setInterval(flush, FLUSH_EVERY_MS);
    timer.unref?.();
    res.once('close', () => {
      clearInterval(timer);
      flush();
    });
  }
}
