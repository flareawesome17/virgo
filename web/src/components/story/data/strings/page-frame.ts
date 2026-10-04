/**
 * The film's frame (05-cinema.md §2, the frame): its rails and buttons.
 * Page-authored, so check-story lints it. Zero-import data module.
 */
export const SOURCES: { text: string; file: string; mode: 'verbatim' }[] = [];

export const FRAME_COPY = {
  home: 'Virgo, back to the top',
  tagline: 'Every shoot is a constellation',
  signIn: 'Sign in',
  join: 'Join',
  download: 'Download Virgo',
  downloadShort: 'Download',
  pause: 'Pause motion',
  illustrative: 'Illustrative',
} as const;

/** The right rail: the chapter in view. */
export const CHAPTERS: Record<string, string> = {
  top: 'Prologue',
  hire: '01 · Wednesday night',
  nearby: '02 · Nearby',
  connect: '03 · Connect',
  calendar: '04 · The calendar',
  saturday: '05 · Saturday',
  delivery: '06 · The handover',
  forget: '07 · Forget',
  'the-work': 'The work',
  community: '08 · Every Saturday',
  features: '09 · Everything around the shoot',
  pricing: '10 · Pricing',
  start: 'Credits',
};
