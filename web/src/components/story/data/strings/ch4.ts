/**
 * Ch4 — The Calendar. The strings its mocks draw: Mika's month grid and day
 * agenda, the event with its crew, the acceptances and the move, the email
 * subject, the New reminder screen and what the reminder says when it rings.
 * The whole chapter is Mika's phone, so the phone app's wording applies
 * ("Who’s coming", "Invited"), never the web's.
 *
 * A zero-import data module (see `../story.ts`): relative imports of other
 * story data modules only, no `@/` aliases, React or packages, so
 * `scripts/check-story.mjs` can load it under plain Node.
 *
 * Every string copied from the app is listed in `SOURCES` with the file it
 * comes from. The reminder's title and notes are Mika's own words, so they
 * are illustrative and have no source; the time it rings is the app's
 * default for a reminder made from a timed event: an hour before.
 */
import { CAST, CLIENT, JOB, NOW, WEDDING_DAY, WHEN } from '../story';
import { JUST_NOW, NOTICES, type SourceEntry, type Topic } from './common';

// ─── Formats the app uses ────────────────────────────────────────────────

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** A `YYYY-MM-DD` key's parts and weekday, with no time zone involved. */
function day(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  // UTC on purpose: only the calendar date matters, and UTC has no DST.
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { y, m: m - 1, d, weekday };
}

/** calendar.ts formatTime: `06:30` -> "6:30 AM". */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':');
  const hour = parseInt(h, 10);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
}

/** The local `HH:MM` of a story instant. */
const hhmm = (iso: string) => iso.slice(11, 16);

/** event-attendees.service.ts formatWhen: "2026-12-12 at 06:00". */
const formatWhen = (date: string, time: string) => `${date} at ${time.slice(0, 5)}`;

const wedding = day(WEDDING_DAY);
const todayKey = NOW.ch4.slice(0, 10);

// ─── The calendar (mobile Schedule tab) ──────────────────────────────────

export const CALENDAR = {
  /** The grid the chapter draws: December 2026, Sunday first. */
  year: wedding.y,
  month: wedding.m,
  /** `{MONTHS[viewMonth]} {viewYear}` */
  title: `${MONTHS_SHORT[wedding.m]} ${wedding.y}`,
  /** `DAYS.map(d => d.slice(0, 2))`, Sunday first. */
  weekdays: WEEKDAYS_SHORT.map((d) => d.slice(0, 2)),
  prev: '‹',
  next: '›',
  full: 'Full',
  /** Friday night, when the chapter looks: the cell the app fills as today. */
  todayKey,
  /** The wedding, which Mika selects. */
  selectedKey: WEDDING_DAY,
} as const;

/** The selected day's heading. The wedding is the day after the chapter's now. */
export const AGENDA = {
  /** labelForDateKey: "Today" for today, "Tomorrow" for the day after. */
  today: 'Today',
  tomorrow: 'Tomorrow',
  link: 'Agenda',
  /** Friday itself has nothing on it. */
  empty: 'No events on this day',
  addEvent: 'Add event',
} as const;

// ─── The event ───────────────────────────────────────────────────────────

const before = hhmm(WHEN.eventBefore);
const after = hhmm(WHEN.eventAfter);

export const EVENT = {
  /** Mika's title for it (illustrative). */
  title: CLIENT.event,
  /** eventTypeLabel for event_type 'event'; the detail screen draws it uppercase. */
  type: 'Event',
  /** formatDateFull: weekday, month, day and year, long. */
  date: `${WEEKDAYS_LONG[wedding.weekday]}, ${MONTHS_LONG[wedding.m]} ${wedding.d}, ${wedding.y}`,
  /** The call time before and after Friday night's move. */
  timeBefore: formatTime(before),
  timeAfter: formatTime(after),
  location: JOB.where,
  labels: { date: 'Date', time: 'Time', where: 'Where' },
  reminders: 'Reminders',
  add: 'Add',
  noReminders: 'No reminders set',
  /** The reminder row's push chip. */
  push: 'PUSH',
} as const;

/**
 * The call time as the roll draws it: the hour and the two minute faces, so a
 * stage can roll 30 -> 00 under a fixed "6:" and " AM".
 */
export const CALL_ROLL = (() => {
  const [b, a] = [EVENT.timeBefore, EVENT.timeAfter].map((t) => /^(\d+:)(\d\d)( [AP]M)$/.exec(t)!);
  if (b[1] !== a[1] || b[3] !== a[3]) throw new Error('the call time roll assumes the same hour');
  return { hour: b[1], from: b[2], to: a[2], suffix: b[3] } as const;
})();

// ─── The crew (mobile EventInvites) ──────────────────────────────────────

