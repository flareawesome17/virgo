/**
 * Ch7 — Forget · #forget (storyboard §2 Ch7) — page-authored copy. The
 * retention field, the clean-up notices, the meter and the emptied pages are
 * the app's, proven in `ch7.ts` and `common.ts`. Zero-import data module,
 * linted by check-story.
 */
export const SOURCES: { text: string; file: string; mode: 'verbatim' }[] = [];

export const CH7_COPY = {
  eyebrow: '07 · Keep files for: 90 days after upload',
  title: 'Hand it over. Then forget about it.',
  body: 'When Mika made the album she chose how long to keep its files: 90 days, counted from each file’s upload. When the day comes, Virgo deletes the originals and every preview copy, then tells her how many went. Nobody has to remember to tidy up, and the storage comes back.',
  step: 'Clean-up runs every night, so a file goes in the first sweep after its 90 days are up. Day 91, Saturday’s 413. Day 92, the teaser and the two recordings. Day 112, the six films Ernie finished three weeks later.',
  small:
    'The album and its link stay. The link just has nothing left to show, so tell your client the date. Or leave the setting at “Until I delete them” and keep everything.',
  footnote: 'Interface drawn from the app. Illustrative.',
  /** The flashback chip over the New album field. */
  flashback: 'When the album was made',
  caption:
    'A day ruler from the wedding, Day 0, to Day 112. Three batches of files were uploaded on Day 0, Day 1 and Day 21. Each is removed in the first nightly clean-up after its 90 days: 413 files on Day 91, 3 on Day 92 and 6 on Day 112, each followed by a notice to Mika. Her storage drops from 9.2 GB to 307 MB of 15 GB. The album stays, marked Delivered and Empty, and the client link reads “Nothing has been shared here yet.”',
  /** The static page's before/after meter. */
  before: 'Before Day 91',
  after: 'After Day 112',
  emptyCaption: 'The album and its link stay, with nothing left to show.',
} as const;
