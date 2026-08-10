import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { FriendsService } from '../friends/friends.service';
import { MailConfig } from '../mail/mail.config';
import { MailService } from '../mail/mail.service';
import { jobApplication, jobPostReported } from '../mail/mail.templates';
import { MessagesService } from '../messages/messages.service';
import { NotifyService } from '../notifications/notify.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { normalizeRoles } from '../auth/roles';
import { slugify } from './slug';
import { canonicalLocation, locationKey } from './locations';

/** How far ahead a post stays live without being touched. */
const DEFAULT_LIFETIME_DAYS = 30;

/** What a stranger sees on the board. Deliberately not a `users` row. */
/**
 * What the Jobs badge is made of.
 *
 * Two numbers rather than one, because they mean different things and clear
 * differently: `count` is other people's new postings and is wiped by opening
 * the board, while `applications` is people waiting on an answer from you and
 * only falls when you actually answer one. Summing them for the badge is the
 * client's business; conflating them here would make "mark seen" silently
 * discard somebody's application.
 */
export interface UnseenJobs {
  /** Open postings by other people, newer than this account's `jobs_seen_at`. */
  count: number;
  /** Applications still at `new` across every post this account owns. */
  applications: number;
}

export interface PublicJobPost {
  id: string;
  slug: string;
  title: string;
  description: string;
  rolesWanted: string[];
  /** `YYYY-MM-DD`, the day of the job. */
  eventDate: string | null;
  location: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  status: 'open' | 'filled' | 'closed' | 'expired';
  createdAt: string;
  expiresAt: string;
  /** The poster, as much of them as is public. */
  postedBy: {
    displayName: string;
    avatarUrl: string | null;
    /** Only when they have published a profile, so the link cannot 404. */
    handle: string | null;
  };
  /**
   * The reader's own application on this post, if they have one.
   *
   * Null means "you have not applied", which is the only state in which an
   * Apply control should be offered. Every other value is a state the clients
   * render instead of the button.
   */
  myApplication: {
    id: string;
    status: JobApplication['status'];
    createdAt: string;
  } | null;
  applicantCount: number;
  /**
   * Of those, how many are still sitting at `new`.
   *
   * The total alone cannot answer "is there anything for me to do here" —
   * a post with nine applicants you have already replied to needs nothing.
   */
  newApplicantCount: number;
  /**
   * Whether the reader posted this.
   *
   * The API has always refused a self-application, but the clients had no way
   * to know, so they offered Apply on your own post and only failed once you
   * had written the whole thing. Reads are authenticated now, so the server
   * always knows who is asking and can just say.
   */
  isMine: boolean;
}

/** The owner's view, and an applicant's view of their own application. */
export interface JobApplication {
  id: string;
  postId: string;
  postTitle: string;
  postSlug: string;
  personName: string;
  personAvatarUrl: string | null;
  personHandle: string | null;
  personRoles: string[];
  message: string;
  status: 'new' | 'shortlisted' | 'accepted' | 'declined';
  /**
   * What happened to the post itself.
   *
   * An applicant could not previously tell that the job they were waiting on
   * had been filled or closed — their application just sat at "Waiting"
   * forever with nothing to explain it.
   */
  postStatus: PublicJobPost['status'];
  createdAt: string;
  respondedAt: string | null;
  conversationId: string | null;
}

interface PostRow {
  id: string;
  user_id: string;
  slug: string;
  title: string;
  description: string;
  roles_wanted: string[] | null;
  event_date: string | null;
  location: string | null;
  budget_min: number | null;
  budget_max: number | null;
  status: PublicJobPost['status'];
  created_at: Date;
  expires_at: Date;
  poster_name: string | null;
  poster_email: string;
  poster_avatar_url: string | null;
  poster_handle: string | null;
  applicant_count: string;
  new_applicant_count: string;
  my_application_id: string | null;
  my_application_status: JobApplication['status'] | null;
  my_application_at: Date | null;
}

