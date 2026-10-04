/**
 * Ch1 — Wednesday, 11:42 PM · #hire: the chapter's page-authored copy, cut
 * to the cinema script (docs/redesign/05-cinema.md §3). The mocks' own words
 * live in `./ch1.ts`, proven there; nothing here is copied from the app, so
 * `SOURCES` is empty and check-story lints every line against the banned
 * words.
 *
 * A zero-import data module: relative imports of story data modules only.
 */
import { CAST, WHEN } from '../story';
import { GROUPS, QUESTION, SEEN_BY, clock12 } from './ch1';

export const SOURCES: { text: string; file: string; mode: 'verbatim' }[] = [];

export const CH1 = {
  /** The scene slate (drawn uppercase): the time card, top-left. */
  slate: `Wednesday · ${clock12(WHEN.panic)}`,
  /** The subtitles, one at a time. The first is the chapter's H2. */
  lines: [
    "Saturday's wedding is booked. The crew isn't.",
    `Three group chats. Seen by ${SEEN_BY}. Answered by nobody.`,
    'Or post the job once. A rate for every role.',
  ],
  /** The job card's byline: who is hiring, with her camera beside it. */
  byline: `${CAST.mika.first} · ${CAST.mika.roles[0]}`,
} as const;

/** The three group chats the film stacks up (generic chat chrome, aria-hidden): the question, then the receipt it gets. */
export const CH1_CHATS = [
  { title: GROUPS.suppliers, sent: 'Sent', seen: `Seen by ${SEEN_BY}` },
  { title: GROUPS.freelancers, sent: 'Sent', seen: 'Seen' },
  { title: GROUPS.batch, sent: 'Sent', seen: 'Seen' },
] as const;

export const CH1_QUESTION = QUESTION;
