/**
 * Ch6, The Handover: what the owner and the client see. The owner's "Client
 * link" controls (the web dialog, the phone sheet and the alert the phone
 * shows once a link is made) and the client's delivery page, filled with the
 * story's album.
 *
 * A zero-import data module (see `../story.ts`): relative imports of other
 * story data modules only, so `scripts/check-story.mjs` can load it under
 * plain Node and prove every app string below against the file it copies.
 *
 * Two moments, two sets of counts:
 * - Sunday 13 December, 4:50 PM (`NOW.ch6`). The link shows photos only, and
 *   the album holds 412 photos, two films (the same-day edit and the teaser)
 *   and two recordings.
 * - Three weeks later (`NOW.ch6Later`). Ernie's six films are in, and the same
 *   link is widened to photos, films and audio: 412 + 8 + 2 = 422.
 */
import { ALBUM, CLIENT, COHORTS, NOW, WHEN } from '../story';
import type { SourceEntry } from './common';

const WEB_DIALOG = 'web/src/components/media/share-dialog.tsx';
const PHONE_ALBUM = 'mobile/app/(app)/albums/[albumId]/index.tsx';
const CLIENT_SRC = 'api/src/albums/share/client-gallery.template.ts';
const PALETTE_SRC = 'api/src/albums/share/client-palette.ts';
const SHARE_SERVICE = 'api/src/albums/share/album-share.service.ts';

const round1 = (n: number) => Math.round(n * 10) / 10;

// ─── The link ────────────────────────────────────────────────────────────

/**
 * The address, as both apps print it: `https://client.virgo.ph/s/` and a
 * token. The token is drawn as an illustrative tail ("a4f2…") that opens
 * nothing, and it is the same in every frame: changing what a link shows
 * keeps its address.
 */
export const LINK_URL = `https://${ALBUM.linkPath}`;

export type ShareKind = 'image' | 'video' | 'audio';

/** The order both apps list the kinds in. */
export const SHARE_KINDS: readonly ShareKind[] = ['image', 'video', 'audio'];

// ─── The web dialog ──────────────────────────────────────────────────────

/** `web/src/components/media/share-dialog.tsx`. The web says "Videos"; the phone and the client page say "Films". */
export const DIALOG = {
  title: 'Client link',
  description: `A read-only gallery of ${CLIENT.album}. It opens in any browser with no account needed.`,
  shows: 'What the link shows',
  kinds: { image: 'Photos', video: 'Videos', audio: 'Audio' },
  helper: 'Anything unticked is not served at all, not merely hidden.',
  link: 'Link',
  note: 'Unguessable, but public to anyone holding it. Treat it like a key, and revoke it once the shoot is signed off.',
  revoke: 'Revoke link',
  generate: 'Generate link',
  update: 'Update link',
  upToDate: 'Link is up to date',
} as const;

// ─── The phone sheet and its alert ───────────────────────────────────────

/** The album screen's "Client link" sheet (mobile `albums/[albumId]/index.tsx`). */
export const SHEET = {
  title: 'Client link',
  intro: 'Choose what the client sees. Anything unticked is not served by the link at all.',
  make: 'Make link',
  making: 'Making the link…',
} as const;

/** LINK_SCOPE_ROWS, in the app's order. */
export const SHEET_ROWS = [
  { kind: 'image', label: 'Photos', singular: 'photo', plural: 'photos' },
  { kind: 'video', label: 'Films', singular: 'film', plural: 'films' },
  { kind: 'audio', label: 'Audio', singular: 'file', plural: 'files' },
] as const satisfies readonly { kind: ShareKind; label: string; singular: string; plural: string }[];

/** The sheet's `plural()`: "412 photos", "1 film". */
const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** Sunday's upload: the teaser and the two recordings. */
const SUNDAY_FILMS = ALBUM.filmsSaturday + (COHORTS[1].files - ALBUM.recordings);

const sheetCounts = (films: number): Record<ShareKind, string> => ({
  image: plural(ALBUM.photos, SHEET_ROWS[0].singular, SHEET_ROWS[0].plural),
  video: plural(films, SHEET_ROWS[1].singular, SHEET_ROWS[1].plural),
  audio: plural(ALBUM.recordings, SHEET_ROWS[2].singular, SHEET_ROWS[2].plural),
});

