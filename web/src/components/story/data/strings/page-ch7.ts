/**
 * Ch7 · Day 91 · #forget (05-cinema.md §3) — page-authored copy: the slate
 * and the subtitles. The retention field, the meter and the album are the
 * app's, proven in `ch7.ts` and `common.ts`. Zero-import data module, linted
 * by check-story.
 */
export const SOURCES: { text: string; file: string; mode: 'verbatim' }[] = [];

export const CH7_COPY = {
  slate: 'Day 91',
  /** The chapter's one heading: the first two lines. */
  title: 'Hand it over. Then forget about it.',
  /** The film's subtitles, one at a time. The script's last line is split in two to keep each under ten words. */
  lines: ['Hand it over.', 'Then forget about it.', 'Each file leaves on its own schedule.', 'The storage comes back.'],
  /** The static page's line under the heading: the script's last line, whole. */
  body: 'Each file leaves on its own schedule. The storage comes back.',
  /** Under the static still. */
  still: 'Mika’s storage after the last clean-up. Illustrative.',
} as const;
