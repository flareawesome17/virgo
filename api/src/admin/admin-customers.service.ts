import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { MailConfig } from '../mail/mail.config';
import { MailService } from '../mail/mail.service';
import { accountRestored, accountSuspended } from '../mail/mail.templates';
import type { AdminIdentity } from './admin-auth.service';

/** How the console names what staff did, in a customer's timeline. */
const CONSOLE_ACTION: Record<string, string> = {
  'user.setPlan': 'Plan changed by staff',
  'user.disable': 'Suspended',
  'user.enable': 'Suspension lifted',
  'user.passwordResetEmail': 'Sent a password reset email',
  'user.verificationEmail': 'Sent a verification email',
  'user.markVerified': 'Email marked confirmed by staff',
  'user.twoFactorReset': 'Two-factor removed by staff',
  'user.signOut': 'Signed out everywhere by staff',
  'user.signOutDevice': 'A device signed out by staff',
  'user.tags': 'Tags changed',
  'promo.grant': 'Offered a promo',
};

export const TAG_COLORS = ['neutral', 'terracotta', 'green', 'amber', 'red', 'blue', 'violet'] as const;

/**
 * One customer, all the way round: what they did and when, what they paid,
 * what they hired and were hired for, what was reported, where they are
 * signed in, and what staff wrote about them.
 *
 * Each tab reads its own slice, so opening an account costs one query and
 * the rest are paid only when somebody looks.
 */
@Injectable()
export class AdminCustomersService {
  constructor(
    private readonly db: DatabaseService,
    private readonly mail: MailService,
    private readonly mailConfig: MailConfig,
  ) {}

  /**
   * Tells the customer their account was suspended or restored. Opt-in from
   * the console, and never with the reason staff recorded — that is an
   * internal note, and explaining a decision is a reply, not a template.
   */
  async notifySuspension(userId: string, suspended: boolean): Promise<boolean> {
    const user = await this.db.queryOne<{ email: string; display_name: string | null }>(
      'select email, display_name from users where id = $1',
      [userId],
    );
    if (!user) return false;
    const name = user.display_name?.trim() || user.email.split('@')[0];
    return this.mail.send(
      user.email,
      suspended
        ? accountSuspended({ name })
        : accountRestored({ name, url: `${this.mailConfig.appUrl}/sign-in` }),
    );
  }

  private async assertUser(id: string): Promise<{ id: string; email: string }> {
    const row = await this.db.queryOne<{ id: string; email: string }>(
      'select id, email from users where id = $1',
      [id],
    );
    if (!row) throw new NotFoundException('No such account');
    return row;
  }

  // ------------------------------------------------------------- timeline

