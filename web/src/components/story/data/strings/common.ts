/**
 * Strings the shared frames and primitives draw: the desktop app's chrome,
 * the notification row's tables, and a few notifications the lab and any
 * chapter can reuse.
 *
 * A zero-import data module (see `../story.ts`): relative imports of other
 * story data modules only, no `@/` aliases, React or packages, so
 * `scripts/check-story.mjs` can load it under plain Node.
 *
 * Every string copied from the app is listed in `SOURCES` with the file it
 * comes from; the check fails the moment the app's wording drifts. Strings
 * that are OS chrome rather than Virgo UI (the status bar, the lock screen)
 * are marked as such and have no source.
 */
import { ALBUM, CAST, CLIENT, COHORTS, WHEN } from '../story';

/** One string copied from the app, and where the check finds it. */
export type SourceEntry =
  | { text: string; file: string; mode: 'verbatim' }
  | {
      /** The string as the page draws it, when it is built from a template. */
      text?: string;
      file: string;
      mode: 'fragments';
      /** Every one of these must appear, exactly, in `file`. */
      fragments: readonly string[];
    };

// ─── The desktop app ─────────────────────────────────────────────────────

/** The title bar's name beside the mark, and the sidebar head's. */
export const APP_NAME = 'Virgo';

export type NavKey =
  | 'dashboard'
  | 'feed'
  | 'workspaces'
  | 'albums'
  | 'schedule'
  | 'network'
  | 'chat'
  | 'nearby'
  | 'jobs'
  | 'bookings'
  | 'notifications'
  | 'support';

/** lucide-react icon names, resolved to components in `frames/desktop-window.tsx`. */
export type NavIcon =
  | 'Home'
  | 'LayoutGrid'
  | 'FolderOpen'
  | 'Images'
  | 'CalendarDays'
  | 'Users'
  | 'MessageCircle'
  | 'MapPin'
  | 'BriefcaseBusiness'
  | 'FileText'
  | 'Bell'
  | 'LifeBuoy';

export type NavGroup = {
  heading?: string;
  items: readonly { key: NavKey; label: string; icon: NavIcon }[];
};

/**
 * The app shell's sidebar, in the app's order. Rewards is left out on
 * purpose (the brief keeps offers off the page), and so is the "Creative OS"
 * line under the name, which the audit flags as brand drift.
 */
export const DESKTOP_NAV: readonly NavGroup[] = [
  {
    items: [
      { key: 'dashboard', label: 'Dashboard', icon: 'Home' },
      { key: 'feed', label: 'Feed', icon: 'LayoutGrid' },
      { key: 'workspaces', label: 'Workspaces', icon: 'FolderOpen' },
      { key: 'albums', label: 'Albums', icon: 'Images' },
      { key: 'schedule', label: 'Schedule', icon: 'CalendarDays' },
    ],
  },
  {
    heading: 'People',
    items: [
      { key: 'network', label: 'Network', icon: 'Users' },
      { key: 'chat', label: 'Chat', icon: 'MessageCircle' },
      { key: 'nearby', label: 'Nearby', icon: 'MapPin' },
      { key: 'jobs', label: 'Jobs', icon: 'BriefcaseBusiness' },
      { key: 'bookings', label: 'Bookings', icon: 'FileText' },
      { key: 'notifications', label: 'Notifications', icon: 'Bell' },
    ],
  },
  {
    items: [{ key: 'support', label: 'Support', icon: 'LifeBuoy' }],
  },
];

/** The sidebar footer's account. The address is illustrative. */
export const DESKTOP_USER = { name: CAST.mika.name, email: 'mika@example.com' } as const;

// ─── Notifications ───────────────────────────────────────────────────────

/** What each kind of notification is, as `@/api`'s CATEGORY_OF_TOPIC says (copied: that module is not importable from a mock). */
export const TOPIC_CATEGORY = {
  booking: 'bookings',
  'client-picks': 'albums',
  retention: 'albums',
  'job-application': 'jobs',
  'job-response': 'jobs',
  'hire-enquiry': 'hire',
  'hire-response': 'hire',
  'friend-request': 'network',
  'friend-accepted': 'network',
  'collaborator-invite': 'network',
  'collaborator-response': 'network',
  'event-invite': 'schedule',
  'event-response': 'schedule',
  'event-updated': 'schedule',
  reminder: 'schedule',
  billing: 'billing',
  'app-update': 'updates',
  promo: 'offers',
  support: 'support',
} as const;

export type Topic = keyof typeof TOPIC_CATEGORY;
export type Category = (typeof TOPIC_CATEGORY)[Topic];

/** The icon per topic: the web bell's table, which the phone app's matches glyph for glyph. */
export const TOPIC_ICON = {
  'friend-request': 'UserPlus',
  'friend-accepted': 'UserPlus',
  'collaborator-invite': 'Users',
  'collaborator-response': 'Users',
  'event-invite': 'Calendar',
  'event-response': 'Calendar',
  'event-updated': 'Calendar',
  'hire-enquiry': 'MessageCircle',
  'hire-response': 'MessageCircle',
  'job-application': 'BriefcaseBusiness',
  'job-response': 'BriefcaseBusiness',
  booking: 'FileText',
  reminder: 'Calendar',
  billing: 'CreditCard',
  retention: 'Trash2',
  'client-picks': 'Heart',
  support: 'LifeBuoy',
  promo: 'Gift',
  'app-update': 'Sparkles',
} as const satisfies Record<Topic, string>;

/** The list's day heading for today's rows (drawn uppercase by CSS on the web). */
export const TODAY = 'Today';

/** A row's time when it has just arrived. */
export const JUST_NOW = 'now';