export type Guest = 'ernie' | 'kenn' | 'bea';
/** In the order Mika invited them. */
export const GUESTS: readonly Guest[] = ['ernie', 'kenn', 'bea'];
export const GUEST_NAME: Record<Guest, string> = {
  ernie: CAST.ernie.name,
  kenn: CAST.kenn.name,
  bea: CAST.bea.name,
};

export const ATTENDEES = {
  heading: 'Who’s coming',
  invite: 'Invite',
  status: { pending: 'Invited', accepted: 'Going', declined: 'Not going' },
  color: { pending: '#A89489', accepted: '#6B8E4E', declined: '#C4776A' },
} as const;

/** An invitation's state, as the API stores it. */
export type AttendeeStatus = 'pending' | 'accepted' | 'declined';

const byText = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);

/**
 * The guest list after the first `going` of the crew have said yes (they
 * answer in invitation order), in the order the phone draws it.
 *
 * The phone draws the list exactly as the API sends it, and the API sorts
 * with `order by a.status, name`. The status is a text column, so everyone
 * going ('accepted') comes before everyone still invited ('pending'), each
 * group by name. The list reshuffles as people answer: Bea, Ernie, Kenn while
 * all three are invited; Ernie first once he says yes; Bea, Ernie, Kenn again
 * once everyone is going.
 */
export function guestList(going: number): { guest: Guest; status: AttendeeStatus }[] {
  const said = new Set(GUESTS.slice(0, going));
  return GUESTS.map((guest) => ({
    guest,
    status: (said.has(guest) ? 'accepted' : 'pending') as AttendeeStatus,
  })).sort((a, b) => byText(a.status, b.status) || byText(GUEST_NAME[a.guest], GUEST_NAME[b.guest]));
}

/**
 * AttendeeSummary's line for an agenda row: names, not a count, until more
 * than one is going.
 */
export function attendeeLine(going: readonly string[], waiting: number): string {
  const head =
    going.length === 0
      ? `${waiting} awaiting a reply`
      : going.length === 1
        ? `${going[0].split(' ')[0]} is going`
        : `${going.length} going`;
  return `${head}${going.length > 0 && waiting > 0 ? ` · ${waiting} pending` : ''}`;
}

// ─── Notifications ───────────────────────────────────────────────────────

type Notice = { topic: Topic; title: string; body: string; time: string };

const acceptedBy = (guest: Guest): Notice => ({
  topic: 'event-response',
  title: `${GUEST_NAME[guest]} accepted your invitation`,
  body: CLIENT.event,
  time: JUST_NOW,
});

export const NOTICES_CH4 = {
  /** Mika's, as each of the crew says yes. */
  acceptedErnie: acceptedBy('ernie'),
  acceptedKenn: acceptedBy('kenn'),
  acceptedBea: acceptedBy('bea'),
  /** The crew's, when Mika moves the call time (proven in common.ts). */
  moved: NOTICES.callMoved,
} as const satisfies Record<string, Notice>;

/** What the email the crew gets says in an inbox (generic inbox chrome). */
export const EMAIL = {
  /** MAIL_FROM_NAME's default. */
  from: 'Virgo',
  subject: `Moved: ${CLIENT.event} is now ${formatWhen(WEDDING_DAY, after)}`,
  /** When it arrives, with the in-app notice: Friday, 9:20 PM. */
  time: formatTime(hhmm(WHEN.moved)),
} as const;

// ─── The reminder (mobile New reminder) ──────────────────────────────────

const reminderTime = formatTime(hhmm(WHEN.reminder));

export const REMINDER_FORM = {
  heading: 'New reminder',
  /** `for {event.title}`, under the heading when it is made from an event. */
  forEvent: `for ${CLIENT.event}`,
  title: 'Title',
  titlePlaceholder: 'e.g. Pack lighting kit',
  notes: 'Notes',
  optional: '(optional)',
  notesPlaceholder: 'Anything worth remembering...',
  date: 'Date',
  time: 'Time',
  /** DateTimeField's date: weekday, month and day short, with the year. */
  dateValue: `${WEEKDAYS_SHORT[wedding.weekday]}, ${MONTHS_SHORT[wedding.m]} ${wedding.d}, ${wedding.y}`,
  /** An hour before the 6:00 call, which is where the app starts a new reminder. */
  timeValue: reminderTime,
  alerts: 'Alerts',
  alarm: 'Alarm',
  alarmHint: 'Play a sound at the reminder time',
  push: 'Push notification',
  pushHint: 'Send a notification to this device',
  cancel: 'Cancel',
  create: 'Create reminder',
} as const;

/** Mika's reminder (illustrative): what she types, and so what rings. */
export const REMINDER = {
  title: 'Leave for the hotel',
  notes: `Call time ${formatTime(hhmm(WHEN.call)).replace(/ [AP]M$/, '')}. Cards, batteries, the second flash.`,
  time: reminderTime,
} as const;