  /**
   * Everything that happened to and by this account, newest first.
   *
   * One union across the tables that hold a moment in someone's history. Paged
   * by time (`before`), not offset, so a page does not shift when something
   * new happens while it is being read.
   */
  async timeline(userId: string, params: { before?: string; limit?: number }) {
    await this.assertUser(userId);
    const limit = Math.min(Math.max(params.limit ?? 40, 1), 100);
    const peso = (col: string) => `'₱' || to_char(${col} / 100.0, 'FM999,999,990')`;

    const rows = await this.db.query<{
      at: Date;
      kind: string;
      title: string;
      detail: string | null;
      actor: string | null;
      link: string | null;
    }>(
      `select * from (
         select u.created_at as at, 'signup'::text as kind, 'Signed up'::text as title,
                null::text as detail, null::text as actor, null::text as link
           from users u where u.id = $1
         union all
         select u.email_verified_at, 'verified', 'Confirmed their email', null, null, null
           from users u where u.id = $1
         union all
         select l.created_at, 'console', l.action, l.detail::text, coalesce(a.name, l.admin_email), null
           from admin_audit_log l left join admin_users a on a.id = l.admin_id
          where l.target_type = 'user' and l.target_id = $1::text and l.action not like '%.view'
         union all
         select n.created_at, 'note', 'Staff note', left(n.body, 280), n.admin_name, null
           from customer_notes n where n.user_id = $1
         union all
         select a.created_at, 'album', 'Created an album', a.name, null, null
           from albums a where a.user_id = $1
         union all
         select l.created_at, 'link', 'Shared a client link', al.name || ' · ' || coalesce(l.purpose, 'link'), null, null
           from album_share_links l join albums al on al.id = l.album_id where l.user_id = $1
         union all
         select t.created_at, 'ticket', 'Opened a ticket', t.subject, null, '/support/' || t.id
           from support_tickets t where t.user_id = $1
         union all
         select r.created_at, 'reported', 'Was reported', r.reason || coalesce(' · from ' || r.source, ''), null, null
           from user_reports r where r.target_id = $1
         union all
         select r.created_at, 'report', 'Reported someone', r.reason, null, '/virgo-users/' || r.target_id
           from user_reports r where r.reporter_id = $1
         union all
         select g.claimed_at, 'promo', 'Claimed a promo', p.name, null, null
           from promo_grants g join promos p on p.id = g.promo_id where g.user_id = $1
         union all
         select s.published_at, 'showcase', 'Published a post', coalesce(nullif(s.title, ''), 'Untitled post'), null, null
           from showcases s where s.user_id = $1
         union all
         select h.created_at, 'job', 'Posted a job', h.title, null, null
           from hiring_posts h where h.user_id = $1
         union all
         select ap.created_at, 'application', 'Applied to a job', p.title, null, null
           from hiring_applications ap join hiring_posts p on p.id = ap.post_id where ap.user_id = $1
         union all
         select e.created_at, 'enquiry',
                case when e.from_user_id = $1 then 'Sent a hire enquiry' else 'Received a hire enquiry' end,
                e.role_wanted, null,
                '/virgo-users/' || case when e.from_user_id = $1 then e.to_user_id else e.from_user_id end
           from hire_enquiries e where $1 in (e.from_user_id, e.to_user_id)
         union all
         select b.created_at, 'booking',
                case when b.poster_id = $1 then 'Booked someone' else 'Was booked' end,
                b.role || ' · ' || ${peso('b.rate_minor')}
                  || case when b.cancelled_at is not null then ' · cancelled' else '' end,
                null,
                '/virgo-users/' || case when b.poster_id = $1 then b.creative_id else b.poster_id end
           from job_bookings b where $1 in (b.poster_id, b.creative_id)
         union all
         select s.created_at, 'subscription', 'Subscribed', s.plan_name || ' · ' || ${peso('s.amount_minor')}, null, null
           from subscriptions s where s.user_id = $1
         union all
         select s.cancelled_at, 'subscription', 'Cancelled a subscription', s.plan_name, null, null
           from subscriptions s where s.user_id = $1
       ) t
       where at is not null and ($2::timestamptz is null or at < $2::timestamptz)
       order by at desc
       limit $3`,
      [userId, params.before ?? null, limit],
    );

    return {
      data: rows.map((r) =>
        r.kind === 'console'
          ? { ...r, title: CONSOLE_ACTION[r.title] ?? r.title, detail: summarize(r.detail) }
          : r,
      ),
      // The next page starts before the oldest row here; none when this one
      // was not full.
      nextBefore: rows.length === limit ? rows[rows.length - 1].at : null,
    };
  }

  // --------------------------------------------------------------- billing

  async billing(userId: string) {
    await this.assertUser(userId);
    const [subscriptions, promos] = await Promise.all([
      this.db.query(
        `select id, plan_name, status, amount_minor, currency, kind,
                current_period_end, cancelled_at, created_at
           from subscriptions where user_id = $1 order by created_at desc`,
        [userId],
      ),
      this.db.query(
        `select g.id, p.name, p.kind, p.storage_bytes::text as storage_bytes,
                p.extra_workspaces, p.extra_albums_per_workspace,
                g.claimed_at, g.expires_at, g.created_at,
                r.display_name as referred_name
           from promo_grants g
           join promos p on p.id = g.promo_id
           left join users r on r.id = g.referred_user_id
          where g.user_id = $1
          order by g.created_at desc`,
        [userId],
      ),
    ]);
    return { subscriptions, promos };
  }

  // ----------------------------------------------------------- marketplace