interface ApplicationRow {
  id: string;
  post_id: string;
  user_id: string;
  message: string;
  status: JobApplication['status'];
  created_at: Date;
  responded_at: Date | null;
  post_title: string;
  post_slug: string;
  post_owner_id: string;
  person_name: string | null;
  person_email: string;
  person_avatar_url: string | null;
  person_handle: string | null;
  post_status: PublicJobPost['status'];
  conversation_id: string | null;
  person_roles: string[] | null;
}

export interface ListJobsParams {
  roles?: string[];
  location?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class HiringService {
  private readonly logger = new Logger(HiringService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly friends: FriendsService,
    private readonly messages: MessagesService,
    private readonly notifier: NotifyService,
    private readonly mail: MailService,
    private readonly mailConfig: MailConfig,
    private readonly realtime: RealtimeGateway,
  ) {}

  /**
   * Columns every public read selects.
   *
   * One constant rather than four copies, because the failure mode of drift
   * here is silent and public: a query that forgets `hidden_at is null` serves
   * a post somebody already reported.
   */
  private postSelect(viewer: string): string {
    return `
    p.id, p.user_id, p.slug, p.title, p.description, p.roles_wanted,
    p.event_date, p.location, p.budget_min, p.budget_max, p.status,
    p.created_at, p.expires_at,
    u.display_name as poster_name,
    u.email        as poster_email,
    u.avatar_url   as poster_avatar_url,
    case when u.public_profile then u.handle end as poster_handle,
    (select count(*)::text from hiring_applications a where a.post_id = p.id)
      as applicant_count,
    (select count(*)::text from hiring_applications a
      where a.post_id = p.id and a.status = 'new')
      as new_applicant_count,
    /*
     * The viewer's own application, if they have one.
     *
     * Without this a client cannot tell an unapplied job from one it already
     * applied to, which is why both of them offered a live Apply button on a
     * post the API would answer with 409 — after the person had written the
     * whole message. The board needs the answer as much as the detail page
     * does, so it lives in the shared select rather than in one query.
     *
     * \${viewer} is a placeholder position this class controls, never caller
     * input.
     */
    (select a.id from hiring_applications a
      where a.post_id = p.id and a.user_id = ${viewer}) as my_application_id,
    (select a.status from hiring_applications a
      where a.post_id = p.id and a.user_id = ${viewer}) as my_application_status,
    (select a.created_at from hiring_applications a
      where a.post_id = p.id and a.user_id = ${viewer}) as my_application_at`;
  }

  /** The board. Open, visible, unexpired — nothing else. */
  async list(
    viewerId: string,
    params: ListJobsParams = {},
  ): Promise<{ data: PublicJobPost[]; total: number }> {
    const roles = normalizeRoles(params.roles ?? []);
    const limit = Math.min(Math.max(params.limit ?? 30, 1), 60);
    const offset = Math.max(params.offset ?? 0, 0);
    // Folded, so the search is accent- and punctuation-blind: "Ozamis",
    // "ozamiz city" and "Ozamiz City" all become the same key. Canonicalised
    // first so an alias like "CDO" searches for Cagayan de Oro.
    const typed = params.location?.trim() || '';
    const locationKeyQuery = typed ? locationKey(canonicalLocation(typed)) : null;

    const where = `
        where p.status = 'open'
          and p.hidden_at is null
          and p.expires_at > now()
          -- A post whose date has passed is not a job any more, whatever the
          -- sweep has got round to marking.
          and (p.event_date is null or p.event_date >= current_date)
          and ($1::text[] = '{}' or p.roles_wanted && $1::text[])
          -- Prefix, not '%…%': "cebu" still finds "Cebu City", and a prefix
          -- is the only shape the text_pattern_ops index can serve. The
          -- fallback covers rows written before location_key existed.
          and (
            $2::text is null
            or p.location_key like $2 || '%'
            or (p.location_key is null and p.location ilike '%' || $2 || '%')
          )`;

    const rows = await this.db.query<PostRow>(
      `select ${this.postSelect('$5')}
         from hiring_posts p
         join users u on u.id = p.user_id
        ${where}
        order by p.created_at desc
        limit $3 offset $4`,
      [roles, locationKeyQuery, limit, offset, viewerId],
    );

    const totalRow = await this.db.queryOne<{ total: string }>(
      `select count(*)::text as total
         from hiring_posts p
         join users u on u.id = p.user_id
        ${where}`,
      [roles, locationKeyQuery],
    );

    return {
      data: rows.map((row) => this.present(row, viewerId)),
      total: Number(totalRow?.total ?? 0),
    };
  }

  /**
   * One post by slug.
   *
   * A closed or filled post still resolves — a link shared last week should
   * explain that the job is taken rather than 404, and the page can say so.
   * Hidden and expired do not: those are the two states where showing it is
   * the problem.
   */
  async bySlug(viewerId: string, slug: string): Promise<PublicJobPost> {
    const row = await this.db.queryOne<PostRow>(
      `select ${this.postSelect('$2')}
         from hiring_posts p
         join users u on u.id = p.user_id
        where p.slug = $1
          and p.hidden_at is null
          and p.expires_at > now()`,
      [slug, viewerId],
    );
    if (!row) throw new NotFoundException('That job post is no longer available');
    return this.present(row, viewerId);
  }

  /**
   * How many open posts have appeared since the caller last looked.
   *
   * Excludes their own — a badge for something you just wrote is noise — and
   * counts everything when `jobs_seen_at` is null, which is the honest answer
   * for an account that has never opened the board: none of it has been seen.
   */
  async unseenCount(userId: string): Promise<UnseenJobs> {
    const row = await this.db.queryOne<{ count: string; applications: string }>(
      `select
         (select count(*)
            from hiring_posts p
           where p.status = 'open'
             and p.hidden_at is null
             and p.expires_at > now()
             and (p.event_date is null or p.event_date >= current_date)
             and p.user_id <> $1
             and p.created_at > coalesce(
                   (select jobs_seen_at from users where id = $1),
                   'epoch'::timestamptz))::text as count,
         (select count(*)
            from hiring_applications a
            join hiring_posts p on p.id = a.post_id
           where p.user_id = $1
             and p.hidden_at is null
             -- Only posts still taking applications. A filled or closed post
             -- has already answered everyone, and counting its history kept
             -- the Jobs badge lit permanently on a job finished weeks ago.
             and p.status = 'open'
             and a.status = 'new')::text as applications`,
      [userId],
    );
    return {
      count: Number(row?.count ?? 0),
      applications: Number(row?.applications ?? 0),
    };
  }

  /** Marks the board as read up to now. Called when the Jobs tab is opened. */
  async markSeen(userId: string): Promise<{ seenAt: string }> {
    const row = await this.db.queryOne<{ jobs_seen_at: Date }>(
      'update users set jobs_seen_at = now() where id = $1 returning jobs_seen_at',
      [userId],
    );
    return { seenAt: (row?.jobs_seen_at ?? new Date()).toISOString() };
  }

  /** Posts the caller has made, including closed ones. */
  async mine(userId: string): Promise<PublicJobPost[]> {
    const rows = await this.db.query<PostRow>(
      `select ${this.postSelect('$1')}
         from hiring_posts p
         join users u on u.id = p.user_id
        where p.user_id = $1
        order by p.created_at desc
        limit 100`,
      [userId],
    );
    return rows.map((row) => this.present(row, userId));
  }

  async create(
    userId: string,
    input: {
      title: string;
      description: string;
      rolesWanted: string[];
      eventDate?: string;
      location?: string;
      budgetMin?: number;
      budgetMax?: number;
    },
  ): Promise<PublicJobPost> {
    const roles = normalizeRoles(input.rolesWanted ?? []);
    if (roles.length === 0) {
      throw new BadRequestException(
        'Say which role you are hiring for — it is how the right people find this.',
      );
    }

    // An event already in the past is a typo, and publishing it wastes
    // everybody's time including the poster's.
    if (input.eventDate && input.eventDate < new Date().toISOString().slice(0, 10)) {
      throw new BadRequestException('That date has already passed');
    }

    const expiresAt = this.expiryFor(input.eventDate);

    const row = await this.db.queryOne<{ slug: string }>(
      `insert into hiring_posts
         (user_id, slug, title, description, roles_wanted, event_date,
          location, location_key, budget_min, budget_max, expires_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       returning slug`,
      [
        userId,
        slugify(input.title),
        input.title.trim(),
        input.description.trim(),
        roles,
        input.eventDate || null,
        // Canonical on the way in, so the board groups the same place under
        // one spelling however it was typed. Server-side because a request
        // does not have to come from our own form.
        canonicalLocation(input.location ?? '') || null,
        locationKey(canonicalLocation(input.location ?? '')) || null,
        input.budgetMin ?? null,
        input.budgetMax ?? null,
        expiresAt,
      ],
    );

    // Everyone connected except the poster. Ambient, not a notification: it
    // says the board moved, so a client can bump its badge and refetch.
    this.realtime.broadcast(
      { type: 'job-posted', slug: row!.slug, at: new Date().toISOString() },
      userId,
    );

    this.logger.log(`job post ${row!.slug} created by ${userId}`);
    return this.bySlug(userId, row!.slug);
  }

  /**
   * When a post should stop being shown.
   *
   * Never past the job itself: a post for the 19th is worthless on the 20th,
   * so a dated job expires the day after rather than running its full 30.
   */
  private expiryFor(eventDate?: string): Date {
    const standard = new Date(Date.now() + DEFAULT_LIFETIME_DAYS * 86_400_000);
    if (!eventDate) return standard;

    const dayAfter = new Date(`${eventDate}T00:00:00Z`);
    dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
    return dayAfter < standard ? dayAfter : standard;
  }

  /**
   * How many people are still waiting on an answer.
   *
   * The clients ask before filling or closing, so the confirmation can name a
   * number rather than "are you sure" — the whole point is that the poster
   * knows they are ending it for other people too.
   */
  async pendingApplicantCount(userId: string, id: string): Promise<number> {
    await this.ownedPost(userId, id);
    const row = await this.db.queryOne<{ count: string }>(
      `select count(*)::text as count from hiring_applications
        where post_id = $1 and status in ('new', 'shortlisted')`,
      [id],
    );
    return Number(row?.count ?? 0);
  }

  /**
   * Close, fill, or reopen a post the caller owns.
   *
   * Ending a post ends the applications on it. Accepting somebody deliberately
   * does *not* — a post can want a photographer and a videographer and an
   * HMUA, so hiring one person is not the end of anything. Filling or closing
   * is the poster saying it is over, and everybody still waiting is answered
   * then, in the same transaction.
   *
   * Without this they sat at `new` forever: no answer, and the poster's Jobs
   * badge lit permanently by applications on a job that was finished weeks ago.
   */
  async setStatus(
    userId: string,
    id: string,
    status: 'open' | 'filled' | 'closed',
  ): Promise<PublicJobPost> {
    const post = await this.ownedPost(userId, id);

    if (status === 'open' && post.expires_at <= new Date()) {
      throw new BadRequestException('This post has expired — create a new one.');
    }

    const ending = status === 'filled' || status === 'closed';

    const { slug, declined } = await this.db.transaction(async (client) => {
      const updated = await client.query<{ slug: string }>(
        'update hiring_posts set status = $3 where id = $1 and user_id = $2 returning slug',
        [id, userId, status],
      );

      if (!ending) return { slug: updated.rows[0].slug, declined: [] };

      // Returns the rows so each person can be told, which a bare UPDATE
      // could not do — and the notification is the entire point.
      const rest = await client.query<{ user_id: string }>(
        `update hiring_applications
            set status = 'declined', responded_at = now()
          where post_id = $1 and status in ('new', 'shortlisted')
          returning user_id`,
        [id],
      );
      return { slug: updated.rows[0].slug, declined: rest.rows.map((r) => r.user_id) };
    });

    if (declined.length > 0) {
      const me = await this.account(userId);
      const who = me ? this.nameFor(me) : 'The poster';
      // Outside the transaction: a notification that fails must not roll back
      // a status change the poster has already been told succeeded.
      await this.notifier.notify(declined, {
        topic: 'job-response',
        title: status === 'filled' ? 'Role filled' : 'Job closed',
        body:
          status === 'filled'
            ? `${who} filled “${post.title}”`
            : `${who} closed “${post.title}”`,
        data: { type: 'job_response', postId: id, status: 'declined' },
      });
      this.logger.log(
        `post ${id} ${status}; ${declined.length} pending application(s) declined`,
      );
    }

    return this.bySlug(userId, slug);
  }

  /**
   * Edit a post after it is up.
   *
   * There was no route for this at all, so a wrong date meant deleting and
   * reposting — which cascades and destroys every application already made.
   *
   * The slug is deliberately not regenerated on a title change: it is in
   * links people have already been sent.
   */
  async update(
    userId: string,
    id: string,
    input: Partial<{
      title: string;
      description: string;
      rolesWanted: string[];
      eventDate: string | null;
      location: string | null;
      budgetMin: number | null;
      budgetMax: number | null;
    }>,
  ): Promise<PublicJobPost> {
    await this.ownedPost(userId, id);

    const roles = input.rolesWanted
      ? normalizeRoles(input.rolesWanted)
      : undefined;
    if (roles && roles.length === 0) {
      throw new BadRequestException('Choose at least one role');
    }
    if (
      input.budgetMin != null &&
      input.budgetMax != null &&
      input.budgetMin > input.budgetMax
    ) {
      throw new BadRequestException('The lowest budget cannot exceed the highest');
    }

    const location =
      input.location === undefined
        ? undefined
        : input.location
          ? canonicalLocation(input.location)
          : null;

    const row = await this.db.queryOne<{ slug: string }>(
      `update hiring_posts
          set title        = coalesce($3, title),
              description  = coalesce($4, description),
              roles_wanted = coalesce($5::text[], roles_wanted),
              event_date   = case when $6::boolean then $7::date else event_date end,
              location     = case when $8::boolean then $9::text else location end,
              location_key = case when $8::boolean then $10::text else location_key end,
              budget_min   = case when $11::boolean then $12::int else budget_min end,
              budget_max   = case when $13::boolean then $14::int else budget_max end,
              updated_at   = now()
        where id = $1 and user_id = $2
        returning slug`,
      [
        id,
        userId,
        input.title ?? null,
        input.description ?? null,
        roles ?? null,
        input.eventDate !== undefined,
        input.eventDate ?? null,
        input.location !== undefined,
        location ?? null,
        location ? locationKey(location) : null,
        input.budgetMin !== undefined,
        input.budgetMin ?? null,
        input.budgetMax !== undefined,
        input.budgetMax ?? null,
      ],
    );
    return this.bySlug(userId, row!.slug);
  }

  async remove(userId: string, id: string): Promise<{ deleted: boolean }> {
    await this.ownedPost(userId, id);
    await this.db.query('delete from hiring_posts where id = $1 and user_id = $2', [
      id,
      userId,
    ]);
    return { deleted: true };
  }

  // ---------------------------------------------------------------- applying

  /**
   * Applies to a post.
   *
   * Deliberately does not require a matching role. Somebody who does two jobs
   * and lists one, or who is branching out, is exactly the person a rule like
   * that would wrongly exclude — the poster can see their roles and decide.
   */
  async apply(userId: string, slug: string, message: string): Promise<JobApplication> {
    const text = message?.trim();
    if (!text) throw new BadRequestException('Say why you are right for this job');

    const post = await this.db.queryOne<{
      id: string;
      user_id: string;
      title: string;
      status: string;
    }>(
      `select id, user_id, title, status from hiring_posts
        where slug = $1 and hidden_at is null and expires_at > now()`,
      [slug],
    );
    if (!post) throw new NotFoundException('That job post is no longer available');

    if (post.user_id === userId) {
      throw new BadRequestException('That is your own post');
    }
    if (post.status !== 'open') {
      throw new BadRequestException('This job is no longer taking applications');
    }

    let row: { id: string } | null;
    try {
      row = await this.db.queryOne<{ id: string }>(
        `insert into hiring_applications (post_id, user_id, message)
         values ($1, $2, $3) returning id`,
        [post.id, userId, text],
      );
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new ConflictException('You have already applied to this job');
      }
      throw err;
    }

    const me = await this.account(userId);
    const name = me ? this.nameFor(me) : 'Someone';

    await this.notifier.notify([post.user_id], {
      topic: 'job-application',
      title: 'New application',
      body: `${name} applied to “${post.title}”`,
      data: { type: 'job_application', postId: post.id, applicationId: row!.id },
      email: jobApplication({
        applicantName: name,
        jobTitle: post.title,
        url: `${this.mailConfig.appUrl}/jobs/mine`,
      }),
    });

    this.logger.log(`application ${row!.id} on post ${post.id} by ${userId}`);
    return this.applicationById(row!.id, userId);
  }

