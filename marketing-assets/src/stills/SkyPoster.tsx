import { useMemo } from "react";
import { Still, useVideoConfig } from "remotion";
import { COUNTS, SEED_MAP, hashStars, prologue, starCloud, type SkyVariant } from "../site";
import { SkyStill } from "../sky/SkyStill";
import { stillLevels } from "../sky/map-levels";
import type { StillOptions } from "../sky/still-sky";

type Props = {
  readonly variant: Extract<SkyVariant, "mobile" | "desktop">;
  /** Device pixels per CSS pixel the poster is drawn for: the CSS viewport is the still's size divided by it. */
  readonly dpr: number;
  /** The coastline under the stars (the frame's `geo.map`). The page's canvas holds it back until the push; the poster bakes it in faintly. */
  readonly mapOpacity: number;
  /** The twinkle clock, seconds: 0 is the canvas's first frame. */
  readonly time: number;
  /** check-seed.mjs's pinned hash for this variant (passed by scripts/render-all.mjs): the render fails if the cloud differs. */
  readonly expectSeed: string;
};

/**
 * B3, the sky posters: frame 0 of the Prologue's canvas (the archipelago
 * seen from space, seed "VIRG"), with the archipelago's coastline baked in
 * faintly. The page shows it as the hero's CSS background until the canvas
 * crossfades over it, so it is drawn by the canvas's own painter, from the
 * same seed, camera and sprites.
 */
export function SkyPoster({ variant, dpr, mapOpacity, time, expectSeed }: Props) {
  const { width, height } = useVideoConfig();
  const options: StillOptions = useMemo(
    () => ({ cssWidth: width / dpr, cssHeight: height / dpr, dpr, variant, time }),
    [width, height, dpr, variant, time],
  );
  const seedHash = useMemo(() => hashStars(starCloud(SEED_MAP, COUNTS[variant])), [variant]);
  if (expectSeed && seedHash !== expectSeed) {
    throw new Error(`SkyPoster ${variant}: the cloud hashes ${seedHash}, check-seed.mjs pins ${expectSeed}. The page and the poster would differ.`);
  }
  const geo = useMemo(() => {
    const frame = prologue(0, { w: options.cssWidth, h: options.cssHeight, mobile: variant === "mobile" });
    return { ...frame.geo!, map: mapOpacity };
  }, [options, variant, mapOpacity]);
  const levels = useMemo(() => stillLevels(3 * dpr), [dpr]);
  return <SkyStill geo={geo} options={options} levels={levels} />;
}

export const SkyPosterStills = () => (
  <>
    <Still
      id="SkyPosterM"
      component={SkyPoster}
      width={720}
      height={1560}
      defaultProps={{ variant: "mobile", dpr: 2, mapOpacity: 0.075, time: 0, expectSeed: "" }}
    />
    <Still
      id="SkyPosterD"
      component={SkyPoster}
      width={1920}
      height={1080}
      defaultProps={{ variant: "desktop", dpr: 1, mapOpacity: 0.075, time: 0, expectSeed: "" }}
    />
  </>
);
