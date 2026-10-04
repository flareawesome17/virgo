/**
 * The story's night colours (storyboard §1.4, §1.5), as the sky stage and the
 * hero draw them. design/tokens.json has no `story` group yet (storyboard
 * §1.5 moves them there in Phase 4); until then they are written here once.
 */
export const NIGHT = {
  /** The page at night. */
  ground: "#161311",
  /** The warm horizon at the bottom of the sky stage. */
  horizon: "#1E1A17",
  /** The top of the sky stage, behind the stars. */
  deep: "#0E0C0B",
  ink: "#F2EDE8",
  secondary: "#BCADA3",
  muted: "#A08E84",
  /** Accent text on night: 6.6:1. */
  accent: "#D18A5A",
  /** The sky's gold (sky/paint.ts GOLD), and its threads and figure lines. */
  gold: "#F0C88E",
  copper: "#C17745",
  /** The pre-dawn band's umber. */
  umber: "#6B3E25",
} as const;

/** The sky stage behind every star, as the sky lab paints it under the canvas. */
export const STAGE_BACKGROUND =
  "radial-gradient(120% 80% at 50% 100%, #1E1A17 0%, #161311 45%, #0E0C0B 100%)";

/** The H1's gold line, left to right (landing/hero.tsx). */
export const GOLD_TEXT = "linear-gradient(to right, #e8b189, #c17745, #a85f38)";
