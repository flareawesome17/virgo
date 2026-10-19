/**
 * Ch7 · Forget: the words the retention field, the day ruler, the clean-up
 * notices, the emptied album card and the empty client page draw.
 *
 * A zero-import data module (see `../story.ts`): relative imports of other
 * story data modules only, no `@/` aliases, React or packages, so
 * `scripts/check-story.mjs` can load it under plain Node.
 *
 * Every string copied from the app is listed in `SOURCES` with the file it
 * comes from. The ruler's day labels are page copy, not Virgo UI, and have
 * no source.
 */
import { CLIENT, COHORTS, RETENTION_DAYS, TZ, WEDDING_DAY, WHEN } from '../story';
import type { SourceEntry } from './common';

// ─── The New album dialog (web) ──────────────────────────────────────────

export const NEW_ALBUM = {
  title: 'New album',
  description: 'Albums hold the media for one shoot or one delivery.',
  name: 'Name',
  descriptionLabel: 'Description',
  descriptionPlaceholder: 'Optional',
  keep: 'Keep files for',
  cancel: 'Cancel',
  create: 'Create album',
} as const;

/** The web's retention choices, in the app's order (the phone offers different ones). */
export const RETENTION_OPTIONS = [
  { value: 'none', label: 'Until I delete them' },
  { value: '30', label: '30 days after upload' },
  { value: '60', label: '60 days after upload' },
  { value: '90', label: '90 days after upload' },
  { value: '180', label: '180 days after upload' },
  { value: '365', label: '1 year after upload' },
] as const;
export type RetentionValue = (typeof RETENTION_OPTIONS)[number]['value'];

/** What Mika chose when she made the album. */
export const RETENTION_CHOSEN = String(RETENTION_DAYS) as RetentionValue;

/** The helper under the select, for "Until I delete them" and for a number of days. */
export const KEEP_HELPER = {
  none: 'Files stay until you remove them.',
  days: `Each file is deleted ${RETENTION_DAYS} days after it is uploaded. This cannot be undone.`,
} as const;

// ─── The clean-up notices ────────────────────────────────────────────────

/** The receipt's title, the same for every sweep. */
export const CLEANUP_TITLE = 'Delivered files cleaned up';

/** "1 file", "3 files": the receipt's own plural. */
const files = (n: number) => `${n} file${n === 1 ? '' : 's'}`;

/**
 * When Mika reads each receipt: that morning at 8:05, five hours after the
 * 3 AM sweep. The phone's status bar shows the clock (OS chrome).
 */
export const READ = { clock: '8:05', minutesAfterSweep: 5 * 60 + 5 } as const;

/** The sweep's own time of day, as the web list writes a time under "Today". */
const SWEEP_TIME = '3:00 AM';

/**
 * One receipt per sweep, sent after the files are gone — never a warning
 * before. Day 91 takes Saturday's 413, Day 92 the teaser and the two
 * recordings, Day 112 Ernie's six films.
 */
export const CLEANUPS = COHORTS.map((c) => ({
  id: c.id,
  day: c.sweep.day,
  at: c.sweep.at,
  topic: 'retention' as const,
  title: CLEANUP_TITLE,
  body: `${files(c.files)} removed from “${CLIENT.album}” as scheduled.`,
  /** The web page's time for a row under "Today": its time of day. */
  time: SWEEP_TIME,
  /** The phone's for a row under "Today": how long ago, "5h". */
  phoneTime: `${Math.floor(READ.minutesAfterSweep / 60)}h`,
}));

// ─── The client page, emptied ────────────────────────────────────────────

/** What the client link shows once nothing it serves is left. */
export const CLIENT_EMPTY = 'Nothing has been shared here yet.';

// ─── The album card ──────────────────────────────────────────────────────

/**
 * When the album row last changed, which is what the card's time reads.
 * Uploads, sections and clean-ups never touch it; making the album and
 * setting its status do. Illustrative: Mika makes the album on Friday night
 * (choosing 90 days), and marks it Delivered once the films are out on Day 21.
 */
export const ALBUM_TIMES = {
  made: `2026-12-11T21:34:00${TZ}`,
  delivered: WHEN.filmsShared,
} as const;

