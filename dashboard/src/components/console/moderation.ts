import type { CaseKind } from '@/api/console';

export const KIND_LABEL: Record<CaseKind, string> = {
  user: 'Person',
  job: 'Job post',
  showcase: 'Post',
};

/** Reasons across all three kinds of report, as the apps word them. */
export const REASON_LABEL: Record<string, string> = {
  spam: 'Spam',
  scam: 'Scam or fraud',
  harassment: 'Harassment',
  impersonation: 'Impersonation',
  inappropriate: 'Inappropriate',
  offensive: 'Offensive',
  'not-a-job': 'Not a job',
  stolen_work: 'Stolen work',
  wrong_credit: 'Wrong credit',
  other: 'Something else',
};

/** Where in the app a report about a person was made. */
export const SOURCE_LABEL: Record<string, string> = {
  profile: 'profile',
  chat: 'chat',
  nearby: 'Nearby',
  applicants: 'applicants',
  enquiries: 'enquiries',
  job: 'a job',
  requests: 'a friend request',
};

/** What a decision did, in past tense, for the history and closed cases. */
export const RESOLUTION_LABEL: Record<string, string> = {
  dismissed: 'Dismissed',
  hidden: 'Hidden',
  warned: 'Warned',
  suspended: 'Suspended',
  dismiss: 'Dismissed',
  hide: 'Hidden',
  warn: 'Warned',
  suspend: 'Suspended',
  remove_comment: 'Comment removed',
};

export const reasonLabel = (reason: string) => REASON_LABEL[reason] ?? reason;

/**
 * Starting points for a warning. Inserted into the box to be edited — a
 * warning should read as written to this person about this thing, not as a
 * form letter, so none of these is sent as it stands.
 */
export const WARNING_STARTERS: { key: string; label: string; text: string }[] = [
  {
    key: 'harassment',
    label: 'Harassment',
    text: 'People reported messages from you that threatened or harassed them. That is not allowed on Virgo. If it happens again, your account will be suspended.',
  },
  {
    key: 'scam',
    label: 'Scam or deposits',
    text: 'Asking for money up front, outside a booking, puts people at risk and is not allowed on Virgo. Please take this out of what you post. If it happens again, your account will be suspended.',
  },
  {
    key: 'spam',
    label: 'Spam',
    text: 'People reported repeated, unwanted messages or posts from you. Please keep what you send to people who asked for it. If it continues, your account will be suspended.',
  },
  {
    key: 'inappropriate',
    label: 'Inappropriate content',
    text: 'Something you posted broke Virgo’s rules on what can be shared, and it has been taken down. Please read the Terms before posting again.',
  },
  {
    key: 'stolen_work',
    label: 'Someone else’s work',
    text: 'Someone reported that a post of yours shows work that is not yours, or does not credit the people who made it. Please post only your own work, credited properly.',
  },
];
