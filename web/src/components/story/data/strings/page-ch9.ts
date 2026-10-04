/**
 * Ch9 — Everything Around the Shoot · #features (storyboard §2 Ch9) —
 * page-authored copy. The few app words the tiles' little pictures print
 * ("Waiting on them", "Agreed", "Invited", "Going", "picked") come from the
 * chapters' own strings files, already proven there. Zero-import data module,
 * linted by check-story.
 */
export const SOURCES: { text: string; file: string; mode: 'verbatim' }[] = [];

export const CH9_COPY = {
  eyebrow: '09 · What you get',
  title: 'Everything around the shoot',
  lead: 'Shooting is the part you love. Virgo handles what is wrapped around it: the crew, the calendar, the files, the client, and the tidying up afterwards.',
  storyHeading: 'From the story',
  practicalHeading: 'And the practical bits',
  more: 'More',
  download: 'Download',
  seeChapter: 'See it in the story',
  footnote: 'Interface details drawn from the app. Illustrative.',
} as const;

export type StoryTileKey = 'nearby' | 'job' | 'hire' | 'calendar' | 'album' | 'client' | 'forget' | 'chat';

/** The eight story tiles, in the story's order. `short` is the mobile row's line (≤ 80 characters). */
export const STORY_TILES: readonly {
  key: StoryTileKey;
  title: string;
  href?: string;
  line: string;
  short: string;
}[] = [
  {
    key: 'nearby',
    title: 'Find who’s near',
    href: '#nearby',
    line: 'Pick the roles and a distance from 5 km to 200, from where you are, a city or an upcoming shoot. Only how far away you are is ever shared.',
    short: 'Roles and a distance, 5 to 200 km. Only how far away you are is shared.',
  },
  {
    key: 'job',
    title: 'Post the job once',
    href: '#hire',
    line: 'A budget for each role, up to ₱500,000. The post comes down after 30 days or once the job date passes.',
    short: 'A budget for each role, up to ₱500,000.',
  },
  {
    key: 'hire',
    title: 'Hire, and it’s written down',
    href: '#connect',
    line: 'Accept an applicant and get a chat and a booking: role, date, place, rate, what’s included. They confirm; change anything and they confirm again. A record, not a contract.',
    short: 'A chat and a booking with the agreed terms. A record, not a contract.',
  },
  {
    key: 'calendar',
    title: 'A calendar people answered',
    href: '#calendar',
    line: 'Invites wait for a yes. Move the time and everyone going hears who changed what. Reminders with the alarm on ring with no signal.',
    short: 'Invites wait for a yes. Reminders ring with no signal.',
  },
  {
    key: 'album',
    title: 'One album, in the order it happened',
    href: '#saturday',
    line: 'Sorted by when each frame was taken, in sections your client sees as chapters. Originals kept as shot. Crew uploads count against your storage.',
    short: 'Sorted by when each frame was taken, in your client’s chapters.',
  },
  {
    key: 'client',
    title: 'Client links that just open',
    href: '#delivery',
    line: 'No account. Photos, films and recordings. Clients heart their favourites and download them or send them to you.',
    short: 'No account. Clients heart favourites and send them to you.',
  },
  {
    key: 'forget',
    title: 'Files that clear themselves out',
    href: '#forget',
    line: 'Choose a retention window when you make the album. Each file goes in the first nightly clean-up after its time is up, and you get a notice.',
    short: 'Each file goes after its retention window, and you get a notice.',
  },
  {
    key: 'chat',
    title: 'Talk to the crew',
    line: 'One-to-one and group threads with read receipts, replies, @mentions and mute.',
    short: 'Group threads with read receipts, replies and @mentions.',
  },
];

export type PracticalTileKey = 'desktop' | 'uploads' | 'account' | 'notifications' | 'archive';

/** The five practical tiles. `short` is the mobile list's one line; the full line opens under More. */
export const PRACTICAL_TILES: readonly {
  key: PracticalTileKey;
  title: string;
  line: string;
  short: string;
}[] = [
  {
    key: 'desktop',
    title: 'On your desktop',
    line: 'Virgo for Windows 10 and 11, and macOS 10.15 or later on Apple Silicon or Intel. It checks for updates and installs them when you click Update.',
    short: 'Virgo for Windows and macOS.',
  },
  {
    key: 'uploads',
    title: 'Uploads that keep going',
    line: 'Three at a time on the web, with speed and time left, or drop a whole folder. On the phone, an upload cut off when the app closed is checked and sent again next time you open Virgo.',
    short: 'Three at a time, or a whole folder.',
  },
  {
    key: 'account',
    title: 'Your account, your call',
    line: 'Two-step sign-in with a six-digit code by email, plus ten recovery codes. Need a break? Pause for 7, 14, 30 or 90 days; it lifts on its own.',
    short: 'Two-step sign-in, and a pause when you need one.',
  },
  {
    key: 'notifications',
    title: 'Notifications on your terms',
    line: 'Choose which kinds reach your phone, your inbox or your desktop.',
    short: 'Your phone, your inbox or your desktop.',
  },
  {
    key: 'archive',
    title: 'Archive a finished job',
    line: 'Fold a finished workspace out of everyone’s list, and bring it back whenever.',
    short: 'Fold it away; bring it back whenever.',
  },
];

/** What each tile's little picture shows, for its figcaption-free alt (the pictures are aria-hidden). */
export const MINI = {
  nearbyFrom: '5 km',
  nearbyTo: '25 km',
  chatMention: '@Kenn',
} as const;
