import { Injectable, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { DatabaseService } from '../database/database.service';
import { MailConfig } from '../mail/mail.config';
import { clientDownloadsAlert } from '../mail/mail.templates';
import { NotifyService } from '../notifications/notify.service';
import { limitsFor, PLAN_LIMITS, toJsonLimit } from './quota.config';

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

/** The share of the allowance at which the photographer is warned. */
export const WARN_AT = 0.8;

/**
 * Below this no plan is near its line, so a download is recorded without
 * looking the owner's plan up: WARN_AT of the smallest allowance there is.
 */
const NO_ALERT_BELOW =
  WARN_AT *
  Math.min(
    ...Object.values(PLAN_LIMITS)
      .map((limits) => limits.downloadBytesPerMonth)
      .filter((bytes) => Number.isFinite(bytes) && bytes > 0),
  );

const GB = 1024 ** 3;

/** "24 GB", or "7.5 GB" under ten. Binary, like the apps' own figures. */
export function formatGb(bytes: number): string {
  const gb = bytes / GB;
  return `${gb < 10 ? Math.round(gb * 10) / 10 : Math.round(gb)} GB`;
}

/** "November 1": the day the count starts again, in the Philippines. */
export function resetsOn(now: Date): string {
  return nextMonthStart(now).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Manila',
  });
}

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

  constructor(
    private readonly db: DatabaseService,
    private readonly notifier: NotifyService,
    private readonly mailConfig: MailConfig,
  ) {}

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
   * Adds `bytes` to the owner's month, and tells the owner when that takes
   * the month past 80% of the allowance or to all of it. Never throws.
   *
   * An upsert, so concurrent downloads add to the same row rather than each
   * reading a total and writing back their own. It hands back the new total,
   * so the alert check costs nothing until the month is close to the line.
   */
  async record(ownerId: string, bytes: number, now = new Date()): Promise<void> {
    const amount = Math.floor(bytes);
    if (!Number.isFinite(amount) || amount <= 0) return;
    let month: { bytes: string; paused: boolean } | undefined;
    try {
      const rows = await this.db.query<{ bytes: string; paused: boolean }>(
        `insert into download_usage (user_id, month, bytes)
         values ($1, $2::date, $3)
         on conflict (user_id, month)
         do update set bytes = download_usage.bytes + excluded.bytes,
                       updated_at = now()
         returning bytes::text, paused_at is not null as paused`,
        [ownerId, monthKey(now), amount],
      );
      month = rows[0];
    } catch (err) {
      this.logger.warn(`Download of ${amount} bytes not metered: ${String(err)}`);
      return;
    }
    // Once paused there is nothing left to say this month, and far from any
    // line there is nothing to say yet.
    const used = Number(month?.bytes ?? 0);
    if (month && !month.paused && used >= NO_ALERT_BELOW) await this.alertIfCrossed(ownerId, used, now);
  }

  /**
   * Tells the owner their clients have used most of the month's downloads,
   * or all of them. Never throws.
   *
   * Each alert is claimed before it is sent, by stamping the month's row where
   * the stamp is still empty: whichever download crosses the line first sends
   * it, and one arriving a moment later finds the stamp set and sends nothing.
   * Reaching the limit stamps both, so a jump from under 80% to past the limit
   * sends only the pause.
   *
   * The owner is the photographer — the album's owner, whose plan pays for
   * the egress — never the client, who is told nothing about any of this.
   */
  private async alertIfCrossed(ownerId: string, usedBytes: number, now: Date): Promise<void> {
    try {
      const owner = await this.db.queryOne<{ plan: string | null; name: string | null }>(
        `select plan, display_name as name from users where id = $1`,
        [ownerId],
      );
      const limit = limitsFor(owner?.plan ?? 'free').downloadBytesPerMonth;
      if (!Number.isFinite(limit) || limit <= 0) return;

      const state = usedBytes >= limit ? 'paused' : usedBytes >= limit * WARN_AT ? 'warning' : null;
      if (!state) return;

      const claimed = await this.db.query(
        state === 'paused'
          ? `update download_usage
                set paused_at = now(), warned_at = coalesce(warned_at, now())
              where user_id = $1 and month = $2::date and paused_at is null
              returning 1`
          : `update download_usage
                set warned_at = now()
              where user_id = $1 and month = $2::date and warned_at is null and paused_at is null
              returning 1`,
        [ownerId, monthKey(now)],
      );
      if (claimed.length === 0) return;

      const used = formatGb(usedBytes);
      const allowance = formatGb(limit);
      const reset = resetsOn(now);
      const paused = state === 'paused';
      await this.notifier.notify([ownerId], {
        topic: 'billing',
        title: paused ? 'Client downloads are paused' : 'Most of this month’s client downloads are used',
        body: paused
          ? `Your clients have downloaded your ${allowance} for this month, so new downloads from your client links are paused until ${reset}. Downloads already under way will finish.`
          : `Your clients have downloaded ${used} of your ${allowance} this month. At ${allowance}, new downloads from your client links pause until ${reset}.`,
        // `billing` rather than a topic of its own: phones still on an older
        // bundle know it, and open their plan screen for it. Newer ones read
        // `type` and open Storage, where the month's downloads are.
        data: { type: 'downloads', state, month: monthKey(now) },
        email: clientDownloadsAlert({
          state,
          name: owner?.name?.trim() || 'there',
          used,
          limit: allowance,
          resetsOn: reset,
          url: `${this.mailConfig.appUrl}/settings/storage`,
        }),
      });
    } catch (err) {
      this.logger.warn(`Client download alert not sent: ${String(err)}`);
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
