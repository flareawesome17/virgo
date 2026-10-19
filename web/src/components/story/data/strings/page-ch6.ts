/**
 * Ch6 — The Handover · #delivery (docs/redesign/05-cinema.md §3) —
 * page-authored copy. The client page's own words are the app's, proven in
 * `ch6.ts`. Zero-import data module, linted by check-story.
 */
export const SOURCES: { text: string; file: string; mode: 'verbatim' }[] = [];

export const CH6 = {
  /** The time cards: Sunday, then the slate change. */
  slate: 'Sunday · 4:50 PM',
  slateLater: 'Three weeks later',
  /** The chapter's heading, and the first subtitle. */
  title: 'One link. No account. Nothing to explain.',
  picks: 'They pick. You get told.',
  later: 'Same link. Now with the films.',
} as const;
