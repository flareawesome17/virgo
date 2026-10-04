import { useMemo } from "react";
import { Still, useVideoConfig } from "remotion";
import { crane } from "../site";
import { SkyStill } from "../sky/SkyStill";
import { stillLevels } from "../sky/map-levels";
import type { StillOptions } from "../sky/still-sky";

type Props = {
  /** Which Ch8 framing and cluster set: desktop's 18 cities in a low, wide view, or the phone's 12 from higher up. */
  readonly variant: "mobile" | "desktop";
  /** Device pixels per CSS pixel: the still's size divided by it is the layout the crane was framed for. */
  readonly dpr: number;
  /** "The coastline appears under the stars at 14%." */
  readonly mapOpacity: number;
};

/**
 * B3b, Ch8 for reduced motion: the crane's last frame held still, for a
 * desktop layout (18 clusters, low and wide) and a phone (12, from higher up). The
 * archipelago lies back as a plane in perspective (Mindanao near, Luzon
 * receding), every small constellation lit above its city with its thread of
 * light down to the ground, the coastline at 14%. No labels are baked in:
 * the page sets text as text.
 */
export function Clusters({ variant, dpr, mapOpacity }: Props) {
  const { width, height } = useVideoConfig();
  const options: StillOptions = useMemo(
    () => ({ cssWidth: width / dpr, cssHeight: height / dpr, dpr, variant, time: null }),
    [width, height, dpr, variant],
  );
  const geo = useMemo(() => {
    const frame = crane(1, { w: options.cssWidth, h: options.cssHeight, mobile: variant === "mobile" }, false);
    return { ...frame.geo!, map: mapOpacity };
  }, [options, variant, mapOpacity]);
  const levels = useMemo(() => stillLevels(4 * dpr), [dpr]);
  return <SkyStill geo={geo} options={options} levels={levels} />;
}

export const ClustersStill = () => (
  <>
    <Still id="ClustersD" component={Clusters} width={1920} height={1200} defaultProps={{ variant: "desktop", dpr: 1.5, mapOpacity: 0.14 }} />
    <Still id="ClustersM" component={Clusters} width={720} height={1560} defaultProps={{ variant: "mobile", dpr: 2, mapOpacity: 0.14 }} />
  </>
);