/**
 * The notification the phone shows at 5:00 AM: the reminder's title, and its
 * notes as the body ("Reminder" when there are none).
 */
export const RINGS = { title: REMINDER.title, body: REMINDER.notes } as const;

// ─── Sources ─────────────────────────────────────────────────────────────

const CAL = 'web/src/lib/calendar.ts';
const SCHEDULE = 'mobile/app/(app)/(tabs)/schedule.tsx';
const DETAIL = 'mobile/app/(app)/schedule/[eventId].tsx';
const INVITES = 'mobile/components/EventInvites.tsx';
const ATTENDEES_API = 'api/src/schedule-events/event-attendees.service.ts';
const CREATE = 'mobile/app/(app)/schedule/reminders/create.tsx';
const FIELD = 'mobile/components/DateTimeField.tsx';

export const SOURCES: readonly SourceEntry[] = [
  // The calendar.
  {
    text: CALENDAR.title,
    file: CAL,
    mode: 'fragments',
    fragments: ["'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',", 'export const WEEK_STARTS_ON = 0; // Sunday'],
  },
  { text: CALENDAR.title, file: SCHEDULE, mode: 'fragments', fragments: ['{MONTHS[viewMonth]} {viewYear}'] },
  {
    file: CAL,
    mode: 'fragments',
    fragments: ["const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];"],
  },
  { file: SCHEDULE, mode: 'fragments', fragments: ['{d.slice(0,2)}', '>‹</Text>', '>›</Text>'] },
  { text: CALENDAR.full, file: SCHEDULE, mode: 'fragments', fragments: ['font-semibold">Full</Text>'] },
  { text: AGENDA.today, file: CAL, mode: 'fragments', fragments: ["return 'Today';"] },
  { text: AGENDA.tomorrow, file: CAL, mode: 'fragments', fragments: ["return 'Tomorrow';"] },
  { text: AGENDA.link, file: SCHEDULE, mode: 'fragments', fragments: ['font-semibold">Agenda</Text>'] },
  { text: AGENDA.empty, file: SCHEDULE, mode: 'verbatim' },
  { text: AGENDA.addEvent, file: SCHEDULE, mode: 'verbatim' },

  // The event.
  {
    text: EVENT.type,
    file: CAL,
    mode: 'fragments',
    fragments: ["event: '#B66A40',", 'return type.charAt(0).toUpperCase() + type.slice(1);'],
  },
  { text: EVENT.timeBefore, file: CAL, mode: 'fragments', fragments: ['return `${h12}:${m} ${ampm}`;'] },
  {
    text: EVENT.date,
    file: DETAIL,
    mode: 'fragments',
    fragments: ["toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })"],
  },
  { text: EVENT.labels.date, file: DETAIL, mode: 'fragments', fragments: ['font-semibold uppercase">Date</Text>'] },
  { text: EVENT.labels.time, file: DETAIL, mode: 'fragments', fragments: ['font-semibold uppercase">Time</Text>'] },
  { text: EVENT.labels.where, file: DETAIL, mode: 'fragments', fragments: ['font-semibold uppercase">Where</Text>'] },
  { file: DETAIL, mode: 'fragments', fragments: ["textTransform: event.event_type_other ? 'none' : 'uppercase'"] },
  { text: EVENT.reminders, file: DETAIL, mode: 'fragments', fragments: ['tracking-tight">Reminders</Text>'] },
  { text: EVENT.add, file: DETAIL, mode: 'fragments', fragments: ['font-semibold">Add</Text>'] },
  { text: EVENT.noReminders, file: DETAIL, mode: 'verbatim' },
  { text: EVENT.push, file: DETAIL, mode: 'fragments', fragments: [">PUSH</Text>"] },

  // The crew.
  { text: ATTENDEES.heading, file: INVITES, mode: 'verbatim' },
  { text: ATTENDEES.invite, file: INVITES, mode: 'fragments', fragments: ["{picking ? 'Close' : 'Invite'}"] },
  {
    file: INVITES,
    mode: 'fragments',
    fragments: [
      "pending: 'Invited',",
      "accepted: 'Going',",
      "declined: 'Not going',",
      "pending: '#A89489',",
      "accepted: '#6B8E4E',",
      "declined: '#C4776A',",
      'return name.trim().slice(0, 2).toUpperCase();',
    ],
  },
  // The list's order: the API sorts by status (a text column), then name, and
  // the phone draws what it is sent.
  { file: ATTENDEES_API, mode: 'fragments', fragments: ['order by a.status, name'] },
  {
    file: 'api/migrations/026_event_attendees.sql',
    mode: 'fragments',
    fragments: ["status text not null default 'pending'", "check (status in ('pending', 'accepted', 'declined'))"],
  },
  { file: 'mobile/src/hooks/useScheduleEvents.ts', mode: 'fragments', fragments: ['attendees: query.data?.data ?? [],'] },
  { file: INVITES, mode: 'fragments', fragments: ['{attendees.map((person, i) => (', "const going = attendees.filter((a) => a.status === 'accepted');"] },
  {
    text: attendeeLine([], 3),
    file: INVITES,
    mode: 'fragments',
    fragments: [
      '`${waiting} awaiting a reply`',
      "`${going[0].name.split(' ')[0]} is going`",
      '`${going.length} going`',
      "{going.length > 0 && waiting > 0 ? ` · ${waiting} pending` : ''}",
    ],
  },

  // The notifications and the email.
  {
    text: NOTICES_CH4.acceptedErnie.title,
    file: ATTENDEES_API,
    mode: 'fragments',
    fragments: [
      "`${meta?.name ?? 'Someone'} ${status} your invitation`",
      "body: meta?.title ?? 'Event',",
      "export type AttendeeStatus = 'pending' | 'accepted' | 'declined';",
    ],
  },
  {
    text: EMAIL.subject,
    file: 'api/src/mail/mail.templates.ts',
    mode: 'fragments',
    fragments: ['`Moved: ${options.eventTitle} is now ${options.when}`'],
  },
  { text: EMAIL.subject, file: ATTENDEES_API, mode: 'fragments', fragments: ['`${date} at ${time.slice(0, 5)}`'] },
  {
    text: EMAIL.from,
    file: 'api/src/mail/mail.config.ts',
    mode: 'fragments',
    fragments: ["config.get<string>('MAIL_FROM_NAME', 'Virgo')"],
  },

  // The New reminder screen.
  { text: REMINDER_FORM.heading, file: CREATE, mode: 'fragments', fragments: ["{isEdit ? 'Edit reminder' : 'New reminder'}"] },
  { text: REMINDER_FORM.forEvent, file: CREATE, mode: 'fragments', fragments: ['for {event.title}'] },
  { text: REMINDER_FORM.title, file: CREATE, mode: 'fragments', fragments: ['mb-2 ml-1">Title</Text>'] },
  { text: REMINDER_FORM.titlePlaceholder, file: CREATE, mode: 'verbatim' },
  {
    text: REMINDER_FORM.notes,
    file: CREATE,
    mode: 'fragments',
    fragments: ['Notes <Text className="font-medium normal-case tracking-normal">(optional)</Text>'],
  },
  { text: REMINDER_FORM.notesPlaceholder, file: CREATE, mode: 'verbatim' },
  {
    text: REMINDER_FORM.date,
    file: CREATE,
    mode: 'fragments',
    fragments: ['label="Date" mode="date"', 'label="Time" mode="time"'],
  },
  {
    text: REMINDER_FORM.dateValue,
    file: FIELD,
    mode: 'fragments',
    fragments: ["weekday: 'short',", "month: 'short',", "day: 'numeric',", "year: 'numeric',"],
  },
  {
    text: REMINDER_FORM.timeValue,
    file: FIELD,
    mode: 'fragments',
    fragments: ["value.toLocaleTimeString('en-US', {", "hour: 'numeric',", "minute: '2-digit',"],
  },
  {
    text: REMINDER_FORM.timeValue,
    file: CREATE,
    mode: 'fragments',
    fragments: ['before.setHours(before.getHours() - 1);'],
  },
  { text: REMINDER_FORM.alerts, file: CREATE, mode: 'fragments', fragments: ['mb-3 ml-1">Alerts</Text>'] },
  { text: REMINDER_FORM.alarm, file: CREATE, mode: 'fragments', fragments: ['font-semibold">Alarm</Text>'] },
  { text: REMINDER_FORM.alarmHint, file: CREATE, mode: 'verbatim' },
  { text: REMINDER_FORM.push, file: CREATE, mode: 'fragments', fragments: ['font-semibold">Push notification</Text>'] },
  { text: REMINDER_FORM.pushHint, file: CREATE, mode: 'verbatim' },
  { text: REMINDER_FORM.cancel, file: CREATE, mode: 'fragments', fragments: ['font-bold">Cancel</Text>'] },
  { text: REMINDER_FORM.create, file: CREATE, mode: 'fragments', fragments: ["'Create reminder'"] },

  // What rings.
  {
    text: RINGS.body,
    file: 'mobile/src/lib/notifications.ts',
    mode: 'fragments',
    fragments: ['title: reminder.title,', "body: reminder.description ?? 'Reminder',"],
  },
];
