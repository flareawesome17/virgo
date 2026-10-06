import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';
import { MailService } from '../mail/mail.service';
import { PLAN_CATALOGUE, limitsFor, toJsonLimit } from '../quota/quota.config';
import { audienceWhere, planStorageCase, storageThreshold, type AudienceFilters } from './audience';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { VisitsService } from '../visits/visits.service';

/**
 * The columns the people list can be ordered by.
 *
 * A fixed map rather than the caller's string: ORDER BY cannot take a bind
 * parameter, so anything not named here never reaches the SQL. `storage_bytes`
 * and `albums` are the select list's own aliases. `u.id` breaks ties, so a page
 * boundary never lands between two rows that compare equal and shows one twice.
 */
const USER_SORTS: Record<string, string> = {
  joined: 'u.created_at',
  last_seen: 'u.last_seen_at',
  storage: 'storage_bytes',
  albums: 'albums',
  email: 'u.email',
};

export function userOrder(sort?: string, dir?: string): string {
  const column = USER_SORTS[sort ?? ''] ?? USER_SORTS.joined;
  const direction = dir === 'asc' ? 'asc' : 'desc';
  // Never-seen accounts go last either way: "nulls first" on a descending
  // last-seen sort would open the list with the people who never came back.
  return `${column} ${direction} nulls last, u.id ${direction}`;
}

