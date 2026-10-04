import { useCurrentFrame } from "remotion";
import { geist, geistMono } from "../brand/fonts";
import { typeset, type SceneCopy } from "./copy";
import { EASE, span } from "./motion";
import { SAFE, TYPE } from "./timeline";

/** The ground a caption sits on (storyboard §1.4–1.5): its ink and accent come from it. */
export type Tone = "night" | "gold" | "paper";

const INK: Record<Tone, { ink: string; accent: string; slate: string; shadow: string }> = {
  night: { ink: "#F2EDE8", accent: "#E8B189", slate: "#D18A5A", shadow: "0 2px 28px rgba(8,6,5,0.55)" },
  gold: { ink: "#1E1B18", accent: "#7A3E1E", slate: "#7A3E1E", shadow: "none" },
  paper: { ink: "#1E1B18", accent: "#A85D35", slate: "#7A3E1E", shadow: "none" },
};

/**
 * A scene's caption: the story-clock slate in mono, then the line, word by
 * word (each rises half an em and fades in on the entrance curve, 1.5 frames
 * apart), held, and lifted away together on the exit curve before the cut.
 * Sound-off first: the line is the story, so it stays fully set for nearly
 * the whole scene.
 *
 * On night it sits on a scrim of the page's #161311 at ≥ 0.9 under every
 * glyph (§1.5), fading out below the block, so stars never cross the text.
 */
export function Caption({
  copy,
  tone,
  inAt = 4,
  outAt,
  size = TYPE.headline,
  slate,
  scrim = tone === "night",
  scrimEnd,
  top = SAFE.copyTop,
}: {
  copy: SceneCopy;
  tone: Tone;
  /** Local frame the first word starts. */
  inAt?: number;
  /** Local frame by which it has gone (the scene's length, usually). */
  outAt: number;
  size?: number;
  /** Override the slate (S7's clock steps). */
  slate?: string;
  scrim?: boolean;
  /** Where the scrim has faded out, px from the top (default: 640 px under the caption's top). */
  scrimEnd?: number;
  top?: number;
}) {
  const f = useCurrentFrame();
  const c = INK[tone];
  const words = typeset(copy.text).split(" ").filter(Boolean);
  const out = EASE.exit(span(f, outAt - 8, outAt - 1));
  const shown = 1 - out;
  const label = slate ?? copy.slate;
  const slateIn = EASE.enter(span(f, inAt - 2, inAt + 12));
  if (size < TYPE.headlineMin) throw new Error(`Caption: ${size}px is under the ${TYPE.headlineMin}px headline floor`);

  return (
    <>
      {scrim ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            height: scrimEnd ?? top + 640,
            opacity: Math.min(slateIn, shown) * 0.98 + 0.02,
            background:
              scrimEnd === undefined
                ? "linear-gradient(to bottom, rgba(16,13,12,0.94) 0%, rgba(16,13,12,0.9) 58%, rgba(16,13,12,0.55) 78%, rgba(16,13,12,0) 100%)"
                : `linear-gradient(to bottom, rgba(16,13,12,0.94) 0px, rgba(16,13,12,0.9) ${scrimEnd - 150}px, rgba(16,13,12,0.45) ${scrimEnd - 70}px, rgba(16,13,12,0) ${scrimEnd}px)`,
          }}
        />
      ) : null}
      <div style={{ position: "absolute", left: SAFE.side, top, width: SAFE.copyWidth }}>
        {label ? (
          <div
            style={{
              fontFamily: geistMono,
              fontSize: TYPE.eyebrow,
              fontWeight: 500,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              fontVariantNumeric: "tabular-nums",
              color: c.slate,
              lineHeight: 1.1,
              marginBottom: 22,
              opacity: slateIn * shown,
              transform: `translateY(${(1 - slateIn) * 16 - out * 10}px)`,
            }}
          >
            {label}
          </div>
        ) : null}
        <div
          style={{
            fontFamily: geist,
            fontSize: size,
            fontWeight: 700,
            lineHeight: 1.04,
            letterSpacing: "-0.032em",
            color: c.ink,
            textShadow: c.shadow,
            textWrap: "balance",
          }}
        >
          {words.map((w, i) => {
            const e = EASE.enter(span(f, inAt + i * 1.5, inAt + i * 1.5 + 16));
            const accent = copy.accentFrom !== undefined && i >= copy.accentFrom;
            return (
              <span key={`${w}-${i}`}>
                <span
                  style={{
                    display: "inline-block",
                    color: accent ? c.accent : undefined,
                    opacity: e * shown,
                    transform: `translateY(${(1 - e) * 0.42 * size - out * 12}px)`,
                  }}
                >
                  {w}
                </span>
                {i < words.length - 1 ? " " : null}
              </span>
            );
          })}
        </div>
      </div>
    </>
  );
}