  /** Applications on one of the caller's own posts. */
  async applicationsFor(userId: string, postId: string): Promise<JobApplication[]> {
    await this.ownedPost(userId, postId);
    const rows = await this.db.query<ApplicationRow>(
      `${this.applicationSelect} where a.post_id = $1 order by a.created_at desc`,
      [postId],
    );
    return rows.map((row) => this.presentApplication(row, userId));
  }

  /** Everything the caller has applied to. */
  async myApplications(userId: string): Promise<JobApplication[]> {
    const rows = await this.db.query<ApplicationRow>(
      `${this.applicationSelect} where a.user_id = $1 order by a.created_at desc limit 100`,
      [userId],
    );
    return rows.map((row) => this.presentApplication(row, userId));
  }

  private readonly applicationSelect = `
    select a.*, p.title as post_title, p.slug as post_slug,
           p.user_id as post_owner_id,
           p.status  as post_status,
           u.display_name as person_name,
           u.email        as person_email,
           u.avatar_url   as person_avatar_url,
           u.roles        as person_roles,
           case when u.public_profile then u.handle end as person_handle,
           /*
            * The conversation acceptance opened, resolved on every read.
            *
            * It used to be returned by respond() alone and hard-coded null
            * everywhere else, so the id existed for exactly one response and
            * was then unreachable — four "Open chat" buttons across the two
            * clients were guarded on a field that could never arrive. An
            * accepted applicant had no path from their application to the
            * chat at all.
            *
            * Same subquery HireService.list uses, which is why enquiries kept
            * their chat link across refreshes and applications did not.
            */
           (select c.id
              from conversations c
              join conversation_participants cp1
                on cp1.conversation_id = c.id and cp1.user_id = a.user_id
              join conversation_participants cp2
                on cp2.conversation_id = c.id and cp2.user_id = p.user_id
             where c.is_group = false
             limit 1) as conversation_id
      from hiring_applications a
      join hiring_posts p on p.id = a.post_id
      join users u on u.id = a.user_id`;

