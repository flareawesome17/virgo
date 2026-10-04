/**
 * The story's footer (05-cinema.md §3). Page-authored, so check-story lints
 * it. The honesty line lives in the credits (page-finale.ts), once. Zero-import
 * data module.
 */
export const SOURCES: { text: string; file: string; mode: 'verbatim' }[] = [];

export const FOOTER_COPY = {
  home: 'Virgo home',
  name: 'Virgo',
  nav: 'Footer',
  links: { download: 'Download', join: 'Join', signIn: 'Sign in', app: 'Web app', terms: 'Terms', privacy: 'Privacy' },
  /** "© {year} Virgo · " precedes it. */
  made: 'Made in the Philippines.',
  creditsLabel: 'Credits',
  mapCredit:
    'Philippine boundaries: NAMRIA and PSA, via OCHA (HDX) and geoBoundaries (Runfola et al. 2020), CC BY 3.0 IGO, simplified.',
  starCredit: 'Star positions: SIMBAD / Hipparcos.',
} as const;