/** The card's words. Its time is the app's own `ago` / `timeAgo`, copied into the mock. */
export const CARD = {
  empty: 'Empty',
  /** The web card's ago(), for the template pieces the mock copies. */
  justNowWeb: 'just now',
  justNowPhone: 'Just now',
} as const;

// ─── The day ruler (page copy, not Virgo UI) ─────────────────────────────

/** "Day 91": the counter and the labels. Day 0 is the wedding, Saturday 12 December. */
export const dayLabel = (n: number) => `Day ${n}`;

export const RULER = {
  /** Every sweep runs at 3 AM. */
  sweepTime: SWEEP_TIME,
  /** Under each cohort's mark. */
  uploaded: 'uploaded',
  /** Under each sweep's mark. */
  removed: 'removed',
  /** The span each file is kept for, from its own upload. */
  window: `${RETENTION_DAYS} days`,
  /** Day 0 is the wedding. */
  start: WEDDING_DAY,
} as const;

/** The ruler's three cohorts: when each arrived (day), how many, and the sweep that takes it. */
export const RULER_COHORTS = COHORTS.map((c) => {
  /** Days after the wedding the batch was uploaded. */
  const day = Math.round((Date.parse(c.uploaded.from.slice(0, 10)) - Date.parse(WEDDING_DAY)) / 86_400_000);
  return {
    id: c.id,
    day,
    files: c.files,
    gb: c.gb,
    sweep: c.sweep.day,
    count: files(c.files),
    /** Over a lane's start: "Day 0 · 413 files". */
    label: `${dayLabel(day)} · ${files(c.files)}`,
    /** The vertical timeline's second line: "413 files uploaded". */
    uploadedLine: `${files(c.files)} ${RULER.uploaded}`,
    /** Over a sweep: "Day 91 · 3:00 AM". */
    sweepLine: `${dayLabel(c.sweep.day)} · ${RULER.sweepTime}`,
  };
});

/** The far end of the ruler. */
export const RULER_END = COHORTS[COHORTS.length - 1].sweep.day;

/** The legend under the ruler: the marks are uploads; a ring is a sweep. */
export const RULER_LEGEND = {
  uploaded: RULER.uploaded,
  removed: `${RULER.removed} · ${RULER.sweepTime}`,
} as const;

// ─── Sources ─────────────────────────────────────────────────────────────

const NEW_ALBUM_DIALOG = 'web/src/components/new-album-dialog.tsx';
const RETENTION = 'api/src/albums/album-retention.service.ts';
const CLIENT_PAGE = 'api/src/albums/share/client-gallery.template.ts';
const WEB_ALBUMS = 'web/src/app/(app)/albums/page-client.tsx';
const PHONE_ALBUMS = 'mobile/app/(app)/albums/index.tsx';