const isoDate = (iso: string) => iso.slice(0, 10);
const isoTime = (iso: string) => iso.slice(11, 16);

/**
 * Notifications the app really sends, filled with the story's values. Any
 * chapter can draw these through `NotificationRow`; the lab does.
 */
export const NOTICES = {
  /** Ch4: Mika moves the call time on Friday night; the crew is told. */
  callMoved: {
    topic: 'event-updated',
    title: `${CAST.mika.name} moved an event`,
    body: `${CLIENT.event} — now ${isoDate(WHEN.eventAfter)} at ${isoTime(WHEN.eventAfter)}`,
    time: '9:20 PM',
  },
  /** Ch6: the couple send their picks on Sunday night. */
  picks: {
    topic: 'client-picks',
    title: 'Your client sent their picks',
    body: `${ALBUM.picks} files chosen from “${CLIENT.album}”.`,
    time: '8:15 PM',
  },
  /** Ch7: the receipt after the Day 91 sweep. Sent after, never before. */
  cleanedUp: {
    topic: 'retention',
    title: 'Delivered files cleaned up',
    body: `${COHORTS[0].files} files removed from “${CLIENT.album}” as scheduled.`,
    time: '3:00 AM',
  },
} as const satisfies Record<string, { topic: Topic; title: string; body: string; time: string }>;

// ─── OS chrome (not Virgo UI; no source) ─────────────────────────────────

/** Generic, OS-neutral words the phone frame and lock screen draw. */
export const OS = {
  /** The status bar beside zero signal bars. */
  noService: 'No service',
  /** A lock-screen notification's age when it has just arrived. */
  now: 'now',
} as const;

// ─── Sources ─────────────────────────────────────────────────────────────

const SHELL = 'web/src/components/app-shell.tsx';
const TITLE_BAR = 'web/src/components/desktop-title-bar.tsx';
const BELL = 'web/src/components/notification-bell.tsx';
const PHONE_TOPICS = 'mobile/src/lib/notification-topics.ts';
const WEB_TOPICS = 'web/src/api/endpoints/notifications.ts';

const nav = (label: string, icon: string): SourceEntry => ({
  text: label,
  file: SHELL,
  mode: 'fragments',
  fragments: [`label: '${label}', icon: ${icon}`],
});

export const SOURCES: readonly SourceEntry[] = [
  // The desktop title bar and the sidebar head.
  {
    text: APP_NAME,
    file: TITLE_BAR,
    mode: 'fragments',
    fragments: ['<span className="text-xs font-medium text-muted-foreground">Virgo</span>'],
  },
  {
    text: APP_NAME,
    file: SHELL,
    mode: 'fragments',
    fragments: ['<p className="truncate text-sm font-bold leading-none">Virgo</p>'],
  },
  // The sidebar, item by item, with its icon.
  ...DESKTOP_NAV.flatMap((g) => g.items.map((i) => nav(i.label, i.icon))),
  { text: 'People', file: SHELL, mode: 'fragments', fragments: ["heading: 'People'"] },

  // The topic tables, both copies checked against the app.
  ...Object.entries(TOPIC_CATEGORY).map(
    ([topic, category]): SourceEntry => ({
      file: WEB_TOPICS,
      mode: 'fragments',
      fragments: [`${/-/.test(topic) ? `'${topic}'` : topic}: '${category}',`],
    }),
  ),
  ...Object.entries(TOPIC_ICON).map(
    ([topic, icon]): SourceEntry => ({
      file: BELL,
      mode: 'fragments',
      // One fragment, matched with whitespace collapsed: several entries
      // break the line after the brace.
      fragments: [`${/-/.test(topic) ? `'${topic}'` : topic}: { icon: ${icon},`],
    }),
  ),
  { file: PHONE_TOPICS, mode: 'fragments', fragments: ['retention: { icon: Trash2Icon'] },
  {
    file: PHONE_TOPICS,
    mode: 'fragments',
    // The phone tints albums with the brand accent, where the web uses chart-3.
    fragments: [
      "case 'albums': case 'updates': case 'offers': return palette.accent;",
      "case 'schedule': return palette.warning;",
    ],
  },

  // The list's words.
  { text: TODAY, file: 'web/src/lib/notification-categories.ts', mode: 'fragments', fragments: ["return 'Today';"] },
  { text: JUST_NOW, file: BELL, mode: 'fragments', fragments: ["return 'now';"] },

  // The notifications, as the API writes them.
  {
    text: NOTICES.callMoved.title,
    file: 'api/src/schedule-events/event-attendees.service.ts',
    mode: 'fragments',
    fragments: ['`${who} moved an event`', '`${event.title} — now ${when}`', '`${date} at ${time.slice(0, 5)}`'],
  },
  {
    text: NOTICES.callMoved.body,
    file: 'api/src/schedule-events/event-attendees.service.ts',
    mode: 'fragments',
    fragments: ['`${event.title} — now ${when}`'],
  },
  {
    text: NOTICES.picks.title,
    file: 'api/src/albums/share/album-share.service.ts',
    mode: 'verbatim',
  },
  {
    text: NOTICES.picks.body,
    file: 'api/src/albums/share/album-share.service.ts',
    mode: 'fragments',
    fragments: ["`${count} file${count === 1 ? '' : 's'} chosen from “${link.name}”.`"],
  },
  {
    text: NOTICES.cleanedUp.title,
    file: 'api/src/albums/album-retention.service.ts',
    mode: 'verbatim',
  },
  {
    text: NOTICES.cleanedUp.body,
    file: 'api/src/albums/album-retention.service.ts',
    mode: 'fragments',
    fragments: [
      "`${album.removed} file${album.removed === 1 ? '' : 's'} removed from “${album.name}” as scheduled.`",
    ],
  },
];