/** The people list: an audience (see audience.ts), paged and sorted. */
export interface UsersQuery extends AudienceFilters {
  limit?: number;
  offset?: number;
  sort?: string;
  dir?: string;
}


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
    // Global (RealtimeModule), so no import here: suspending closes sockets.
    private readonly realtime: RealtimeGateway,
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
         (select count(*) from hiring_post_reports where status = 'open')::text as reports,
         (select count(*) from user_reports where status = 'open')::text      as user_reports,
         (select count(*) from showcase_reports where status = 'open')::text  as showcase_reports`,
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
        // Open reports, waiting in the moderation queue. `reports` is job
        // posts only, as the console before this release reads it.
        reports: Number(counts?.reports ?? 0),
        userReports: Number(counts?.user_reports ?? 0),
        showcaseReports: Number(counts?.showcase_reports ?? 0),
        openReports:
          Number(counts?.reports ?? 0) +
          Number(counts?.user_reports ?? 0) +
          Number(counts?.showcase_reports ?? 0),
      },
      signups,
      uploads,
      byPlan,
      visits: await this.visits.summary(days),
    };
  }

  // ------------------------------------------------------------------- users

  async users(params: UsersQuery) {
    const limit = Math.min(Math.max(params.limit ?? 25, 1), 100);
    const offset = Math.max(params.offset ?? 0, 0);
    const orderBy = userOrder(params.sort, params.dir);

    /*
     * The filters, each optional. Built from fixed fragments with bind
     * parameters for every value, so nothing the caller sends becomes SQL.
     * `full` needs the storage figure, which only exists after the select, so
     * the whole list is a CTE and the filters apply to it.
     */
    const args: unknown[] = [];
    const where = audienceWhere(params, args);
    if (where.length === 0) where.push('true');
    const threshold = storageThreshold(params);
    if (threshold !== null) args.push(threshold);
    const outer =
      threshold !== null
        ? `where storage_bytes >= $${args.length}::numeric * (${planStorageCase('plan')} + bonus_storage_bytes)`
        : '';

    const base = `
      with base as (
        select u.id, u.email, u.display_name, u.avatar_url, u.plan, u.roles,
               u.created_at, u.last_seen_at, u.email_verified_at,
               u.disabled_at, u.disabled_until, u.suspended_at, u.handle, u.public_profile,
               u.two_factor_enabled_at is not null as two_factor,
               (select coalesce(sum(f.size_bytes), 0) from user_files f where f.user_id = u.id)::bigint
                 as storage_bytes,
               -- Claimed promos, which raise the ceiling above what the plan
               -- name implies. Computed here rather than by calling
               -- QuotaService per row, which would be one query per user.
               (select coalesce(sum(p.storage_bytes), 0)
                  from promo_grants g
                  join promos p on p.id = g.promo_id
                 where g.user_id = u.id and g.claimed_at is not null)::bigint
                 as bonus_storage_bytes,
               (select count(*) from albums a where a.user_id = u.id)::int as albums,
               (select coalesce(json_agg(json_build_object('id', t.id, 'label', t.label, 'color', t.color)
                                         order by lower(t.label)), '[]'::json)
                  from customer_tag_links l join customer_tags t on t.id = l.tag_id
                 where l.user_id = u.id) as tags
          from users u
         where ${where.join('\n           and ')}
      )`;

    const rows = await this.db.query<{
      plan: string;
      bonus_storage_bytes: string;
      [key: string]: unknown;
    }>(
      `${base}
       select * from base ${outer}
        order by ${orderBy.replace(/\bu\./g, '')}
        limit $${args.length + 1} offset $${args.length + 2}`,
      [...args, limit, offset],
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
      `${base} select count(*)::text as count from base ${outer}`,
      args,
    );

    return { data, total: Number(total?.count ?? 0) };
  }

  /**
   * One account in full.
   *
   * Includes storage and album counts because the question support is usually
   * answering is "why can this person not upload", and the answer is almost
   * always their quota — so the limits include what claimed promos add, as
   * QuotaService enforces them.
   */
  async user(id: string) {
    const user = await this.db.queryOne<Record<string, unknown>>(
      `select u.id, u.email, u.display_name, u.avatar_url, u.cover_url, u.plan, u.plan_since,
              u.roles, u.title, u.bio, u.location, u.website, u.phone, u.studio_name,
              u.social_handle, u.handle, u.public_profile, u.discoverable, u.shares_location,
              u.available_for_bookings,
              u.address_line1, u.address_line2, u.address_city, u.address_province,
              u.address_postal, u.address_country,
              u.created_at, u.updated_at, u.last_seen_at, u.email_verified_at,
              u.disabled_at, u.disabled_until, u.suspended_at, u.paymongo_customer_id,
              u.two_factor_enabled_at is not null as two_factor,
              u.referral_code, u.referred_at, u.referred_by_user_id,
              coalesce(nullif(trim(r.display_name), ''), r.email) as referred_by_name
         from users u left join users r on r.id = u.referred_by_user_id
        where u.id = $1`,
      [id],
    );
    if (!user) throw new NotFoundException('No such account');

    const [storage, bonus, workspaces, albums, subscription, tickets, tags, pinned, referrals] =
      await Promise.all([
        this.db.queryOne<{ bytes: string; files: string }>(
          `select coalesce(sum(size_bytes),0)::text as bytes, count(*)::text as files
             from user_files where user_id = $1`,
          [id],
        ),
        // The same sums QuotaService.bonusFor adds to the plan.
        this.db.queryOne<{ storage: string; workspaces: string; albums: string }>(
          `select coalesce(sum(p.storage_bytes), 0)::text              as storage,
                  coalesce(sum(p.extra_workspaces), 0)::text           as workspaces,
                  coalesce(sum(p.extra_albums_per_workspace), 0)::text as albums
             from promo_grants g join promos p on p.id = g.promo_id
            where g.user_id = $1 and g.claimed_at is not null`,
          [id],
        ),
        this.db.query(
          `select id, name, created_at, archived_at from workspaces where user_id = $1 order by created_at`,
          [id],
        ),
        // Items are the album's files, counted like the storage figure above.
        // `albums.item_count` is a counter nothing maintains, and it read 0 for
        // every album made since August 2026.
        this.db.query(
          `select a.id, a.name, a.status, a.workspace_id,
                  (select count(*) from user_files f where f.album_id = a.id)::int
                    as item_count,
                  (select coalesce(sum(f.size_bytes), 0) from user_files f where f.album_id = a.id)::bigint
                    as bytes,
                  a.retention_days, a.created_at,
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
          `select id, subject, status, priority, created_at, updated_at
             from support_tickets where user_id = $1 order by created_at desc limit 50`,
          [id],
        ),
        this.db.query(
          `select t.id, t.label, t.color from customer_tag_links l
             join customer_tags t on t.id = l.tag_id
            where l.user_id = $1 order by lower(t.label)`,
          [id],
        ),
        this.db.query(
          `select id, admin_name, body, created_at from customer_notes
            where user_id = $1 and pinned order by created_at desc limit 5`,
          [id],
        ),
        this.db.queryOne<{ count: string }>(
          'select count(*)::text as count from users where referred_by_user_id = $1',
          [id],
        ),
      ]);

    const plan = limitsFor(String(user.plan));
    const extra = {
      storage: Number(bonus?.storage ?? 0),
      workspaces: Number(bonus?.workspaces ?? 0),
      albums: Number(bonus?.albums ?? 0),
    };

    return {
      user,
      storage: {
        bytes: Number(storage?.bytes ?? 0),
        files: Number(storage?.files ?? 0),
        limitBytes: toJsonLimit(plan.storageBytes + extra.storage),
        bonusBytes: extra.storage,
      },
      limits: {
        workspaces: toJsonLimit(plan.workspaces + extra.workspaces),
        albumsPerWorkspace: toJsonLimit(plan.albumsPerWorkspace + extra.albums),
      },
      workspaces,
      albums,
      subscription,
      tickets,
      tags,
      pinnedNotes: pinned,
      referrals: Number(referrals?.count ?? 0),
      // What the plan picker offers, so the console never lists a plan the
      // API would refuse or misses one it would take.
      plans: PLAN_CATALOGUE.map(({ name, label }) => ({ name, label })),
    };
  }

  /**
   * Suspends or restores an account.
   *
   * `suspended_at` is what the app enforces: sign-in and refresh refuse it,
   * and every place that hides a paused account hides a suspended one too.
   * Suspending again keeps the first time.
   *
   * `disabled_at` is still written because the console before this release
   * shows its "Disabled" badge from it. It cannot be the suspension on its own
   * — a self-pause sets it too, and keeps it after the pause ends. The pause
   * itself (`disabled_until`) is the person's and is left alone; this used to
   * clear it, so suspending someone who had paused their account un-paused it.
   *
   * Suspending ends the sessions that exist: refresh tokens are revoked and
   * open sockets closed. An access token already issued lives out its fifteen
   * minutes on REST, which is accepted; a socket reconnecting with it is
   * refused when it authenticates, and push stops because the token reads
   * skip suspended accounts. Nothing is deleted, so lifting it needs nothing
   * re-registered.
   */
  async setUserDisabled(id: string, disabled: boolean, reason?: string) {
    const row = await this.db.queryOne<{
      id: string;
      email: string;
      suspended_at: Date | null;
    }>(
      `update users
          set suspended_at = case when $2 then coalesce(suspended_at, now()) else null end,
              disabled_at = case when $2 then now() else null end,
              updated_at = now()
        where id = $1
        returning id, email, suspended_at`,
      [id, disabled],
    );
    if (!row) throw new NotFoundException('No such account');

    if (disabled) {
      await this.db.query(
        `update refresh_tokens set revoked_at = now()
          where user_id = $1 and revoked_at is null`,
        [id],
      );
      this.realtime.closeUser(id);
    }

    return {
      id: row.id,
      email: row.email,
      disabled,
      suspendedAt: row.suspended_at,
      reason: reason ?? null,
    };
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

    // Items counted from the same files the size is summed from, rather than
    // read from `albums.item_count`, a counter nothing maintains.
    const rows = await this.db.query(
      `select a.id, a.name, a.status,
              (select count(*) from user_files f where f.album_id = a.id)::int
                as item_count,
              a.retention_days, a.created_at,
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
              a.name as album_name, u.id as owner_id, u.email as owner_email
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

  /**
   * Take a showcase down, or put it back.
   *
   * hidden_at rather than the author's own unpublished_at: a moderation
   * decision the author could reverse is not one.
   */
  async setShowcaseHidden(showcaseId: string, hidden: boolean) {
    const row = await this.db.queryOne<{ id: string; title: string | null }>(
      `update showcases set hidden_at = case when $2 then now() else null end
        where id = $1 returning id, title`,
      [showcaseId, hidden],
    );
    if (!row) throw new NotFoundException('Showcase not found');
    return row;
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
