import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { MailConfig } from '../mail/mail.config';
import { MailService } from '../mail/mail.service';
import { moderationNotice } from '../mail/mail.templates';
import { DISPLAY_URL_TTL_SECONDS } from '../storage/storage.config';
import { StorageService } from '../storage/storage.service';
import { AdminCustomersService } from './admin-customers.service';
import { AdminService } from './admin.service';
import { SupportService } from './support.service';

export const CASE_KINDS = ['user', 'job', 'showcase'] as const;
export type CaseKind = (typeof CASE_KINDS)[number];

export const CASE_ACTIONS = ['dismiss', 'hide', 'warn', 'suspend'] as const;
export type CaseAction = (typeof CASE_ACTIONS)[number];

/** What a decision records on the reports it closes. */
const RESOLUTION: Record<CaseAction, string> = {
  dismiss: 'dismissed',
  hide: 'hidden',
  warn: 'warned',
  suspend: 'suspended',
};

/** Where each kind of report lives, and which column names its target. */
const REPORTS: Record<CaseKind, { table: string; target: string }> = {
  user: { table: 'user_reports', target: 'target_id' },
  job: { table: 'hiring_post_reports', target: 'post_id' },
  showcase: { table: 'showcase_reports', target: 'showcase_id' },
};

/**
 * Every report, of all three kinds, as one shape: what it is about, whose that
 * is (the subject — the person, or the post's author), and where it stands.
 */
const ALL_REPORTS = `
  select 'user'::text as kind, r.id, r.target_id, r.target_id as subject_id,
         r.reporter_id, r.reason, r.note, r.source, r.created_at,
         r.status, r.resolution, r.resolved_at, r.resolved_by, r.resolution_note
    from user_reports r
  union all
  select 'job', r.id, r.post_id, p.user_id,
         r.reporter_user_id, r.reason, r.note, null, r.created_at,
         r.status, r.resolution, r.resolved_at, r.resolved_by, r.resolution_note
    from hiring_post_reports r join hiring_posts p on p.id = r.post_id
  union all
  select 'showcase', r.id, r.showcase_id, s.user_id,
         r.reporter_id, r.reason, r.note, null, r.created_at,
         r.status, r.resolution, r.resolved_at, r.resolved_by, r.resolution_note
    from showcase_reports r join showcases s on s.id = r.showcase_id`;

/** A showcase's first picture or poster frame, for a moderator to look at. */
const SHOWCASE_THUMB = `
  (select coalesce(f.thumb_key, f.poster_key)
     from showcase_items si
     join user_files f on f.key = si.file_key and f.user_id = si.user_id
    where si.showcase_id = s.id and coalesce(f.thumb_key, f.poster_key) is not null
    order by si.position, si.created_at
    limit 1)`;

const NAME = (alias: string) =>
  `coalesce(nullif(btrim(${alias}.display_name), ''), split_part(${alias}.email, '@', 1))`;

interface Staff {
  id: string;
  name: string;
}

/**
 * The moderation queue: reports of people, job posts and showcases, reviewed
 * together.
 *
 * Grouped by what was reported. Five people reporting one account is one
 * case with five reports, and a decision closes all of them — so the person
 * is warned once, not five times, and nobody re-decides something already
 * decided. Each case carries the signals that say how seriously to take it:
 * how many people reported it, how many have blocked its subject, and what
 * has been done about that person before.
 *
 * A warning reaches the person as a message from the safety team in their
 * support inbox, and by email, so they can answer it — the same thread is
 * where an appeal arrives. Every decision is written to moderation_actions
 * against the person it concerned: the repeat-offender count, and the history
 * on their account page.
 */
