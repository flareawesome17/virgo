/**
 * The story the virgo.ph page tells: one wedding crew, from Mika's 11:42 PM
 * panic to the night the files are cleaned up.
 *
 * Everything counted, dated or named on the page lives here, so the page,
 * the stills and the videos cannot tell different numbers. It is a zero-import
 * module on purpose: `marketing-assets/` (Remotion) imports it by relative
 * path, and so does `scripts/check-story.mjs`, which runs it under plain Node.
 * No `@/` aliases, no React, no packages — relative imports of other story
 * data modules only.
 *
 * All of it is illustrative. The people are invented (first names only, so no
 * real member is implied), and nothing here is client work.
 *
 * Per-chapter UI strings live beside this file in `strings/`, each one tied
 * to the app source it copies so the string check can catch drift.
 */

/** Philippine time. Every timestamp below is local to Cebu City. */
export const TZ = '+08:00';

const at = (local: string) => `${local}${TZ}`;

// ─── Cast ────────────────────────────────────────────────────────────────

/** A compass bearing in degrees (0 = north) and a distance from Mika. */
export type Offset = { km: number; bearing: number };

export type CastMember = {
  id: 'mika' | 'ernie' | 'kenn' | 'bea';
  /** As the app shows it. Mika is the only one with a surname: she is the account holder in every frame. */
  name: string;
  first: string;
  roles: readonly string[];
  /** The star this person becomes when the Virgo figure forms in Ch3. */
  star: 'alpha' | 'gamma' | 'epsilon' | 'zeta';
  /** Where they are, relative to Mika. Bearings keep everyone on land. */
  offset: Offset;
};

export const CAST = {
  mika: {
    id: 'mika',
    name: 'Mika Dizon',
    first: 'Mika',
    roles: ['Photographer'],
    star: 'alpha',
    offset: { km: 0, bearing: 0 },
  },
  ernie: {
    id: 'ernie',
    name: 'Ernie',
    first: 'Ernie',
    roles: ['Photographer', 'Videographer'],
    star: 'gamma',
    offset: { km: 2, bearing: 350 },
  },
  kenn: {
    id: 'kenn',
    name: 'Kenn',
    first: 'Kenn',
    roles: ['Video Editor', 'SDE Editor Video'],
    star: 'epsilon',
    offset: { km: 2, bearing: 280 },
  },
  bea: {
    id: 'bea',
    name: 'Bea',
    first: 'Bea',
    roles: ['HMUA'],
    star: 'zeta',
    offset: { km: 8, bearing: 320 },
  },
} as const satisfies Record<string, CastMember>;

/** Ernie is hired as the videographer, though he shoots stills on the day too. */
export const HIRED = {
  ernie: { role: 'Videographer', rate: 25_000 },
  kenn: { role: 'SDE Editor Video', rate: 15_000 },
  bea: { role: 'HMUA', rate: 10_000 },
} as const;

/** Mika's home city, where the camera lands. */
export const HOME = { city: 'Cebu City', lat: 10.3157, lon: 123.8854 } as const;

export const CLIENT = {
  /** The album, as named in the app and on the client page. */
  album: 'Reyes & Santos — Wedding',
  /** The event, as named on the calendar. */
  event: 'Reyes & Santos wedding',
  /** The workspace the album lives in. */
  workspace: 'Reyes & Santos',
  /** The group thread. */
  thread: 'Reyes & Santos crew',
} as const;

// ─── Calendar ────────────────────────────────────────────────────────────

/**
 * The wedding is Saturday 12 December 2026. Visible strings show a year only
 * where the real UI prints one (the job form's date, the hired-terms card,
 * the ISO dates in move notices); album day headings drop the current year,
 * which is why every chapter before the films keeps its `now` in 2026.
 */
export const WEDDING_DAY = '2026-12-12';

