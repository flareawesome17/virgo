/**
 * Ch1 — Wednesday, 11:42 PM: every word the chapter's two mocks draw.
 *
 * - `ChatCardStack` is generic chrome: unbranded group chats, a story reply
 *   and a contacts search, over a generic lock screen. None of it is Virgo
 *   UI and none of it is any real app's, so it has no source; the chapter's
 *   footnote names it as generic. The group names and people are invented.
 * - `JobPostForm` is the phone app's "Post a job" screen
 *   (`mobile/app/(app)/jobs/new.tsx`), word for word, proven in `SOURCES`.
 *   The filled-in values come from the story's job (`story.ts › JOB`).
 * - The "Posted" stamp is the page's own annotation, not app UI.
 *
 * A zero-import data module (see `../story.ts`): relative imports of other
 * story data modules only, so `scripts/check-story.mjs` loads it under plain
 * Node.
 */
import { JOB, ROLES, TZ, WEDDING_DAY, WHEN } from '../story';
import type { SourceEntry } from './common';

// ─── Times ───────────────────────────────────────────────────────────────

/** "11:42 PM": a story instant's local time, 12-hour, as the page writes times. */
export function clock12(iso: string): string {
  const h = Number(iso.slice(11, 13));
  return `${h % 12 || 12}:${iso.slice(14, 16)} ${h < 12 ? 'AM' : 'PM'}`;
}

/** An instant on Wednesday night, the night of the panic. */
const wednesday = (hhmm: string) => `${WHEN.panic.slice(0, 10)}T${hhmm}:00${TZ}`;

// ─── The chat pile (generic; no source) ──────────────────────────────────

/** What Mika asks, as she typed it into each group. */
export const QUESTION = 'anyone free sat? vid + SDE + HMUA';

/** Three group chats. Invented names that say what kind of group each is, not any real group. */
export const GROUPS = {
  suppliers: 'Wedding suppliers · Cebu',
  freelancers: 'Photo & video freelancers',
  batch: 'Photogs batch 2019',
} as const;

/** How many saw the question in the first group, and how many answered (none). */
export const SEEN_BY = 14;

/** The group's last message before hers: the chat was already about something else. */
export const BEFORE_QUESTION = 'Rico: anyone selling a gimbal?';

export type ChatRow = { name: string; initials: string; preview: string; time: string };

type Base = {
  /** When it lands; the lock screen's clock reads this once it is the newest card. */
  at: string;
  /** The card's own time, as the chat writes it. */
  time: string;
  /** In the 5-card deck phones get, as well as the desktop's 7. */
  mobile: boolean;
};

export type ChatCard = Base &
  (
    | { kind: 'thread'; title: string; incoming: string; mine: string; receipt: string }
    | { kind: 'list'; title: string; rows: readonly ChatRow[] }
    | { kind: 'notice'; title: string; summary: string; preview: readonly string[] }
    | { kind: 'story'; title: string; label: string; mine: string; receipt: string }
    | { kind: 'search'; title: string; query: string; results: readonly string[] }
  );

const card = <T extends ChatCard>(c: T) => c;
const at = (hhmm: string) => ({ at: wednesday(hhmm), time: clock12(wednesday(hhmm)) });

/**
 * The pile, oldest first: the same question in three groups, a group that
 * keeps talking about everything else, "Seen by 14", a story reply left on
 * Seen, and a contacts search for a Kenn she half remembers. Desktop shows
 * all seven; phones show the five marked `mobile`, which still carry every
 * beat the step list names (11:42, 11:51, 11:57).
 */
