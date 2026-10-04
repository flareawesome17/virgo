import { useMemo } from "react";
import { AbsoluteFill, Interactive, Still, useVideoConfig } from "remotion";
import { geistMono } from "../brand/fonts";
import { CAST_WORLD, prologue, rig } from "../site";
import { SkyStill } from "../sky/SkyStill";
import { stillLevels } from "../sky/map-levels";
import { toScreen, type StillOptions } from "../sky/still-sky";

type Props = {
  /** Device pixels per CSS pixel: the lens is laid out at its size divided by this. */
  readonly dpr: number;
  /** Where the Prologue's push is, 0..1: 1 is the landing on Mika, the end of the zoom the lens stands in for. */
  readonly progress: number;
  /** The coastline's strength. The canvas brings it up to 7.5% on arrival; the lens shows more, so Cebu, Mactan and Bohol read without the motion. */
  readonly mapOpacity: number;
  /** A thin gold line along the shores, at this opacity, so the lens reads as a map of Cebu, Mactan and Bohol without the motion. */
  readonly coast: number;
  /**
   * The lens's own framing, on Mika's star: farther out than the landing, so
   * the island, Mactan and the strait read as Cebu (map units, degrees).
   */
  readonly camera: { readonly distance: number; readonly pitch: number; readonly heading: number; readonly fov: number };
};

/**
 * B3c, the Prologue for reduced motion and no JS: a round lens on Cebu City
 * at the end of the push, Mika's star in gold at its centre with her chip,
 * the crew and the Nearby roster faint around her, and Cebu, Mactan, Bohol
 * and Negros lying back in perspective, their shores traced in gold, the far
 * side sinking into the night. Outside the circle the still is transparent, so it sits
 * on whatever ground the page gives it.
 */
export function CebuLens({ dpr, progress, mapOpacity, coast, camera }: Props) {
  const { width, height } = useVideoConfig();
  const options: StillOptions = useMemo(
    () => ({ cssWidth: width / dpr, cssHeight: height / dpr, dpr, variant: "desktop", time: null }),
    [width, height, dpr],
  );
  const geo = useMemo(() => {
    const frame = prologue(progress, { w: options.cssWidth, h: options.cssHeight, mobile: false });
    const lens = rig({ target: CAST_WORLD.mika, ...camera });
    return { ...frame.geo!, camera: lens, map: mapOpacity };
  }, [options, progress, mapOpacity, camera]);
  const levels = useMemo(() => stillLevels(120 * dpr), [dpr]);
  const mika = toScreen(geo, options, CAST_WORLD.mika);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ borderRadius: "50%", overflow: "hidden" }}>
        <SkyStill geo={geo} options={options} levels={levels} coast={coast}>
          {mika ? (
            <div style={{ position: "absolute", left: mika.x, top: mika.y, width: 0, height: 0 }}>
              <div style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", scale: String(dpr) }}>
                <Interactive.Div
                  name="Mika's chip"
                  className="-translate-x-1/2 translate-y-[18px] rounded-full border border-[#F0C88E]/30 bg-[#161311]/[0.92] px-3.5 py-1.5 text-xs tracking-[0.06em] whitespace-nowrap text-[#F2EDE8]"
                  style={{ fontFamily: geistMono }}
                >
                  Mika · Photographer · Cebu City
                </Interactive.Div>
              </div>
            </div>
          ) : null}
        </SkyStill>
        {/* Distance: the far side of the view sinks into the night, so the plane reads as receding. */}
        <AbsoluteFill style={{ background: "linear-gradient(to bottom, rgba(14,12,11,0.55) 0%, rgba(14,12,11,0.22) 24%, rgba(14,12,11,0) 46%)" }} />
        {/* The glass: a soft fall-off to the rim, so the lens reads as looking through. */}
        <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 50%, rgba(14,12,11,0) 58%, rgba(14,12,11,0.35) 86%, rgba(14,12,11,0.75) 100%)" }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ borderRadius: "50%", boxShadow: "inset 0 0 0 2px rgba(240,200,142,0.28), inset 0 0 0 6px rgba(240,200,142,0.05)" }} />
    </AbsoluteFill>
  );
}

export const CebuLensStill = () => (
  <Still id="CebuLens" component={CebuLens} width={960} height={960} defaultProps={{ dpr: 2, progress: 1, mapOpacity: 0.15, coast: 0.42, camera: { distance: 78, pitch: 40, heading: 14, fov: 40 } }} />
);