  /**
   * Accepting is what connects them, and it is the same transaction a hire
   * enquiry uses — status, both friend rows, then the conversation. Shortlisting
   * and declining only move the status; neither is a commitment.
   */
  async respond(
    userId: string,
    applicationId: string,
    status: 'shortlisted' | 'accepted' | 'declined',
  ): Promise<JobApplication> {
    const row = await this.db.queryOne<ApplicationRow>(
      `${this.applicationSelect} where a.id = $1`,
      [applicationId],
    );
    // Same answer for "not yours" and "does not exist", so an id cannot be
    // probed by anyone who was not sent it.
    if (!row || row.post_owner_id !== userId) {
      throw new NotFoundException('Application not found');
    }
    if (row.status === 'accepted') {
      throw new BadRequestException('You have already accepted this application');
    }

    if (status !== 'accepted') {
      await this.db.query(
        `update hiring_applications set status = $2, responded_at = now() where id = $1`,
        [applicationId, status],
      );

      /*
       * Tell them either way.
       *
       * Shortlisting and declining used to return here silently, so an
       * applicant learned nothing — no push, no realtime frame, and nothing
       * on the client polls application status. A decline that is never
       * delivered reads exactly like a poster who never looked, and the
       * applicant goes on waiting for a job that is gone.
       */
      const me = await this.account(userId);
      const who = me ? this.nameFor(me) : 'The poster';
      await this.notifier.notify([row.user_id], {
        topic: 'job-response',
        title:
          status === 'shortlisted' ? 'You were shortlisted' : 'Application closed',
        body:
          status === 'shortlisted'
            ? `${who} shortlisted you for “${row.post_title}”`
            : `${who} went with someone else for “${row.post_title}”`,
        data: { type: 'job_response', applicationId, status },
      });

      return this.applicationById(applicationId, userId);
    }

    await this.db.transaction(async (client) => {
      await client.query(
        `update hiring_applications set status = 'accepted', responded_at = now()
          where id = $1`,
        [applicationId],
      );
      await this.friends.connect(userId, row.user_id, client);
    });

    // Outside the transaction: openDirect runs its own and is idempotent.
    const conversation = await this.messages.openDirect(userId, row.user_id);

    const me = await this.account(userId);
    await this.notifier.notify([row.user_id], {
      topic: 'job-response',
      title: 'Application accepted',
      body: `${me ? this.nameFor(me) : 'They'} accepted your application for “${row.post_title}”`,
      data: {
        type: 'job_response',
        applicationId,
        conversationId: conversation.id,
      },
    });

    this.logger.log(`application ${applicationId} accepted by ${userId}`);
    return this.applicationById(applicationId, userId, conversation.id);
  }