export const WHEN = {
  panic: at('2026-12-09T23:42:00'),
  seenBy14: at('2026-12-09T23:51:00'),
  whichKenn: at('2026-12-09T23:57:00'),
  posted: at('2026-12-09T23:58:00'),
  nearby: at('2026-12-10T00:04:00'),
  appliedErnie: at('2026-12-10T00:31:00'),
  appliedKenn: at('2026-12-10T00:44:00'),
  appliedBea: at('2026-12-10T00:52:00'),
  /** Mika moves the call time on Friday night. */
  moved: at('2026-12-11T21:20:00'),
  eventBefore: at('2026-12-12T06:30:00'),
  eventAfter: at('2026-12-12T06:00:00'),
  reminder: at('2026-12-12T05:00:00'),
  call: at('2026-12-12T06:00:00'),
  prep: at('2026-12-12T09:30:00'),
  ceremony: at('2026-12-12T15:00:00'),
  /** Sunset in Cebu on 12 Dec is about 17:24; 17:05 keeps the sun up. */
  goldenHour: at('2026-12-12T17:05:00'),
  sameDayEdit: at('2026-12-12T21:30:00'),
  firstCapture: at('2026-12-12T05:52:00'),
  lastCapture: at('2026-12-12T22:41:00'),
  /** The handover: the link goes out on Sunday afternoon. */
  linkSent: at('2026-12-13T16:50:00'),
  picksSent: at('2026-12-13T20:15:00'),
  /** Three weeks later the films are done and the same link grows. */
  filmsShared: at('2027-01-02T11:00:00'),
} as const;

/**
 * Upload cohorts. Each is pinned after 3 AM so the nightly clean-up takes
 * them in three separate sweeps (Day 91, 92 and 112) rather than merging two.
 */
export const COHORTS = [
  {
    id: 'saturday',
    uploaded: { from: at('2026-12-12T21:00:00'), to: at('2026-12-12T23:48:00') },
    files: 413, // 412 photos + the same-day edit
    gb: 6.0,
    sweep: { day: 91, at: at('2027-03-13T03:00:00') },
  },
  {
    id: 'sunday',
    uploaded: { from: at('2026-12-13T14:10:00'), to: at('2026-12-13T14:10:00') },
    files: 3, // the teaser and two recordings
    gb: 0.4,
    sweep: { day: 92, at: at('2027-03-14T03:00:00') },
  },
  {
    id: 'films',
    uploaded: { from: at('2027-01-02T10:30:00'), to: at('2027-01-02T10:30:00') },
    files: 6, // Ernie's six films
    gb: 2.5,
    sweep: { day: 112, at: at('2027-04-03T03:00:00') },
  },
] as const;

/**
 * A fixed `now` per chapter, passed to every date helper so the server and
 * client render the same words. Ch5's album is looked at on Monday, so its
 * day heading reads "Saturday 12 December" rather than "Yesterday".
 */
export const NOW = {
  ch1: WHEN.panic,
  ch2: WHEN.nearby,
  ch3: WHEN.appliedBea,
  ch4: WHEN.moved,
  ch5: at('2026-12-14T09:00:00'),
  ch6: WHEN.linkSent,
  ch6Later: WHEN.filmsShared,
  ch7: COHORTS[2].sweep.at,
} as const;

/** What the time chip and the desktop slate read, in order (12-hour, as the page writes times). */
export const SLATE = [
  'WED 11:42 PM',
  'THU 12:04 AM',
  'THU 12:31 AM',
  'FRI 9:20 PM',
  'SAT 5:00 AM',
  'SAT 5:05 PM',
  'SAT 9:30 PM',
  'SAT 10:48 PM',
  'SUN 4:50 PM',
  'DAY 91',
  'DAY 92',
  'DAY 112',
] as const;

// ─── The job ─────────────────────────────────────────────────────────────

