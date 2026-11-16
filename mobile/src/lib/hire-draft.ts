/**
 * An enquiry as it was written, kept until the server has it.
 *
 * The Hire form closes on the tap now, before the server has answered. If the
 * send then fails, the brief must not be gone with the form: it is kept here,
 * by whose it was for, and the form opens with it again. In memory only. It
 * is a few sentences that matter for the length of one request, not something
 * to find on the phone next week.
 */
export interface HireDraft {
  message: string;
  roleWanted: string | null;
  eventDate: string;
  budget: string;
}

const drafts = new Map<string, HireDraft>();

const keyOf = (handle: string) => handle.replace(/^@/, '').toLowerCase();

export const hireDrafts = {
  keep(handle: string, draft: HireDraft): void {
    drafts.set(keyOf(handle), draft);
  },
  /** Reads it without letting go of it: the form may be opened more than once. */
  get(handle: string | undefined): HireDraft | null {
    return handle ? (drafts.get(keyOf(handle)) ?? null) : null;
  },
  clear(handle: string): void {
    drafts.delete(keyOf(handle));
  },
};
