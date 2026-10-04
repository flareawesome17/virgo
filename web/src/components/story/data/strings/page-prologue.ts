/**
 * The Prologue's page-authored copy (storyboard, Prologue — The Sky). Nothing
 * here is copied from the app, so `SOURCES` is empty and check-story lints
 * every line against the banned words.
 *
 * A zero-import data module: relative imports of story data modules only.
 */
import { CAST, HOME } from '../story';

export const SOURCES: { text: string; file: string; mode: 'verbatim' }[] = [];

export const HERO = {
  eyebrow: 'Built in the Philippines, for Filipino creatives',
  /** Line 1 of the H1, weight 500 in the secondary ink. */
  titleLead: 'Where creatives find',
  /** Line 2, in the gold gradient. Its full stop is the star (StarStop), with a real "." for readers. */
  titleTail: 'each other, and get paid',
  lead: 'Virgo is a network of photographers, videographers, editors and HMUAs, and the workspace they run the job from.',
  join: 'Join the community',
  signIn: 'Sign in',
  micro: 'Free plan with 15 GB. No card needed.',
  follow: 'Follow one job',
  skip: 'Skip the story',
} as const;

/** The sky behind the hero: sr-only in motion, visible under the lens in the static page. */
export const SKY_CAPTION =
  'A night sky over the Philippines. Each star stands for a creative somewhere in the country. Illustrative; the stars are not members.';

/** The chip on Mika's star as the camera lands. */
export const MIKA_CHIP = `${CAST.mika.first} · ${CAST.mika.roles[0]} · ${HOME.city}`;

/** The static page's lens: the zoom, implied. */
export const LENS = {
  alt: `A circular lens over ${HOME.city}, with one star at its centre: ${CAST.mika.first}'s.`,
  caption: `One of them is ${CAST.mika.first}, a photographer in ${HOME.city}.`,
  footnote: 'The sky is drawn for the page. The stars mark places, not members; the map and the star field are illustrative.',
} as const;
