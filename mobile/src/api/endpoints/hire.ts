import { api } from '../client';

/**
 * A hire enquiry, from either side.
 *
 * One shape for both inboxes: `direction` says whether the caller sent it or
 * received it, and `person*` is always the other party. Two near-identical
 * types would drift the first time a field was added to one of them.
 */
export interface HireEnquiry {
  id: string;
  direction: 'received' | 'sent';
  personName: string;
  personAvatarUrl: string | null;
  personHandle: string | null;
  /** One of the recipient's own roles, when the sender picked one. */
  roleWanted: string | null;
  /** Date only, `YYYY-MM-DD`. */
  eventDate: string | null;
  budget: string | null;
  message: string;
  status: 'new' | 'accepted' | 'declined';
  createdAt: string;
  respondedAt: string | null;
  /** Where to continue the conversation, once accepted. */
  conversationId: string | null;
}

export interface SendEnquiryInput {
  handle: string;
  message: string;
  roleWanted?: string;
  eventDate?: string;
  budget?: string;
}

/**
 * Hiring somebody found on a public profile.
 *
 * Sending needs an account — the profile is public, but an enquiry that reaches
 * a stranger's phone has to come from someone answerable for it.
 */
export const hireApi = {
  /** Both directions, newest first. */
  list(): Promise<{ data: HireEnquiry[]; total: number }> {
    return api.get('/hire');
  },

  send(input: SendEnquiryInput): Promise<HireEnquiry> {
    return api.post('/hire', { body: input });
  },

  /** Connects the two accounts and opens a chat. */
  accept(id: string): Promise<HireEnquiry> {
    return api.post(`/hire/${id}/accept`);
  },

  decline(id: string): Promise<HireEnquiry> {
    return api.post(`/hire/${id}/decline`);
  },
};
