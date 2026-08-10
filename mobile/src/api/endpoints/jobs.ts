import { api } from '../client';

/**
 * A job post, as the board serves it.
 *
 * `postedBy` is a deliberate subset — the poster's name, face and handle and
 * nothing else. Reading the board needs an account now, but the subset stays:
 * "another user may see this" is still a smaller set than the poster's row.
 */
export type JobApplicationStatus =
  | 'new'
  | 'shortlisted'
  | 'accepted'
  | 'declined';

/** What one role on a post pays, in centavos. Either end may be unstated. */
export interface RoleBudget {
  min?: number | null;
  max?: number | null;
}

/** One of your own applications on a post, as the post carries it. */
export interface MyApplication {
  id: string;
  /** Null only on applications written before roles were recorded. */
  role: string | null;
  status: JobApplicationStatus;
  createdAt: string;
}

export interface JobPost {
  id: string;
  slug: string;
  title: string;
  description: string;
  rolesWanted: string[];
  /**
   * What each role pays, keyed by role name.
   *
   * A wedding wanting a photographer, a videographer and an HMUA pays three
   * different rates, and one range across all three tells nobody anything. A
   * role absent from this map has no stated budget, which is normal — every
   * post written before this existed looks that way.
   */
  roleBudgets: Record<string, RoleBudget>;
  /**
   * Roles somebody has already been hired for.
   *
   * A filled role stops taking applications; a post with every role filled
   * stops taking them altogether and leaves the board. Derived server-side
   * from the applications, so it cannot disagree with them.
   */
  filledRoles: string[];
  /** `YYYY-MM-DD`, the day of the job. */
  eventDate: string | null;
  location: string | null;
  /**
   * The range across every role, in centavos — what a board card shows.
   *
   * Derived by the server from `roleBudgets`. Never sent when writing: the
   * two must not be able to disagree about what a post pays.
   */
  budgetMin: number | null;
  budgetMax: number | null;
  status: 'open' | 'filled' | 'closed' | 'expired';
  createdAt: string;
  expiresAt: string;
  postedBy: {
    displayName: string;
    avatarUrl: string | null;
    /** Only set when they have published a profile, so a link cannot 404. */
    handle: string | null;
  };
  /**
   * Roughly how far away, in kilometres, or null.
   *
   * Null whenever it cannot be known — you have not shared a position, or the
   * post's location is not a place we hold coordinates for. Measured city
   * centre to city centre, so it answers "is this reachable" and must not be
   * shown as though it were an address.
   */
  distanceKm: number | null;
  applicantCount: number;
  /** Of those, how many are still unanswered. Drives the "needs you" dot. */
  newApplicantCount: number;
  /**
   * Your own applications on this post — one per role you applied for.
   *
   * A list, because a post wanting a videographer and an HMUA is two jobs and
   * somebody who does both may take both. Empty means you have applied for
   * nothing; a role missing from it is a role still open to you.
   *
   * Without this both clients offered Apply on a post the API answers with
   * 409, after the person had already filled the form in.
   */
  myApplications: MyApplication[];
  /**
   * Whether you posted this.
   *
   * The API always refused a self-application; without this the UI could not
   * tell, so it offered Apply on your own post and only failed on submit.
   */
  isMine: boolean;
}

export interface JobApplication {
  id: string;
  postId: string;
  postTitle: string;
  postSlug: string;
  /** The other party: the applicant on your post, you on your application. */
  personName: string;
  personAvatarUrl: string | null;
  personHandle: string | null;
  personRoles: string[];
  /**
   * Which role they applied for.
   *
   * Null only on applications written before this field existed. Filled in
   * without asking when a post wants exactly one role.
   */
  role: string | null;
  /**
   * Why they are right for the job — no longer asked for.
   *
   * Null on anything applied for since. Rendered when present, because
   * applications already carry messages people wrote.
   */
  message: string | null;
  status: JobApplicationStatus;
  /**
   * What became of the post itself.
   *
   * An applicant could not previously tell that the job was filled or closed
   * — their row sat at "Waiting" with nothing to explain it.
   */
  postStatus: 'open' | 'filled' | 'closed' | 'expired';
  createdAt: string;
  respondedAt: string | null;
  conversationId: string | null;
}

