/**
 * Ch1 — Wednesday, 11:42 PM: the chapter's page-authored copy (storyboard
 * Ch1). The mocks' own words live in `./ch1.ts`, proven there; nothing here
 * is copied from the app, so `SOURCES` is empty and check-story lints every
 * line against the banned words.
 *
 * A zero-import data module: relative imports of story data modules only.
 */
import { CAST, CLIENT, HOME, WHEN } from '../story';
import { clock12 } from './ch1';

export const SOURCES: { text: string; file: string; mode: 'verbatim' }[] = [];

const panic = clock12(WHEN.panic);

export const CH1 = {
  eyebrow: `01 · Wednesday, ${panic} · ${HOME.city}`,
  title: "Saturday's wedding is booked. The crew isn't.",
  body: `${CAST.mika.first} needs a videographer, a same-day-edit editor and an HMUA for the ${CLIENT.event} on Saturday. She knows people. They're somewhere in her phone.`,
  /** The step list: three time lines, each its own card on phones. */
  steps: [
    { time: panic, iso: WHEN.panic, text: 'Three group chats, one question.' },
    { time: clock12(WHEN.seenBy14), iso: WHEN.seenBy14, text: 'Seen by 14. Answered by nobody.' },
    { time: clock12(WHEN.whichKenn), iso: WHEN.whichKenn, text: '"Kenn SDE." Which Kenn?' },
  ],
  pull: 'Most of the work in this trade comes from someone you know. Finding them by Saturday is the hard part.',
  turn: 'Or post the job once.',
  turnBody: 'Put it on the Jobs board with what each role pays, up to ₱500,000 a role.',
  footnote:
    'The chats and lock screen are generic; the Post a job form is drawn from the app. People, places and amounts are illustrative.',
} as const;

/** The display clock: "11:42" behind the phone, "11:42 PM" over the static figures. Decorative (aria-hidden). */
export const BIG_CLOCK = panic.replace(/\s?[AP]M$/, '');
export const BIG_CLOCK_FULL = panic;

/** The figure's caption: sr-only in motion, visible on the static page. */
export const FIGURE = {
  caption: `${CAST.mika.first}'s phone, Wednesday night. The same question goes to three group chats; one shows "Seen by 14" and no answers, a story reply is left on Seen, and a contacts search for "kenn" finds two of them. At ${clock12(WHEN.posted)} she posts the job once instead: a videographer, an SDE editor and an HMUA, each with its own rate.`,
  before: `Before · ${clock12(WHEN.whichKenn)}`,
  after: `After · ${clock12(WHEN.posted)}`,
} as const;