export const JOB = {
  title: 'Wedding crew for Saturday in Cebu City',
  where: 'Cebu City',
  brief: 'Church at 3, reception at the hotel. The SDE plays at 9:30 PM. Need files by Sunday.',
  roles: [
    { role: 'Videographer', min: 18_000, max: 25_000 },
    { role: 'SDE Editor Video', min: 12_000, max: 15_000 },
    { role: 'HMUA', min: 8_000, max: 12_000 },
  ],
  /** The app's cap on a single role's budget. */
  roleCap: 500_000,
} as const;

// ─── Nearby ──────────────────────────────────────────────────────────────

/** The app's radius choices, in km (copied: the app keeps them module-local). */
export const RADII = [5, 25, 50, 100, 200] as const;

/** All nine roles, in the app's order (copied from api/src/auth/roles.ts). */
export const ROLES = [
  'Photographer',
  'Videographer',
  'Photo Editor',
  'Video Editor',
  'SDE Editor Photo',
  'SDE Editor Video',
  'Coordinator',
  'Host',
  'HMUA',
] as const;
export type Role = (typeof ROLES)[number];

export type Neighbour = {
  name: string;
  km: number;
  roles: readonly Role[];
  /** Bearing from Mika, for placing the star on land. */
  bearing: number;
  /** Turns sharing off in the privacy beat, and is erased. */
  erased?: true;
};

/**
 * Everyone sharing a location near Mika, illustrative. Mika is never in it:
 * Nearby leaves out the person looking. Counts, rows and the demo's live
 * region are all derived from this list, never typed by hand.
 */
export const ROSTER: readonly Neighbour[] = [
  { name: 'Ernie', km: 2, roles: ['Photographer', 'Videographer'], bearing: 350 },
  { name: 'Kenn', km: 2, roles: ['Video Editor', 'SDE Editor Video'], bearing: 280 },
  { name: 'Tonette', km: 3, roles: ['Coordinator'], bearing: 300, erased: true },
  { name: 'Paolo', km: 4, roles: ['Photographer'], bearing: 20 },
  { name: 'Rhea', km: 4, roles: ['HMUA'], bearing: 250 },
  { name: 'Bea', km: 8, roles: ['HMUA'], bearing: 320 },
  { name: 'Joy', km: 9, roles: ['Videographer', 'Photo Editor'], bearing: 10 },
  { name: 'Carlo', km: 12, roles: ['Videographer'], bearing: 231 },
  { name: 'Dana', km: 15, roles: ['Video Editor', 'SDE Editor Video'], bearing: 30 },
  { name: 'Migs', km: 18, roles: ['Photographer', 'Videographer'], bearing: 42 },
  { name: 'Jessa', km: 21, roles: ['HMUA'], bearing: 0 },
  { name: 'Lito', km: 24, roles: ['Videographer', 'Host'], bearing: 232 },
  { name: 'Noel', km: 38, roles: ['Photographer'], bearing: 148 },
  { name: 'Iya', km: 44, roles: ['HMUA', 'Coordinator'], bearing: 15 },
  { name: 'Ramon', km: 47, roles: ['Videographer', 'Video Editor'], bearing: 240 },
  { name: 'Grace', km: 63, roles: ['Photo Editor', 'SDE Editor Photo'], bearing: 160 },
  { name: 'Teddy', km: 88, roles: ['Host'], bearing: 128 },
  { name: 'Liza', km: 95, roles: ['Photographer', 'HMUA'], bearing: 210 },
  { name: 'Jun', km: 140, roles: ['Videographer'], bearing: 100 },
  { name: 'Marga', km: 176, roles: ['Coordinator', 'Host'], bearing: 284 },
] as const;

/** The roles Mika searches for in Ch2. */
export const SEARCH_ROLES: readonly Role[] = ['Videographer', 'SDE Editor Video', 'HMUA'];

/** People within a radius, optionally after the privacy beat has erased someone. */
export function within(radiusKm: number, afterErase = true): Neighbour[] {
  return ROSTER.filter((n) => n.km <= radiusKm && !(afterErase && n.erased));
}

