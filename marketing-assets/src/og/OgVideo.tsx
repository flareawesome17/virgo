import { useLayoutEffect, useMemo, useRef } from "react";
import { AbsoluteFill, Composition, Folder, Img, Interactive, cancelRender, continueRender, delayRender, useCurrentFrame, useVideoConfig } from "remotion";
import logo from "../../../web/public/logo.png";
import { StarStop } from "../../../web/src/components/story/svg/star-stop";
import { geist, geistMono } from "../brand/fonts";
import { GOLD_TEXT, STAGE_BACKGROUND } from "../brand/palette";
import { figureLayout, paintField, paintFigure, paintPulse } from "./figure";

type Props = {
  /** Frames in one loop: the twinkle's harmonics are of 2πf/loopFrames. A prop so OgVideoSeam can run one frame past it. */
  readonly loopFrames: number;
};

/** Where every word must stay: 72 px from the left, 64 from the top and bottom, left of the figure. */
const SAFE = { left: 72, top: 64, right: 640, bottom: 566 } as const;

/**
 * C2, the animated Open Graph card (storyboard §4.1). Left: the logo and
 * "Virgo", the H1 in the hero's two weights with its star full stop, and
 * virgo.ph. Right: the whole Virgo figure, all 14 stars, at rest. Between
 * frames 36 and 150 one pulse of light leaves Spica and runs the figure's
 * edges while the stars twinkle softly; every other frame is the same card,
 * so frame 0 is the og:image and frame 240 is frame 0 again.
 */
export function OgVideo({ loopFrames }: Props) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const canvas = useRef<HTMLCanvasElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  const layout = useMemo(() => figureLayout(width, height), [width, height]);
  const field = useMemo(() => {
    const c = new OffscreenCanvas(width, height);
    const g = c.getContext("2d")!;
    paintField(g, layout, 0.95);
    // Keep the far field off the copy: it fades in from the left third.
    g.globalCompositeOperation = "destination-in";
    const mask = g.createLinearGradient(0, 0, width, 0);
    mask.addColorStop(0, "rgba(0,0,0,0.08)");
    mask.addColorStop(0.36, "rgba(0,0,0,0.18)");
    mask.addColorStop(0.58, "rgba(0,0,0,1)");
    g.fillStyle = mask;
    g.fillRect(0, 0, width, height);
    return c;
  }, [layout, width, height]);

  useLayoutEffect(() => {
    const g = canvas.current?.getContext("2d");
    if (!g) return;
    g.clearRect(0, 0, width, height);
    // A warm glow behind the figure, then the field, the figure and its pulse.
    let cx = 0;
    let cy = 0;
    for (const p of layout.at.values()) {
      cx += p.x / layout.at.size;
      cy += p.y / layout.at.size;
    }
    const glow = g.createRadialGradient(cx, cy, 0, cx, cy, height * 0.62);
    glow.addColorStop(0, "rgba(193,119,69,0.11)");
    glow.addColorStop(0.55, "rgba(193,119,69,0.04)");
    glow.addColorStop(1, "rgba(193,119,69,0)");
    g.fillStyle = glow;
    g.fillRect(0, 0, width, height);
    g.drawImage(field, 0, 0);
    paintFigure(g, layout, frame, loopFrames);
    paintPulse(g, layout, frame);
  }, [frame, loopFrames, layout, field, width, height]);

  // Every word inside the safe area, measured once the faces have loaded: a longer headline fails the render instead of shipping clipped.
  useLayoutEffect(() => {
    const handle = delayRender("Measuring the OG copy");
    document.fonts.ready.then(() => {
      const box = copy.current?.getBoundingClientRect();
      const words = copy.current ? [...copy.current.querySelectorAll("[data-copy]")].map((el) => el.getBoundingClientRect()) : [];
      const out = words.find((r) => r.left < SAFE.left - 0.5 || r.right > SAFE.right || r.top < SAFE.top - 0.5 || r.bottom > SAFE.bottom);
      if (!box || out) cancelRender(new Error(`OgVideo: copy outside the safe area (${JSON.stringify(out ?? null)})`));
      else continueRender(handle);
    });
  }, []);

  return (
    <AbsoluteFill style={{ background: STAGE_BACKGROUND }}>
      <canvas ref={canvas} width={width} height={height} style={{ position: "absolute", inset: 0, width, height }} />
      <AbsoluteFill ref={copy}>
        <Interactive.Div name="Brand" data-copy="" style={{ position: "absolute", left: 72, top: 64, display: "flex", alignItems: "center", gap: 14 }}>
          <Img src={logo} style={{ width: 64, height: 64, display: "block" }} />
          <span style={{ fontFamily: geist, fontWeight: 600, fontSize: 34, letterSpacing: "-0.02em", color: "#F2EDE8" }}>Virgo</span>
        </Interactive.Div>
        <Interactive.H1
          name="Headline"
          data-copy=""
          style={{
            position: "absolute",
            left: 72,
            top: 210,
            margin: 0,
            fontFamily: geist,
            fontSize: 74,
            lineHeight: 1.02,
            letterSpacing: "-0.035em",
            fontWeight: 500,
            color: "#BCADA3",
          }}
        >
          Where creatives
          <br />
          find{" "}
          <span style={{ fontWeight: 800, backgroundImage: GOLD_TEXT, backgroundClip: "text", WebkitBackgroundClip: "text", color: "transparent" }}>
            each other,
            <br />
            and get paid
          </span>
          <StarStop />
        </Interactive.H1>
        <Interactive.Div
          name="Domain"
          data-copy=""
          style={{ position: "absolute", left: 72, bottom: 64, fontFamily: geistMono, fontSize: 22, letterSpacing: "0.06em", color: "#BCADA3" }}
        >
          virgo.ph
        </Interactive.Div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

export const OgCompositions = () => (
  <>
    <Composition id="OgVideo" component={OgVideo} width={1200} height={630} fps={24} durationInFrames={240} defaultProps={{ loopFrames: 240 }} />
    <Folder name="OG-Debug">
      {/* One frame past the loop: frame 240 must be frame 0, the og:image (scripts/render-check.mjs). */}
      <Composition id="OgVideoSeam" component={OgVideo} width={1200} height={630} fps={24} durationInFrames={241} defaultProps={{ loopFrames: 240 }} />
    </Folder>
  </>
);