export const CHAT_CARDS: readonly ChatCard[] = [
  card({
    kind: 'thread',
    ...at('23:42'),
    mobile: false,
    title: GROUPS.suppliers,
    incoming: BEFORE_QUESTION,
    mine: QUESTION,
    receipt: 'Sent',
  }),
  card({
    kind: 'list',
    ...at('23:44'),
    mobile: true,
    title: 'Chats',
    rows: [
      { name: GROUPS.suppliers, initials: 'WS', preview: `You: ${QUESTION}`, time: clock12(wednesday('23:42')) },
      { name: GROUPS.freelancers, initials: 'PV', preview: `You: ${QUESTION}`, time: clock12(wednesday('23:43')) },
      { name: GROUPS.batch, initials: 'PB', preview: `You: ${QUESTION}`, time: clock12(wednesday('23:44')) },
    ],
  }),
  card({
    kind: 'notice',
    ...at('23:46'),
    mobile: false,
    title: GROUPS.freelancers,
    summary: '12 new messages',
    preview: [
      'Jo: selling my 70-200, meet-ups in Cebu only',
      'Mae: who has a spare battery grip?',
      'Rico: anyone going to the expo on sunday?',
    ],
  }),
  card({
    kind: 'thread',
    at: WHEN.seenBy14,
    time: clock12(WHEN.seenBy14),
    mobile: true,
    title: GROUPS.suppliers,
    incoming: BEFORE_QUESTION,
    mine: QUESTION,
    receipt: `Seen by ${SEEN_BY}`,
  }),
  card({
    kind: 'notice',
    ...at('23:53'),
    mobile: true,
    title: GROUPS.freelancers,
    summary: '38 new messages',
    preview: [
      'Ana: anyone know a photo booth for the 19th?',
      'Jo: 70-200 sold, thanks all',
      'Mae: rates for a january prenup?',
    ],
  }),
  card({
    kind: 'story',
    ...at('23:55'),
    mobile: true,
    title: 'Gino',
    label: 'You replied to their story',
    mine: 'free ka sat? need a vid',
    receipt: 'Seen',
  }),
  card({
    kind: 'search',
    at: WHEN.whichKenn,
    time: clock12(WHEN.whichKenn),
    mobile: true,
    title: 'Contacts',
    query: 'kenn',
    results: ['Kenn SDE?', 'Kenn (Dumaguete wedding)'],
  }),
];

// ─── The "Post a job" form (mobile/app/(app)/jobs/new.tsx) ───────────────

/** The screen's words, in the order the screen draws them. Labels are drawn uppercase by CSS, as the app does. */
export const FORM = {
  title: 'Post a job',
  intro:
    'Everyone on Virgo sees this on the job board, so anyone looking for this kind of work can find it. It is not visible outside the app.',
  titleLabel: 'What do you need?',
  titlePlaceholder: 'Wedding photographer for a December wedding in Cebu',
  titleHint: 'This is the line people scan on the board. Say the role, the place and roughly when.',
  rolesLabel: 'Which roles are you hiring for?',
  rolesHint: 'Pick more than one if the event needs a team — it shows up in each of their searches.',
  dateLabel: 'Date of the job',
  dateEmpty: 'Pick a date (optional)',
  whereLabel: 'Where',
  /** LocationField's own placeholder. */
  wherePlaceholder: 'Cebu City',
  budgetsLabel: 'What each role pays (₱)',
  budgetFrom: 'from 30,000',
  budgetTo: 'up to 45,000',
  budgetHint: 'Optional, but a role with a number gets far better applications.',
  briefLabel: 'The brief',
  briefPlaceholder:
    'What the day looks like, how many hours, what you need delivered and by when. The more specific this is, the fewer wrong applications you get.',
  briefHint: 'A few sentences at least — people are deciding whether to spend their day on this.',
  submit: 'Post it',
  /** The helper under the button once the form is ready, and only then. */
  ready: 'Posts run for 30 days, or until the job date passes.',
} as const;

/** The nine roles the form offers, in the app's order. */
export const FORM_ROLES = ROLES;

/** `joinBlockers`, as `mobile/src/lib/job-form.ts` writes it. */
function joinBlockers(reasons: readonly string[]): string {
  if (reasons.length <= 1) return reasons[0] ?? '';
  return `${reasons.slice(0, -1).join(', ')} and ${reasons[reasons.length - 1]}`;
}

/** What the helper says before the form is ready: the app's own blocker sentence. */
export const STILL_NEEDS = {
  /** Nothing filled in. */
  empty: `Still needs ${joinBlockers(['a title', 'at least one role', 'a brief'])}.`,
  /** Everything but the brief. */
  brief: `Still needs ${joinBlockers(['a brief'])}.`,
} as const;

const pesos = (n: number) => new Intl.NumberFormat('en-US').format(n);

/** The job as Mika types it in. */
export const FILLED = {
  title: JOB.title,
  /** DateTimeField's display: toLocaleDateString('en-US', weekday/month short, day, year). */
  date: new Date(`${WEDDING_DAY}T12:00:00${TZ}`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'Asia/Manila',
  }),
  where: JOB.where,
  budgets: JOB.roles.map((r) => ({ role: r.role, min: pesos(r.min), max: pesos(r.max) })),
  brief: JOB.brief,
  /** The brief's hint once it is 30 characters or more: `${description.length} / 4000`. */
  briefCount: `${JOB.brief.length} / 4000`,
} as const;

