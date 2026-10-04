/**
 * The work · #the-work (05-cinema.md §3) — page-authored copy. The card's own
 * words (title, note, tags, Like · Keep · Hire) are the app's, proven in
 * `work.ts`. The kit around it is scenery, not a feature: the app has no gear
 * list. Zero-import data module, linted by check-story.
 */
export const SOURCES: { text: string; file: string; mode: 'verbatim' }[] = [];

export const WORK_COPY = {
  slate: 'The work',
  title: 'Show the work. Say how you made it.',
  /** The one supporting line: who can see a showcase. */
  small: 'Showcases are seen by signed-in members only.',
  /** Under the static still. */
  still: 'A showcase card from the Virgo phone app. Illustrative.',
} as const;
