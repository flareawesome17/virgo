/**
 * Ch3 — Connect. The strings its mocks draw: the poster's applicant rows, the
 * hired-terms card on both sides, the booking badge, the crew's group thread,
 * and the chapter's notifications.
 *
 * A zero-import data module (see `../story.ts`): relative imports of other
 * story data modules only, no `@/` aliases, React or packages, so
 * `scripts/check-story.mjs` can load it under plain Node.
 *
 * Every string copied from the app is listed in `SOURCES` with the file it
 * comes from, so the check fails the moment the app's wording drifts. Names,
 * the job and the thread's two lines are the story's own (illustrative) and
 * come from `story.ts` or are marked as such below.
 */
import { CAST, CLIENT, HIRED, JOB, WEDDING_DAY } from '../story';
import { JUST_NOW, type SourceEntry, type Topic } from './common';

// ─── Formats the app uses (copied: their modules import the HTTP client) ──

/**
 * Whole pesos, as both `budgetLabel` (jobs) and `rateLabel` (bookings) print
 * them: "₱25,000". rateLabel goes through Intl en-PH; for whole pesos that is
 * the same string, and this form needs no locale data.
 */
export const peso = (n: number) => `₱${n.toLocaleString('en-US')}`;

/**
 * The wedding as `new Date(`${date}T12:00:00`).toLocaleDateString()` prints
 * it on an en-US or en-PH device: "12/12/2026". Built from parts so it cannot
 * depend on the server's locale or time zone.
 */
const [wy, wm, wd] = WEDDING_DAY.split('-').map(Number);
export const TERMS_DATE = `${wm}/${wd}/${wy}`;

