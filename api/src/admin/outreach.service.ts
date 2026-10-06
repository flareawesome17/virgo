import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import type { ClientPlatform } from '../notifications/app-update-targeting';
import { AppUpdatesService } from '../notifications/app-updates.service';
import { NotifyService } from '../notifications/notify.service';
import { PromosService } from '../promos/promos.service';
import { audienceSelect, cleanFilters, type AudienceFilters } from './audience';

interface Staff {
  id: string;
  name: string;
}

interface BroadcastRow {
  id: string;
  title: string;
  body: string;
  url: string | null;
  filters: AudienceFilters;
  push: boolean;
  status: 'scheduled' | 'sending' | 'sent' | 'cancelled';
  per_minute: number;
  cursor: string | null;
}

/** Nobody suspended is ever counted into an audience or sent anything. */
const REACHABLE = 'u.suspended_at is null';
const HAS_PHONE =
  'exists (select 1 from push_tokens p where p.user_id = u.id and p.disabled_at is null)';
/** How many go to NotifyService in one call: its row insert, its token reads, one push request. */
const CHUNK = 500;

/**
 * Reaching many customers at once, from the console.
 *
 * Segments are saved audiences: the people list's filters, counted live. A
 * broadcast is an in-app notification — and a push, where people allow
 * "updates" pushes — sent to a segment or to everyone, now or later. Sending
 * happens here, a batch a minute: `per_minute` accounts at a time, in id
 * order from where the last batch stopped, so a broadcast to thousands is
 * throttled, survives a restart without sending anyone anything twice, and
 * can be cancelled part way. App-update announcements, which a workflow used
 * to post with a shared token, are made from here too.
 */
@Injectable()
export class OutreachService {
  private readonly logger = new Logger(OutreachService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly notify: NotifyService,
    private readonly updates: AppUpdatesService,
    private readonly promos: PromosService,
  ) {}

  // -------------------------------------------------------------- audiences

  /**
   * How many people these filters reach, how many of them have a phone to
   * push to, and a few of them by name — so whoever builds a segment sees who
   * it is, not only how many.
   */
  async count(input: unknown) {
    const filters = cleanFilters(input);
    const args: unknown[] = [];
    const sql = audienceSelect(filters, args, [REACHABLE]);
    const phoneArgs: unknown[] = [];
    const phoneSql = audienceSelect(filters, phoneArgs, [REACHABLE, HAS_PHONE]);
    const [count, withPhone, preview] = await Promise.all([
      this.db.queryOne<{ n: number }>(`select count(*)::int as n from (${sql}) a`, args),
      this.db.queryOne<{ n: number }>(`select count(*)::int as n from (${phoneSql}) a`, phoneArgs),
      this.db.query(
        `select u.id, coalesce(nullif(btrim(u.display_name), ''), split_part(u.email, '@', 1)) as name,
                u.email, u.last_seen_at
           from users u where u.id in (${sql})
          order by u.last_seen_at desc nulls last limit 8`,
        args,
      ),
    ]);
    return { filters, count: count?.n ?? 0, withPhone: withPhone?.n ?? 0, preview };
  }

  // --------------------------------------------------------------- segments

  async segments() {
    const rows = await this.db.query<{ id: string; filters: AudienceFilters } & Record<string, unknown>>(
      `select id, name, description, filters, created_by_name, created_at, updated_at
         from segments order by lower(name)`,
    );
    // Counted live, one query each: a segment is only worth what it reaches today.
    return Promise.all(
      rows.map(async (row) => {
        const args: unknown[] = [];
        const sql = audienceSelect(cleanFilters(row.filters), args, [REACHABLE]);
        const n = await this.db.queryOne<{ n: number }>(`select count(*)::int as n from (${sql}) a`, args);
        return { ...row, count: n?.n ?? 0 };
      }),
    );
  }

  async saveSegment(
    staff: Staff,
    input: { name: string; description?: string | null; filters: unknown },
    id?: string,
  ) {
    const filters = cleanFilters(input.filters);
    const name = input.name.trim();
    const description = input.description?.trim() || null;
    if (id) {
      const row = await this.db.queryOne(
        `update segments set name = $2, description = $3, filters = $4, updated_at = now()
          where id = $1 returning id, name, description, filters`,
        [id, name, description, JSON.stringify(filters)],
      );
      if (!row) throw new NotFoundException('No such segment');
      return row;
    }
    return this.db.queryOne(
      `insert into segments (name, description, filters, created_by, created_by_name)
       values ($1, $2, $3, $4, $5) returning id, name, description, filters`,
      [name, description, JSON.stringify(filters), staff.id, staff.name],
    );
  }