/** Per-role counts for the chips, zeros included, as the app shows them. */
export function roleCounts(radiusKm: number, afterErase = true): Record<Role, number> {
  const counts = Object.fromEntries(ROLES.map((r) => [r, 0])) as Record<Role, number>;
  for (const n of within(radiusKm, afterErase)) for (const r of n.roles) counts[r] += 1;
  return counts;
}

/** The rows Nearby lists for the selected roles, nearest first. */
export function rows(radiusKm: number, roles: readonly Role[] = SEARCH_ROLES, afterErase = true) {
  return within(radiusKm, afterErase)
    .filter((n) => n.roles.some((r) => roles.includes(r)))
    .sort((a, b) => a.km - b.km || a.name.localeCompare(b.name));
}

/** The "Try the distance" demo's live-region sentence. */
export function demoSentence(radiusKm: number): string {
  const n = within(radiusKm).length;
  return `Within ${radiusKm} km: ${n} ${n === 1 ? 'person' : 'people'} in this illustration.`;
}

// ─── The album ───────────────────────────────────────────────────────────

/** Who uploaded what on Saturday night. 248 + 164 = 412 photos; Kenn's file is the same-day edit. */
export const UPLOADS = [
  { who: 'mika', files: 248, role: 'Owner' },
  { who: 'ernie', files: 164, role: 'Photographer' },
  { who: 'kenn', files: 1, role: 'Editor' },
] as const;

export const ALBUM = {
  photos: 412,
  /** Films on the night: the same-day edit. */
  filmsSaturday: 1,
  /** Films by Day 21: the same-day edit, the teaser, and Ernie's six. */
  films: 8,
  recordings: 2,
  /** Saturday's day heading: photos plus the same-day edit. */
  saturdayItems: 413,
  total: 422,
  sections: [
    { name: 'Prep', photos: 96 },
    { name: 'Ceremony', photos: 151 },
    { name: 'Reception', photos: 165 },
  ],
  photosGb: 5.6,
  sameDayEditDuration: '3:48',
  picks: 12,
  recordingTitle: 'Vows',
  recordingPosition: '0:42',
  recordingLength: '3:12',
  /** The tail of the link, as drawn. The token is illustrative and opens nothing. */
  linkPath: 'client.virgo.ph/s/a4f2…',
} as const;

// ─── Storage ─────────────────────────────────────────────────────────────

/** Mika's plan and what her other albums already use. */
export const STORAGE = { planGb: 15, baselineGb: 0.3 } as const;

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Every meter reading on the page, computed from the cohorts rather than
 * typed, so the arithmetic cannot drift: 6.3 → 9.2 → 3.2 → 2.8 → 0.3 GB.
 */
export const METER = (() => {
  const [sat, sun, films] = COHORTS;
  const saturday = round1(STORAGE.baselineGb + sat.gb);
  const beforeCleanUp = round1(saturday + sun.gb + films.gb);
  const afterDay91 = round1(beforeCleanUp - sat.gb);
  const afterDay92 = round1(afterDay91 - sun.gb);
  const afterDay112 = round1(afterDay92 - films.gb);
  return { saturday, beforeCleanUp, afterDay91, afterDay92, afterDay112 } as const;
})();

/** The phone ring's second line on Saturday night. */
export const METER_LEFT_SATURDAY = round1(STORAGE.planGb - METER.saturday);

// ─── Elsewhere in the story ──────────────────────────────────────────────

export const RETENTION_DAYS = 90;

/** Bea's profile stats, fed to the app's own `profileStatsLine`. */
export const BEA_STATS = { connections: 3, jobsDone: 1 } as const;

/** The showcase in "The work": a non-wedding piece of Mika's. */
export const SHOWCASE = {
  title: 'Ten minutes before the rain',
  howItWasMade: 'Backlit into the storm front so the rain read as light, not weather.',
  tags: ['35mm', 'Backlight', 'Natural light'],
} as const;
