import { Injectable, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { DatabaseService } from '../database/database.service';
import { MailConfig } from '../mail/mail.config';
import { clientDownloadsAlert } from '../mail/mail.templates';
import { NotifyService } from '../notifications/notify.service';
import { limitsFor, PLAN_LIMITS, toJsonLimit } from './quota.config';

/** What the owner's usage screen shows for client downloads. */
export interface DownloadUsage {
  /**
   * What the owner's client links delivered this month: each file counted
   * once, the first time any of it went out, however often it was downloaded.
   */
  usedBytes: number;
  /**
   * The plan's monthly allowance plus anything staff added for this month.
   * null means unlimited.
   */
  limitBytes: number | null;
  /** When the count starts again: the first instant of next month, UTC. */
  resetsAt: string;
  /**
   * New downloads are paused: the allowance is delivered, or so much has been
   * sent that the month passed the fair-use ceiling. Clients that predate it
   * work it out from usedBytes and limitBytes, which covers the first case.
   */
  paused: boolean;
  /** What staff added for this month, inside limitBytes. 0 when nothing. */
  extraBytes: number;
}

/** A file a response sent some of: its storage key and its size. */
export interface DeliveredFile {
  key: string;
  bytes: number;
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
 * How far past the allowance a month's raw bytes may go before downloads
 * pause anyway.
 *
 * Counting deliveries leaves one way to abuse it: put a few files behind a
 * link and let the world download them, each copy free after the first. Ten
 * times the allowance is far beyond any real month — the wedding a couple, a
 * parent and a flaky phone all downloaded sent three times its size — and
 * well short of a link handed round in public.
 */
export const FAIR_USE_MULTIPLE = 10;

/** The smallest allowance any plan has. */
const SMALLEST_ALLOWANCE = Math.min(
  ...Object.values(PLAN_LIMITS)
    .map((limits) => limits.downloadBytesPerMonth)
    .filter((bytes) => Number.isFinite(bytes) && bytes > 0),
);

/**
 * Below these no plan is near a line, so a download is recorded without
 * looking the owner's plan up.
 */
const NO_ALERT_BELOW = WARN_AT * SMALLEST_ALLOWANCE;
const NO_FAIR_USE_BELOW = FAIR_USE_MULTIPLE * SMALLEST_ALLOWANCE;

/**
 * Roughly what a zip spends on each entry besides its bytes: the local
 * header, the name, the data descriptor. The zips are stored, not
 * compressed, so a file's place in one is the sizes before it plus this.
 */
const ZIP_ENTRY_OVERHEAD = 128;

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
 * Where in the file a Range request starts: `bytes=500-` is 500, the last
 * 500 bytes (`bytes=-500`) of a 2000-byte file is 1500. No range, or one this
 * cannot read, is the start.
 */
export function rangeStart(range: string | undefined, size: number): number {
  const value = range?.trim() ?? '';
  const from = /^bytes=(\d+)-/.exec(value);
  if (from) return Number(from[1]);
  const last = /^bytes=-(\d+)$/.exec(value);
  if (last) return Math.max(0, size - Number(last[1]));
  return 0;
}

/**
 * The files of a zip a response reached: those whose place in it overlaps
 * the `sent` bytes from `start`.
 *
 * A file counts as delivered once any of it went out, so a zip cancelled a
 * tenth of the way through delivered the files in that tenth and none of the
 * rest, and a resume picks up from where it starts. The places are worked
 * out from the sizes, in zip order; a file storage could not read is left
 * out of the zip and shifts the ones after it by its size, which can only
 * count a neighbour early, never miss one sent.
 */
export function filesReached(
  files: readonly { key: string; size?: number }[],
  start: number,
  sent: number,
): DeliveredFile[] {
  if (sent <= 0) return [];
  const end = start + sent;
  const reached: DeliveredFile[] = [];
  let cursor = 0;
  for (const file of files) {
    const size = file.size ?? 0;
    const from = cursor;
    cursor += ZIP_ENTRY_OVERHEAD + size;
    if (cursor > start && from < end) reached.push({ key: file.key, bytes: size });
    if (cursor >= end) break;
  }
  return reached;
}

/** The month's figures for one owner, as the checks read them. */
interface Month {
  plan: string | null;
  name: string | null;
  delivered: number;
  sent: number;
  extra: number;
}

/**
 * Where the owner stands: the allowance with this month's extra, the fair-use
 * ceiling above it, and whether new downloads are paused. An unlimited plan
 * has neither line.
 */
function standing(month: Month): {
  limit: number | null;
  ceiling: number | null;
  paused: boolean;
  reason: 'allowance' | 'fair-use' | null;
} {
  const plan = limitsFor(month.plan ?? 'free').downloadBytesPerMonth;
  if (!Number.isFinite(plan)) return { limit: null, ceiling: null, paused: false, reason: null };
  const limit = plan + month.extra;
  const ceiling = FAIR_USE_MULTIPLE * limit;
  const reason =
    month.delivered >= limit ? 'allowance' : month.sent >= ceiling ? 'fair-use' : null;
  return { limit, ceiling, paused: reason !== null, reason };
}

/**
 * The monthly client-download allowance: metering and the check.
 *
 * Counted against the album owner, never the client — the photographer's plan
 * is what pays for the egress. Only the public client-link routes are metered;
 * the owner fetching their own files through the app is not a delivery.
 *
 * Two counts. Deliveries — each file once a month, the first time any of it
 * went out — are what the allowance measures, so a gallery downloaded by the
 * couple, a parent and a phone that dropped part way costs its size once.
 * Bytes sent are what the fair-use ceiling measures, ten times the allowance,
 * so a link passed round in public still stops.
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

  private async month(ownerId: string, now: Date): Promise<Month> {
    const row = await this.db.queryOne<{
      plan: string | null;
      name: string | null;
      delivered: string;
      sent: string;
      extra: string;
    }>(
      `select u.plan, u.display_name as name,
              coalesce(d.delivered_bytes, 0)::text as delivered,
              coalesce(d.bytes, 0)::text as sent,
              coalesce(d.extra_bytes, 0)::text as extra
         from users u
         left join download_usage d
           on d.user_id = u.id and d.month = $2::date
        where u.id = $1`,
      [ownerId, monthKey(now)],
    );
    return {
      plan: row?.plan ?? null,
      name: row?.name ?? null,
      delivered: Number(row?.delivered ?? 0),
      sent: Number(row?.sent ?? 0),
      extra: Number(row?.extra ?? 0),
    };
  }

  /**
   * This month's deliveries against the allowance. Throws on a database
   * error; `allows` is the caller that must not.
   *
   * The plan's allowance plus what staff added for the month: claimed promos
   * add storage, workspaces and albums, and none of them were sold as extra
   * downloads.
   */
  async usage(ownerId: string, now = new Date()): Promise<DownloadUsage> {
    const month = await this.month(ownerId, now);
    const { limit, paused } = standing(month);
    return {
      usedBytes: month.delivered,
      limitBytes: toJsonLimit(limit ?? Infinity),
      resetsAt: nextMonthStart(now).toISOString(),
      paused,
      extraBytes: month.extra,
    };
  }

  /**
   * Whether a new download may start. False only when the owner is known to
   * be paused; an error answers true.
   *
   * Checked before a download, never during one. Whatever is already being
   * sent finishes, so the last download of the month can take the count past
   * the allowance — by at most what was in flight at the time.
   */
  async allows(ownerId: string, now = new Date()): Promise<boolean> {
    try {
      return !standing(await this.month(ownerId, now)).paused;
    } catch (err) {
      this.logger.warn(`Download allowance unchecked, allowing: ${String(err)}`);
      return true;
    }
  }

  /**
   * Adds `bytes` sent to the owner's month — the fair-use count. Never throws.
   *
   * An upsert, so concurrent downloads add to the same row rather than each
   * reading a total and writing back their own. It hands back the new total,
   * so the ceiling check costs nothing until the month is near it.
   */
  async recordSent(ownerId: string, bytes: number, now = new Date()): Promise<void> {
    const amount = Math.floor(bytes);
    if (!Number.isFinite(amount) || amount <= 0) return;
    let month: { sent: string; paused: boolean } | undefined;
    try {
      const rows = await this.db.query<{ sent: string; paused: boolean }>(
        `insert into download_usage (user_id, month, bytes)
         values ($1, $2::date, $3)
         on conflict (user_id, month)
         do update set bytes = download_usage.bytes + excluded.bytes,
                       updated_at = now()
         returning bytes::text as sent, paused_at is not null as paused`,
        [ownerId, monthKey(now), amount],
      );
      month = rows[0];
    } catch (err) {
      this.logger.warn(`Download of ${amount} bytes not metered: ${String(err)}`);
      return;
    }
    if (month && !month.paused && Number(month.sent) >= NO_FAIR_USE_BELOW) {
      await this.alertIfCrossed(ownerId, now);
    }
  }

  /**
   * Counts these files as delivered this month, those not counted already.
   * Never throws.
   *
   * One statement: the files go into download_deliveries, where a file
   * already there this month is left alone, and the sizes of the ones that
   * went in are added to the month's delivered_bytes. Two downloads of the
   * same file at once cannot both count it — the primary key lets one in.
   */
  async recordDelivered(
    ownerId: string,
    files: readonly DeliveredFile[],
    now = new Date(),
  ): Promise<void> {
    const unique = new Map<string, number>();
    for (const file of files) {
      const bytes = Math.floor(file.bytes);
      if (file.key && Number.isFinite(bytes) && bytes >= 0) unique.set(file.key, bytes);
    }
    if (unique.size === 0) return;
    let month: { delivered: string; paused: boolean } | undefined;
    try {
      const rows = await this.db.query<{ delivered: string; paused: boolean }>(
        `with fresh as (
           insert into download_deliveries (user_id, month, file_key, bytes)
           select $1, $2::date, f.key, f.bytes
             from unnest($3::text[], $4::bigint[]) as f(key, bytes)
           on conflict (user_id, month, file_key) do nothing
           returning bytes
         ), added as (
           select coalesce(sum(bytes), 0) as bytes from fresh
         )
         insert into download_usage (user_id, month, delivered_bytes)
         select $1, $2::date, added.bytes from added where added.bytes > 0
         on conflict (user_id, month)
         do update set delivered_bytes = download_usage.delivered_bytes + excluded.delivered_bytes,
                       updated_at = now()
         returning delivered_bytes::text as delivered, paused_at is not null as paused`,
        [ownerId, monthKey(now), [...unique.keys()], [...unique.values()]],
      );
      month = rows[0];
    } catch (err) {
      this.logger.warn(`Delivery of ${unique.size} files not counted: ${String(err)}`);
      return;
    }
    // No row: everything here was delivered already this month.
    if (month && !month.paused && Number(month.delivered) >= NO_ALERT_BELOW) {
      await this.alertIfCrossed(ownerId, now);
    }
  }

  /**
   * Staff setting this month's extra allowance for one account: the way out
   * while no plan can be bought. `bytes` replaces what was there; 0 takes it
   * away. Clears the month's alert stamps, so the 80% and pause alerts work
   * again against the new line.
   */
  async setExtra(ownerId: string, bytes: number, staffId: string, now = new Date()): Promise<DownloadUsage> {
    const amount = Math.max(0, Math.floor(bytes));
    await this.db.query(
      `insert into download_usage (user_id, month, extra_bytes, extra_granted_by, extra_granted_at)
       values ($1, $2::date, $3, $4, now())
       on conflict (user_id, month)
       do update set extra_bytes = excluded.extra_bytes,
                     extra_granted_by = excluded.extra_granted_by,
                     extra_granted_at = excluded.extra_granted_at,
                     warned_at = null,
                     paused_at = null,
                     updated_at = now()`,
      [ownerId, monthKey(now), amount, staffId],
    );
    return this.usage(ownerId, now);
  }

  /**
   * Tells the owner their client links have delivered most of the month's
   * allowance, all of it, or so much more than delivering takes that the
   * fair-use ceiling was reached. Never throws.
   *
   * Each alert is claimed before it is sent, by stamping the month's row where
   * the stamp is still empty: whichever download crosses the line first sends
   * it, and one arriving a moment later finds the stamp set and sends nothing.
   * Pausing stamps both, so a jump from under 80% to past the line sends only
   * the pause.
   *
   * The owner is the photographer — the album's owner, whose plan pays for
   * the egress — never the client, who is told nothing about any of this.
   */
  private async alertIfCrossed(ownerId: string, now: Date): Promise<void> {
    try {
      const month = await this.month(ownerId, now);
      const { limit, paused, reason } = standing(month);
      if (limit === null || limit <= 0) return;

      const state = paused ? 'paused' : month.delivered >= limit * WARN_AT ? 'warning' : null;
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

      const used = formatGb(month.delivered);
      const allowance = formatGb(limit);
      const sent = formatGb(month.sent);
      const reset = resetsOn(now);
      const fairUse = reason === 'fair-use';
      await this.notifier.notify([ownerId], {
        topic: 'billing',
        title:
          state === 'paused' ? 'Client downloads are paused' : 'Most of this month’s client downloads are used',
        body: fairUse
          ? `Your client links have sent ${sent} this month, far more than delivering your galleries takes, so new downloads are paused until ${reset}. If that is expected, contact support.`
          : state === 'paused'
            ? `Your client links have delivered your ${allowance} for this month, so new downloads are paused until ${reset}. Downloads already under way will finish.`
            : `Your client links have delivered ${used} of your ${allowance} this month. At ${allowance}, new downloads pause until ${reset}.`,
        // `billing` rather than a topic of its own: phones still on an older
        // bundle know it, and open their plan screen for it. Newer ones read
        // `type` and open Storage, where the month's downloads are.
        data: { type: 'downloads', state, reason, month: monthKey(now) },
        email: clientDownloadsAlert({
          state,
          reason: fairUse ? 'fair-use' : 'allowance',
          name: month.name?.trim() || 'there',
          used,
          limit: allowance,
          sent,
          resetsOn: reset,
          url: `${this.mailConfig.appUrl}/settings/storage`,
        }),
      });
    } catch (err) {
      this.logger.warn(`Client download alert not sent: ${String(err)}`);
    }
  }

  /**
   * Counts what this response actually puts on the wire, to the owner, and —
   * given `delivered` — which files that delivered.
   *
   * Measured at the socket rather than by wrapping each file's stream, so one
   * rule covers the three ways a delivery leaves: a zip assembled from many
   * objects, a cache hit sent by `res.sendFile` (which handles Range itself
   * and offers no hook), and a pass-through from storage. A client who
   * cancels is charged for what they received, not the whole file; a Range
   * request for the last 10 MB is charged 10 MB. Response headers are counted
   * too, a few hundred bytes against files measured in megabytes.
   *
   * `delivered` turns the bytes sent so far into the files they reached; each
   * is counted once for this response, and once for the month however many
   * responses reach it.
   *
   * Long downloads report every FLUSH_EVERY_MS rather than only at the end,
   * so a second download started meanwhile is checked against a count that
   * includes the first.
   *
   * One response per socket at a time is what makes the delta this response's
   * alone: Node's HTTP/1.1 server does not interleave responses on a
   * connection.
   */
  meter(ownerId: string, res: Response, delivered?: (sent: number) => DeliveredFile[]): void {
    const socket = res.socket;
    if (!socket) return;
    const start = socket.bytesWritten;
    let counted = 0;
    const reported = new Set<string>();
    const flush = () => {
      const sent = Math.max(0, socket.bytesWritten - start);
      const delta = sent - counted;
      counted = sent;
      if (delta > 0) void this.recordSent(ownerId, delta);
      if (delivered && sent > 0) {
        const fresh = delivered(sent).filter((file) => !reported.has(file.key));
        for (const file of fresh) reported.add(file.key);
        if (fresh.length > 0) void this.recordDelivered(ownerId, fresh);
      }
    };
    const timer = setInterval(flush, FLUSH_EVERY_MS);
    timer.unref?.();
    res.once('close', () => {
      clearInterval(timer);
      flush();
    });
  }
}
