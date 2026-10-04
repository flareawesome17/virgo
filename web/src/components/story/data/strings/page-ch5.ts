/**
 * Ch5 — Saturday (docs/redesign/05-cinema.md §3). Page-authored copy only;
 * the album's names and times come from story.ts and strings/ch5.ts.
 */
export const SOURCES: { text: string; file: string; mode: 'verbatim' }[] = [];

export const CH5 = {
  /** The chapter's heading: the golden-hour title card. */
  title: 'Saturday.',
  /** The display word; the sun is its full stop. */
  display: 'Saturday',
  /** The time cards: the shoot, then the night the album fills. */
  slate: 'Saturday',
  slateNight: 'Saturday · That night',
  /** The subtitles, one at a time. */
  lines: ['Everyone shot it.', 'One album holds it, in order.', 'Kept exactly as shot.'],
} as const;