  /**
   * The jobs side: posts and applications, enquiries both ways, and bookings
   * with what they were worth. A cancelled booking is listed but not counted.
   */
  async marketplace(userId: string) {
    await this.assertUser(userId);
    const [posts, applications, enquiries, bookings] = await Promise.all([
      this.db.query(
        `select p.id, p.slug, p.title, p.status, p.hidden_at, p.event_date, p.created_at,
                (select count(*) from hiring_applications a where a.post_id = p.id)::int as applications
           from hiring_posts p where p.user_id = $1
          order by p.created_at desc limit 50`,
        [userId],
      ),
      this.db.query(
        `select a.id, a.status, a.role, a.created_at, p.title, p.user_id as poster_id,
                coalesce(nullif(trim(u.display_name), ''), u.email) as poster_name
           from hiring_applications a
           join hiring_posts p on p.id = a.post_id
           join users u on u.id = p.user_id
          where a.user_id = $1
          order by a.created_at desc limit 50`,
        [userId],
      ),
      this.db.query(
        `select e.id, e.role_wanted, e.event_date, e.budget, e.status, e.created_at,
                case when e.from_user_id = $1 then 'sent' else 'received' end as direction,
                o.id as other_id,
                coalesce(nullif(trim(o.display_name), ''), o.email) as other_name
           from hire_enquiries e
           join users o on o.id = case when e.from_user_id = $1 then e.to_user_id else e.from_user_id end
          where $1 in (e.from_user_id, e.to_user_id)
          order by e.created_at desc limit 50`,
        [userId],
      ),
      this.db.query<{ side: string; rate_minor: number; cancelled_at: Date | null }>(
        `select b.id, b.role, b.event_date, b.rate_minor, b.currency, b.created_at,
                b.cancelled_at, b.cancel_reason, b.locked_at,
                b.poster_confirmed_at, b.creative_confirmed_at,
                case when b.poster_id = $1 then 'hired' else 'booked' end as side,
                o.id as other_id,
                coalesce(nullif(trim(o.display_name), ''), o.email) as other_name
           from job_bookings b
           join users o on o.id = case when b.poster_id = $1 then b.creative_id else b.poster_id end
          where $1 in (b.poster_id, b.creative_id)
          order by b.created_at desc limit 100`,
        [userId],
      ),
    ]);

    const sum = (side: string) =>
      bookings
        .filter((b) => b.side === side && !b.cancelled_at)
        .reduce((total, b) => total + Number(b.rate_minor ?? 0), 0);

    return {
      posts,
      applications,
      enquiries,
      bookings,
      totals: { earnedMinor: sum('booked'), spentMinor: sum('hired') },
    };
  }

  // ----------------------------------------------------------------- safety

  async safety(userId: string) {
    await this.assertUser(userId);
    const [against, made, counts, actions] = await Promise.all([
      this.db.query(
        `select r.id, r.reason, r.note, r.source, r.created_at, r.reporter_id, r.status, r.resolution,
                coalesce(nullif(trim(u.display_name), ''), u.email) as reporter_name
           from user_reports r left join users u on u.id = r.reporter_id
          where r.target_id = $1 order by r.created_at desc limit 100`,
        [userId],
      ),
      this.db.query(
        `select r.id, r.reason, r.note, r.source, r.created_at, r.target_id,
                coalesce(nullif(trim(u.display_name), ''), u.email) as target_name
           from user_reports r join users u on u.id = r.target_id
          where r.reporter_id = $1 order by r.created_at desc limit 100`,
        [userId],
      ),
      this.db.queryOne<Record<string, number>>(
        `select
           (select count(*) from user_blocks where blocked_id = $1)::int as blocked_by,
           (select count(*) from user_blocks where blocker_id = $1)::int as blocking,
           (select count(*) from showcase_reports sr join showcases s on s.id = sr.showcase_id
             where s.user_id = $1)::int as post_reports,
           (select count(*) from hiring_post_reports hr join hiring_posts p on p.id = hr.post_id
             where p.user_id = $1)::int as job_reports,
           (select count(*) from showcases where user_id = $1 and hidden_at is not null)::int as hidden_posts,
           (select count(*) from hiring_posts where user_id = $1 and hidden_at is not null)::int as hidden_jobs,
           (select count(*) from moderation_actions
             where subject_user_id = $1 and action <> 'dismiss')::int as strikes`,
        [userId],
      ),
      // What moderation decided about them, newest first: the record a
      // repeat offender has, and what they were told.
      this.db.query(
        `select id, action, target_type, target_id, target_label, reports, message, note,
                ticket_id, admin_name, created_at
           from moderation_actions where subject_user_id = $1
          order by created_at desc limit 50`,
        [userId],
      ),
    ]);
    return { against, made, counts, actions };
  }

  // ---------------------------------------------------------------- devices