/** Each row's second line: the whole album's count of that kind, as the sheet reads it. */
export const SHEET_COUNTS = {
  /** Sunday, 4:50 PM: 412 photos · 2 films · 2 files. */
  sunday: sheetCounts(SUNDAY_FILMS),
  /** Three weeks later: 412 photos · 8 films · 2 files. */
  later: sheetCounts(ALBUM.films),
} as const;

/** The native alert once the link is made. Its message is the URL itself. */
export const ALERT = {
  title: 'Client link ready',
  copy: 'Copy link',
  share: 'Share…',
  done: 'Done',
} as const;

// ─── The client page ─────────────────────────────────────────────────────

/** `client-gallery.template.ts`, word for word. The eyebrow is drawn uppercase by CSS, as there. */
export const CLIENT_PAGE = {
  eyebrow: 'Private delivery',
  downloadAll: 'Download all',
  everything: 'Everything',
  kinds: { all: 'All', image: 'Photos', video: 'Films', audio: 'Audio' },
  myPicks: 'My picks',
  picked: 'picked',
  download: 'Download',
  send: 'Send to photographer',
  sendAgain: 'Send again',
  recordings: 'Recordings',
  empty: 'Nothing has been shared here yet.',
} as const;

/** The album's name, as the link carries it: the page's H1 and its document title. */
export const CLIENT_ALBUM = CLIENT.album;

const items = (n: number) => `${n} item${n === 1 ? '' : 's'}`;
/** bytesLabel(): "5.6 GB" from 1 GB up, "0 MB" for nothing. */
const gb = (n: number) => `${n.toFixed(1)} GB`;

/** Everything this link shows, in bytes: Sunday's photos, then the whole album. */
const LATER_GB = round1(COHORTS.reduce((s, c) => s + c.gb, 0));

/** The hero's summary line: the count is what the link shows, the size its total. */
export const CLIENT_SUMMARY = {
  sunday: `${items(ALBUM.photos)} · ${gb(ALBUM.photosGb)}`,
  later: `${items(ALBUM.total)} · ${gb(LATER_GB)}`,
  /** After the last sweep (Ch7): the link stays, with nothing left to show. */
  empty: `${items(0)} · 0 MB`,
} as const;

export type ClientChapter = { name: string; count: number };

/** "Everything" with the link's total, then the album's sections in the photographer's order. */
const chapters = (all: number): readonly ClientChapter[] => [
  { name: CLIENT_PAGE.everything, count: all },
  ...ALBUM.sections.map((s) => ({ name: s.name, count: s.photos })),
];

export const CLIENT_CHAPTERS = {
  sunday: chapters(ALBUM.photos),
  later: chapters(ALBUM.total),
} as const;

export type KindKey = 'all' | ShareKind;

/**
 * The kind tabs once the link shows all three kinds. With photos only there
 * is one kind, and the real page hides the bar.
 */
export const CLIENT_KIND_TABS: readonly { key: KindKey; label: string; count: number }[] = [
  { key: 'all', label: CLIENT_PAGE.kinds.all, count: ALBUM.total },
  { key: 'image', label: CLIENT_PAGE.kinds.image, count: ALBUM.photos },
  { key: 'video', label: CLIENT_PAGE.kinds.video, count: ALBUM.films },
  { key: 'audio', label: CLIENT_PAGE.kinds.audio, count: ALBUM.recordings },
];

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

