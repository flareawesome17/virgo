/**
 * Ch5 — Saturday (storyboard §2 Ch5). Page-authored copy only; the album,
 * activity and meter strings come from strings/ch5.ts and are proven there.
 */
export const SOURCES: { text: string; file: string; mode: 'verbatim' }[] = [];

export const CH5 = {
  eyebrow: '05 · Saturday',
  h2: 'Everyone shot it. One album holds it, in order.',
  lead: 'That night, the crew uploads into Mika’s album. Virgo files every frame by when it was taken, not when it arrived.',
  aside: 'Set the camera clocks to match first. Virgo reads them as written.',
  beats: [
    { h3: 'Split it the way the day went.', body: 'Prep, Ceremony, Reception.' },
    { h3: 'Kept as shot.', body: 'The files you upload are the files Virgo keeps.' },
    {
      h3: 'One meter.',
      body: 'Give the crew upload access and what they add counts against your storage, not theirs. Virgo checks there’s room before an upload starts.',
    },
  ],
  footnote: 'We do not put client work on a marketing page. Interface drawn from the app; album contents are illustrative.',
  /** The aria-hidden display word; the sun is its full stop. */
  display: 'Saturday',
  /** The time chip, in order (12-hour, as the page writes times). */
  chip: [
    { time: '6:00 AM', label: 'Call time' },
    { time: '9:30 AM', label: 'Prep' },
    { time: '3:00 PM', label: 'Ceremony' },
    { time: '5:05 PM', label: 'Golden hour' },
    { time: '9:30 PM', label: 'Reception' },
  ],
  chipDay: 'Saturday',
  crest: '9:30 PM — the same-day edit plays at the reception.',
  /** Mobile, on the meter. */
  meterLabel: 'Crew uploads count against Mika’s 15 GB',
  legendTitle: 'Where the 413 came from',
  /** Figure narration (visible in the static page, sr-only in motion). */
  caption:
    'Saturday, from the 6:00 AM call to the 9:30 PM reception, as the light turns golden. That night Mika’s camera, Ernie’s camera and Kenn’s laptop upload into one album, Reyes & Santos — Wedding, which sorts every frame by when it was taken: Today, 413 items from 05:52 to 22:41, in Prep, Ceremony and Reception. The activity card lists the three uploads, and Mika’s storage meter reads 6.3 GB of 15 GB.',
} as const;