export interface CreateJobInput {
  title: string;
  description: string;
  rolesWanted: string[];
  /**
   * What each role pays. Keys not in `rolesWanted` are dropped by the server,
   * and the post's own range is derived from this — never sent directly.
   */
  roleBudgets?: Record<string, RoleBudget>;
  eventDate?: string;
  location?: string;
}

export interface ListJobsParams {
  roles?: string[];
  location?: string;
  limit?: number;
  offset?: number;
}

/** Why somebody flagged a post. */
export type ReportReason = 'spam' | 'scam' | 'offensive' | 'not-a-job' | 'other';

export const jobsApi = {
  /** The open board. Needs an account, like every other read. */
  list(params: ListJobsParams = {}): Promise<{ data: JobPost[]; total: number }> {
    return api.get('/jobs', {
      query: {
        // Comma-separated, and omitted entirely when empty so the URL stays
        // clean and cacheable.
        ...(params.roles?.length ? { roles: params.roles.join(',') } : {}),
        ...(params.location ? { location: params.location } : {}),
        ...(params.limit ? { limit: params.limit } : {}),
        ...(params.offset ? { offset: params.offset } : {}),
      },
    });
  },

  /**
   * The two halves of the Jobs badge.
   *
   * `count` is other people's new postings, cleared by opening the board.
   * `applications` is people waiting on an answer from you, and only falls
   * when you answer one — so marking the board seen cannot bury somebody's
   * application, which is what would happen if these were one number.
   */
  unseen(): Promise<{ count: number; applications: number }> {
    return api.get('/jobs/unseen');
  },

  /**
   * What ending or deleting this post would cost other people.
   *
   * Asked before doing either, so the confirmation can name numbers — "are you
   * sure" does not say that somebody else loses something.
   *
   * `count` is who filling or closing would answer. `applications` and
   * `bookings` are what deleting destroys outright: the post cascades, so
   * every application at any status and every agreement made from one goes
   * with it.
   */
  pendingApplicants(postId: string): Promise<{
    count: number;
    applications: number;
    bookings: number;
  }> {
    return api.get(`/me/jobs/${postId}/pending-applicants`);
  },

  /** Edit a post that is already up. Omitted fields are left alone. */
  update(
    postId: string,
    input: Partial<{
      title: string;
      description: string;
      rolesWanted: string[];
      /**
       * Sent whole, not merged: a key left out means the poster cleared it.
       * Sending either this or `rolesWanted` re-derives the post's range from
       * both, so the two can never drift apart.
       */
      roleBudgets: Record<string, RoleBudget>;
      eventDate: string | null;
      location: string | null;
    }>,
  ): Promise<JobPost> {
    return api.patch(`/me/jobs/${postId}`, { body: input });
  },

  /** Clears the badge. Called when the Jobs tab is opened. */
  markSeen(): Promise<{ seenAt: string }> {
    return api.post('/me/jobs/seen');
  },

  bySlug(slug: string): Promise<JobPost> {
    return api.get(`/jobs/${encodeURIComponent(slug)}`);
  },

  /** Posts the caller has made, open or not. */
  mine(): Promise<{ data: JobPost[]; total: number }> {
    return api.get('/me/jobs');
  },

  create(input: CreateJobInput): Promise<JobPost> {
    return api.post('/me/jobs', { body: input });
  },

  setStatus(id: string, status: 'open' | 'filled' | 'closed'): Promise<JobPost> {
    return api.patch(`/me/jobs/${id}/status`, { body: { status } });
  },

  remove(id: string): Promise<{ deleted: boolean }> {
    return api.delete(`/me/jobs/${id}`);
  },

  /** Applicants on one of the caller's own posts. */
  applicants(postId: string): Promise<{ data: JobApplication[]; total: number }> {
    return api.get(`/me/jobs/${postId}/applications`);
  },

  /** Everything the caller has applied to. */
  myApplications(): Promise<{ data: JobApplication[]; total: number }> {
    return api.get('/me/jobs/applications');
  },

  /**
   * Applies for one role on a post.
   *
   * `role` is required by the server when the post wants more than one, and
   * ignored when it wants exactly one — being asked to pick from a list of one
   * is a step with no decision in it.
   */
  apply(slug: string, role?: string | null): Promise<JobApplication> {
    return api.post(`/jobs/${encodeURIComponent(slug)}/apply`, {
      body: role ? { role } : {},
    });
  },

  respond(
    applicationId: string,
    status: 'shortlisted' | 'accepted' | 'declined',
  ): Promise<JobApplication> {
    return api.post(`/jobs/applications/${applicationId}/respond`, { body: { status } });
  },

  report(postId: string, reason: ReportReason, note?: string): Promise<{ reported: boolean }> {
    return api.post(`/jobs/${postId}/report`, { body: { reason, note } });
  },
};