/** The page's stamp when the post goes up (not app UI). */
export const POSTED_STAMP = `Posted · ${clock12(WHEN.posted)}`;

// ─── Sources ─────────────────────────────────────────────────────────────

const NEW_JOB = 'mobile/app/(app)/jobs/new.tsx';
const JOB_FORM = 'mobile/src/lib/job-form.ts';

export const SOURCES: readonly SourceEntry[] = [
  { text: FORM.title, file: NEW_JOB, mode: 'verbatim' },
  { text: FORM.intro, file: NEW_JOB, mode: 'verbatim' },
  { text: FORM.titleLabel, file: NEW_JOB, mode: 'fragments', fragments: ['<Field label="What do you need?">'] },
  { text: FORM.titlePlaceholder, file: NEW_JOB, mode: 'verbatim' },
  { text: FORM.titleHint, file: NEW_JOB, mode: 'verbatim' },
  { text: FORM.rolesLabel, file: NEW_JOB, mode: 'fragments', fragments: ['<Field label="Which roles are you hiring for?">'] },
  { text: FORM.rolesHint, file: NEW_JOB, mode: 'verbatim' },
  { text: FORM.dateLabel, file: NEW_JOB, mode: 'fragments', fragments: ['label="Date of the job"'] },
  { text: FORM.dateEmpty, file: NEW_JOB, mode: 'fragments', fragments: ['emptyLabel="Pick a date (optional)"'] },
  { text: FORM.whereLabel, file: NEW_JOB, mode: 'fragments', fragments: ['<Field label="Where">'] },
  { text: FORM.wherePlaceholder, file: 'mobile/components/LocationField.tsx', mode: 'fragments', fragments: ["placeholder = 'Cebu City',"] },
  { text: FORM.budgetsLabel, file: NEW_JOB, mode: 'verbatim' },
  { text: FORM.budgetFrom, file: NEW_JOB, mode: 'fragments', fragments: ['placeholder="from 30,000"'] },
  { text: FORM.budgetTo, file: NEW_JOB, mode: 'fragments', fragments: ['placeholder="up to 45,000"'] },
  { text: FORM.budgetHint, file: NEW_JOB, mode: 'verbatim' },
  { text: FORM.briefLabel, file: NEW_JOB, mode: 'fragments', fragments: ['<Field label="The brief">'] },
  { text: FORM.briefPlaceholder, file: NEW_JOB, mode: 'verbatim' },
  { text: FORM.briefHint, file: NEW_JOB, mode: 'verbatim' },
  { text: FILLED.briefCount, file: NEW_JOB, mode: 'fragments', fragments: ['`${description.length} / 4000`', 'maxLength={4000}', '.length < 30'] },
  { text: FORM.submit, file: NEW_JOB, mode: 'fragments', fragments: [": 'Post it'}"] },
  { text: FORM.ready, file: NEW_JOB, mode: 'verbatim' },
  // The helper before the form is ready, and the order the screen draws it in.
  { text: STILL_NEEDS.empty, file: NEW_JOB, mode: 'fragments', fragments: ['`Still needs ${joinBlockers(blockers)}.`', "? 'Posts run for 30 days, or until the job date passes.'"] },
  { text: STILL_NEEDS.empty, file: JOB_FORM, mode: 'fragments', fragments: ["? 'a title'", "reasons.push('at least one role')", "? 'a brief'", "`${reasons.slice(0, -1).join(', ')} and ${reasons[reasons.length - 1]}`"] },
  { text: STILL_NEEDS.brief, file: JOB_FORM, mode: 'fragments', fragments: ["if (reasons.length <= 1) return reasons[0] ?? '';"] },
  // The date as DateTimeField writes it.
  {
    text: FILLED.date,
    file: 'mobile/components/DateTimeField.tsx',
    mode: 'fragments',
    fragments: ["value.toLocaleDateString('en-US', {", "weekday: 'short',", "month: 'short',", "day: 'numeric',", "year: 'numeric',"],
  },
  // The roles, in the API's order.
  ...ROLES.map((role): SourceEntry => ({ text: role, file: 'api/src/auth/roles.ts', mode: 'fragments', fragments: [`'${role}',`] })),
];
