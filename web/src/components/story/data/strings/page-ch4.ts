/**
 * Ch4 — The Calendar (05-cinema.md §3, Ch4). Page-authored copy only; every
 * app string the scene draws comes from strings/ch4.ts and is proven there.
 */
export const SOURCES: { text: string; file: string; mode: 'verbatim' }[] = [];

export const CH4 = {
  /** The two scene slates (drawn uppercase). Their instants are WHEN.moved and WHEN.reminder. */
  friday: 'Friday · 9:20 PM',
  saturday: 'Saturday · 5:00 AM',
  /** The subtitles, in order. The first is the chapter's H2. */
  moved: 'The call time moved. Everyone heard.',
  rings: 'No signal. It rings anyway.',
  /** The one supporting line: only reminders ring offline. */
  ringsSmall: 'A reminder with the alarm on is scheduled on the phone itself.',
  /** Names the static still for screen readers. */
  still: 'Saturday, 5:00 AM: Mika’s phone has no service, and her reminder rings.',
} as const;