/** "Dec 13": `toLocaleDateString(undefined, { day, month: 'short' })` in an en-US browser. */
const shortDate = (iso: string) => `${MONTHS_SHORT[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;

/**
 * The page's own `dayTitle`: en-GB, "Saturday 12 December", with the year
 * only when it is not the viewer's. With the year, en-GB puts a comma after
 * the weekday: "Sunday, 13 December 2026" (Chromium 153, ICU 77). No Intl,
 * so it reads the same in Node, Next and Remotion.
 */
function clientDayTitle(key: string, nowIso: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return y === Number(nowIso.slice(0, 4)) ? `${weekday} ${d} ${MONTHS[m - 1]}` : `${weekday}, ${d} ${MONTHS[m - 1]} ${y}`;
}

/** The picks bar and the "My picks" toggle. */
export const CLIENT_PICKS = {
  count: ALBUM.picks,
  /** The toggle once there are picks. */
  mine: `${CLIENT_PAGE.myPicks} · ${ALBUM.picks}`,
  /** Beside "Send again" on a wide screen; hidden at 520 px and under, so never on the phone. */
  sentNote: `Sent ${shortDate(WHEN.picksSent)}`,
} as const;

/**
 * The album's films, in the order the page would reach them: Kenn's same-day
 * edit on Saturday night, the teaser on Sunday, and Ernie's six three weeks
 * later. Durations are illustrative, except the same-day edit's.
 */
export const CLIENT_FILMS: readonly { id: string; duration: string }[] = [
  { id: 'same-day-edit', duration: ALBUM.sameDayEditDuration },
  { id: 'teaser', duration: '1:04' },
  { id: 'highlights', duration: '6:12' },
  { id: 'ceremony', duration: '24:08' },
  { id: 'prep', duration: '2:41' },
  { id: 'first-dance', duration: '3:55' },
  { id: 'speeches', duration: '11:37' },
  { id: 'reception', duration: '5:20' },
];

/** The page's play, pause, next-track and close marks: characters, not icons. */
export const CLIENT_GLYPHS = { play: '▶', pause: 'Ⅱ', next: '⏭', close: '✕' } as const;

const seconds = (clock: string) => clock.split(':').reduce((s, part) => s * 60 + Number(part), 0);
const clockOf = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

const SDE_SECONDS = seconds(ALBUM.sameDayEditDuration);
const PLAYED_SECONDS = 96;

/**
 * The player the page opens over itself when a film is tapped
 * (`#videoViewer`): close, the file's name and length, download, and the
 * video with the browser's own controls. Films never play inside their tile.
 * Kenn's same-day edit, 1:36 in. The file name is what Kenn called it, so it
 * is illustrative; so are the positions the browser's controls show.
 */
export const CLIENT_PLAYER = {
  name: 'Reyes & Santos SDE.mp4',
  meta: ALBUM.sameDayEditDuration,
  /** The browser's controls, before and while it plays. */
  start: `${clockOf(0)} / ${ALBUM.sameDayEditDuration}`,
  playing: `${clockOf(PLAYED_SECONDS)} / ${ALBUM.sameDayEditDuration}`,
  progress: Math.round((PLAYED_SECONDS / SDE_SECONDS) * 1000) / 1000,
} as const;

/** A film tile's badge: "▶ 3:48". */
export const filmBadge = (duration: string) => `${CLIENT_GLYPHS.play} ${duration}`;

/**
 * The line under each recording: the day it arrived, not the day it was
 * recorded. The API dates a film from its container but gives a sound file no
 * capture time, so the page falls back to the upload. Both recordings came up
 * with the teaser on Sunday afternoon, and three weeks later the year is no
 * longer the viewer's, so it is printed. Titles other than "Vows" are
 * illustrative.
 */
const RECORDED = clientDayTitle(COHORTS[1].uploaded.from.slice(0, 10), NOW.ch6Later);

/** The Recordings line: "2 files". */
const filesLine = (n: number) => `${n} file${n === 1 ? '' : 's'}`;

export const CLIENT_RECORDINGS = {
  heading: CLIENT_PAGE.recordings,
  count: filesLine(ALBUM.recordings),
  tracks: [
    { title: ALBUM.recordingTitle, sub: RECORDED, duration: ALBUM.recordingLength },
    { title: 'Speeches', sub: RECORDED, duration: '6:05' },
  ],
} as const;

/** The audio dock while "Vows" plays: its title, its clock, and how far along the bar is. */
export const CLIENT_DOCK = {
  title: ALBUM.recordingTitle,
  clock: `${ALBUM.recordingPosition} / ${ALBUM.recordingLength}`,
  progress: Math.round((seconds(ALBUM.recordingPosition) / seconds(ALBUM.recordingLength)) * 1000) / 1000,
} as const;

/**
 * What the page says to a screen reader. None of it is drawn: on the real
 * page these sentences live in a visually hidden live region. Ch6's
 * figcaption and the "Try the hearts" demo read them.
 */
export const CLIENT_ANNOUNCE = {
  sent: `Sent. Your photographer has your ${ALBUM.picks} picks.`,
  picked: 'Picked. ',
  removed: 'Removed. ',
  inAll: ' picked in all.',
  /** A heart's label: "Pick: " + the file's name. */
  pick: 'Pick: ',
  unpick: 'Remove from picks: ',
} as const;

