/**
 * The Finale, the closing screen · #start (05-cinema.md §3): the credits, the
 * logo, "Start your journey now.", every way in, and the page's credits. It
 * replaces the FAQ and the footer. Page-authored, so check-story lints it.
 * The crew's names and roles come from `story.ts`. Zero-import data module.
 */
export const SOURCES: { text: string; file: string; mode: 'verbatim' }[] = [];

/** The one contact address, everywhere it appears (Appendix C: support@). */
export const CONTACT_EMAIL = 'support@virgo.ph';

export const FINALE_COPY = {
  slate: 'The credits',
  crew: 'The crew',
  /** The wordmark under the logo as it flashes in. */
  name: 'Virgo',
  title: 'Start your journey now.',
  join: 'Join the community',
  download: 'Download Virgo',
  signIn: 'Sign in',
  /** The links the footer used to carry, now buttons on the last screen. */
  more: 'More from Virgo',
  links: { app: 'Open the web app', terms: 'Terms', privacy: 'Privacy' },
  /** The page's one full honesty line (05-cinema.md §3). */
  honesty: 'Interfaces drawn from the app. People, places and numbers are illustrative; no client work appears here.',
  /** "© {year} Virgo · " precedes it. */
  made: 'Made in the Philippines.',
  creditsLabel: 'Credits',
  mapCredit:
    'Philippine boundaries: NAMRIA and PSA, via OCHA (HDX) and geoBoundaries (Runfola et al. 2020), CC BY 3.0 IGO, simplified.',
  starCredit: 'Star positions: SIMBAD / Hipparcos.',
} as const;
