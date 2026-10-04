/**
 * Ch3 — Connect: the page's own words (05-cinema.md §3, Ch3). The mocks'
 * words live in `ch3.ts`, proven against the app; this file holds only what
 * the page says around them, so check-story lints it.
 *
 * A zero-import data module (see `../story.ts`).
 */
export const SOURCES: { text: string; file: string; mode: 'verbatim' }[] = [];

export const CH3 = {
  /** The scene slate (drawn uppercase). Its instant is WHEN.appliedErnie. */
  slate: 'Thursday · 12:31 AM',
  /** The subtitles, in order. The first is the chapter's H2. */
  applied: 'They applied. She accepted.',
  rate: 'The rate, written down. The money stays between you.',
  /** As Virgo forms in the sky. */
  consent: 'Nobody joins your network without agreeing to it.',
  /** Names the static still for screen readers. */
  still: 'The terms Ernie was hired on, confirmed: the role, the date, the place and the rate.',
} as const;
