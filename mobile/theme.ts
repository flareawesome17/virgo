import { vars } from "nativewind";

/**
 * The palettes, as plain hex.
 *
 * These are the source: the CSS variables below are generated from them, so a
 * screen that needs a literal colour — the appearance preview, chart series,
 * anything drawing outside NativeWind's reach — cannot drift from what the app
 * actually renders.
 */
export interface Palette {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  action: string;
  actionForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  border: string;
  input: string;
  ring: string;
}

export const PALETTES: { light: Palette; dark: Palette } = {
  light: {
    background: "#FFF8F4",
    foreground: "#1E1B18",
    card: "#FFFFFF",
    cardForeground: "#1E1B18",
    popover: "#FFFFFF",
    popoverForeground: "#1E1B18",
    primary: "#A85D35",
    primaryForeground: "#FFFFFF",
    action: "#A85D35",
    actionForeground: "#FFFFFF",
    secondary: "#FAF2EC",
    secondaryForeground: "#54433C",
    muted: "#F5EEE8",
    mutedForeground: "#7E6A60",
    accent: "#C17745",
    accentForeground: "#FFFFFF",
    destructive: "#B44632",
    border: "#D9C2B7",
    input: "#D9C2B7",
    ring: "#B66A40",
  },
  dark: {
    background: "#161311",
    foreground: "#F2EDE8",
    card: "#1E1B18",
    cardForeground: "#F2EDE8",
    popover: "#1E1B18",
    popoverForeground: "#F2EDE8",
    primary: "#D18A5A",
    primaryForeground: "#161311",
    action: "#A85D35",
    actionForeground: "#FFFFFF",
    secondary: "#26221F",
    secondaryForeground: "#BCADA3",
    muted: "#2A2522",
    mutedForeground: "#948278",
    accent: "#B66A40",
    accentForeground: "#FFFFFF",
    destructive: "#C8503C",
    border: "#362F2B",
    input: "#362F2B",
    ring: "#C17745",
  },
};

/**
 * Chart series past the first two, which are the palette's own primary and
 * accent — so a chart leads with the colour the rest of that mode is built on.
 */
const CHARTS_TAIL = ["#8B5E3C", "#6B8E4E", "#5B7B9A"];

/** NativeWind wants space-separated channels, not hex. */
function channels(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

function cssVars(palette: Palette) {
  return {
    "--radius": "14",
    "--background": channels(palette.background),
    "--foreground": channels(palette.foreground),
    "--card": channels(palette.card),
    "--card-foreground": channels(palette.cardForeground),
    "--popover": channels(palette.popover),
    "--popover-foreground": channels(palette.popoverForeground),
    "--primary": channels(palette.primary),
    "--primary-foreground": channels(palette.primaryForeground),
    "--action": channels(palette.action),
    "--action-foreground": channels(palette.actionForeground),
    "--secondary": channels(palette.secondary),
    "--secondary-foreground": channels(palette.secondaryForeground),
    "--muted": channels(palette.muted),
    "--muted-foreground": channels(palette.mutedForeground),
    "--accent": channels(palette.accent),
    "--accent-foreground": channels(palette.accentForeground),
    "--destructive": channels(palette.destructive),
    "--border": channels(palette.border),
    "--input": channels(palette.input),
    "--ring": channels(palette.ring),
    "--chart-1": channels(palette.primary),
    "--chart-2": channels(palette.accent),
    ...Object.fromEntries(
      CHARTS_TAIL.map((hex, i) => [`--chart-${i + 3}`, channels(hex)]),
    ),
  };
}

export const lightTheme = vars(cssVars(PALETTES.light));
export const darkTheme = vars(cssVars(PALETTES.dark));

export const themeFonts = {
  regular: undefined,
  medium: undefined,
  semibold: undefined,
  bold: undefined,
};