/** The page's palette (`client-palette.ts`, from design/tokens.json "delivery"). The hero panel is dark in both. */
export const CLIENT_PALETTE = {
  light: { paper: '#FBF7F2', ink: '#201C19', muted: '#6F5C52', line: '#DED3CA', accent: '#A85D35', accentInk: '#FFFFFF' },
  dark: { paper: '#171411', ink: '#F2EDE8', muted: '#A89488', line: '#302A26', accent: '#D18A5A', accentInk: '#171411' },
  panel: '#211D1A',
  panelInk: '#FFFFFF',
  panelMuted: 'rgba(255,255,255,0.74)',
  panelAccent: '#E0A97C',
} as const;

/** The page's type: the system stack, a serif for the album's name, mono for counts. Never Geist. */
export const CLIENT_FONTS = {
  sans: 'ui-sans-serif,system-ui,sans-serif',
  serif: 'ui-serif,Georgia,serif',
  mono: 'ui-monospace,monospace',
} as const;

// ─── Sources ─────────────────────────────────────────────────────────────

const kindRow = (kind: string, label: string, one: string, many: string, icon: string): SourceEntry => ({
  text: label,
  file: PHONE_ALBUM,
  mode: 'fragments',
  fragments: [`{ kind: '${kind}', label: '${label}', singular: '${one}', plural: '${many}', icon: ${icon} }`],
});

const paletteEntry = (key: string, value: string): SourceEntry => ({
  text: value,
  file: PALETTE_SRC,
  mode: 'fragments',
  fragments: [`${key}: '${value}',`],
});

