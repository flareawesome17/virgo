/**
 * The Finale, the credits · #start (05-cinema.md §3). Page-authored, so
 * check-story lints it. The crew's names and roles come from `story.ts`.
 * Zero-import data module.
 */
export const SOURCES: { text: string; file: string; mode: 'verbatim' }[] = [];

export const FINALE_COPY = {
  slate: 'The credits',
  crew: 'The crew',
  title: 'This one’s you.',
  join: 'Join the community',
  download: 'Download Virgo',
  signIn: 'Sign in',
  /** The page's one full honesty line (05-cinema.md §3). */
  honesty: 'Interfaces drawn from the app. People, places and numbers are illustrative; no client work appears here.',
} as const;
