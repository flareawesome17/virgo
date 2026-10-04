/**
 * Ch5 · Saturday: the words and the data the album, the crew's activity, the
 * storage meter, the device chips and the viewfinder draw.
 *
 * A zero-import data module (see `../story.ts`): relative imports of other
 * story data modules only, no `@/` aliases, React or packages, so
 * `scripts/check-story.mjs` can load it under plain Node.
 *
 * Every string copied from the app is listed in `SOURCES` with the file it
 * comes from. Strings the app builds from a template (the counts line, the
 * day heading, "You uploaded 248 files to …") are drawn in the mocks by the
 * app's own helpers or by a line-for-line copy of its template; their pieces
 * are listed here as fragments so the check catches a change in either.
 *
 * Page chrome that is not Virgo UI (the device chips, the viewfinder's
 * exposure readout, the upload stamps on tiles in flight, the address bars)
 * is marked as such and has no source.
 */
import { ALBUM, CAST, CLIENT, COHORTS, RETENTION_DAYS, TZ, UPLOADS, WEDDING_DAY } from '../story';
import type { SourceEntry } from './common';

// ─── Time, read as written ───────────────────────────────────────────────

/** `2026-12-12T22:48:00` from `2026-12-12T22:48:00+08:00`: the wall clock, without the zone. */
export function wallClockString(iso: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(iso);
  if (!m) throw new Error(`Not an ISO date-time: ${iso}`);
  return `${m[1]}T${m[2]}:${m[3]}:${m[4] ?? '00'}`;
}

/**
 * A story instant as a local `Date` with the same wall clock, in whatever
 * zone the server renders in.
 *
 * The app's `dayTitle` and `relativeTime` read their `now` (and `then`)
 * through local getters. Handing them the Cebu wall clock as local time makes
 * "Saturday 12 December" and "Sat" come out the same on a server in Manila,
 * in UTC or in California, as they would on Mika's phone.
 */
export function wallClock(iso: string): Date {
  const [date, time] = wallClockString(iso).split('T');
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi, s] = time.split(':').map(Number);
  return new Date(y, mo - 1, d, h, mi, s);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * "Sat 10:48 PM": the stamp a tile carries in flight, so the gold threads
 * read as *later that night*, not live (storyboard Ch5 p 0.40). Page chrome,
 * not Virgo UI. Computed from the wall clock, so no locale or zone can move it.
 */