  async removeSegment(id: string) {
    const row = await this.db.queryOne<{ name: string }>(
      'delete from segments where id = $1 returning name',
      [id],
    );
    if (!row) throw new NotFoundException('No such segment');
    return row;
  }

  private async segment(id: string): Promise<{ id: string; name: string; filters: AudienceFilters }> {
    const row = await this.db.queryOne<{ id: string; name: string; filters: AudienceFilters }>(
      'select id, name, filters from segments where id = $1',
      [id],
    );
    if (!row) throw new NotFoundException('No such segment');
    return { ...row, filters: cleanFilters(row.filters) };
  }

  // ------------------------------------------------------------- broadcasts

  async broadcasts() {
    return this.db.query(
      `select b.id, b.title, b.body, b.url, b.segment_id, b.segment_name, b.filters, b.push,
              b.status, b.send_at, b.per_minute, b.started_at, b.finished_at,
              b.recipients, b.delivered, b.pushed, b.push_failed,
              b.created_by_name, b.cancelled_by_name, b.created_at,
              (select count(*) from notifications n
                where n.data ->> 'broadcastId' = b.id::text and n.read_at is not null)::int as opened
         from broadcasts b
        order by case when b.status in ('scheduled', 'sending') then 0 else 1 end,
                 coalesce(b.started_at, b.send_at) desc
        limit 100`,
    );
  }

  /**
   * Schedules a broadcast — now, or at `sendAt`. The audience is copied from
   * the segment as it stands, so editing the segment later does not change
   * who a scheduled message reaches. With neither a segment nor filters it
   * goes to everyone, which the console asks about first.
   */
  async createBroadcast(
    staff: Staff,
    input: {
      title: string;
      body: string;
      url?: string | null;
      segmentId?: string | null;
      filters?: unknown;
      push?: boolean;
      sendAt?: string | null;
      perMinute?: number;
    },
  ) {
    const segment = input.segmentId ? await this.segment(input.segmentId) : null;
    const filters = segment ? segment.filters : cleanFilters(input.filters);
    const sendAt = input.sendAt ? new Date(input.sendAt) : new Date();
    if (Number.isNaN(sendAt.getTime())) throw new BadRequestException('That send time is not a date.');
    if (sendAt.getTime() > Date.now() + 90 * 86_400_000) {
      throw new BadRequestException('A broadcast can be scheduled up to 90 days ahead.');
    }
    return this.db.queryOne(
      `insert into broadcasts
         (title, body, url, segment_id, segment_name, filters, push, send_at, per_minute,
          created_by, created_by_name)
       values ($1, $2, $3, $4, $5, $6, $7, greatest($8::timestamptz, now()), $9, $10, $11)
       returning id, status, send_at`,
      [
        input.title.trim(),
        input.body.trim(),
        input.url?.trim() || null,
        segment?.id ?? null,
        segment?.name ?? null,
        JSON.stringify(filters),
        input.push !== false,
        sendAt.toISOString(),
        input.perMinute ?? 1000,
        staff.id,
        staff.name,
      ],
    );
  }

  /** Stops one that has not finished. What already went out stays out. */
  async cancelBroadcast(id: string, staff: Staff) {
    const row = await this.db.queryOne<{ id: string; delivered: number }>(
      `update broadcasts set status = 'cancelled', cancelled_by_name = $2, finished_at = now(), updated_at = now()
        where id = $1 and status in ('scheduled', 'sending')
        returning id, delivered`,
      [id, staff.name],
    );
    if (!row) throw new ConflictException('That broadcast has already finished.');
    return row;
  }

  /** A scheduled broadcast, sent on the next minute instead. */
  async sendNow(id: string) {
    const row = await this.db.queryOne<{ id: string }>(
      `update broadcasts set send_at = now(), updated_at = now()
        where id = $1 and status = 'scheduled' returning id`,
      [id],
    );
    if (!row) throw new ConflictException('Only a scheduled broadcast can be sent early.');
    return row;
  }

