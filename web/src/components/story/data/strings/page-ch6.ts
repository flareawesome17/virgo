/**
 * Ch6 — The Handover · #delivery (storyboard §2 Ch6) — page-authored copy.
 * The dialog, sheet, alert and client-page words are the app's, proven in
 * `ch6.ts`; the screen-reader sentences the demo speaks are `CLIENT_ANNOUNCE`
 * there. Zero-import data module, linted by check-story.
 */
const CLIENT_TEMPLATE = 'api/src/albums/share/client-gallery.template.ts';

export const SOURCES: { text: string; file: string; mode: 'verbatim' }[] = [
  // The page's own sentence after Send, around the count.
  { text: 'Sent. Your photographer has your ', file: CLIENT_TEMPLATE, mode: 'verbatim' },
  { text: ' picks.', file: CLIENT_TEMPLATE, mode: 'verbatim' },
];

export const CH6_COPY = {
  eyebrow: '06 · Sunday, 4:50 PM · The couple’s phone',
  /** The eyebrow in pieces, so its time sits in a <time>. */
  eyebrowN: '06',
  eyebrowPlace: 'The couple’s phone',
  title: 'One link. No account. Nothing to explain over the phone.',
  body: 'Send the album as a link. It opens in any browser, in chapters (Prep, Ceremony, Reception) in the order you set, with blurred previews that sharpen on mobile data. Every download is the original file.',
  line: 'No app. No sign-up. No password.',
  picksTitle: 'They pick. You get told.',
  picksBody:
    'The couple taps the heart on the ones they love, then downloads just those or presses Send to photographer. You get a notification, and the album opens on their picks.',
  laterEyebrow: 'Three weeks later',
  laterTitle: 'Same link when the films are ready.',
  laterBody:
    'Tick films and audio when the edit is done. The address doesn’t change. Films play in any browser, HEVC and ProRes uploads included, and recordings get a small player of their own. Turn the link off and it stops opening straight away.',
  footnote: 'Interface drawn from Virgo and the client page. People and album contents are illustrative.',
  /** The title card before the dialog (desktop). */
  titleCard: 'Sunday, 4:50 PM',
  /** The bracket over the unchanged address. */
  sameLink: 'Same link',
  /** The figure's narration (a screen reader hears it; visible in the static page). */
  caption:
    'Mika makes a client link that shows photos only. The couple open it on a phone: Reyes & Santos — Wedding, 412 items, in chapters Everything, Prep, Ceremony and Reception. They heart 12 photos and press Send to photographer; on the real page a screen reader then hears “Sent. Your photographer has your 12 picks.” Mika is told: your client sent their picks. Three weeks later she ticks films and audio, the link keeps its address, and the page gains tabs for All 422, Photos 412, Films 8 and Audio 2, with the vows playing in a small player.',
  panels: [
    'Sunday, 4:50 PM. The client link shows Photos only, and the address is made once.',
    'The couple heart 12 photos and send them. The button now reads Send again.',
    'Three weeks later: Films and Audio ticked, the same address, and the page gains kind tabs and a player for the recordings.',
  ],
} as const;

/** "Try the hearts": a working copy of the client page's hearts and picks bar. No network. */
export const CH6_DEMO = {
  title: 'Try the hearts',
  intro: 'Tap a heart, as the couple would. Nothing leaves this page.',
  /** Each heart's label ends with the photo's number: "Pick: illustrative photo 3". */
  photo: 'illustrative photo ',
  picked: 'picked',
  /** Before anything is picked. */
  none: 'Nothing picked yet',
  /** What the page's live region says after Send, around the real count. */
  sentBefore: 'Sent. Your photographer has your ',
  sentAfter: ' picks.',
} as const;