  /**
   * Where the account is signed in, and which phones get its notifications.
   *
   * A session is a family of rotated refresh tokens with at least one still
   * usable; a token from before families existed counts as its own.
   */
  async devices(userId: string) {
    await this.assertUser(userId);
    const [sessions, push] = await Promise.all([
      this.db.query(
        `select coalesce(t.family_id, t.id) as family_id,
                min(t.created_at) as signed_in_at,
                max(t.created_at) as last_active_at,
                (array_agg(t.user_agent order by t.created_at desc)
                   filter (where t.user_agent is not null))[1] as user_agent
           from refresh_tokens t
          where t.user_id = $1
          group by coalesce(t.family_id, t.id)
         having bool_or(t.revoked_at is null and t.expires_at > now())
          order by max(t.created_at) desc
          limit 50`,
        [userId],
      ),
      this.db.query(
        `select id, platform, app_version, created_at, updated_at, disabled_at
           from push_tokens where user_id = $1 order by updated_at desc`,
        [userId],
      ),
    ]);
    return { sessions, push };
  }

  /** Ends one device's session. Its access token runs out within 15 minutes. */
  async signOutDevice(userId: string, familyId: string) {
    const rows = await this.db.query(
      `update refresh_tokens set revoked_at = now()
        where user_id = $1 and coalesce(family_id, id) = $2::uuid and revoked_at is null
        returning id`,
      [userId, familyId],
    );
    if (rows.length === 0) throw new NotFoundException('That device is already signed out');
    return { revoked: rows.length };
  }

  // ------------------------------------------------------------------ notes

  async notes(userId: string) {
    return this.db.query(
      `select id, admin_id, admin_name, body, pinned, created_at, updated_at
         from customer_notes where user_id = $1
        order by pinned desc, created_at desc`,
      [userId],
    );
  }

  async addNote(userId: string, admin: AdminIdentity, body: string, pinned = false) {
    await this.assertUser(userId);
    const text = body.trim();
    if (!text) throw new BadRequestException('Write something first');
    return this.db.queryOne(
      `insert into customer_notes (user_id, admin_id, admin_name, body, pinned)
       values ($1, $2, $3, $4, $5)
       returning id, admin_id, admin_name, body, pinned, created_at, updated_at`,
      [userId, admin.id, admin.name, text, pinned],
    );
  }

  /**
   * Edits or pins a note. Anyone who may write notes can pin one; only its
   * author — or someone who may change account security — can change or
   * delete its words, so a note cannot be rewritten under its author's name.
   */
  async updateNote(
    userId: string,
    noteId: string,
    admin: AdminIdentity,
    patch: { body?: string; pinned?: boolean },
  ) {
    const note = await this.ownedNote(userId, noteId, admin, patch.body !== undefined);
    const body = patch.body?.trim();
    if (patch.body !== undefined && !body) throw new BadRequestException('A note cannot be empty');
    return this.db.queryOne(
      `update customer_notes
          set body = coalesce($3, body), pinned = coalesce($4, pinned), updated_at = now()
        where id = $1 and user_id = $2
        returning id, admin_id, admin_name, body, pinned, created_at, updated_at`,
      [note.id, userId, body ?? null, patch.pinned ?? null],
    );
  }

  async removeNote(userId: string, noteId: string, admin: AdminIdentity) {
    const note = await this.ownedNote(userId, noteId, admin, true);
    await this.db.query('delete from customer_notes where id = $1', [note.id]);
    return { id: note.id };
  }

  private async ownedNote(userId: string, noteId: string, admin: AdminIdentity, needsAuthor: boolean) {
    const note = await this.db.queryOne<{ id: string; admin_id: string | null }>(
      'select id, admin_id from customer_notes where id = $1 and user_id = $2',
      [noteId, userId],
    );
    if (!note) throw new NotFoundException('No such note');
    if (needsAuthor && note.admin_id !== admin.id && !admin.permissions.includes('users.security')) {
      throw new ForbiddenException('Only its author can change what a note says');
    }
    return note;
  }

  // ------------------------------------------------------------------- tags

  async tags() {
    return this.db.query(
      `select t.id, t.label, t.color, t.created_at,
              (select count(*) from customer_tag_links l where l.tag_id = t.id)::int as customers
         from customer_tags t order by lower(t.label)`,
    );
  }