  /**
   * Sends what is due, a batch per broadcast per minute.
   *
   * Under a transaction-scoped advisory lock, so two API processes do not
   * both send the same batch; whichever does not get it skips the minute.
   * Never throws.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    try {
      await this.db.transaction(async (tx) => {
        const lock = await tx.query<{ ok: boolean }>(
          "select pg_try_advisory_xact_lock(hashtext('virgo.broadcasts')) as ok",
        );
        if (!lock.rows[0]?.ok) return;
        const due = await this.db.query<BroadcastRow>(
          `select id, title, body, url, filters, push, status, per_minute, cursor
             from broadcasts
            where status in ('scheduled', 'sending') and send_at <= now()
            order by send_at limit 5`,
        );
        for (const broadcast of due) await this.sendBatch(broadcast);
      });
    } catch (err) {
      this.logger.error(`Broadcast tick failed: ${String(err)}`);
    }
  }

  /** One minute's worth of one broadcast. */
  async sendBatch(b: BroadcastRow): Promise<void> {
    const filters = cleanFilters(b.filters);
    if (b.status === 'scheduled') {
      const args: unknown[] = [];
      const sql = audienceSelect(filters, args, [REACHABLE]);
      const total = await this.db.queryOne<{ n: number }>(`select count(*)::int as n from (${sql}) a`, args);
      const started = await this.db.queryOne(
        `update broadcasts set status = 'sending', started_at = now(), recipients = $2, updated_at = now()
          where id = $1 and status = 'scheduled' returning id`,
        [b.id, total?.n ?? 0],
      );
      if (!started) return;
    }

    const args: unknown[] = [];
    const extra = [REACHABLE];
    if (b.cursor) {
      args.push(b.cursor);
      extra.push(`u.id > $${args.length}::uuid`);
    }
    const sql = audienceSelect(filters, args, extra);
    const batch = await this.db.query<{ id: string }>(
      `${sql} order by u.id limit ${Math.min(Math.max(b.per_minute, 50), 20000)}`,
      args,
    );

    let delivered = 0;
    let pushed = 0;
    let failed = 0;
    for (let i = 0; i < batch.length; i += CHUNK) {
      const ids = batch.slice(i, i + CHUNK).map((r) => r.id);
      const result = await this.notify.deliver(
        ids.map((userId) => ({
          userId,
          topic: 'announcement',
          title: b.title,
          body: b.body,
          data: { type: 'announcement', broadcastId: b.id, ...(b.url ? { url: b.url } : {}) },
          push: b.push,
          // News, not somebody waiting on you: the quiet channel, no sound.
          channelId: 'updates',
          sound: null,
          priority: 'normal',
        })),
      );
      delivered += ids.length;
      pushed += result.sent;
      failed += result.failed;
    }

    const last = batch[batch.length - 1]?.id ?? b.cursor;
    const finished = batch.length < Math.min(Math.max(b.per_minute, 50), 20000);
    await this.db.query(
      `update broadcasts
          set cursor = $2, delivered = delivered + $3, pushed = pushed + $4, push_failed = push_failed + $5,
              status = case when $6 and status = 'sending' then 'sent' else status end,
              finished_at = case when $6 and status = 'sending' then now() else finished_at end,
              updated_at = now()
        where id = $1`,
      [b.id, last, delivered, pushed, failed, finished],
    );
    if (batch.length > 0 || finished) {
      this.logger.log(`broadcast ${b.id}: ${delivered} delivered, ${pushed} pushed${finished ? ', finished' : ''}`);
    }
  }

  // ------------------------------------------------------------ app updates

  async appUpdates() {
    return this.db.query(
      `select u.id, u.slug, u.platforms, u.min_version, u.max_version, u.version, u.title, u.body,
              u.url, u.published_at, u.pushed, u.created_by_name,
              (select count(*) from app_update_reads r
                where r.update_id = u.id and r.read_at is not null)::int as reads
         from app_updates u order by u.published_at desc limit 100`,
    );
  }

  /** The workflow's announcement, from the console, under the console's permissions. */
  async announce(
    staff: Staff,
    input: {
      slug: string;
      platforms: ClientPlatform[];
      minVersion?: string;
      maxVersion?: string;
      version?: string;
      title: string;
      body: string;
      url?: string;
      push?: boolean;
    },
  ) {
    const result = await this.updates.announce({ ...input, push: input.push !== false });
    if (!result.created) throw new ConflictException('That name was used for an earlier announcement.');
    await this.db.query('update app_updates set pushed = $2, created_by_name = $3 where id = $1', [
      result.id,
      result.pushed,
      staff.name,
    ]);
    return result;
  }

  // ----------------------------------------------------------------- promos

  /** A targeted promo, offered to everyone a segment reaches today. */
  async grantPromoToSegment(promoId: string, segmentId: string) {
    const segment = await this.segment(segmentId);
    const args: unknown[] = [];
    const sql = audienceSelect(segment.filters, args, [REACHABLE]);
    const result = await this.promos.grantToAudience(promoId, { sql, args });
    return { ...result, segment: segment.name };
  }
}
