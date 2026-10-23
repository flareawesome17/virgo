/**
 * The Prologue's page-authored copy (storyboard, Prologue — The Sky). Nothing
 * here is copied from the app, so `SOURCES` is empty and check-story lints
 * every line against the banned words.
 *
 * A zero-import data module: relative imports of story data modules only.
 */
import { CAST, HOME, type Role } from '../story';

export const SOURCES: { text: string; file: string; mode: 'verbatim' }[] = [];

export const HERO = {
  /** The opening title's small mono line. */
  eyebrow: 'A Virgo story',
  /** Line 1 of the H1, weight 500 in the secondary ink. */
  titleLead: 'Where creatives find',
  /** Line 2, in the gold gradient. Its full stop is the star (StarStop), with a real "." for readers. */
  titleTail: 'each other, and get paid',
  lead: 'For photographers, videographers, editors and other creatives. Find the crew, run the job, hand over the work.',
  join: 'Join the community',
  cue: 'Scroll to play',
} as const;

/**
 * The opening's two subtitles (05-cinema.md §3): the descent through the
 * stars onto Mika. The second names the star as a person, so nobody wonders
 * whether the line is about a star or about someone.
 */
export const DESCENT = [
  'Every star is a creative.',
  `This star is ${CAST.mika.first}, a wedding ${CAST.mika.roles[0].toLowerCase()} in ${HOME.city}.`,
] as const;

/**
 * "Every star is a creative.": while the line plays, stars across the
 * country say what they do. Roles from the app's list; the places are
 * illustrative, like every star on the page (none of them is a member).
 * They ring Cebu, where the camera is going, so they stay in frame through
 * the dive; phones show the first four. `side`: which way the tag reads
 * from its star (east of Cebu, to the left, so it stays on a phone's screen).
 */
export const STAR_ROLES: readonly { city: string; role: Role; side: 'left' | 'right' }[] = [
  { city: 'Kalibo', role: 'Photographer', side: 'right' },
  { city: 'Ormoc', role: 'Videographer', side: 'left' },
  { city: 'Dumaguete', role: 'Photo Editor', side: 'right' },
  { city: 'Cagayan de Oro', role: 'HMUA', side: 'left' },
  { city: 'Legazpi', role: 'Coordinator', side: 'right' },
  { city: 'Iloilo City', role: 'Video Editor', side: 'right' },
];

/** Mika's card, as it opens out of her star when the camera lands (illustrative, like her). */
export const MIKA_CARD = {
  name: CAST.mika.first,
  role: `Wedding ${CAST.mika.roles[0].toLowerCase()}`,
  city: HOME.city,
  work: 'Her work',
} as const;

/** The sky behind the hero: sr-only in motion, visible under the lens in the static page. Kept out of search snippets (data-nosnippet). */
export const SKY_CAPTION =
  'A night sky over the Philippines. Each star stands for a creative somewhere in the country. Illustrative; the stars are not members.';

/** The chip on Mika's star as the camera lands. */
export const MIKA_CHIP = `${CAST.mika.first} · ${CAST.mika.roles[0]} · ${HOME.city}`;

/** The static page's lens: the zoom, implied. */
export const LENS = {
  alt: `A circular lens over ${HOME.city}, with one star at its centre: ${CAST.mika.first}'s.`,
  footnote: 'The sky is drawn for the page. The stars mark places, not members; the map and the star field are illustrative.',
} as const;