  async createTag(admin: AdminIdentity, label: string, color = 'neutral') {
    const text = label.trim();
    if (!text) throw new BadRequestException('Give the tag a name');
    try {
      return await this.db.queryOne(
        `insert into customer_tags (label, color, created_by) values ($1, $2, $3)
         returning id, label, color`,
        [text, color, admin.id],
      );
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new ConflictException('There is already a tag with that name');
      }
      throw err;
    }
  }

  async updateTag(id: string, patch: { label?: string; color?: string }) {
    const row = await this.db.queryOne(
      `update customer_tags set label = coalesce($2, label), color = coalesce($3, color)
        where id = $1 returning id, label, color`,
      [id, patch.label?.trim() || null, patch.color ?? null],
    );
    if (!row) throw new NotFoundException('No such tag');
    return row;
  }

  async removeTag(id: string) {
    const row = await this.db.queryOne<{ label: string }>(
      'delete from customer_tags where id = $1 returning label',
      [id],
    );
    if (!row) throw new NotFoundException('No such tag');
    return row;
  }

  /** Replaces one customer's tags with exactly these. */
  async setTags(userId: string, tagIds: string[], admin: AdminIdentity) {
    await this.assertUser(userId);
    await this.db.transaction(async (client) => {
      await client.query(
        'delete from customer_tag_links where user_id = $1 and not (tag_id = any($2::uuid[]))',
        [userId, tagIds],
      );
      await client.query(
        `insert into customer_tag_links (user_id, tag_id, added_by)
         select $1, t, $3 from unnest($2::uuid[]) t
         on conflict do nothing`,
        [userId, tagIds, admin.id],
      );
    });
    return this.tagsOf(userId);
  }

  async tagsOf(userId: string) {
    return this.db.query(
      `select t.id, t.label, t.color from customer_tag_links l
         join customer_tags t on t.id = l.tag_id
        where l.user_id = $1 order by lower(t.label)`,
      [userId],
    );
  }

  /** Adds and removes tags across many customers at once. */
  async bulkTags(userIds: string[], add: string[], remove: string[], admin: AdminIdentity) {
    if (userIds.length === 0) return { changed: 0 };
    let changed = 0;
    await this.db.transaction(async (client) => {
      if (add.length) {
        const res = await client.query(
          `insert into customer_tag_links (user_id, tag_id, added_by)
           select u, t, $3 from unnest($1::uuid[]) u cross join unnest($2::uuid[]) t
            where exists (select 1 from users where id = u)
           on conflict do nothing`,
          [userIds, add, admin.id],
        );
        changed += res.rowCount ?? 0;
      }
      if (remove.length) {
        const res = await client.query(
          'delete from customer_tag_links where user_id = any($1::uuid[]) and tag_id = any($2::uuid[])',
          [userIds, remove],
        );
        changed += res.rowCount ?? 0;
      }
    });
    return { changed };
  }

  // ------------------------------------------------------------ saved views

  async views(admin: AdminIdentity, scope: string) {
    return this.db.query(
      `select v.id, v.name, v.query, v.shared, v.admin_id, a.name as owner_name,
              v.admin_id = $1 as mine
         from admin_saved_views v join admin_users a on a.id = v.admin_id
        where v.scope = $2 and (v.admin_id = $1 or v.shared)
        order by (v.admin_id = $1) desc, lower(v.name)`,
      [admin.id, scope],
    );
  }

  async saveView(
    admin: AdminIdentity,
    input: { scope: string; name: string; query: Record<string, unknown>; shared?: boolean },
  ) {
    const name = input.name.trim();
    if (!name) throw new BadRequestException('Name the view');
    return this.db.queryOne(
      `insert into admin_saved_views (admin_id, scope, name, query, shared)
       values ($1, $2, $3, $4, $5)
       returning id, name, query, shared`,
      [admin.id, input.scope, name, JSON.stringify(input.query ?? {}), input.shared ?? false],
    );
  }

  /** Only the person who saved a view can remove it, or someone managing staff. */
  async removeView(admin: AdminIdentity, id: string) {
    const row = await this.db.queryOne(
      `delete from admin_saved_views
        where id = $1 and (admin_id = $2 or $3)
        returning id`,
      [id, admin.id, admin.permissions.includes('admins.manage')],
    );
    if (!row) throw new NotFoundException('No such view, or it is not yours to remove');
    return row;
  }
}

/** The audit detail as a short line, for the timeline. */
function summarize(detail: string | null): string | null {
  if (!detail) return null;
  try {
    const parsed = JSON.parse(detail) as Record<string, unknown>;
    const parts = Object.entries(parsed)
      .filter(([key, v]) => v !== null && v !== '' && key !== 'email')
      .map(([key, v]) => `${key}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
    return parts.length ? parts.join(' · ') : null;
  } catch {
    return null;
  }
}
