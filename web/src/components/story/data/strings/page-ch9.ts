/**
 * Ch9 — Everything around the shoot · #features (05-cinema.md §3). Page-
 * authored copy, so check-story lints it. One H3 and at most eight words per
 * tile, and only what the app does today. Zero-import data module.
 */
export const SOURCES: { text: string; file: string; mode: 'verbatim' }[] = [];

export const CH9_COPY = {
  title: 'Everything around the shoot',
} as const;

export type TileKey = 'nearby' | 'job' | 'hire' | 'calendar' | 'album' | 'client' | 'forget' | 'chat' | 'desktop';

/** The tiles, in the story's order. `line` is eight words or fewer. */
export const TILES: readonly { key: TileKey; title: string; line: string }[] = [
  { key: 'nearby', title: 'Find who’s near', line: 'Roles and a radius, 5 to 200 km.' },
  { key: 'job', title: 'Post the job once', line: 'A rate for every role.' },
  { key: 'hire', title: 'Hired, in writing', line: 'Role, date, place and rate. They confirm.' },
  { key: 'calendar', title: 'A calendar people answer', line: 'Invites wait for a yes. Reminders ring offline.' },
  { key: 'album', title: 'One album, in order', line: 'Everyone’s uploads, in the order they were shot.' },
  { key: 'client', title: 'Client links that just open', line: 'No account. They heart their favourites.' },
  { key: 'forget', title: 'Files that clear out', line: 'Keep each file 30 to 365 days.' },
  { key: 'chat', title: 'Talk to the crew', line: 'Group threads, replies and @mentions.' },
  { key: 'desktop', title: 'On every screen', line: 'Windows, macOS, Android and any browser.' },
];