/** "1:04 AM" for a story instant, read from its local (+08:00) clock. */
export function clock12(iso: string): string {
  const [h, m] = iso.slice(11, 16).split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

// ─── The three hires ─────────────────────────────────────────────────────

export type Hire = 'ernie' | 'kenn' | 'bea';
export const HIRES: readonly Hire[] = ['ernie', 'kenn', 'bea'];

/** What the poster's row and the booking print for each person hired. */
export const APPLICANT: Record<Hire, { name: string; roles: string; role: string; rate: string }> = {
  ernie: {
    name: CAST.ernie.name,
    roles: CAST.ernie.roles.join(', '),
    role: HIRED.ernie.role,
    rate: peso(HIRED.ernie.rate),
  },
  kenn: {
    name: CAST.kenn.name,
    roles: CAST.kenn.roles.join(', '),
    role: HIRED.kenn.role,
    rate: peso(HIRED.kenn.rate),
  },
  bea: {
    name: CAST.bea.name,
    roles: CAST.bea.roles.join(', '),
    role: HIRED.bea.role,
    rate: peso(HIRED.bea.rate),
  },
};

// ─── The poster's post and applicants (web jobs/mine) ────────────────────

const budget = `${peso(Math.min(...JOB.roles.map((r) => r.min)))} – ${peso(Math.max(...JOB.roles.map((r) => r.max)))}`;

export const JOB_ROW = {
  title: JOB.title,
  /** `[location, budgetLabel(min, max), `${n} applied`].join(' · ')` */
  meta: [JOB.where, budget, `${HIRES.length} applied`].join(' · '),
  status: 'Open',
  /** The role badges' second half: `{role} · {filled ? 'filled' : 'open'}`. */
  open: 'open',
  filled: 'filled',
  applicants: `${HIRES.length} applicant${HIRES.length === 1 ? '' : 's'}`,
  viewPost: 'View post',
  markFilled: 'Mark filled',
  close: 'Close',
} as const;

/** The pill beside the applicant count: "2 new". */
export const newPill = (n: number) => `${n} new`;

/** The phone's post row adds Edit beside Mark filled and Close (mobile JobsTabs). */
export const JOB_ROW_PHONE = { edit: 'Edit' } as const;

export const APPLICANT_ROW = {
  seeWork: 'See their work',
  accept: 'Accept',
  shortlist: 'Shortlist',
  decline: 'Decline',
  openChat: 'Open chat',
  /**
   * The status badge the poster's row prints once they answer. It is the raw
   * status, lowercase: the "Accepted" label in application-state.tsx is the
   * applicant's own view, not this row.
   */
  accepted: 'accepted',
} as const;

// ─── The booking (compact card on web, link on the phone) ────────────────

export const BOOKING = {
  title: 'Booking',
  label: { waiting: 'Waiting on them', 'needs-you': 'Needs you', agreed: 'Agreed' },
  /** The detail line, per side. Also the chat card's state line. */
  detail: {
    poster: { waiting: 'They have not confirmed these terms yet.', agreed: 'They confirmed these terms.' },
    creative: {
      'needs-you': 'They set these terms. Confirm them, or say so in the chat.',
      agreed: 'You confirmed these terms.',
    },
  },
  /** The phone's poster-side link: "Booking · waiting on them". */
  phone: {
    waiting: 'Booking · waiting on them',
    'needs-you': 'Booking · needs you',
    agreed: 'Booking · agreed',
  },
} as const;

// ─── The hired-terms card (the chat's first message) ─────────────────────

export const TERMS = {
  /** `Hired as ${role}`; the app draws it uppercase with CSS. */
  hiredAs: (hire: Hire) => `Hired as ${HIRED[hire].role}`,
  postTitle: JOB.title,
  date: 'Date',
  location: 'Location',
  rate: 'Rate',
  dateValue: TERMS_DATE,
  locationValue: JOB.where,
  confirm: 'Confirm these terms',
  viewBooking: 'View booking',
  changeTerms: 'Change the terms',
  foot: 'A record of what you agreed, not a legal contract.',
  footCreative: 'Only they can change these terms — if something is not right, say so here.',
  footPoster: 'Changing anything clears their confirmation, so you cannot alter agreed terms on your own.',
} as const;

/** The eyebrow for Ernie, the hire the chapter follows: "Hired as Videographer". */
export const HIRED_AS_ERNIE = TERMS.hiredAs('ernie');

// ─── The crew's group thread (phone) ─────────────────────────────────────

/**
 * Illustrative times: Mika writes to the crew a few minutes after the last
 * acceptance, and Kenn answers.
 */
const SENT_AT = '2026-12-10T01:04:00+08:00';
const REPLY_AT = '2026-12-10T01:06:00+08:00';

/** The crew and Mika, ordered by name as the API returns participants. */
const MEMBERS = [CAST.mika, CAST.ernie, CAST.kenn, CAST.bea].map((c) => c.name).sort((x, y) => x.localeCompare(y));

export const THREAD = {
  /** The group's own name, which Mika gave it (illustrative). */
  title: CLIENT.thread,
  /** Everyone in it, the viewer included. */
  members: MEMBERS.join(', '),
  placeholder: 'Message — use @ to mention',
  /** A direct chat's placeholder (Ernie's chat with Mika). */
  placeholderDirect: 'Message',
  sending: 'Sending…',
  /** The names a mention can match, as the app matches them. */
  mentionable: [CAST.mika.name, CAST.ernie.name, CAST.kenn.name, CAST.bea.name],
  /** Mika's message (illustrative). */
  ask: { from: CAST.mika.name, body: `@${CAST.kenn.first} SDE by 9 PM?`, time: clock12(SENT_AT) },
  /** Kenn's reply to it (illustrative; plain English per the storyboard). */
  reply: { from: CAST.kenn.name, body: 'Sure.', time: clock12(REPLY_AT) },
  /** The other members, for the read count: "3" once all of them have read it. */
  others: MEMBERS.length - 1,
} as const;

/** Ernie's direct chat with Mika, where the hired-terms card arrives. */
export const DIRECT = { title: CAST.mika.name } as const;

// ─── Notifications ───────────────────────────────────────────────────────

type Notice = { topic: Topic; title: string; body: string; time: string };

const applied = (hire: Hire): Notice => ({
  topic: 'job-application',
  title: 'New application',
  body: `${CAST[hire].name} applied as ${HIRED[hire].role} for “${JOB.title}”`,
  time: JUST_NOW,
});

export const NOTICES_CH3 = {
  /** Mika's, as each application arrives. */
  appliedErnie: applied('ernie'),
  appliedKenn: applied('kenn'),
  appliedBea: applied('bea'),
  /** Ernie's, when Mika accepts him. */
  accepted: {
    topic: 'job-response',
    title: 'Application accepted',
    body: `${CAST.mika.name} accepted your application for “${JOB.title}”`,
    time: JUST_NOW,
  },
  /** Mika's, when the last role is filled and nobody is left waiting. */
  filled: {
    topic: 'job-application',
    title: 'Every role is filled',
    body: `“${JOB.title}” is fully staffed and has left the board.`,
    time: JUST_NOW,
  },
} as const satisfies Record<string, Notice>;

// ─── Sources ─────────────────────────────────────────────────────────────

const MINE = 'web/src/app/(app)/jobs/mine/page-client.tsx';
const JOBS_API = 'web/src/api/endpoints/jobs.ts';
const BOOKINGS_API = 'web/src/api/endpoints/bookings.ts';
const BOOKING_CARD = 'web/src/components/jobs/booking-card.tsx';
const JOBS_TABS = 'mobile/components/JobsTabs.tsx';
const CARD_PHONE = 'mobile/components/JobAcceptedCard.tsx';
const CARD_WEB = 'web/src/components/chat/job-accepted-card.tsx';
const CHAT_PHONE = 'mobile/app/(app)/chat/[id]/index.tsx';
const HIRING = 'api/src/hiring/hiring.service.ts';

const both = (text: string): SourceEntry[] => [
  { text, file: CARD_PHONE, mode: 'verbatim' },
  { text, file: CARD_WEB, mode: 'verbatim' },
];

export const SOURCES: readonly SourceEntry[] = [
  // The post row.
  { text: JOB_ROW.status, file: MINE, mode: 'fragments', fragments: ["open: 'Open',"] },
  {
    text: JOB_ROW.meta,
    file: MINE,
    mode: 'fragments',
    fragments: ['[job.location, budget, `${job.applicantCount} applied`]', ".join(' · ')"],
  },
  {
    file: JOBS_API,
    mode: 'fragments',
    fragments: ["`₱${Math.round(centavos / 100).toLocaleString('en-US')}`", '`${peso(min)} – ${peso(max)}`'],
  },
  { text: JOB_ROW.open, file: MINE, mode: 'fragments', fragments: ["{role} · {filled ? 'filled' : 'open'}"] },
  {
    text: JOB_ROW.applicants,
    file: MINE,
    mode: 'fragments',
    fragments: ["`${job.applicantCount} applicant${job.applicantCount === 1 ? '' : 's'}`"],
  },
  { file: MINE, mode: 'fragments', fragments: ['{job.newApplicantCount} new'] },
  { text: JOB_ROW.viewPost, file: MINE, mode: 'verbatim' },
  { text: JOB_ROW.markFilled, file: MINE, mode: 'verbatim' },
  { text: JOB_ROW.close, file: MINE, mode: 'verbatim' },

  // An applicant.
  { file: MINE, mode: 'fragments', fragments: ["{app.personRoles.join(', ') || 'No roles listed'}"] },
  { text: APPLICANT_ROW.seeWork, file: MINE, mode: 'verbatim' },
  { text: APPLICANT_ROW.accept, file: MINE, mode: 'verbatim' },
  { text: APPLICANT_ROW.shortlist, file: MINE, mode: 'verbatim' },
  { text: APPLICANT_ROW.decline, file: MINE, mode: 'verbatim' },
  { text: APPLICANT_ROW.openChat, file: MINE, mode: 'verbatim' },
  {
    text: APPLICANT_ROW.accepted,
    file: MINE,
    mode: 'fragments',
    fragments: ["<Badge variant={app.status === 'accepted' ? 'default' : 'secondary'}>", '{app.status}'],
  },
  { text: APPLICANT_ROW.accepted, file: JOBS_API, mode: 'fragments', fragments: ["| 'accepted'"] },

  // The same post and applicants on the phone (mobile JobsTabs: Posted).
  {
    text: JOB_ROW.meta,
    file: JOBS_TABS,
    mode: 'fragments',
    fragments: ["{[job.location, budget, `${job.applicantCount} applied`].filter(Boolean).join(' · ')}"],
  },
  { text: JOB_ROW.status, file: JOBS_TABS, mode: 'fragments', fragments: ["open: 'Open',"] },
  { text: JOB_ROW.open, file: JOBS_TABS, mode: 'fragments', fragments: ["{r} · {filled ? 'filled' : 'open'}"] },
  {
    text: JOB_ROW.applicants,
    file: JOBS_TABS,
    mode: 'fragments',
    fragments: ["`${job.applicantCount} applicant${job.applicantCount === 1 ? '' : 's'}`", '{job.newApplicantCount} new'],
  },
  // JSX text on its own line: the check matches it with the whitespace collapsed.
  { text: JOB_ROW_PHONE.edit, file: JOBS_TABS, mode: 'fragments', fragments: ['Edit </Text>'] },
  { text: JOB_ROW.markFilled, file: JOBS_TABS, mode: 'fragments', fragments: ['Mark filled </Text>'] },
  { text: JOB_ROW.close, file: JOBS_TABS, mode: 'fragments', fragments: ['Close </Text>'] },
  { file: JOBS_TABS, mode: 'fragments', fragments: ["{app.personRoles.join(', ') || 'No roles listed'}"] },
  { text: APPLICANT_ROW.seeWork, file: JOBS_TABS, mode: 'verbatim' },
  { text: APPLICANT_ROW.accept, file: JOBS_TABS, mode: 'fragments', fragments: ['font-bold">Accept</Text>'] },
  { text: APPLICANT_ROW.shortlist, file: JOBS_TABS, mode: 'fragments', fragments: ['font-semibold">Shortlist</Text>'] },
  { text: APPLICANT_ROW.decline, file: JOBS_TABS, mode: 'fragments', fragments: ['text-[12px]">Decline</Text>'] },
  { text: APPLICANT_ROW.openChat, file: JOBS_TABS, mode: 'verbatim' },
  {
    text: APPLICANT_ROW.accepted,
    file: JOBS_TABS,
    mode: 'fragments',
    fragments: ['<Text className="text-[10px] font-bold uppercase"', "{app.status}"],
  },

  // The booking.
  {
    text: BOOKING.title,
    file: BOOKING_CARD,
    mode: 'fragments',
    fragments: ['<FileText className="size-3.5 text-muted-foreground" /> Booking'],
  },
  { text: BOOKING.label.agreed, file: BOOKING_CARD, mode: 'fragments', fragments: ["label: 'Agreed',"] },
  { text: BOOKING.label.waiting, file: BOOKING_CARD, mode: 'fragments', fragments: ["label: 'Waiting on them',"] },
  { text: BOOKING.label['needs-you'], file: BOOKING_CARD, mode: 'fragments', fragments: ["label: 'Needs you',"] },
  { text: BOOKING.detail.poster.waiting, file: BOOKING_CARD, mode: 'verbatim' },
  { text: BOOKING.detail.poster.agreed, file: BOOKING_CARD, mode: 'verbatim' },
  { text: BOOKING.detail.creative['needs-you'], file: BOOKING_CARD, mode: 'verbatim' },
  { text: BOOKING.detail.creative.agreed, file: BOOKING_CARD, mode: 'verbatim' },
  {
    text: TERMS_DATE,
    file: BOOKING_CARD,
    mode: 'fragments',
    fragments: ['new Date(`${booking.eventDate}T12:00:00`).toLocaleDateString()'],
  },
  {
    text: APPLICANT.ernie.rate,
    file: BOOKINGS_API,
    mode: 'fragments',
    fragments: ["new Intl.NumberFormat('en-PH', {", 'maximumFractionDigits: 0,'],
  },
  {
    text: BOOKING.phone.waiting,
    file: JOBS_TABS,
    mode: 'fragments',
    fragments: ['Booking · {booking.cancelledAt', "? 'agreed'", "? 'waiting on them'", ": 'needs you'}"],
  },

  // The hired-terms card, on both platforms.
  { text: HIRED_AS_ERNIE, file: CARD_PHONE, mode: 'fragments', fragments: ['`Hired as ${context.role}`'] },
  { text: HIRED_AS_ERNIE, file: CARD_WEB, mode: 'fragments', fragments: ['`Hired as ${context.role}`'] },
  { text: TERMS.date, file: CARD_PHONE, mode: 'fragments', fragments: ['label="Date"'] },
  { text: TERMS.location, file: CARD_PHONE, mode: 'fragments', fragments: ['label="Location"'] },
  { text: TERMS.rate, file: CARD_PHONE, mode: 'fragments', fragments: ['label="Rate"'] },
  { text: TERMS.date, file: CARD_WEB, mode: 'fragments', fragments: ['<Row label="Date">'] },
  { text: TERMS.location, file: CARD_WEB, mode: 'fragments', fragments: ['<Row label="Location">'] },
  { text: TERMS.rate, file: CARD_WEB, mode: 'fragments', fragments: ['<Row label="Rate" strong>'] },
  {
    text: TERMS_DATE,
    file: CARD_PHONE,
    mode: 'fragments',
    fragments: ['new Date(`${booking.eventDate}T12:00:00`).toLocaleDateString()'],
  },
  { text: BOOKING.detail.creative['needs-you'], file: CARD_PHONE, mode: 'verbatim' },
  { text: BOOKING.detail.creative.agreed, file: CARD_PHONE, mode: 'verbatim' },
  { text: BOOKING.detail.poster.waiting, file: CARD_PHONE, mode: 'verbatim' },
  { text: BOOKING.detail.poster.agreed, file: CARD_PHONE, mode: 'verbatim' },
  ...both(TERMS.confirm),
  ...both(TERMS.viewBooking),
  ...both(TERMS.changeTerms),
  ...both(TERMS.foot),
  ...both(TERMS.footCreative),
  ...both(TERMS.footPoster),

  // The thread.
  {
    text: THREAD.placeholder,
    file: CHAT_PHONE,
    mode: 'fragments',
    fragments: ["placeholder={isGroup ? 'Message — use @ to mention' : 'Message'}"],
  },
  { text: THREAD.sending, file: CHAT_PHONE, mode: 'verbatim' },
  {
    text: THREAD.members,
    file: CHAT_PHONE,
    mode: 'fragments',
    fragments: ["{participants.map((p) => p.name).join(', ')}"],
  },
  { file: 'api/src/messages/messages.service.ts', mode: 'fragments', fragments: ['order by name'] },
  {
    text: THREAD.ask.time,
    file: CHAT_PHONE,
    mode: 'fragments',
    fragments: ["toLocaleTimeString('en-US', {", "hour: 'numeric',", "minute: '2-digit',"],
  },

  // The notifications, as the API writes them.
  { text: NOTICES_CH3.appliedErnie.title, file: HIRING, mode: 'fragments', fragments: ["title: 'New application',"] },
  {
    text: NOTICES_CH3.appliedErnie.body,
    file: HIRING,
    mode: 'fragments',
    fragments: ['`${name} applied as ${role} for “${post.title}”`'],
  },
  { text: NOTICES_CH3.accepted.title, file: HIRING, mode: 'fragments', fragments: ["title: 'Application accepted',"] },
  {
    text: NOTICES_CH3.accepted.body,
    file: HIRING,
    mode: 'fragments',
    fragments: [' accepted your application for “${row.post_title}”`'],
  },
  { text: NOTICES_CH3.filled.title, file: HIRING, mode: 'fragments', fragments: ["title: 'Every role is filled',"] },
  {
    text: NOTICES_CH3.filled.body,
    file: HIRING,
    mode: 'fragments',
    fragments: ['`“${row.post_title}” is fully staffed and has left the board.`'],
  },
];
