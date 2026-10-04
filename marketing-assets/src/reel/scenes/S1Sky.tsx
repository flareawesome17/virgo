import { AbsoluteFill, Easing, useCurrentFrame } from "remotion";
import { geistMono } from "../../brand/fonts";
import { smoothstep, type GeoState } from "../../site";
import { Caption } from "../Caption";
import { CAPTIONS, MIKA_CHIP } from "../copy";
import { EASE, span, tw } from "../motion";
import { ReelSky, geoToFrame } from "../sky";
import { MIKA, S1_KEYS, castStars, path, rig } from "../sky-frames";
import { length } from "../timeline";

const N = length("S1");
/** The descent: under way from the first frame (a hook moves), landing softly on Mika by frame 70. */
const descent = Easing.bezier(0.4, 0.02, 0.16, 1);

/** S1's sky at local frame f, shared with S2, which opens on its last frame. */
/** A thin gold shoreline as the coasts come up, so Cebu reads as a place in a 2.5-second shot. */
export const s1Coast = (f: number) => 0.34 * smoothstep(0.35, 0.75, descent(span(f, 0, 70)));

export function s1Geo(f: number): GeoState {
  const t = descent(span(f, 0, 70));
  return {
    camera: rig(path(S1_KEYS, t)),
    opacity: 1,
    // Only the Visayas' coasts come up as the camera arrives, faintly (the page saves the coastline for Ch8).
    map: 0.1 * smoothstep(0.3, 0.7, t),
    dimOuter: { center: MIKA, radius: 26, amount: smoothstep(0.45, 0.85, t) },
    stars: castStars({
      mika: 0.75 + 0.25 * smoothstep(0.6, 0.9, t),
      halo: 0.35 + 0.65 * smoothstep(0.78, 0.98, t),
      crew: 0.7 * smoothstep(0.62, 0.9, t),
      roster: smoothstep(0.7, 0.95, t),
      mikaSize: 15,
    }),
    // Near-field dust streams past mid-push, so the dolly reads as travel through depth (§1.13).
    motes: smoothstep(0.06, 0.2, t) * (1 - smoothstep(0.72, 0.94, t)),
  };
}

/**
 * S1 · Prologue (frames 0–75). Night over the Philippines: the stars sit on
 * the cities, so the archipelago is there before any coastline. The camera
 * dives through them, from overhead to oblique, onto one gold star in Cebu
 * City; it gains a halo and her chip. "Wednesday, 11:42 PM."
 */
export function S1Sky() {
  const f = useCurrentFrame();
  const geo = s1Geo(f);
  const mika = geoToFrame(geo, MIKA);
  // The chip resolves on arrival, then gives way as her glow becomes S2's phone.
  const chip = EASE.enter(span(f, 54, 66)) * (1 - tw(f, 69, 74, EASE.ui));
  return (
    <AbsoluteFill>
      <ReelSky geo={geo} time={f / 30} coast={s1Coast(f)}>
        {mika ? (
          <div
            style={{
              position: "absolute",
              left: mika.x,
              top: mika.y + 46,
              transform: `translate(-50%, ${(1 - chip) * 14}px)`,
              opacity: chip,
              whiteSpace: "nowrap",
              fontFamily: geistMono,
              fontSize: 36,
              letterSpacing: "0.05em",
              color: "#F2EDE8",
              background: "rgba(22,19,17,0.92)",
              border: "2px solid rgba(240,200,142,0.32)",
              borderRadius: 999,
              padding: "12px 30px",
            }}
          >
            {MIKA_CHIP}
          </div>
        ) : null}
      </ReelSky>
      <Caption copy={CAPTIONS.S1} tone="night" inAt={2} outAt={N} size={104} top={210} />
    </AbsoluteFill>
  );
}