/** The public address of a post, for sharing and canonical tags. */
export function jobUrl(slug: string, origin = 'https://virgo.ph'): string {
  return `${origin}/jobs/${slug}`;
}

/**
 * "₱30,000 – ₱45,000", or one side of it, or nothing.
 *
 * Hand-rolled rather than Intl.NumberFormat: Hermes ships a variable subset of
 * Intl and this file is shared with the phone, where a missing formatter is a
 * crash rather than a fallback.
 */
export function budgetLabel(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  const peso = (centavos: number) =>
    `₱${Math.round(centavos / 100).toLocaleString('en-US')}`;
  if (min != null && max != null) {
    return min === max ? peso(min) : `${peso(min)} – ${peso(max)}`;
  }
  return min != null ? `From ${peso(min)}` : `Up to ${peso(max as number)}`;
}

/**
 * Your application for one role, if you made one.
 *
 * A post that only ever wanted one role has applications with a null role on
 * it — written before the field existed — so a post with a single role falls
 * back to "your application, whatever it was recorded against". Anywhere else
 * a null-role application belongs to no role in particular and is left out.
 */
export function applicationFor(
  post: Pick<JobPost, 'myApplications' | 'rolesWanted'>,
  role: string,
): MyApplication | undefined {
  return post.myApplications.find(
    (a) => a.role === role || (a.role === null && post.rolesWanted.length === 1),
  );
}

/** Whether somebody has already been hired for this role. */
export function isRoleFilled(
  post: Pick<JobPost, 'filledRoles'>,
  role: string,
): boolean {
  return post.filledRoles.includes(role);
}

/** Roles nobody has been hired for yet — what the post is still offering. */
export function openRolesOf(
  post: Pick<JobPost, 'rolesWanted' | 'filledRoles'>,
): string[] {
  return post.rolesWanted.filter((role) => !isRoleFilled(post, role));
}

/**
 * The roles on this post you could still apply for.
 *
 * Two ways to be out: somebody has been hired for it, or you already applied
 * for it. Empty means there is nothing here for you, which is the only state
 * in which an open post should stop offering Apply.
 */
export function rolesLeftFor(
  post: Pick<JobPost, 'myApplications' | 'rolesWanted' | 'filledRoles'>,
): string[] {
  return openRolesOf(post).filter((role) => !applicationFor(post, role));
}

/**
 * The one application worth showing on a board card, or undefined.
 *
 * A card has room for one badge and a post can now hold three applications
 * from the same person. Shows the furthest one got: being accepted for the
 * HMUA slot is the thing you want to see, even if the videographer one was
 * declined.
 */
export function headlineApplication(
  post: Pick<JobPost, 'myApplications'>,
): MyApplication | undefined {
  const rank: Record<JobApplicationStatus, number> = {
    accepted: 0,
    shortlisted: 1,
    new: 2,
    declined: 3,
  };
  return [...post.myApplications].sort(
    (a, b) => rank[a.status] - rank[b.status],
  )[0];
}

/**
 * What one role pays, or null if the post did not say.
 *
 * Same words as `budgetLabel` — "From ₱2,000", "₱5,000 – ₱8,000" — because a
 * rate reads the same whether it belongs to a post or to a role on one.
 */
export function roleBudgetLabel(
  budgets: Record<string, RoleBudget> | undefined,
  role: string,
): string | null {
  const b = budgets?.[role];
  if (!b) return null;
  return budgetLabel(b.min ?? null, b.max ?? null);
}

/**
 * "12 km away", or "near Cebu City" when it is far enough that the exact
 * number stops meaning anything.
 *
 * Deliberately vague past 50 km: the coordinate is a city centre, not a
 * venue, and "387.9 km" implies a precision that is not there.
 */
export function distanceLabel(
  km: number | null | undefined,
  location?: string | null,
): string | null {
  if (km == null) return null;
  if (km < 1) return 'Nearby';
  if (km <= 50) return `${Math.round(km)} km away`;
  return location ? `near ${location}` : `${Math.round(km)} km away`;
}
