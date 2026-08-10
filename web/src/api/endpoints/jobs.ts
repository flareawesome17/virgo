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

export interface JobPost {
  id: string;
  slug: string;
  title: string;
  description: string;
  rolesWanted: string[];
  /** `YYYY-MM-DD`, the day of the job. */
  eventDate: string | null;
  location: string | null;
  /** Centavos, like the billing plans. */
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
   * Your own application on this post, or null if you have not applied.
   *
   * The only state in which an Apply control belongs on screen is null. Every
   * other value is something to render instead of the button — without this
   * both clients offered Apply on a post the API answers with 409, after the
   * person had already written the whole message.
   */
  myApplication: {
    id: string;
    status: JobApplicationStatus;
    createdAt: string;
  } | null;
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
  message: string;
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
  eventDate?: string;
  location?: string;
  budgetMin?: number;
  budgetMax?: number;
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
      eventDate: string | null;
      location: string | null;
      budgetMin: number | null;
      budgetMax: number | null;
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

  apply(slug: string, message: string): Promise<JobApplication> {
    return api.post(`/jobs/${encodeURIComponent(slug)}/apply`, { body: { message } });
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
