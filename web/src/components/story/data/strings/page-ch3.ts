/**
 * Ch3 — Connect: the page's own words (storyboard Ch3, Copy). The mocks'
 * words live in `ch3.ts`, proven against the app; this file holds only what
 * the page says around them, so check-story lints it.
 *
 * A zero-import data module (see `../story.ts`).
 */
export const SOURCES: { text: string; file: string; mode: 'verbatim' }[] = [];

export const CH3 = {
  eyebrowNo: '03',
  eyebrowTime: 'Thursday, 12:31 AM',
  eyebrowTimeIso: '2026-12-10T00:31:00+08:00',
  h2: 'Nobody lands in your network without agreeing to it.',
  lead: 'Ernie applies at 12:31. Kenn and Bea before one.',
  body:
    'They applied; Mika accepted. Each acceptance connects them and opens a chat that starts with the job and its terms. The person hired confirms them, and if Mika changes anything, they’re asked again.',
  h3: 'Virgo writes down the rate. The money is between you.',
  h3Body:
    'A booking records the role, the date, the place, the peso rate and what’s included. Virgo doesn’t take or hold payment. You pay each other the way you already do.',
  /** Desktop caption under the figure (mono). */
  starCaption: 'Virgo, from real star positions: Spica, Porrima, Vindemiatrix, Heze.',
  /** Phones: one line instead of a label per star (the crowded fallback). */
  starLine: 'Virgo · Spica, Porrima, Vindemiatrix, Heze',
  footnote: 'Interface drawn from the app. People, amounts and messages are illustrative.',
} as const;

/** Mono kickers over each frame of the set (aria-hidden). */
export const CH3_KICKERS = {
  applied: 'Mika’s post · applicants',
  terms: 'Ernie’s chat · the terms',
  booking: 'Mika’s side · the booking',
  thread: 'The crew’s group chat',
  sky: 'From where you stand',
} as const;

/** Figcaptions: what the moving set shows, in words. */
export const CH3_FIGCAPTION =
  'Ernie, Kenn and Bea apply to Mika’s post, and she accepts each of them; the post’s status beside each name reads “accepted”. Ernie’s chat opens with the terms he was hired on, and he confirms them. On Mika’s side the booking flips from Waiting on them to Agreed. In the crew’s group chat Mika asks “@Kenn SDE by 9 PM?” and Kenn answers “Sure.”';

export const CH3_SKY_CAPTION =
  'Seen from Earth, the four of them line up as the constellation Virgo, drawn from real star positions: Mika is Spica, Ernie is Porrima, Kenn is Vindemiatrix and Bea is Heze. Nine more stars complete the figure. One socket, Syrma, is left unlit for now.';
