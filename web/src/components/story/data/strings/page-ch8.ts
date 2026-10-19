/**
 * Ch8 · Every Saturday · #community (05-cinema.md §3) — page-authored copy.
 * Zero-import data module, linted by check-story.
 */
export const SOURCES: { text: string; file: string; mode: 'verbatim' }[] = [];

export const CH8_COPY = {
  slate: 'Every Saturday',
  /** The film's subtitles, one at a time; the first is also the static heading. */
  lines: ['Somewhere tonight, a crew like this one.', 'A creative industry is a people business.'],
  mapAlt:
    'The Philippine archipelago at night, its coastline faint under the stars, with small constellations of crews lit over cities from Vigan and Baguio in the north to Davao City in the south.',
  /** Under the static still. */
  still: 'These are not real crews. Illustrative.',
} as const;
