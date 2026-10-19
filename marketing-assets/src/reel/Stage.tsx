import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Img } from "remotion";
import logo from "../../../web/public/logo.png";
import { geist, geistMono } from "../brand/fonts";

/**
 * What the site's root layout gives every mock, here for the reel: Geist as
 * `font-sans` and Geist Mono as `font-mono` (Tailwind v4 reads them from
 * these variables), globals.css's `.figure` (mono, tabular, tracked), and
 * the real logo behind `VirgoMark`, which on the site is `/logo.png` and
 * here is the bundler's URL for the same file. The hidden `<Img>` holds the
 * first frame until the logo has loaded, so a mark never pops in.
 */
const FONT_VARS = {
  "--font-sans": `${geist}, ui-sans-serif, system-ui, sans-serif`,
  "--font-mono": `${geistMono}, ui-monospace, monospace`,
} as CSSProperties;

const SITE_CSS = `
.figure { font-family: ${geistMono}, ui-monospace, monospace; font-variant-numeric: tabular-nums; letter-spacing: 0.06em; }
[data-part="mark"] { background-image: url("${logo}") !important; }
`;

export function ReelStage({ children, background }: { children: ReactNode; background: string }) {
  return (
    <AbsoluteFill style={{ ...FONT_VARS, fontFamily: geist, background, overflow: "hidden" }}>
      <style>{SITE_CSS}</style>
      <Img src={logo} alt="" style={{ position: "absolute", left: 0, top: 0, width: 1, height: 1, opacity: 0 }} />
      {children}
    </AbsoluteFill>
  );
}

export { logo };