  // --------------------------------------------------------------- reporting

  /**
   * Reports a post.
   *
   * There is no admin surface in the product yet, so this does the two honest
   * things available: records it, and emails whoever answers the reply-to
   * address. Taking a post down is `hidden_at`, set by hand for now — worth
   * knowing rather than pretending a queue exists.
   */
  async report(
    userId: string,
    postId: string,
    reason: string,
    note?: string,
  ): Promise<{ reported: boolean }> {
    const post = await this.db.queryOne<{ id: string; title: string; slug: string }>(
      'select id, title, slug from hiring_posts where id = $1',
      [postId],
    );
    if (!post) throw new NotFoundException('Post not found');

    try {
      await this.db.query(
        `insert into hiring_post_reports (post_id, reporter_user_id, reason, note)
         values ($1, $2, $3, $4)`,
        [postId, userId, reason, note?.trim() || null],
      );
    } catch (err) {
      // Already reported by this person. Answering "thanks" is right — telling
      // them off for caring twice is not.
      if ((err as { code?: string }).code === '23505') return { reported: true };
      throw err;
    }

    const count = await this.db.queryOne<{ n: string }>(
      'select count(*)::text as n from hiring_post_reports where post_id = $1',
      [postId],
    );

    this.logger.warn(
      `job post ${post.slug} reported (${reason}) — ${count?.n ?? '?'} total`,
    );

    const to = this.mailConfig.replyTo;
    if (to) {
      await this.mail
        .send(to, jobPostReported({
          jobTitle: post.title,
          reason,
          note: note?.trim() || null,
          reportCount: Number(count?.n ?? 1),
          url: `${this.mailConfig.siteUrl}/jobs/${post.slug}`,
        }))
        .catch((error: Error) =>
          // A report that was written down still counts. Failing the request
          // because the mail relay is down would lose it entirely.
          this.logger.error(`could not email the report: ${error.message}`),
        );
    }

    return { reported: true };
  }

