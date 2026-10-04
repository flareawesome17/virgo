import type { FC } from "react";
import { AbsoluteFill, Composition, Sequence } from "remotion";
import { NIGHT } from "../brand/palette";
import { S1Sky } from "./scenes/S1Sky";
import { S2Chats } from "./scenes/S2Chats";
import { S3Post } from "./scenes/S3Post";
import { S4Nearby } from "./scenes/S4Nearby";
import { S5Connect } from "./scenes/S5Connect";
import { S6Rings } from "./scenes/S6Rings";
import { S7Saturday } from "./scenes/S7Saturday";
import { S8Handover } from "./scenes/S8Handover";
import { S9Constellation } from "./scenes/S9Constellation";
import { ReelStage } from "./Stage";
import { REEL, SAFE, SCENES, type SceneId } from "./timeline";

type Props = {
  /** Studio only: draw the video-layout safe areas over the frame. */
  readonly safeArea: boolean;
};

const SCENE: Record<SceneId, FC> = {
  S1: S1Sky,
  S2: S2Chats,
  S3: S3Post,
  S4: S4Nearby,
  S5: S5Connect,
  S6: S6Rings,
  S7: S7Saturday,
  S8: S8Handover,
  S9: S9Constellation,
};

/** The safe areas and the copy band, for checking a layout in the Studio. Off in renders. */
function SafeArea() {
  const line = "2px dashed rgba(0,255,170,0.7)";
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{ position: "absolute", left: SAFE.side, right: SAFE.side, top: SAFE.top, bottom: SAFE.bottom, border: line }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: SAFE.copyBottom, borderTop: "2px dashed rgba(255,80,80,0.7)" }} />
    </AbsoluteFill>
  );
}

/**
 * C3, the 28-second vertical reel (storyboard §4.1): one wedding crew from
 * Wednesday night to the end card, sound off, every UI on screen a real
 * mock from web/src/components/story/mocks in a 3D phone. Nine scenes, each
 * a Sequence on its exact frames, none overlapping.
 *
 * Render (from marketing-assets/, against a bundle):
 *   npx remotion bundle src/index.ts --out-dir=out/reel/bundle
 *   npx remotion render out/reel/bundle Reel out/reel/virgo-reel-master.mp4 --codec=h264 --crf=16
 *     --x264-preset=slow --pixel-format=yuv420p --color-space=bt709 --image-format=png --muted
 *   npx remotion still out/reel/bundle Reel out/reel/stills/frame-040.png --frame=40   (also 120 210 300 400 490 580 680 800)
 * The master is not committed (out/ is gitignored). Add music in each app from its licensed library.
 */
export function Reel({ safeArea }: Props) {
  return (
    <ReelStage background={NIGHT.ground}>
      {(Object.keys(SCENES) as SceneId[]).map((id) => {
        const Scene = SCENE[id];
        const { from, to } = SCENES[id];
        return Scene ? (
          <Sequence key={id} name={id} from={from} durationInFrames={to - from}>
            <Scene />
          </Sequence>
        ) : null;
      })}
      {safeArea ? <SafeArea /> : null}
    </ReelStage>
  );
}

export const ReelCompositions = () => (
  <Composition id="Reel" component={Reel} width={REEL.width} height={REEL.height} fps={REEL.fps} durationInFrames={REEL.frames} defaultProps={{ safeArea: false }} />
);
