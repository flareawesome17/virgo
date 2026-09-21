import { vars } from "nativewind";
import { CHART_TAIL, PALETTES, RADIUS, type Palette } from "./theme.tokens";

/**
 * The palettes, as plain hex.
 *
 * Generated from design/tokens.json into theme.tokens.ts — edit the palette
 * there, never here. Re-exported so a screen that needs a literal colour (the
 * appearance preview, chart series, anything drawing outside NativeWind's
 * reach) cannot drift from what the app actually renders.
 */
export { PALETTES, type Palette };

/**
 * The same series, named, for screens that draw outside NativeWind's reach —
 * an SVG stroke or a tile's accent takes a colour, not a class.
 */
export const CHART_COLORS = {
  brown: CHART_TAIL[0],
  green: CHART_TAIL[1],
  blue: CHART_TAIL[2],
} as const;

/** NativeWind wants space-separated channels, not hex. */
function channels(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

function cssVars(palette: Palette) {
  return {
    "--radius": String(RADIUS),
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
    "--destructive-foreground": channels(palette.destructiveForeground),
    "--success": channels(palette.success),
    "--warning": channels(palette.warning),
    "--info": channels(palette.info),
    "--border": channels(palette.border),
    "--input": channels(palette.input),
    "--ring": channels(palette.ring),
    "--chart-1": channels(palette.primary),
    "--chart-2": channels(palette.accent),
    ...Object.fromEntries(
      CHART_TAIL.map((hex, i) => [`--chart-${i + 3}`, channels(hex)]),
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