export const SOURCES: readonly SourceEntry[] = [
  // The address.
  { text: LINK_URL, file: SHARE_SERVICE, mode: 'fragments', fragments: ["'https://client.virgo.ph'", '`${this.shareBaseUrl()}/s/${token}`'] },

  // The web dialog.
  { text: DIALOG.title, file: WEB_DIALOG, mode: 'fragments', fragments: ['<DialogTitle>Client link</DialogTitle>'] },
  {
    text: DIALOG.description,
    file: WEB_DIALOG,
    mode: 'fragments',
    fragments: ['A read-only gallery of {albumName}. It opens in any browser with no account needed.'],
  },
  { text: DIALOG.shows, file: WEB_DIALOG, mode: 'fragments', fragments: ['<Label>What the link shows</Label>'] },
  { text: DIALOG.kinds.image, file: WEB_DIALOG, mode: 'fragments', fragments: ["image: 'Photos',"] },
  { text: DIALOG.kinds.video, file: WEB_DIALOG, mode: 'fragments', fragments: ["video: 'Videos',"] },
  { text: DIALOG.kinds.audio, file: WEB_DIALOG, mode: 'fragments', fragments: ["audio: 'Audio',"] },
  { text: DIALOG.helper, file: WEB_DIALOG, mode: 'verbatim' },
  { text: DIALOG.link, file: WEB_DIALOG, mode: 'fragments', fragments: ['<Label htmlFor="share-url">Link</Label>'] },
  { text: DIALOG.note, file: WEB_DIALOG, mode: 'verbatim' },
  { text: DIALOG.revoke, file: WEB_DIALOG, mode: 'verbatim' },
  {
    file: WEB_DIALOG,
    mode: 'fragments',
    fragments: ["{link ? (changed ? 'Update link' : 'Link is up to date') : 'Generate link'}"],
  },

  // The phone sheet.
  { text: SHEET.title, file: PHONE_ALBUM, mode: 'fragments', fragments: ['title="Client link"'] },
  { text: SHEET.intro, file: PHONE_ALBUM, mode: 'verbatim' },
  kindRow('image', 'Photos', 'photo', 'photos', 'ImageIcon'),
  kindRow('video', 'Films', 'film', 'films', 'VideoIcon'),
  kindRow('audio', 'Audio', 'file', 'files', 'MusicIcon'),
  {
    text: SHEET_COUNTS.sunday.image,
    file: PHONE_ALBUM,
    mode: 'fragments',
    fragments: ['`${count.toLocaleString()} ${count === 1 ? one : many}`', '{plural(n, row.singular, row.plural)}'],
  },
  { file: PHONE_ALBUM, mode: 'fragments', fragments: ["{linking ? 'Making the link…' : 'Make link'}"] },
  // The checked row and box, as the sheet draws them.
  {
    file: PHONE_ALBUM,
    mode: 'fragments',
    fragments: [
      "checked ? 'bg-primary/10 border-primary/30' : 'border-border'",
      "checked ? 'bg-action' : 'border-2 border-border'",
    ],
  },

  // The alert.
  { text: ALERT.title, file: PHONE_ALBUM, mode: 'fragments', fragments: ["Alert.alert('Client link ready', link.url, ["] },
  { text: ALERT.copy, file: PHONE_ALBUM, mode: 'fragments', fragments: ["text: 'Copy link',"] },
  { text: ALERT.share, file: PHONE_ALBUM, mode: 'fragments', fragments: ["text: 'Share…',"] },
  { text: ALERT.done, file: PHONE_ALBUM, mode: 'fragments', fragments: ["{ text: 'Done', style: 'cancel' }"] },

  // The client page.
  { text: CLIENT_PAGE.eyebrow, file: CLIENT_SRC, mode: 'verbatim' },
  { text: CLIENT_PAGE.eyebrow, file: CLIENT_SRC, mode: 'fragments', fragments: ['text-transform:uppercase'] },
  { text: CLIENT_PAGE.downloadAll, file: CLIENT_SRC, mode: 'verbatim' },
  {
    text: CLIENT_SUMMARY.sunday,
    file: CLIENT_SRC,
    mode: 'fragments',
    fragments: [
      "${view.total} item${view.total === 1 ? '' : 's'}",
      '` · ${bytesLabel(view.totalBytes)}`',
      '`${(mb / 1024).toFixed(1)} GB`',
    ],
  },
  { text: CLIENT_SUMMARY.empty, file: CLIENT_SRC, mode: 'fragments', fragments: ["if (bytes <= 0) return '0 MB';"] },
  { text: CLIENT_PAGE.everything, file: CLIENT_SRC, mode: 'fragments', fragments: ["name: 'Everything', count: initial.total"] },
  {
    file: CLIENT_SRC,
    mode: 'fragments',
    fragments: ["{ all: 'All', image: 'Photos', video: 'Films', audio: 'Audio' }", 'bar.hidden = options.length < 2;'],
  },
  { text: CLIENT_PICKS.mine, file: CLIENT_SRC, mode: 'fragments', fragments: ["'My picks · ' + picks.count : 'My picks'"] },
  { text: CLIENT_PAGE.picked, file: CLIENT_SRC, mode: 'fragments', fragments: ['<span>picked</span>'] },
  { text: CLIENT_PAGE.download, file: CLIENT_SRC, mode: 'fragments', fragments: ['<span class="dl-label">&nbsp;Download</span>'] },
  { text: CLIENT_PAGE.send, file: CLIENT_SRC, mode: 'verbatim' },
  { text: CLIENT_PAGE.sendAgain, file: CLIENT_SRC, mode: 'verbatim' },
  {
    text: CLIENT_PICKS.sentNote,
    file: CLIENT_SRC,
    mode: 'fragments',
    fragments: ["'Sent ' + new Date(picks.sentAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })"],
  },
  // At 520 px and under the Download label and the sent note go.
  { file: CLIENT_SRC, mode: 'fragments', fragments: ['@media(max-width:520px){.picks{gap:8px;padding-left:12px}.picks .dl-label{display:none}.picks .sent{display:none}}'] },
  {
    text: filmBadge(ALBUM.sameDayEditDuration),
    file: CLIENT_SRC,
    mode: 'fragments',
    fragments: ["'▶ ' + (file.processingStatus === 'pending' ? 'Preparing' : duration(file.durationMs))"],
  },
  { text: CLIENT_RECORDINGS.heading, file: CLIENT_SRC, mode: 'fragments', fragments: ["node('h2', '', 'Recordings')"] },
  { text: CLIENT_RECORDINGS.count, file: CLIENT_SRC, mode: 'fragments', fragments: ["sound.length + ' file' + (sound.length === 1 ? '' : 's')"] },
  {
    text: RECORDED,
    file: CLIENT_SRC,
    mode: 'fragments',
    fragments: [
      "node('small', '', file.mediaArtist || dayTitle(dayKey(file)))",
      // No capture time: the day it was uploaded.
      'const d = new Date(file.createdAt);',
      "const opts = { weekday: 'long', day: 'numeric', month: 'long' };",
      "if (date.getFullYear() !== now.getFullYear()) opts.year = 'numeric';",
      "return date.toLocaleDateString('en-GB', opts);",
    ],
  },
  // Why a recording has no capture time: only a film is dated from its container.
  {
    file: 'api/src/storage/media-processing.service.ts',
    mode: 'fragments',
    fragments: ['const takenAt = video ? takenAtFromVideoTags(probe.format?.tags) : null;'],
  },
  { text: CLIENT_DOCK.clock, file: CLIENT_SRC, mode: 'fragments', fragments: ["clock(audio.currentTime) + ' / ' + clock(audio.duration)"] },
  {
    file: CLIENT_SRC,
    mode: 'fragments',
    fragments: [
      "audioIndex === index && !el('audio').paused ? 'Ⅱ' : '▶'",
      '<button id="audioToggle" class="round" aria-label="Play">&#9654;</button>',
      '<button id="audioNext" class="round" aria-label="Next track">&#9197;</button>',
      "el('audioToggle').textContent = 'Ⅱ';",
    ],
  },
  // The film player: a full-screen layer over the page, the file's own name
  // and length, a download, and the browser's controls on the video.
  {
    text: CLIENT_GLYPHS.close,
    file: CLIENT_SRC,
    mode: 'fragments',
    fragments: ['<button id="videoClose" class="round" aria-label="Close">&#10005;</button>'],
  },
  {
    text: CLIENT_PLAYER.meta,
    file: CLIENT_SRC,
    mode: 'fragments',
    fragments: ["el('videoName').textContent = file.originalName;", "el('videoMeta').textContent = duration(file.durationMs);"],
  },
  {
    file: CLIENT_SRC,
    mode: 'fragments',
    fragments: [
      '.overlay{position:fixed;z-index:60;inset:0;display:none;min-height:100dvh;background:#141210;color:#fff}',
      '.vbar{display:flex;align-items:center;gap:8px;padding:12px}',
      '.vtitle small{color:rgba(255,255,255,.74);font:11px ui-monospace,monospace}',
      '<video id="video" class="video" controls playsinline></video>',
      "el('videoDownload').hidden = !file.downloadUrl;",
      "film ? openVideo(file) : openPhoto(list.filter((f) => kindOf(f) === 'image'), file)",
    ],
  },
  { text: CLIENT_PAGE.empty, file: CLIENT_SRC, mode: 'verbatim' },
  { text: CLIENT_ANNOUNCE.sent, file: CLIENT_SRC, mode: 'fragments', fragments: ["'Sent. Your photographer has your ' + result.count + ' picks.'"] },
  {
    file: CLIENT_SRC,
    mode: 'fragments',
    fragments: [
      "'Picked. ' + result.count + ' picked in all.'",
      "'Removed. ' + result.count + ' picked in all.'",
      "(on ? 'Remove from picks: ' : 'Pick: ') + file.originalName",
    ],
  },
  { text: CLIENT_FONTS.sans, file: CLIENT_SRC, mode: 'fragments', fragments: ['font:15px/1.5 ui-sans-serif,system-ui,sans-serif'] },
  { text: CLIENT_FONTS.serif, file: CLIENT_SRC, mode: 'fragments', fragments: ['font:400 clamp(36px,6.4vw,68px)/.98 ui-serif,Georgia,serif'] },
  { text: CLIENT_FONTS.mono, file: CLIENT_SRC, mode: 'fragments', fragments: ['font:12px ui-monospace,monospace'] },

  // The palette.
  ...Object.entries(CLIENT_PALETTE.light).map(([k, v]) => paletteEntry(k, v)),
  ...Object.entries(CLIENT_PALETTE.dark).map(([k, v]) => paletteEntry(k, v)),
  paletteEntry('panel', CLIENT_PALETTE.panel),
  paletteEntry('panelInk', CLIENT_PALETTE.panelInk),
  paletteEntry('panelMuted', CLIENT_PALETTE.panelMuted),
  paletteEntry('panelAccent', CLIENT_PALETTE.panelAccent),
];
