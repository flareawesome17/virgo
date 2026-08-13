import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';
import { MailService } from '../mail/mail.service';
import { PLAN_CATALOGUE, limitsFor, toJsonLimit } from '../quota/quota.config';
import { VisitsService } from '../visits/visits.service';

/**
 * Everything the console reads and writes about the platform.
 *
 * Queries live here rather than in the controllers so the shapes the dashboard
 * depends on are in one file. Nothing in here trusts a caller — authorisation
 * happened in AdminGuard before any of this ran — but it still refuses
 * operations that would break an invariant, like removing the last owner.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    private readonly mail: MailService,
    private readonly visits: VisitsService,
  ) {}

  // ---------------------------------------------------------------- overview

  async overview(days = 30) {
    const counts = await this.db.queryOne<Record<string, string>>(
      `select
         (select count(*) from users)::text                                   as users_total,
         (select count(*) from users
           where created_at > now() - ($1 || ' days')::interval)::text        as users_new,
         (select count(*) from users
           where last_seen_at > now() - interval '7 days')::text              as users_active_7d,
         (select count(*) from users where email_verified_at is not null)::text as users_verified,
         (select count(*) from albums)::text                                  as albums,
         (select count(*) from workspaces)::text                              as workspaces,
         (select count(*) from user_files)::text                              as files,
         (select coalesce(sum(size_bytes), 0) from user_files)::text          as bytes,
         (select count(*) from album_share_links where revoked_at is null)::text as share_links,
         (select count(*) from hiring_posts where status = 'open')::text      as jobs_open,
         (select count(*) from hiring_applications)::text                     as applications,
         (select count(*) from support_tickets where status in ('open','pending'))::text as tickets_open,
         (select count(*) from hiring_post_reports)::text                     as reports`,
      [String(days)],
    );

    const signups = await this.db.query(
      `select date_trunc('day', created_at)::date::text as day, count(*)::int as count
         from users
        where created_at > now() - ($1 || ' days')::interval
        group by 1 order by 1`,
      [String(days)],
    );

    const uploads = await this.db.query(
      `select date_trunc('day', created_at)::date::text as day,
              count(*)::int as count,
              coalesce(sum(size_bytes), 0)::bigint as bytes
         from user_files
        where created_at > now() - ($1 || ' days')::interval
        group by 1 order by 1`,
      [String(days)],
    );

    const byPlan = await this.db.query(
      `select plan, count(*)::int as count from users group by 1 order by 2 desc`,
    );

    return {
      days,
      totals: {
        users: Number(counts?.users_total ?? 0),
        newUsers: Number(counts?.users_new ?? 0),
        activeUsers: Number(counts?.users_active_7d ?? 0),
        verifiedUsers: Number(counts?.users_verified ?? 0),
        albums: Number(counts?.albums ?? 0),
        workspaces: Number(counts?.workspaces ?? 0),
        files: Number(counts?.files ?? 0),
        storageBytes: Number(counts?.bytes ?? 0),
        shareLinks: Number(counts?.share_links ?? 0),
        openJobs: Number(counts?.jobs_open ?? 0),
        applications: Number(counts?.applications ?? 0),
        openTickets: Number(counts?.tickets_open ?? 0),
        reports: Number(counts?.reports ?? 0),
      },
      signups,
      uploads,
      byPlan,
      visits: await this.visits.summary(days),
    };
  }

  // ------------------------------------------------------------------- users

  async users(params: { q?: string; plan?: string; limit?: number; offset?: number }) {
    const limit = Math.min(Math.max(params.limit ?? 25, 1), 100);
    const offset = Math.max(params.offset ?? 0, 0);
    const q = params.q?.trim() ? `%${params.q.trim()}%` : null;
    const plan = params.plan?.trim() || null;

    const rows = await this.db.query<{
      plan: string;
      bonus_storage_bytes: string;
      [key: string]: unknown;
    }>(
      `select u.id, u.email, u.display_name, u.avatar_url, u.plan, u.roles,
              u.created_at, u.last_seen_at, u.email_verified_at,
              u.disabled_at, u.disabled_until, u.handle, u.public_profile,
              (select coalesce(sum(f.size_bytes), 0) from user_files f where f.user_id = u.id)::bigint
                as storage_bytes,
              -- Claimed promos, which raise the ceiling above what the plan
              -- name implies. Computed here rather than by calling
              -- QuotaService per row, which would be one query per user.
              (select coalesce(sum(p.storage_bytes), 0)
                 from promo_grants g
                 join promos p on p.id = g.promo_id
                where g.user_id = u.id and g.claimed_at is not null)::text
                as bonus_storage_bytes,
              (select count(*) from albums a where a.user_id = u.id)::int as albums
         from users u
        where ($3::text is null or u.email ilike $3 or u.display_name ilike $3 or u.handle ilike $3)
          and ($4::text is null or u.plan = $4)
        order by u.created_at desc
        limit $1 offset $2`,
      [limit, offset, q, plan],
    );

    /**
     * What each account may actually store.
     *
     * The plan allowance lives in `quota.config.ts`, not the database, so this
     * half cannot be done in SQL. Adding the promo bonus to it here matches
     * `QuotaService.limits`, which is what every upload is actually checked
     * against — the console showing anything else would be showing a number
     * the product does not enforce.
     */
    const data = rows.map((row) => {
      const bonus = Number(row.bonus_storage_bytes ?? 0);
      return {
        ...row,
        storage_bonus_bytes: bonus,
        storage_limit_bytes: limitsFor(row.plan).storageBytes + bonus,
      };
    });

    const total = await this.db.queryOne<{ count: string }>(
      `select count(*)::text as count from users u
        where ($1::text is null or u.email ilike $1 or u.display_name ilike $1 or u.handle ilike $1)
          and ($2::text is null or u.plan = $2)`,
      [q, plan],
    );

    return { data, total: Number(total?.count ?? 0) };
  }

  /**
   * One account in full.
   *
   * Includes storage and album counts because the question support is usually
   * answering is "why can this person not upload", and the answer is almost
   * always their quota.
   */
  async user(id: string) {
    const user = await this.db.queryOne<Record<string, unknown>>(
      `select id, email, display_name, avatar_url, plan, plan_since, roles, title, bio,
              location, website, handle, public_profile, discoverable, shares_location,
              created_at, updated_at, last_seen_at, email_verified_at,
              disabled_at, disabled_until, paymongo_customer_id
         from users where id = $1`,
      [id],
    );
    if (!user) throw new NotFoundException('No such account');

    const [storage, workspaces, albums, subscription, tickets] = await Promise.all([
      this.db.queryOne<{ bytes: string; files: string }>(
        `select coalesce(sum(size_bytes),0)::text as bytes, count(*)::text as files
           from user_files where user_id = $1`,
        [id],
      ),
      this.db.query(
        `select id, name, created_at from workspaces where user_id = $1 order by created_at`,
        [id],
      ),
      this.db.query(
        `select a.id, a.name, a.status, a.item_count, a.retention_days, a.created_at,
                (select count(*) from album_share_links l
                  where l.album_id = a.id and l.revoked_at is null)::int as share_links
           from albums a where a.user_id = $1 order by a.created_at desc`,
        [id],
      ),
      this.db.queryOne(
        `select id, plan_name, status, amount_minor, currency, kind,
                current_period_end, cancelled_at, created_at
           from subscriptions where user_id = $1
          order by created_at desc limit 1`,
        [id],
      ),
      this.db.query(
        `select id, subject, status, priority, created_at
           from support_tickets where user_id = $1 order by created_at desc limit 10`,
        [id],
      ),
    ]);

    const limits = limitsFor(String(user.plan));

    return {
      user,
      storage: {
        bytes: Number(storage?.bytes ?? 0),
        files: Number(storage?.files ?? 0),
        limitBytes: toJsonLimit(limits.storageBytes),
      },
      limits: {
        workspaces: toJsonLimit(limits.workspaces),
        albumsPerWorkspace: toJsonLimit(limits.albumsPerWorkspace),
      },
      workspaces,
      albums,
      subscription,
      tickets,
    };
  }

  /**
   * Suspends or restores an account.
   *
   * Sets `disabled_at`, which the app's own auth already understands — this
   * reuses the existing suspension path rather than inventing a second notion
   * of "blocked" that only the console knows about.
   */
  async setUserDisabled(id: string, disabled: boolean, reason?: string) {
    const row = await this.db.queryOne<{ id: string; email: string }>(
      `update users
          set disabled_at = case when $2 then now() else null end,
              disabled_until = null,
              updated_at = now()
        where id = $1
        returning id, email`,
      [id, disabled],
    );
    if (!row) throw new NotFoundException('No such account');
    return { ...row, disabled, reason: reason ?? null };
  }

  /**
   * Moves an account between plans by hand.
   *
   * The console can do this while checkout is switched off for the
   * pre-release, which is the only way to give someone paid limits today. It
   * does not create a subscription — no money changed hands — and the plan
   * name is checked against the catalogue so a typo cannot produce an account
   * whose limits fall back to free.
   */
  async setUserPlan(id: string, plan: string) {
    if (!PLAN_CATALOGUE.some((p) => p.name === plan)) {
      throw new BadRequestException(
        `Unknown plan. One of: ${PLAN_CATALOGUE.map((p) => p.name).join(', ')}`,
      );
    }
    const row = await this.db.queryOne<{ id: string; email: string; plan: string }>(
      `update users
          set plan = $2,
              plan_since = case when plan <> $2 then now() else plan_since end,
              updated_at = now()
        where id = $1
        returning id, email, plan`,
      [id, plan],
    );
    if (!row) throw new NotFoundException('No such account');
    return row;
  }

  // ----------------------------------------------------------------- content

  async albums(params: { q?: string; limit?: number; offset?: number }) {
    const limit = Math.min(Math.max(params.limit ?? 25, 1), 100);
    const offset = Math.max(params.offset ?? 0, 0);
    const q = params.q?.trim() ? `%${params.q.trim()}%` : null;

    const rows = await this.db.query(
      `select a.id, a.name, a.status, a.item_count, a.retention_days, a.created_at,
              u.id as owner_id, u.email as owner_email, u.display_name as owner_name,
              (select count(*) from album_share_links l
                where l.album_id = a.id and l.revoked_at is null)::int as share_links,
              (select coalesce(sum(f.size_bytes),0) from user_files f where f.album_id = a.id)::bigint
                as bytes
         from albums a join users u on u.id = a.user_id
        where ($3::text is null or a.name ilike $3 or u.email ilike $3)
        order by a.created_at desc limit $1 offset $2`,
      [limit, offset, q],
    );
    const total = await this.db.queryOne<{ count: string }>(
      `select count(*)::text as count from albums a join users u on u.id = a.user_id
        where ($1::text is null or a.name ilike $1 or u.email ilike $1)`,
      [q],
    );
    return { data: rows, total: Number(total?.count ?? 0) };
  }

  async shareLinks(params: { limit?: number; offset?: number }) {
    const limit = Math.min(Math.max(params.limit ?? 25, 1), 100);
    const offset = Math.max(params.offset ?? 0, 0);
    const rows = await this.db.query(
      // The token is deliberately not selected. It is the credential to
      // somebody's private gallery, and a console list is not a reason to put
      // it on the wire.
      `select l.id, l.album_id, l.purpose, l.media_kinds, l.created_at,
              l.expires_at, l.revoked_at,
              a.name as album_name, u.email as owner_email
         from album_share_links l
         join albums a on a.id = l.album_id
         join users u on u.id = l.user_id
        order by l.created_at desc limit $1 offset $2`,
      [limit, offset],
    );
    const total = await this.db.queryOne<{ count: string }>(
      'select count(*)::text as count from album_share_links',
    );
    return { data: rows, total: Number(total?.count ?? 0) };
  }

  async revokeShareLink(id: string) {
    const row = await this.db.queryOne<{ id: string; album_id: string }>(
      `update album_share_links set revoked_at = now()
        where id = $1 and revoked_at is null returning id, album_id`,
      [id],
    );
    if (!row) throw new NotFoundException('No such link, or it is already revoked');
    return row;
  }

  async jobReports(params: { limit?: number; offset?: number }) {
    const limit = Math.min(Math.max(params.limit ?? 25, 1), 100);
    const offset = Math.max(params.offset ?? 0, 0);
    const rows = await this.db.query(
      `select r.*, p.title, p.slug, p.status as post_status, p.hidden_at,
              u.email as reporter_email
         from hiring_post_reports r
         join hiring_posts p on p.id = r.post_id
         left join users u on u.id = r.reporter_user_id
        order by r.created_at desc limit $1 offset $2`,
      [limit, offset],
    );
    const total = await this.db.queryOne<{ count: string }>(
      'select count(*)::text as count from hiring_post_reports',
    );
    return { data: rows, total: Number(total?.count ?? 0) };
  }

  async setJobHidden(postId: string, hidden: boolean) {
    const row = await this.db.queryOne<{ id: string; title: string }>(
      `update hiring_posts set hidden_at = case when $2 then now() else null end
        where id = $1 returning id, title`,
      [postId, hidden],
    );
    if (!row) throw new NotFoundException('No such post');
    return { ...row, hidden };
  }

  // ----------------------------------------------------------------- billing

  async subscriptions(params: { status?: string; limit?: number; offset?: number }) {
    const limit = Math.min(Math.max(params.limit ?? 25, 1), 100);
    const offset = Math.max(params.offset ?? 0, 0);
    const status = params.status?.trim() || null;

    const rows = await this.db.query(
      `select s.id, s.provider_id, s.plan_name, s.status, s.amount_minor, s.currency,
              s.kind, s.current_period_end, s.cancelled_at, s.created_at,
              u.id as user_id, u.email as user_email, u.display_name as user_name
         from subscriptions s join users u on u.id = s.user_id
        where ($3::text is null or s.status = $3)
        order by s.created_at desc limit $1 offset $2`,
      [limit, offset, status],
    );
    const total = await this.db.queryOne<{ count: string }>(
      `select count(*)::text as count from subscriptions
        where ($1::text is null or status = $1)`,
      [status],
    );

    const revenue = await this.db.queryOne<{ mrr: string; active: string }>(
      `select coalesce(sum(amount_minor), 0)::text as mrr, count(*)::text as active
         from subscriptions
        where status = 'active' and kind = 'subscription' and cancelled_at is null`,
    );

    return {
      data: rows,
      total: Number(total?.count ?? 0),
      mrrMinor: Number(revenue?.mrr ?? 0),
      activeCount: Number(revenue?.active ?? 0),
    };
  }

  // ------------------------------------------------------------------ system

  /**
   * Whether the moving parts are reachable, checked live.
   *
   * Storage and mail are probed rather than reported from config, because the
   * failure this is meant to catch — the container losing its route to B2 —
   * looks perfectly healthy from configuration alone.
   */
  async health() {
    const started = Date.now();
    const [database, storage, mail] = await Promise.all([
      this.db
        .queryOne('select 1 as ok')
        .then(() => ({ ok: true, detail: 'reachable' }))
        .catch((e: unknown) => ({ ok: false, detail: String(e).slice(0, 160) })),
      this.storage
        .healthCheck()
        .then((r) => r)
        .catch((e: unknown) => ({ ok: false, detail: String(e).slice(0, 160) })),
      Promise.resolve(
        this.mail.isEnabled
          ? { ok: true, detail: 'configured' }
          : { ok: false, detail: 'not configured' },
      ),
    ]);

    const counts = await this.db.queryOne<Record<string, string>>(
      `select
         (select count(*) from user_files)::text as files,
         (select coalesce(sum(size_bytes),0) from user_files)::text as bytes,
         (select count(*) from user_files where thumb_key is null
            and content_type like 'image/%')::text as missing_thumbs,
         (select count(*) from push_tokens)::text as push_tokens,
         (select count(*) from refresh_tokens where revoked_at is null)::text as sessions`,
    );

    return {
      checkedInMs: Date.now() - started,
      services: { database, storage, mail },
      storage: {
        files: Number(counts?.files ?? 0),
        bytes: Number(counts?.bytes ?? 0),
        imagesWithoutThumbnail: Number(counts?.missing_thumbs ?? 0),
      },
      pushTokens: Number(counts?.push_tokens ?? 0),
      activeSessions: Number(counts?.sessions ?? 0),
    };
  }
}