export function uploadStamp(iso: string): string {
  const [date, time] = wallClockString(iso).split('T');
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${weekday} ${hour}:${String(mi).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** An instant on the wedding night, in Cebu. */
const saturday = (hhmm: string) => `${WEDDING_DAY}T${hhmm}:00${TZ}`;

// ─── Address bars (page chrome; the ids are illustrative) ────────────────

export const FRAME_URLS = {
  album: 'web.virgo.ph/albums/8f3c…',
  albums: 'web.virgo.ph/albums',
  workspace: 'web.virgo.ph/workspaces/2b71…',
  storage: 'web.virgo.ph/settings/storage',
  notifications: 'web.virgo.ph/notifications',
} as const;

// ─── The album header ────────────────────────────────────────────────────

/** Album status, as both apps label it. Drawn uppercase by CSS. */
export const STATUS_LABEL = {
  draft: 'Draft',
  review: 'In review',
  delivered: 'Delivered',
} as const;
export type AlbumStatusKey = keyof typeof STATUS_LABEL;

/** The words in the counts line: "412 photos · 1 film", or "Empty". */
export const COUNT_WORDS = {
  photo: { one: 'photo', many: 'photos' },
  film: { one: 'film', many: 'films' },
  recording: { one: 'recording', many: 'recordings' },
} as const;
export const COUNT_JOIN = ' · ';
export const EMPTY = 'Empty';

/** The web header's link to the couple's picks, once there are some: "♥ 12 client picks". */
export const PICKS_WORDS = { one: 'client pick', many: 'client picks' } as const;

export const HEADER = {
  /** The web breadcrumb's first step. */
  albums: 'Albums',
  /** Between the breadcrumb's steps. */
  crumb: '/',
  clientLink: 'Client link',
  upload: 'Upload',
  /** The phone header's retention pill. The album keeps files 90 days. */
  retention: `Files deleted ${RETENTION_DAYS} days after upload`,
} as const;

/** What the album holds, per moment of the story. */
export const ALBUM_COUNTS = {
  /** Made, before the shoot. */
  empty: { image: 0, video: 0, audio: 0 },
  /** Saturday night: 412 photos and the same-day edit. */
  saturday: { image: ALBUM.photos, video: ALBUM.filmsSaturday, audio: 0 },
  /** Day 21, when the films are in: 412 photos, 8 films, 2 recordings. */
  complete: { image: ALBUM.photos, video: ALBUM.films, audio: ALBUM.recordings },
} as const;

// ─── Sections ────────────────────────────────────────────────────────────

export const SECTIONS_UI = {
  /** The web rail's heading. */
  rail: 'Sections',
  /** The first entry: "All media" on the web, "All" on the phone. */
  allWeb: 'All media',
  allPhone: 'All',
  unsorted: 'Unsorted',
  picks: 'Client picks',
  /** The dashed chip that adds one. */
  add: 'Section',
  /** The web rail with no sections yet. */
  hint: 'Group the album into chapters — Prep, Ceremony, Reception — and the client link shows them as chapters too.',
} as const;

/**
 * The album's sections and what each holds once Mika has filed Saturday's
 * 413 files (uploads land unsorted; she files them before the link goes out
 * on Sunday, which shows them as chapters). The section counts every kind,
 * so Reception holds its 165 photos and Kenn's same-day edit; the client
 * link, which shows photos only until Day 21, counts 96 · 151 · 165 (Ch6).
 */
export const SECTION_COUNTS = ALBUM.sections.map((s) => ({
  name: s.name,
  key: s.name.toLowerCase() as SectionKey,
  count: s.photos + (s.name === 'Reception' ? ALBUM.filmsSaturday : 0),
}));

/**
 * What the grid shows: everything, or one section. In the apps a section chip
 * filters the grid (it is not a scroll position), so a chip shown active
 * comes with a grid narrowed to that section.
 */
export type SectionKey = 'all' | 'prep' | 'ceremony' | 'reception';

/** The phone's kind segment under the chips. */
export const KIND_TABS = ['All', 'Photos', 'Films', 'Audio'] as const;

/**
 * The phone's order toggle, which names the order on screen. The apps open
 * an album newest first; the story's grid runs the day forward, Prep to
 * Reception, so Mika has it on "Oldest".
 */
export const ORDER = { newest: 'Newest', oldest: 'Oldest' } as const;

/** An album with nothing in it yet, as each app says it. */
export const EMPTY_ALBUM = {
  title: 'Nothing here yet',
  web: 'Drop the shoot’s folder anywhere on this page. It sorts itself by the day each frame was taken.',
  webFolder: 'Choose a folder',
  webFiles: 'Choose files',
  phone: 'Upload from the shoot and it sorts itself by the day each frame was taken.',
  phoneUpload: 'Upload',
} as const;

// ─── The day heading ─────────────────────────────────────────────────────

/** "413 items · 05:52 – 22:41": the count's words. The title and span come from media-days.ts. */
export const DAY_ITEMS = { one: 'item', many: 'items' } as const;

// ─── The grid ────────────────────────────────────────────────────────────

export type Source = 'mika' | 'ernie' | 'kenn';

export type AlbumTile = {
  /** Capture order, 0-based. */
  index: number;
  who: Source;
  section: 'Prep' | 'Ceremony' | 'Reception';
  /** The camera's wall clock, as written: no zone (media-days reads it as written). */
  takenAt: string;
  /** When it reached the album, in Cebu. */
  uploadedAt: string;
  kind: 'image' | 'video';
  /** The Plate's seed. Abstract: never a photograph. */
  seed: number;
  /**
   * Which tiles stay when a grid crops to whole rows: 0 stays longest. Kenn's
   * film, the day's first and last frames, then one per section.
   */
  keep: number;
};

const taken = (hhmm: string) => `${WEDDING_DAY}T${hhmm}:00`;

/**
 * Saturday in 27 frames, nine a section, in capture order: Mika's and
 * Ernie's stills interleaved, Kenn's same-day edit among the reception.
 * Upload times follow the activity rows below — Kenn's film at 9:24 PM,
 * Ernie's card in the 10 PM hour, Mika's in the 11 PM hour, each in the
 * order the camera wrote them — so a tile's stamp and the feed agree, and
 * every one sits inside the Saturday cohort (9:00–11:48 PM).
 */
export const ALBUM_TILES: readonly AlbumTile[] = [
  { index: 0, who: 'mika', section: 'Prep', takenAt: taken('05:52'), uploadedAt: saturday('23:00'), kind: 'image', seed: 53, keep: 1 },
  { index: 1, who: 'mika', section: 'Prep', takenAt: taken('06:30'), uploadedAt: saturday('23:03'), kind: 'image', seed: 74, keep: 15 },
  { index: 2, who: 'ernie', section: 'Prep', takenAt: taken('07:10'), uploadedAt: saturday('22:04'), kind: 'image', seed: 61, keep: 5 },
  { index: 3, who: 'mika', section: 'Prep', takenAt: taken('07:48'), uploadedAt: saturday('23:06'), kind: 'image', seed: 45, keep: 18 },
  { index: 4, who: 'mika', section: 'Prep', takenAt: taken('08:25'), uploadedAt: saturday('23:09'), kind: 'image', seed: 59, keep: 8 },
  { index: 5, who: 'ernie', section: 'Prep', takenAt: taken('09:05'), uploadedAt: saturday('22:09'), kind: 'image', seed: 52, keep: 21 },
  { index: 6, who: 'mika', section: 'Prep', takenAt: taken('09:30'), uploadedAt: saturday('23:12'), kind: 'image', seed: 48, keep: 12 },
  { index: 7, who: 'ernie', section: 'Prep', takenAt: taken('10:15'), uploadedAt: saturday('22:14'), kind: 'image', seed: 66, keep: 10 },
  { index: 8, who: 'mika', section: 'Prep', takenAt: taken('11:40'), uploadedAt: saturday('23:15'), kind: 'image', seed: 55, keep: 24 },
  { index: 9, who: 'ernie', section: 'Ceremony', takenAt: taken('14:30'), uploadedAt: saturday('22:19'), kind: 'image', seed: 72, keep: 13 },
  { index: 10, who: 'mika', section: 'Ceremony', takenAt: taken('14:48'), uploadedAt: saturday('23:18'), kind: 'image', seed: 44, keep: 25 },
  { index: 11, who: 'mika', section: 'Ceremony', takenAt: taken('15:00'), uploadedAt: saturday('23:21'), kind: 'image', seed: 42, keep: 3 },
  { index: 12, who: 'ernie', section: 'Ceremony', takenAt: taken('15:12'), uploadedAt: saturday('22:24'), kind: 'image', seed: 60, keep: 19 },
  { index: 13, who: 'ernie', section: 'Ceremony', takenAt: taken('15:24'), uploadedAt: saturday('22:29'), kind: 'image', seed: 57, keep: 6 },
  { index: 14, who: 'mika', section: 'Ceremony', takenAt: taken('15:41'), uploadedAt: saturday('23:24'), kind: 'image', seed: 70, keep: 11 },
  { index: 15, who: 'mika', section: 'Ceremony', takenAt: taken('16:05'), uploadedAt: saturday('23:27'), kind: 'image', seed: 49, keep: 16 },
  { index: 16, who: 'ernie', section: 'Ceremony', takenAt: taken('16:20'), uploadedAt: saturday('22:34'), kind: 'image', seed: 65, keep: 22 },
  { index: 17, who: 'mika', section: 'Ceremony', takenAt: taken('17:05'), uploadedAt: saturday('23:30'), kind: 'image', seed: 47, keep: 4 },
  { index: 18, who: 'mika', section: 'Reception', takenAt: taken('18:20'), uploadedAt: saturday('23:33'), kind: 'image', seed: 56, keep: 23 },
  { index: 19, who: 'ernie', section: 'Reception', takenAt: taken('18:40'), uploadedAt: saturday('22:41'), kind: 'image', seed: 73, keep: 17 },
  { index: 20, who: 'ernie', section: 'Reception', takenAt: taken('19:12'), uploadedAt: saturday('22:48'), kind: 'image', seed: 64, keep: 7 },
  { index: 21, who: 'mika', section: 'Reception', takenAt: taken('19:48'), uploadedAt: saturday('23:36'), kind: 'image', seed: 62, keep: 14 },
  { index: 22, who: 'mika', section: 'Reception', takenAt: taken('20:05'), uploadedAt: saturday('23:40'), kind: 'image', seed: 54, keep: 20 },
  { index: 23, who: 'kenn', section: 'Reception', takenAt: taken('21:12'), uploadedAt: saturday('21:24'), kind: 'video', seed: 63, keep: 0 },
  { index: 24, who: 'mika', section: 'Reception', takenAt: taken('21:30'), uploadedAt: saturday('23:44'), kind: 'image', seed: 69, keep: 9 },
  { index: 25, who: 'ernie', section: 'Reception', takenAt: taken('22:05'), uploadedAt: saturday('22:53'), kind: 'image', seed: 67, keep: 26 },
  { index: 26, who: 'mika', section: 'Reception', takenAt: taken('22:41'), uploadedAt: COHORTS[0].uploaded.to, kind: 'image', seed: 58, keep: 2 },
];

/**
 * The tiles each grid size draws, by capture index: every size spans the day
 * from Prep to Reception, keeps Kenn's film, takes the same number from each
 * section, and keeps the sources in proportion (7 · 4 · 1, then 5 · 3 · 1,
 * then 3 · 2 · 1). Narrowed to one section, a grid draws that many of the
 * section's nine instead, chosen by `keep`.
 */
export const TILE_SETS = {
  6: [0, 7, 13, 17, 23, 26],
  9: [0, 2, 6, 11, 13, 17, 20, 23, 26],
  12: [0, 2, 4, 7, 11, 13, 14, 17, 20, 23, 24, 26],
} as const;
export type TileCount = keyof typeof TILE_SETS;

/** The same-day edit's frames, for the film tile's crossfade. */
export const FILM_SEEDS = [63, 71, 76] as const;

/** The film badge: "3:48" in the app; "▶ 3:48" on the client page. */
export const FILM = {
  duration: ALBUM.sameDayEditDuration,
  clientPrefix: '▶ ',
} as const;

// ─── Activity ────────────────────────────────────────────────────────────

/** The workspace card's title, on both apps. */
export const ACTIVITY_TITLE = 'What’s been happening';

/** The feed with nothing in it: the web's two lines, the phone's one. */
export const ACTIVITY_EMPTY = {
  title: 'Nothing yet',
  body: 'Uploads, new albums and people joining show up here.',
  phone: 'Nothing yet. Uploads, new albums and people joining show up here.',
} as const;

export type ActivityRow = {
  id: string;
  who: Source;
  /** The account's name, as the feed prints it under "You" (the avatar's letters). */
  name: string;
  /** The role in the workspace, as the API sends it. */
  role: 'owner' | 'photographer' | 'editor';
  isYou: boolean;
  count: number;
  /** The folded row's created_at: its last file. */
  at: string;
};

const ROLE_OF = { Owner: 'owner', Photographer: 'photographer', Editor: 'editor' } as const;
const LAST_UPLOAD: Record<Source, string> = {
  mika: COHORTS[0].uploaded.to,
  ernie: saturday('22:53'),
  kenn: saturday('21:24'),
};

/**
 * Saturday night's uploads as the feed folds them: one row per person, album
 * and hour (`workspace-activity.service.ts`), newest first. Each batch fits
 * one clock hour, so each is one row: Mika's 248 in the 11 PM hour, Ernie's
 * 164 in the 10 PM hour, Kenn's film at 9:24 PM.
 */
export const ACTIVITY: readonly ActivityRow[] = UPLOADS.map((u) => ({
  id: `upload-${u.who}`,
  who: u.who,
  name: CAST[u.who].name,
  role: ROLE_OF[u.role],
  isYou: u.who === 'mika',
  count: u.files,
  at: LAST_UPLOAD[u.who],
})).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

/** The album the rows name: the album, never a section. */
export const ACTIVITY_ALBUM = { id: 'album-reyes-santos', name: CLIENT.album } as const;

/** The face a row falls back to when it has no actor (a client's picks). Every story row has one. */
export const ACTIVITY_CLIENT = 'Client';

// ─── Storage ─────────────────────────────────────────────────────────────

/** The meter's words. The numbers come from `formatBytes` (copied) over `METER`. */
export const METER_UI = {
  /** Under the web reading: "of 15.0 GB on the free plan". */
  of: 'of',
  plan: 'free',
  /** The web card's file count label. */
  files: 'files',
  /** The phone dashboard card. */
  storage: 'Storage',
  used: 'used',
  left: 'left',
} as const;

/** "of 15.0 GB on the free plan": the web card's line, given the limit as formatBytes writes it. */
export const meterPlanLine = (limit: string) => `${METER_UI.of} ${limit} on the ${METER_UI.plan} plan`;

/**
 * Files in Mika's other albums: the 0.3 GB baseline. Illustrative, and only
 * the web card's file count shows it; every other count comes from story.ts.
 */
export const BASELINE_FILES = 38;

// ─── Device chips (page chrome, not Virgo UI) ───────────────────────────

const counted = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Where each thread starts: the three devices, and what each sent that night. */
export const DEVICES = UPLOADS.map((u) => ({
  who: u.who,
  name: CAST[u.who].name,
  icon: u.who === 'kenn' ? 'laptop' : 'camera',
  label: `${CAST[u.who].first}’s ${u.who === 'kenn' ? 'laptop' : 'camera'}`,
  /** What arrived from it: Kenn's one file is the same-day edit. */
  count: u.who === 'kenn' ? counted(u.files, 'film', 'films') : counted(u.files, 'photo', 'photos'),
}));

// ─── The viewfinder (page chrome) ────────────────────────────────────────

/** Golden hour, 5:05 PM: the exposure the readout shows. */
export const VIEWFINDER = { readout: '1/250 · f/2.8 · ISO 200' } as const;

// ─── Sources ─────────────────────────────────────────────────────────────

const WEB_ALBUM = 'web/src/app/(app)/albums/[id]/page-client.tsx';
const PHONE_ALBUM = 'mobile/app/(app)/albums/[albumId]/index.tsx';
const WEB_SECTIONS = 'web/src/components/media/album-sections.tsx';
const WEB_GRID = 'web/src/components/media/album-grid.tsx';
const MEDIA_DAYS = 'web/src/lib/media-days.ts';
const WORKSPACES = 'web/src/lib/workspaces.ts';
const WEB_WORKSPACE = 'web/src/app/(app)/workspaces/[id]/page-client.tsx';
const PHONE_WORKSPACE = 'mobile/app/(app)/workspaces/[id].tsx';
const WEB_FEED = 'web/src/components/workspaces/activity-feed.tsx';
const PHONE_FEED = 'mobile/components/WorkspaceActivity.tsx';
const WEB_STORAGE = 'web/src/app/(app)/settings/storage/page-client.tsx';
const USAGE = 'web/src/api/endpoints/usage.ts';
const PHONE_HOME = 'mobile/app/(app)/(tabs)/index.tsx';
const RING = 'mobile/components/StorageRing.tsx';
const CLIENT_PAGE = 'api/src/albums/share/client-gallery.template.ts';
const ACTIVITY_SERVICE = 'api/src/workspaces/workspace-activity.service.ts';

export const SOURCES: readonly SourceEntry[] = [
  // Status pills, on both apps.
  { text: STATUS_LABEL.draft, file: WEB_ALBUM, mode: 'fragments', fragments: ["draft: { label: 'Draft', className: 'bg-muted text-muted-foreground' }"] },
  { text: STATUS_LABEL.review, file: WEB_ALBUM, mode: 'fragments', fragments: ["review: { label: 'In review', className: 'bg-warning/15 text-warning' }"] },
  { text: STATUS_LABEL.delivered, file: WEB_ALBUM, mode: 'fragments', fragments: ["delivered: { label: 'Delivered', className: 'bg-success/15 text-success' }"] },
  { text: STATUS_LABEL.draft, file: PHONE_ALBUM, mode: 'fragments', fragments: ["draft: { label: 'Draft', className: 'bg-muted', text: 'text-muted-foreground' }"] },
  { text: STATUS_LABEL.delivered, file: PHONE_ALBUM, mode: 'fragments', fragments: ["delivered: { label: 'Delivered', className: 'bg-success/15', text: 'text-success' }"] },
  {
    file: WEB_ALBUM,
    mode: 'fragments',
    fragments: ["rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide"],
  },

  // The counts line, the same template on both apps.
  ...[WEB_ALBUM, PHONE_ALBUM].map(
    (file): SourceEntry => ({
      text: `412 ${COUNT_WORDS.photo.many}${COUNT_JOIN}1 ${COUNT_WORDS.film.one}`,
      file,
      mode: 'fragments',
      fragments: [
        "plural(albumCounts.image, 'photo', 'photos')",
        "plural(albumCounts.video, 'film', 'films')",
        "plural(albumCounts.audio, 'recording', 'recordings')",
        ".join(' · ') || 'Empty'",
      ],
    }),
  ),
  { file: WEB_ALBUM, mode: 'fragments', fragments: ['return `${n.toLocaleString()} ${n === 1 ? one : many}`;'] },
  {
    text: `12 ${PICKS_WORDS.many}`,
    file: WEB_ALBUM,
    mode: 'fragments',
    fragments: [
      "{plural(sectionsQuery.picked, 'client pick', 'client picks')}",
      'className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-medium text-primary hover:bg-primary/10"',
      '<Heart className="size-3.5 fill-current" aria-hidden />',
    ],
  },
  { file: PHONE_ALBUM, mode: 'fragments', fragments: ['return `${count.toLocaleString()} ${count === 1 ? one : many}`;'] },

  // Header actions and the breadcrumb.
  { text: HEADER.albums, file: WEB_ALBUM, mode: 'fragments', fragments: ['className="hover:text-foreground">Albums</Link>'] },
  { text: HEADER.crumb, file: WEB_ALBUM, mode: 'fragments', fragments: ['<span aria-hidden>/</span>'] },
  { text: HEADER.clientLink, file: WEB_ALBUM, mode: 'verbatim' },
  { text: HEADER.upload, file: WEB_ALBUM, mode: 'fragments', fragments: ['<Upload className="size-4" /> Upload <ChevronDown className="size-3.5 opacity-70" />'] },
  { text: HEADER.clientLink, file: PHONE_ALBUM, mode: 'fragments', fragments: ['text-sm font-semibold">Client link</Text>'] },
  { text: HEADER.upload, file: PHONE_ALBUM, mode: 'fragments', fragments: ['text-action-foreground text-sm font-bold">Upload</Text>'] },
  { text: HEADER.retention, file: PHONE_ALBUM, mode: 'fragments', fragments: ['Files deleted {album.retention_days} days after upload'] },

  // Sections: the web rail and chips, the phone chips.
  { text: SECTIONS_UI.rail, file: WEB_SECTIONS, mode: 'fragments', fragments: ['tracking-[0.14em] text-muted-foreground">Sections</p>'] },
  { text: SECTIONS_UI.allWeb, file: WEB_SECTIONS, mode: 'fragments', fragments: ["{ key: 'all', label: 'All media', count: total }"] },
  { text: SECTIONS_UI.unsorted, file: WEB_SECTIONS, mode: 'fragments', fragments: ["[{ key: 'none', label: 'Unsorted', count: unsorted, dropTo: null }]"] },
  { text: SECTIONS_UI.picks, file: WEB_SECTIONS, mode: 'fragments', fragments: ["[{ key: 'picked', label: 'Client picks', count: picked }]"] },
  { text: SECTIONS_UI.add, file: WEB_SECTIONS, mode: 'fragments', fragments: ['<Plus className="size-3.5" aria-hidden /> Section </button>'] },
  { text: SECTIONS_UI.hint, file: WEB_SECTIONS, mode: 'verbatim' },
  { text: SECTIONS_UI.allPhone, file: PHONE_ALBUM, mode: 'fragments', fragments: ["{ key: 'all', label: 'All', count: sectionsQuery.total }"] },
  { text: SECTIONS_UI.unsorted, file: PHONE_ALBUM, mode: 'fragments', fragments: ["[{ key: 'none', label: 'Unsorted', count: sectionsQuery.unsorted }]"] },
  { text: SECTIONS_UI.add, file: PHONE_ALBUM, mode: 'fragments', fragments: ['text-muted-foreground text-[13px] font-semibold">Section</Text>'] },
  ...KIND_TABS.map(
    (label, i): SourceEntry => ({
      text: label,
      file: PHONE_ALBUM,
      mode: 'fragments',
      fragments: [`{ key: '${['all', 'image', 'video', 'audio'][i]}', label: '${label}' }`],
    }),
  ),
  ...[ORDER.newest, ORDER.oldest].map(
    (text): SourceEntry => ({ text, file: PHONE_ALBUM, mode: 'fragments', fragments: ["{order === 'newest' ? 'Newest' : 'Oldest'}"] }),
  ),
  // Both apps open an album newest first; the phone's toggle names the order.
  { file: PHONE_ALBUM, mode: 'fragments', fragments: ["useState<'newest' | 'oldest'>('newest')"] },

  // An album with nothing in it: the web page's empty state, and the phone's.
  { text: EMPTY_ALBUM.title, file: WEB_ALBUM, mode: 'fragments', fragments: ['<h2 className="mt-5 text-lg font-semibold tracking-tight">Nothing here yet</h2>'] },
  { text: EMPTY_ALBUM.web, file: WEB_ALBUM, mode: 'verbatim' },
  { text: EMPTY_ALBUM.webFolder, file: WEB_ALBUM, mode: 'fragments', fragments: ['<FolderUp className="size-4" /> Choose a folder </Button>'] },
  { text: EMPTY_ALBUM.webFiles, file: WEB_ALBUM, mode: 'fragments', fragments: ['onClick={() => openFilePicker()}> Choose files </Button>'] },
  { text: EMPTY_ALBUM.title, file: PHONE_ALBUM, mode: 'fragments', fragments: ['<Text className="text-foreground text-lg font-bold mt-4">Nothing here yet</Text>'] },
  { text: EMPTY_ALBUM.phone, file: PHONE_ALBUM, mode: 'verbatim' },
  { text: EMPTY_ALBUM.phoneUpload, file: PHONE_ALBUM, mode: 'fragments', fragments: ['<Text className="text-action-foreground font-semibold">Upload</Text>'] },

  // The day heading: the web template, the phone's, and media-days' span and title.
  { file: WEB_GRID, mode: 'fragments', fragments: ["item{day.items.length === 1 ? '' : 's'}", "{span ? ` · ${span}` : ''}"] },
  { file: PHONE_ALBUM, mode: 'fragments', fragments: ["plural(dayFiles.length, 'item', 'items')", "{span ? ` · ${span}` : ''}"] },
  { file: MEDIA_DAYS, mode: 'fragments', fragments: ['return `${times[0]} – ${times[times.length - 1]}`;', "toLocaleDateString('en-GB', {"] },

  // Film badges: the web grid's, the phone grid's, the client page's.
  { text: FILM.duration, file: WEB_GRID, mode: 'fragments', fragments: ['<Play className="size-3 fill-current" aria-hidden />', 'return h > 0 ? `${h}:${String(m).padStart(2, \'0\')}:${s}` : `${m}:${s}`;'] },
  { file: PHONE_ALBUM, mode: 'fragments', fragments: ['rounded-md bg-foreground/70 px-1.5 py-0.5', '<PlayIcon size={9} className="text-background" fill="currentColor" />'] },
  { text: FILM.clientPrefix, file: CLIENT_PAGE, mode: 'fragments', fragments: ["'▶ ' + (file.processingStatus === 'pending' ? 'Preparing' : duration(file.durationMs))"] },

  // Activity: the card title, the empty state, and the lines as describeActivity builds them.
  { text: ACTIVITY_TITLE, file: WEB_WORKSPACE, mode: 'verbatim' },
  { text: ACTIVITY_TITLE, file: PHONE_WORKSPACE, mode: 'verbatim' },
  { text: ACTIVITY_EMPTY.title, file: WEB_FEED, mode: 'fragments', fragments: ['<p className="text-sm font-medium">Nothing yet</p>'] },
  { text: ACTIVITY_EMPTY.body, file: WEB_FEED, mode: 'verbatim' },
  { text: ACTIVITY_EMPTY.phone, file: PHONE_FEED, mode: 'verbatim' },
  {
    text: `You uploaded ${UPLOADS[0].files} files to ${CLIENT.album}`,
    file: WORKSPACES,
    mode: 'fragments',
    fragments: [
      "{ text: 'You', strong: true }",
      "const files = item.count === 1 ? 'a file' : plural(item.count, 'file');",
      "return { parts: [who, { text: ` uploaded ${files} to ` }, album], subline: role };",
      "owner: 'Owner',",
      "photographer: 'Photographer',",
      "editor: 'Editor',",
    ],
  },
  { file: ACTIVITY_SERVICE, mode: 'fragments', fragments: ["values ($1, $2, $3, $4, $5, date_trunc('hour', now()))"] },
  { text: ACTIVITY_CLIENT, file: WEB_FEED, mode: 'fragments', fragments: ["name={item.actor?.name ?? 'Client'}"] },
  { text: ACTIVITY_CLIENT, file: PHONE_FEED, mode: 'fragments', fragments: ["<PersonAvatar name={item.actor?.name ?? 'Client'} url={item.actor?.avatar_url} size={32} />"] },

  // The storage meter: the web card, formatBytes, the phone card and ring.
  {
    text: `${METER_UI.of} 15.0 GB on the ${METER_UI.plan} plan`,
    file: WEB_STORAGE,
    mode: 'fragments',
    fragments: ['`of ${formatBytes(storageLimitBytes)}${', "` on the ${usage?.plan ?? 'free'} plan`"],
  },
  { text: METER_UI.files, file: WEB_STORAGE, mode: 'fragments', fragments: ['<p className="text-xs text-muted-foreground">files</p>'] },
  {
    file: USAGE,
    mode: 'fragments',
    fragments: ['`${(bytes / 1024 ** 3).toFixed(1)} GB`', '`${Math.round(bytes / 1024 ** 2)} MB`'],
  },
  { text: METER_UI.storage, file: PHONE_HOME, mode: 'fragments', fragments: ['text-[11px] font-bold uppercase tracking-wider"> Storage </Text>'] },
  { text: METER_UI.used, file: PHONE_HOME, mode: 'fragments', fragments: ['<Text className="text-muted-foreground text-xs font-medium">used</Text>'] },
  { text: METER_UI.left, file: PHONE_HOME, mode: 'fragments', fragments: ['<Text className="text-muted-foreground text-xs font-medium">left</Text>'] },
  { text: METER_UI.used, file: RING, mode: 'fragments', fragments: ['uppercase tracking-wider"> used </Text>'] },
  // The ring's figure, "42%": two decimals under 1 %, whole numbers above.
  { file: RING, mode: 'fragments', fragments: ['percent > 0 && percent < 1', '`${percent.toFixed(2)}%`', '`${Math.round(percent)}%`'] },
];