  // ----------------------------------------------------------------- helpers

  private async ownedPost(
    userId: string,
    id: string,
  ): Promise<{ expires_at: Date; title: string; status: PublicJobPost['status'] }> {
    const row = await this.db.queryOne<{
      expires_at: Date;
      title: string;
      status: PublicJobPost['status'];
    }>(
      // The title comes back so a notification about this post can name it
      // without a second query.
      'select expires_at, title, status from hiring_posts where id = $1 and user_id = $2',
      [id, userId],
    );
    if (!row) throw new NotFoundException('Post not found');
    return row;
  }

  private async applicationById(
    id: string,
    viewerId: string,
    conversationId: string | null = null,
  ): Promise<JobApplication> {
    const row = await this.db.queryOne<ApplicationRow>(
      `${this.applicationSelect} where a.id = $1`,
      [id],
    );
    if (!row) throw new NotFoundException('Application not found');
    if (row.post_owner_id !== viewerId && row.user_id !== viewerId) {
      throw new ForbiddenException('Not your application');
    }
    return this.presentApplication(row, viewerId, conversationId);
  }

  private present(row: PostRow, viewerId: string): PublicJobPost {
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      rolesWanted: row.roles_wanted ?? [],
      // `date` columns come back as raw strings by design (database.service),
      // so a day never picks up a timezone on the way out.
      eventDate: row.event_date,
      location: row.location,
      budgetMin: row.budget_min,
      budgetMax: row.budget_max,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      expiresAt: row.expires_at.toISOString(),
      postedBy: {
        displayName: row.poster_name?.trim() || row.poster_email.split('@')[0],
        avatarUrl: row.poster_avatar_url,
        handle: row.poster_handle,
      },
      myApplication: row.my_application_id
        ? {
            id: row.my_application_id,
            status: row.my_application_status ?? 'new',
            createdAt: (row.my_application_at ?? new Date()).toISOString(),
          }
        : null,
      applicantCount: Number(row.applicant_count ?? 0),
      newApplicantCount: Number(row.new_applicant_count ?? 0),
      isMine: row.user_id === viewerId,
    };
  }

  private presentApplication(
    row: ApplicationRow,
    viewerId: string,
    /**
     * Only passed by `respond()`, which has just created the conversation and
     * knows its id before the next read could see it. Everything else lets the
     * select resolve it.
     */
    conversationId?: string | null,
  ): JobApplication {
    return {
      id: row.id,
      postId: row.post_id,
      postTitle: row.post_title,
      postSlug: row.post_slug,
      // On your own post this is the applicant; on your application it is you,
      // which is a little odd to read but keeps one shape for one concept.
      personName: row.person_name?.trim() || row.person_email.split('@')[0],
      personAvatarUrl: row.person_avatar_url,
      personHandle: row.person_handle,
      personRoles: row.person_roles ?? [],
      message: row.message,
      status: row.status,
      postStatus: row.post_status,
      createdAt: row.created_at.toISOString(),
      respondedAt: row.responded_at?.toISOString() ?? null,
      conversationId: conversationId ?? row.conversation_id ?? null,
    };
  }

  private async account(
    id: string,
  ): Promise<{ email: string; display_name: string | null } | null> {
    return this.db.queryOne<{ email: string; display_name: string | null }>(
      'select email, display_name from users where id = $1',
      [id],
    );
  }

  private nameFor(a: { email: string; display_name: string | null }): string {
    return a.display_name?.trim() || a.email.split('@')[0];
  }
}