@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly support: SupportService,
    private readonly admin: AdminService,
    private readonly customers: AdminCustomersService,
    private readonly mail: MailService,
    private readonly mailConfig: MailConfig,
    private readonly storage: StorageService,
  ) {}

  // ------------------------------------------------------------- the queue

  async cases(params: {
    state?: string;
    kind?: string;
    q?: string;
    limit?: number;
    offset?: number;
  }) {
    const state = params.state === 'closed' ? 'closed' : 'open';
    const kind = (CASE_KINDS as readonly string[]).includes(params.kind ?? '') ? params.kind! : null;
    const q = params.q?.trim() ? `%${params.q.trim()}%` : null;
    const limit = Math.min(Math.max(params.limit ?? 25, 1), 100);
    const offset = Math.max(params.offset ?? 0, 0);

    const rows = await this.db.query<Record<string, unknown> & { kind: string; thumb_key: string | null }>(
      `with r as (${ALL_REPORTS}),
       c as (
         select kind, target_id, subject_id,
                count(*) filter (where status = 'open')::int as open,
                count(*)::int as total,
                count(distinct reporter_id)::int as reporters,
                array_agg(distinct reason) filter (where status = 'open') as open_reasons,
                array_agg(distinct reason) as reasons,
                array_agg(distinct source) filter (where source is not null) as sources,
                min(created_at) filter (where status = 'open') as waiting_since,
                max(created_at) as last_reported_at,
                max(resolved_at) as resolved_at,
                (array_agg(resolution order by resolved_at desc nulls last))[1] as last_resolution
           from r
          where ($1::text is null or kind = $1)
          group by kind, target_id, subject_id
         having (count(*) filter (where status = 'open') > 0) = ($2 = 'open')
       )
       select c.*,
              ${NAME('u')} as subject_name, u.email as subject_email, u.handle as subject_handle,
              u.suspended_at as subject_suspended_at,
              case c.kind when 'job' then p.title when 'showcase' then s.title end as title,
              case c.kind when 'job' then p.hidden_at when 'showcase' then s.hidden_at end as hidden_at,
              case when c.kind = 'showcase' then ${SHOWCASE_THUMB} end as thumb_key,
              (select count(*) from user_blocks b where b.blocked_id = c.subject_id)::int as blocked_by,
              (select count(*) from moderation_actions a
                where a.subject_user_id = c.subject_id and a.action <> 'dismiss')::int as strikes,
              (c.kind = 'user' and exists (
                 select 1 from report_evidence e join user_reports ur on ur.id = e.report_id
                  where ur.target_id = c.target_id and ur.status = 'open')) as has_evidence,
              count(*) over ()::int as full_count
         from c
         left join users u on u.id = c.subject_id
         left join hiring_posts p on c.kind = 'job' and p.id = c.target_id
         left join showcases s on c.kind = 'showcase' and s.id = c.target_id
        where ($3::text is null or u.email ilike $3 or u.display_name ilike $3
               or u.handle ilike $3 or p.title ilike $3 or s.title ilike $3)
        order by
          -- Open: the most reported first, then whoever has waited longest.
          -- Closed: the latest decision first.
          case when $2 = 'open' then c.open end desc nulls last,
          case when $2 = 'open' then c.waiting_since end asc nulls last,
          c.resolved_at desc nulls last
        limit $4 offset $5`,
      [kind, state, q, limit, offset],
    );

    const counts = await this.db.query<{ kind: string; open: number }>(
      `with r as (${ALL_REPORTS})
       select kind, count(distinct target_id)::int as open from r where status = 'open' group by kind`,
    );

    const thumbs = await this.storage.mediaUrls(
      rows.map((row) => row.thumb_key),
      DISPLAY_URL_TTL_SECONDS,
    );
    return {
      data: rows.map(({ thumb_key: _key, full_count: _count, ...row }, i) => ({ ...row, thumb_url: thumbs[i] })),
      total: Number(rows[0]?.full_count ?? 0),
      counts: Object.fromEntries(counts.map((c) => [c.kind, c.open])),
    };
  }

  // -------------------------------------------------------------- one case

  async case(kind: CaseKind, targetId: string) {
    const subject = await this.subjectOf(kind, targetId);

    const [target, reports, history, signals] = await Promise.all([
      this.targetOf(kind, targetId),
      this.db.query(
        `with r as (${ALL_REPORTS})
         select r.id, r.reason, r.note, r.source, r.created_at, r.status, r.resolution,
                r.resolved_at, r.resolution_note, r.reporter_id,
                ${NAME('u')} as reporter_name, u.email as reporter_email,
                a.name as resolved_by_name,
                (select count(*) from report_evidence e where e.report_id = r.id)::int as evidence
           from r
           left join users u on u.id = r.reporter_id
           left join admin_users a on a.id = r.resolved_by
          where r.kind = $1 and r.target_id = $2
          order by (r.status = 'open') desc, r.created_at desc`,
        [kind, targetId],
      ),
      subject.id
        ? this.db.query(
            `select id, action, target_type, target_id, target_label, reports, message, note,
                    snapshot, ticket_id, admin_name, created_at
               from moderation_actions where subject_user_id = $1
              order by created_at desc limit 50`,
            [subject.id],
          )
        : Promise.resolve([]),
      subject.id
        ? this.db.queryOne<Record<string, number>>(
            `with r as (${ALL_REPORTS})
             select
               (select count(*) from user_blocks where blocked_id = $1)::int as blocked_by,
               (select count(*) from moderation_actions
                 where subject_user_id = $1 and action <> 'dismiss')::int as strikes,
               (select count(distinct (kind, target_id)) from r
                 where subject_id = $1 and status = 'open'
                   and not (kind = $2 and target_id = $3))::int as other_open_cases,
               (select count(*) from r where subject_id = $1)::int as reports_ever`,
            [subject.id, kind, targetId],
          )
        : Promise.resolve(null),
    ]);

    if (reports.length === 0) throw new NotFoundException('Nothing has been reported there');
    return { kind, targetId, subject, target, reports, history, signals };
  }

  /** The messages a chat report brought with it, as they were when it was filed. */
  async evidence(reportId: string) {
    const report = await this.db.queryOne<{ id: string; target_id: string; reporter_id: string | null }>(
      'select id, target_id, reporter_id from user_reports where id = $1',
      [reportId],
    );
    if (!report) throw new NotFoundException('No such report');
    const messages = await this.db.query(
      `select message_id, sender_role, sender_name, body, kind, sent_at, captured_at
         from report_evidence where report_id = $1 order by sent_at`,
      [reportId],
    );
    return { reportId, targetId: report.target_id, messages };
  }

  // ------------------------------------------------------------ decisions

  /**
   * Decides a case and closes every open report on it.
   *
   * dismiss  nothing was wrong
   * hide     takes the post or job off the app (not for a person)
   * warn     a message from the safety team, in their support inbox and by email
   * suspend  the account, as the account page does
   *
   * A message on hide or suspend warns as well, so "taken down, and here is
   * why" is one decision. Suspending needs users.disable, which the
   * controller checks.
   */
  async resolve(
    kind: CaseKind,
    targetId: string,
    staff: Staff,
    input: { action: CaseAction; message?: string; note?: string; notify?: boolean },
  ) {
    const message = input.message?.trim() || null;
    const note = input.note?.trim() || null;
    if (input.action === 'hide' && kind === 'user') {
      throw new BadRequestException('A person cannot be hidden. Warn or suspend them instead.');
    }
    if (input.action === 'warn' && !message) {
      throw new BadRequestException('Write what to tell them.');
    }
    if (input.action === 'dismiss' && message) {
      throw new BadRequestException('A dismissal tells nobody anything.');
    }

    const subject = await this.subjectOf(kind, targetId);
    const label = kind === 'user' ? subject.name : ((await this.targetOf(kind, targetId)) as { title: string | null }).title;

    if (input.action === 'hide') {
      const table = kind === 'job' ? 'hiring_posts' : 'showcases';
      await this.db.query(`update ${table} set hidden_at = coalesce(hidden_at, now()) where id = $1`, [
        targetId,
      ]);
    }
    let emailed = false;
    if (input.action === 'suspend') {
      if (!subject.id) throw new BadRequestException('That account no longer exists.');
      await this.admin.setUserDisabled(subject.id, true, note ?? undefined);
      if (input.notify !== false) emailed = await this.customers.notifySuspension(subject.id, true);
    }

    const ticketId =
      message && subject.id ? await this.warn(subject.id, kind, label, message, staff) : null;

    const { table, target } = REPORTS[kind];
    const closed = await this.db.query<{ id: string }>(
      `update ${table}
          set status = $2, resolution = $3, resolved_by = $4, resolved_at = now(), resolution_note = $5
        where ${target} = $1 and status = 'open'
        returning id`,
      [
        targetId,
        input.action === 'dismiss' ? 'dismissed' : 'actioned',
        RESOLUTION[input.action],
        staff.id,
        note,
      ],
    );

    await this.db.query(
      `insert into moderation_actions
         (subject_user_id, action, target_type, target_id, target_label, reports, message, note,
          ticket_id, admin_id, admin_name)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        subject.id,
        input.action,
        kind,
        targetId,
        label,
        closed.length,
        message,
        note,
        ticketId,
        staff.id,
        staff.name,
      ],
    );

    return { action: input.action, closed: closed.length, ticketId, emailed, subjectId: subject.id };
  }

  // ------------------------------------------------------------- comments

  /** Comments on showcases, newest first, to find what nobody reported. */
  async comments(params: { q?: string; userId?: string; showcaseId?: string; limit?: number; offset?: number }) {
    const q = params.q?.trim() ? `%${params.q.trim()}%` : null;
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);
    const offset = Math.max(params.offset ?? 0, 0);
    const rows = await this.db.query<Record<string, unknown>>(
      `select c.id, c.body, c.created_at, c.showcase_id, s.title as showcase_title,
              s.hidden_at as showcase_hidden_at,
              c.user_id as author_id, ${NAME('u')} as author_name, u.email as author_email,
              u.suspended_at as author_suspended_at,
              (select count(*) from moderation_actions a
                where a.subject_user_id = c.user_id and a.action <> 'dismiss')::int as author_strikes,
              count(*) over ()::int as full_count
         from showcase_comments c
         join showcases s on s.id = c.showcase_id
         join users u on u.id = c.user_id
        where ($1::text is null or c.body ilike $1 or u.email ilike $1 or u.display_name ilike $1
               or s.title ilike $1)
          and ($2::uuid is null or c.user_id = $2)
          and ($3::uuid is null or c.showcase_id = $3)
        order by c.created_at desc
        limit $4 offset $5`,
      [q, params.userId ?? null, params.showcaseId ?? null, limit, offset],
    );
    return {
      data: rows.map(({ full_count: _count, ...row }) => row),
      total: Number(rows[0]?.full_count ?? 0),
    };
  }

  /**
   * Removes a comment, keeping what it said in moderation_actions — the
   * comment itself is gone from the app, and the record is the only place
   * its words survive. A message warns its author as well.
   */
  async removeComment(commentId: string, staff: Staff, input: { message?: string; note?: string }) {
    const comment = await this.db.queryOne<{
      id: string;
      body: string;
      created_at: Date;
      user_id: string;
      showcase_id: string;
      showcase_title: string | null;
    }>(
      `select c.id, c.body, c.created_at, c.user_id, c.showcase_id, s.title as showcase_title
         from showcase_comments c join showcases s on s.id = c.showcase_id
        where c.id = $1`,
      [commentId],
    );
    if (!comment) throw new NotFoundException('That comment is gone already');

    await this.db.query('delete from showcase_comments where id = $1', [commentId]);
    const message = input.message?.trim() || null;
    const ticketId = message
      ? await this.warn(comment.user_id, 'comment', comment.showcase_title, message, staff)
      : null;

    await this.db.query(
      `insert into moderation_actions
         (subject_user_id, action, target_type, target_id, target_label, message, note, snapshot,
          ticket_id, admin_id, admin_name)
       values ($1, 'remove_comment', 'comment', $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        comment.user_id,
        commentId,
        comment.showcase_title,
        message,
        input.note?.trim() || null,
        JSON.stringify({
          body: comment.body,
          showcaseId: comment.showcase_id,
          writtenAt: comment.created_at,
        }),
        ticketId,
        staff.id,
        staff.name,
      ],
    );
    return { removed: true, ticketId, subjectId: comment.user_id };
  }

  // -------------------------------------------------------------- helpers

  /**
   * Tells someone what was decided about them: a message from the safety
   * team in their support inbox, which they can answer, and an email that
   * says the same and links to it.
   *
   * The email goes straight out rather than through their notification
   * settings: it is about their account, like the suspension notice.
   */
  private async warn(
    userId: string,
    kind: CaseKind | 'comment',
    label: string | null,
    message: string,
    staff: Staff,
  ): Promise<string | null> {
    const about =
      kind === 'job'
        ? `your job post “${label ?? 'Untitled'}”`
        : kind === 'showcase'
          ? `your post “${label ?? 'Untitled'}”`
          : kind === 'comment'
            ? `your comment on “${label ?? 'a post'}”`
            : 'your account';
    const subject = `About ${about}`;
    const ticketId = await this.support.openFromStaff(userId, subject, message, staff, 'safety');
    const user = await this.db.queryOne<{ email: string; display_name: string | null }>(
      'select email, display_name from users where id = $1',
      [userId],
    );
    if (user) {
      await this.mail
        .send(
          user.email,
          moderationNotice({
            name: user.display_name?.trim() || user.email.split('@')[0],
            about,
            message,
            url: `${this.mailConfig.appUrl}/support?ticket=${encodeURIComponent(ticketId)}`,
          }),
        )
        .catch((error: Error) => this.logger.error(`could not email a warning: ${error.message}`));
    }
    return ticketId;
  }

  /** Whose case this is: the person, or whoever posted the job or showcase. */
  private async subjectOf(kind: CaseKind, targetId: string) {
    const sql = {
      user: 'select u.id from users u where u.id = $1',
      job: 'select p.user_id as id from hiring_posts p where p.id = $1',
      showcase: 'select s.user_id as id from showcases s where s.id = $1',
    }[kind];
    const owner = await this.db.queryOne<{ id: string | null }>(sql, [targetId]);
    if (!owner) throw new NotFoundException('That is gone');
    if (!owner.id) return { id: null, name: 'A deleted account', email: null };
    const row = await this.db.queryOne<Record<string, unknown> & { id: string; name: string; email: string }>(
      `select u.id, ${NAME('u')} as name, u.email, u.handle, u.plan, u.created_at, u.last_seen_at,
              u.suspended_at, u.avatar_url, u.email_verified_at
         from users u where u.id = $1`,
      [owner.id],
    );
    return row ?? { id: null, name: 'A deleted account', email: null };
  }

  /** What was reported, as a moderator needs to see it. */
  private async targetOf(kind: CaseKind, targetId: string): Promise<Record<string, unknown> | null> {
    if (kind === 'user') return null;
    if (kind === 'job') {
      return this.db.queryOne(
        `select p.id, p.title, p.slug, p.description, p.status, p.hidden_at, p.created_at
           from hiring_posts p where p.id = $1`,
        [targetId],
      );
    }
    const showcase = await this.db.queryOne<Record<string, unknown> & { id: string }>(
      `select s.id, s.title, s.caption, s.hidden_at, s.published_at, s.created_at, s.comment_count
         from showcases s where s.id = $1`,
      [targetId],
    );
    if (!showcase) return null;
    const [pieces, comments] = await Promise.all([
      this.db.query<{ key: string | null }>(
        `select coalesce(f.thumb_key, f.poster_key) as key
           from showcase_items si
           join user_files f on f.key = si.file_key and f.user_id = si.user_id
          where si.showcase_id = $1
          order by si.position, si.created_at
          limit 8`,
        [targetId],
      ),
      this.db.query(
        `select c.id, c.body, c.created_at, c.user_id as author_id, ${NAME('u')} as author_name
           from showcase_comments c join users u on u.id = c.user_id
          where c.showcase_id = $1
          order by c.created_at desc limit 20`,
        [targetId],
      ),
    ]);
    const urls = await this.storage.mediaUrls(
      pieces.map((p) => p.key),
      DISPLAY_URL_TTL_SECONDS,
    );
    return { ...showcase, pieces: urls.filter(Boolean), comments };
  }
}
