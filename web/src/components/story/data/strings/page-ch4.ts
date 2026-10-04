/**
 * Ch4 — The Calendar (storyboard §2 Ch4). Page-authored copy only; every app
 * string the figure draws comes from strings/ch4.ts and is proven there.
 */
export const SOURCES: { text: string; file: string; mode: 'verbatim' }[] = [];

export const CH4 = {
  eyebrow: '04 · Friday, 9:20 PM · Schedule',
  h2: 'The call time moved. Everyone heard.',
  body: 'Invite the crew to the shoot and each of them accepts or declines. It goes on their calendar only when they say yes, so the schedule shows who is actually coming. Move the call time and everyone going gets a notification in Virgo and an email saying who changed it, with the old time and the new one.',
  h3: '5:00 AM. No signal. It rings anyway.',
  body2:
    'Set a reminder in the Virgo phone app with the alarm on and it’s scheduled on the phone itself, so it goes off on time with no signal at all.',
  micro: 'On Android 14 and later, allow Alarms & reminders for Virgo so it rings on the minute.',
  footnote:
    'The lock screen and its banner are generic; the calendar, notifications, email subject and reminder are drawn from the app. Illustrative.',
  /** Figure narration (visible in the static page, sr-only in motion). */
  caption:
    'Mika’s phone on Friday night: Saturday the 12th selected on the calendar, the wedding’s guest list turning from Invited to Going for Ernie, Kenn and Bea, the call time moving from 6:30 to 6:00 and the crew notified, a 5:00 AM reminder set with the alarm on, and at 5:00 the lock screen with no service showing the reminder.',
  stills: {
    going: 'Who’s coming: Ernie, Kenn and Bea are all Going.',
    moved: 'The crew hear the move: in Virgo, and by email.',
    rings: 'Saturday, 5:00 AM. No service, and the reminder rings.',
  },
  /** The mono slate on the lock beat (desktop). */
  slate: 'SAT 5:00 AM',
  /** The aria-hidden display word behind the lock screen. */
  display: '5:00',
} as const;
