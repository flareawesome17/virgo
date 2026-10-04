/**
 * The Finale — "This one's you." (storyboard §2 Finale). Page-authored, so
 * check-story lints it. Zero-import data module.
 */
export const SOURCES: { text: string; file: string; mode: 'verbatim' }[] = [];

export const FINALE_COPY = {
  /** The H2, without its full stop: the stop is the StarStop glyph. */
  title: 'This one’s you',
  body: 'Free to start, 15 GB included, and nothing for your clients to install. Add your roles, see who is working near you, and take it from there.',
  join: 'Join the community',
  signIn: 'Sign in',
  microBefore: 'Runs in any browser, on Windows and macOS, and on Android from the',
  microLink: 'download page',
  microAfter: '.',
  caption:
    'Virgo, the constellation, drawn faint: thirteen stars and their lines. At Syrma, the one empty place in the figure, a new star lights, and the two lines that join it complete the shape.',
  footnote: 'Star positions are real (SIMBAD, Hipparcos); the new star at Syrma is you. Illustrative.',
  pickerLegend: 'What do you do?',
  pickerHint: 'Pick any that fit. Nothing is sent.',
  /** The live label: "you" alone, or "you · Photographer, HMUA". */
  you: 'you',
} as const;
