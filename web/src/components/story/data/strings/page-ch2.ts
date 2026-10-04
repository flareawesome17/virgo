/**
 * Ch2 — Nearby: the page's own words (storyboard Ch2, Copy). The mocks'
 * words live in `ch2.ts`, proven against the app; this file holds only what
 * the page says around them, so check-story lints it.
 *
 * A zero-import data module (see `../story.ts`).
 */
import { RADII } from '../story';

export const SOURCES: { text: string; file: string; mode: 'verbatim' }[] = [];

export const CH2 = {
  /** Eyebrow, split so the time can sit in a <time>. */
  eyebrowNo: '02',
  eyebrowTime: 'Thursday, 12:04 AM',
  eyebrowTimeIso: '2026-12-10T00:04:00+08:00',
  eyebrowLabel: 'Nearby',
  h2: 'Then see who is working near the shoot.',
  body:
    'Pick the roles and a distance, from 5 km out to 200. Nearby lists the people inside it who do that work, how many there are, and how far away each one is, in whole kilometres. Someone who shoots and edits turns up under either search.',
  h3: 'The only thing anyone learns is how far away you are.',
  privacy:
    'Only people sharing their location can see each other. Positions are kept to about a kilometre and never shown as a pin. Turn sharing off and the position is erased, not hidden.',
  closing: `Shooting out of town? While you’re sharing, you can search from any of 71 Philippine cities, or from the city of an upcoming shoot.`,
  footnote: 'Interface drawn from the app. People, counts and distances are illustrative.',
} as const;

/** Mono kickers on the step cards (aria-hidden: the copy beside them says it). */
export const CH2_KICKERS = {
  r5: 'Within 5 km',
  r25: 'Within 25 km',
  erased: 'Sharing off',
  city: 'Your own card',
} as const;

/** The figure's narration (figcaption): what the moving panel shows, in words. */
export const CH2_FIGCAPTION =
  'Mika’s Nearby search, measured from the Cebu City shoot, for Videographer, SDE Editor Video and HMUA. Within 5 km: Ernie and Kenn, 2 km away, and Rhea, 4 km away. Widened to 25 km, Bea appears 8 km away and the list grows to ten people. Then a coordinator 3 km out turns sharing off and is gone from the next search: the Coordinator count drops from 1 to 0.';

/** The reduced-motion before/after pair. */
export const CH2_PAIR = {
  before: 'Distance only',
  after: 'Sharing off: erased (Coordinator 1 → 0)',
  caption:
    'Two stills of the distance rings at 25 km. Left, everyone sharing their location stands at their distance from the shoot, with no direction given. Right, the coordinator 3 km out has turned sharing off, and their position is gone.',
} as const;

export const CH2_CITY = {
  off: 'Sharing off',
  on: 'Sharing on',
  caption:
    'Mika’s own Share my location card, in its two states. Off: she is not discoverable, and she names Cebu City instead of sharing a device position. On: Discoverable · Cebu City.',
} as const;

/** "Try the distance" (storyboard Ch2, Interactive). */
export const CH2_DEMO = {
  heading: 'Try the distance',
  intro: 'Pick a distance to redraw the rings. The count comes from the same illustrative roster as the panel above.',
  legend: 'Within',
  options: RADII.map((km) => ({ km, label: `${km} km` })),
  figcaption: 'Distance rings around the shoot, redrawn for the distance you pick.',
} as const;
