/**
 * Every word the reel sets that is not app UI: one caption per scene, the
 * story-clock slates above them, Mika's chip and the end card.
 *
 * - [page] captions are the page's own lines, verbatim from the storyboard's
 *   page copy (docs/redesign/02-storyboard.md §2, listed in §4.1).
 * - [proposed] captions are §4.1's proposals, as written, awaiting the
 *   owner's OK (storyboard §6 Q9).
 * - Slates are the page's story clock (story.ts `SLATE`), never typed here.
 *
 * App UI inside the phones is never written here: the mocks draw it from
 * web/src/components/story/data/strings/*. The text below is kept exactly as
 * the storyboard prints it (straight apostrophes); `typeset()` sets the
 * apostrophes as typographic ones on screen and changes nothing else.
 *
 * Banned in page copy (§1.10), and so here: live, real-time, stream,
 * countdown, expires, public feed, TikTok, App Store, Google Play, payments,
 * payouts, PayMongo, "update themselves", resumable.
 */
import { CAST, HOME, SLATE } from "../../../web/src/components/story/data/story";
import type { SceneId } from "./timeline";

export type CaptionSource = "page" | "proposed";

export type SceneCopy = {
  /** The line, as the storyboard prints it. */
  readonly text: string;
  readonly source: CaptionSource;
  /** Words from this index on are set in the accent: the turn in the line. Absent: none. */
  readonly accentFrom?: number;
  /** The story clock above it, from story.ts SLATE. */
  readonly slate?: (typeof SLATE)[number];
};

const slate = (s: (typeof SLATE)[number]) => s;

export const CAPTIONS: Record<SceneId, SceneCopy> = {
  S1: { text: "Wednesday, 11:42 PM.", source: "page" },
  S2: { text: "Saturday's wedding is booked. The crew isn't.", source: "page", accentFrom: 4, slate: slate("WED 11:42 PM") },
  S3: { text: "Or post the job once.", source: "page", accentFrom: 1 },
  S4: { text: "The only thing anyone learns is how far away you are.", source: "page", accentFrom: 7, slate: slate("THU 12:04 AM") },
  S5: { text: "Nobody lands in your network without agreeing to it.", source: "page", accentFrom: 6, slate: slate("THU 12:31 AM") },
  S6: { text: "5:00 AM. No signal. It rings anyway.", source: "page", accentFrom: 4 },
  S7: { text: "Everyone shot it. One album holds it, in order.", source: "page", accentFrom: 3, slate: slate("SAT 5:05 PM") },
  S8: { text: "One link. No account.", source: "proposed", accentFrom: 2, slate: slate("SUN 4:50 PM") },
  // S9's dissolve carries only its slate; the end card carries the lines below.
  S9: { text: "", source: "proposed", slate: slate("DAY 91") },
};

/** Ch5's aria-hidden display word "Saturday." (storyboard Ch5 0.08–0.30); the reel sets its full stop as the sun. */
export const SATURDAY_WORD = "Saturday";

/** S7's clock steps through the day as the light changes, then to the upload hour (the page's time chip). */
export const S7_SLATES = [slate("SAT 5:05 PM"), slate("SAT 9:30 PM"), slate("SAT 10:48 PM")] as const;

/** The end card (§4.1 S9), both [proposed]. */
export const END_CARD = {
  headline: "Every shoot is a constellation.",
  support: "virgo.ph · Free to start, 15 GB",
  /** The wordmark beside the logo, as the OG card and the header set it. */
  wordmark: "Virgo",
} as const;

/** Mika's chip where the Prologue lands (storyboard Prologue 0.80–1.00), built from the story. */
export const MIKA_CHIP = `${CAST.mika.first} · ${CAST.mika.roles[0]} · ${HOME.city}`;

/** "a coordinator": the unnamed star erased in Ch2's privacy beat (storyboard Appendix A). */
export const COORDINATOR_TAG = "a coordinator";

/** Typographic apostrophes for display; the strings above stay as printed. */
export const typeset = (s: string) => s.replace(/(\w)'(\w)/g, "$1’$2");
