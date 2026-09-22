import { api } from '../client';
import type { ListResponse } from '../types';

/**
 * Who a block or a report is about, in whichever terms the screen has.
 *
 * Several shapes because the screens hold different ids. A public profile
 * carries only its handle — the account id is deliberately never public — and
 * an applicant, an enquiry or a job post carries its own id and no account id
 * at all. The server resolves each to the other person, so blocking someone
 * from a card does not first need that person's id handed to the phone.
 */
export type PersonRef =
  | { handle: string }
  | { userId: string }
  | { applicationId: string }
  | { enquiryId: string }
  | { jobPostId: string };

/**
 * Someone you have blocked, as you saw them when you did.
 *
 * `id` is the block's own id, which is what unblocking takes. There is no
 * account id and no email here on purpose: the list is for recognising and
 * unblocking people, and it must not become a way to learn more about them
 * than the screen you blocked them from showed.
 */
export interface BlockedPerson {
  id: string;
  name: string;
  avatarUrl: string | null;
  /** Only when their profile was published. */
  handle: string | null;
  blockedAt: string;
}

export type UserReportReason =
  | 'spam'
  | 'scam'
  | 'harassment'
  | 'impersonation'
  | 'inappropriate'
  | 'other';

/**
 * Which screen a report came from, for whoever reads it.
 *
 * 'requests' is a friend request: often the only trace of a stranger, who may
 * have no profile to open and no chat with you to block them from.
 */
export type ReportSource =
  | 'profile'
  | 'chat'
  | 'nearby'
  | 'applicants'
  | 'enquiries'
  | 'job'
  | 'requests';

/** In the order the report sheet lists them; the API checks the same six. */
export const USER_REPORT_REASONS: { value: UserReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'scam', label: 'Scam or fraud' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'impersonation', label: 'Pretending to be someone else' },
  { value: 'inappropriate', label: 'Inappropriate photos or content' },
  { value: 'other', label: 'Something else' },
];

/**
 * Blocking and reporting people.
 *
 * Neither tells the other person anything. A block also ends what was still
 * waiting between the two of you — requests, enquiries, applications,
 * invitations — and unblocking brings none of it back.
 */
export const blocksApi = {
  /** Newest first. */
  list(): Promise<ListResponse<BlockedPerson>> {
    return api.get('/blocks');
  },

  /** Blocking someone already blocked returns the existing block. */
  block(ref: PersonRef): Promise<BlockedPerson> {
    return api.post('/blocks', { body: ref });
  },

  unblock(id: string): Promise<void> {
    return api.delete<void>(`/blocks/${encodeURIComponent(id)}`);
  },

  /**
   * One report per person you report; sending another is accepted and does
   * nothing. A blank note is left out rather than stored as whitespace.
   */
  report(input: {
    ref: PersonRef;
    reason: UserReportReason;
    note?: string;
    from?: ReportSource;
  }): Promise<{ reported: boolean }> {
    return api.post('/reports', {
      body: {
        ...input.ref,
        reason: input.reason,
        note: input.note?.trim() || undefined,
        from: input.from,
      },
    });
  },
};
