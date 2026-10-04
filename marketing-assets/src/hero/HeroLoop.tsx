import { useLayoutEffect, useMemo, useRef } from "react";
import { AbsoluteFill, Composition, Folder, useCurrentFrame, useVideoConfig } from "remotion";
import { drawHero, heroBuffers, heroField } from "./field";
import { phase } from "./loop";

type Props = {
  /**
   * Frames in one loop, N in θ = 2πf/N. A prop rather than the duration, so
   * HeroLoopSeam can run one frame past the loop and show frame N = frame 0.
   */
  readonly loopFrames: number;
  /** 0..1 multipliers, for tuning in the Studio: the haze, the dust, the stars. */
  readonly haze: number;
  readonly dust: number;
  readonly stars: number;
  /** Outline the hero copy's side of the frame, where haze, stars and dust are held back. Off in renders. */
  readonly showSafeArea: boolean;
};

/**
 * C1, HeroLoop-Wide: the seamless atmospheric loop behind the desktop
 * Prologue. Far stars in depth with a faint band through them, warm haze
 * that churns, and out-of-focus dust drifting up near the lens, while the
 * camera breathes on a small ellipse once per loop. One canvas, redrawn from
 * the frame alone (field.ts), so any frame renders the same in any tab.
 * No grain: the site's grain layer dithers it.
 */
export function HeroLoop({ loopFrames, haze, dust, stars, showSafeArea }: Props) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const canvas = useRef<HTMLCanvasElement>(null);
  const field = useMemo(() => heroField(width, height), [width, height]);
  const scratch = useMemo(() => ({ buffers: heroBuffers(field), image: new ImageData(width, height) }), [field, width, height]);

  useLayoutEffect(() => {
    const g = canvas.current?.getContext("2d");
    if (!g) return;
    drawHero(field, scratch.buffers, phase(frame, loopFrames), { haze, dust, stars }, scratch.image.data);
    g.putImageData(scratch.image, 0, 0);
  }, [frame, loopFrames, field, scratch, haze, dust, stars]);

  return (
    <AbsoluteFill style={{ backgroundColor: "#161311" }}>
      <canvas ref={canvas} width={width} height={height} style={{ position: "absolute", inset: 0, width, height }} />
      {showSafeArea ? <AbsoluteFill style={{ width: "45%", border: "2px dashed rgba(209,138,90,0.7)" }} /> : null}
    </AbsoluteFill>
  );
}

export const HeroLoopCompositions = () => (
  <>
    <Composition
      id="HeroLoopWide"
      component={HeroLoop}
      width={1280}
      height={720}
      fps={24}
      durationInFrames={288}
      defaultProps={{ loopFrames: 288, haze: 1, dust: 1, stars: 1, showSafeArea: false }}
    />
    <Folder name="Hero-Debug">
      {/* One frame past the loop: frame 288 must render what frame 0 renders (scripts/render-check.mjs). */}
      <Composition
        id="HeroLoopSeam"
        component={HeroLoop}
        width={1280}
        height={720}
        fps={24}
        durationInFrames={289}
        defaultProps={{ loopFrames: 288, haze: 1, dust: 1, stars: 1, showSafeArea: false }}
      />
    </Folder>
  </>
);