export const SOURCES: readonly SourceEntry[] = [
  // The dialog around the field.
  { text: NEW_ALBUM.title, file: NEW_ALBUM_DIALOG, mode: 'fragments', fragments: ['<DialogTitle>New album</DialogTitle>'] },
  { text: NEW_ALBUM.description, file: NEW_ALBUM_DIALOG, mode: 'verbatim' },
  { text: NEW_ALBUM.name, file: NEW_ALBUM_DIALOG, mode: 'fragments', fragments: ['<Label htmlFor="album-name">Name</Label>'] },
  { text: NEW_ALBUM.descriptionLabel, file: NEW_ALBUM_DIALOG, mode: 'fragments', fragments: ['<Label htmlFor="album-description">Description</Label>'] },
  { text: NEW_ALBUM.descriptionPlaceholder, file: NEW_ALBUM_DIALOG, mode: 'fragments', fragments: ['placeholder="Optional"'] },
  { text: NEW_ALBUM.keep, file: NEW_ALBUM_DIALOG, mode: 'fragments', fragments: ['<Label htmlFor="album-retention">Keep files for</Label>'] },
  { text: NEW_ALBUM.cancel, file: NEW_ALBUM_DIALOG, mode: 'fragments', fragments: ['onClick={() => onOpenChange(false)}> Cancel </Button>'] },
  { text: NEW_ALBUM.create, file: NEW_ALBUM_DIALOG, mode: 'verbatim' },

  // The options, one by one, with their values.
  ...RETENTION_OPTIONS.map(
    (o): SourceEntry => ({
      text: o.label,
      file: NEW_ALBUM_DIALOG,
      mode: 'fragments',
      fragments: [`<SelectItem value="${o.value}">${o.label}</SelectItem>`],
    }),
  ),
  { text: KEEP_HELPER.none, file: NEW_ALBUM_DIALOG, mode: 'verbatim' },
  {
    text: KEEP_HELPER.days,
    file: NEW_ALBUM_DIALOG,
    mode: 'fragments',
    fragments: ['`Each file is deleted ${retention} days after it is uploaded. This cannot be undone.`'],
  },

  // The receipts.
  { text: CLEANUP_TITLE, file: RETENTION, mode: 'fragments', fragments: ["title: 'Delivered files cleaned up',"] },
  ...CLEANUPS.map(
    (c): SourceEntry => ({
      text: c.body,
      file: RETENTION,
      mode: 'fragments',
      fragments: ["`${album.removed} file${album.removed === 1 ? '' : 's'} removed from “${album.name}” as scheduled.`"],
    }),
  ),
  { file: RETENTION, mode: 'fragments', fragments: ['@Cron(CronExpression.EVERY_DAY_AT_3AM)', 'f.created_at < now() - make_interval(days => a.retention_days)'] },
  // Where each list puts the time: the web page a time of day under "Today", the phone how long ago.
  { text: SWEEP_TIME, file: 'web/src/app/(app)/notifications/page-client.tsx', mode: 'fragments', fragments: ['when={timeOfDay(n.createdAt)}'] },
  { file: 'web/src/lib/notification-categories.ts', mode: 'fragments', fragments: ['return new Date(iso).toLocaleTimeString(undefined, {', "hour: 'numeric',", "minute: '2-digit',"] },
  {
    text: CLEANUPS[0].phoneTime,
    file: 'mobile/app/(app)/notifications/index.tsx',
    mode: 'fragments',
    fragments: ['{today ? ago(n.createdAt) : timeOfDay(n.createdAt)}', 'if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;'],
  },

  // The client page with nothing left to show.
  { text: CLIENT_EMPTY, file: CLIENT_PAGE, mode: 'verbatim' },

  // The album card, web and phone: the pill, "Empty", and the time.
  { text: 'Delivered', file: WEB_ALBUMS, mode: 'fragments', fragments: ["delivered: { label: 'Delivered', className: 'text-success' }", "draft: { label: 'Draft', className: 'text-muted-foreground' }"] },
  { text: CARD.empty, file: WEB_ALBUMS, mode: 'fragments', fragments: ['<span>Empty</span>'] },
  {
    text: CARD.justNowWeb,
    file: WEB_ALBUMS,
    mode: 'fragments',
    fragments: [
      "if (minutes < 1) return 'just now';",
      'if (minutes < 60) return `${minutes}m ago`;',
      'if (hours < 24) return `${hours}h ago`;',
      'if (days < 30) return `${days}d ago`;',
      "return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });",
    ],
  },
  { text: 'Delivered', file: PHONE_ALBUMS, mode: 'fragments', fragments: ["delivered: { label: 'Delivered', className: 'bg-card/90', text: 'text-success' }", "draft: { label: 'Draft', className: 'bg-card/90', text: 'text-muted-foreground' }"] },
  { text: CARD.empty, file: PHONE_ALBUMS, mode: 'fragments', fragments: ['<Text className="text-muted-foreground text-[11px]">Empty</Text>'] },
  {
    text: CARD.justNowPhone,
    file: PHONE_ALBUMS,
    mode: 'fragments',
    fragments: [
      "if (mins < 1) return 'Just now';",
      'if (mins < 60) return `${mins}m ago`;',
      'if (hours < 24) return `${hours}h ago`;',
      'if (days < 7) return `${days}d ago`;',
      'return `${Math.floor(days / 7)}w ago`;',
    ],
  },
];
