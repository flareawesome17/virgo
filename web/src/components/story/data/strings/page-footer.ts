/**
 * The story's footer (storyboard §2 Footer, §1.10). Page-authored, so
 * check-story lints it. Zero-import data module.
 */
export const SOURCES: { text: string; file: string; mode: 'verbatim' }[] = [];

export const FOOTER_COPY = {
  home: 'Virgo home',
  name: 'Virgo',
  nav: 'Footer',
  links: { terms: 'Terms', privacy: 'Privacy', download: 'Download', signIn: 'Sign in' },
  /** "© {year} Virgo · " precedes it. */
  built: 'Built in the Philippines, for Filipino creatives.',
  honesty:
    'Interfaces are drawn from the app. People, places, distances, amounts and album contents are illustrative; we do not put client work on a marketing page. The sky is illustrative; the constellation is real.',
  creditsLabel: 'Credits',
  mapCredit:
    'Philippine boundaries: NAMRIA and PSA, via OCHA (HDX) and geoBoundaries (Runfola et al. 2020), CC BY 3.0 IGO, simplified.',
  starCredit: 'Star positions: SIMBAD / Hipparcos.',
} as const;
