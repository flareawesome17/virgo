import { useRef } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { RADIUS_LABELS } from "../../../../web/src/components/story/data/strings/ch2";
import { RADII, rows } from "../../../../web/src/components/story/data/story";
import { NearbyPhone, slug, type NearbyState } from "../../../../web/src/components/story/mocks/nearby-phone";
import { geistMono } from "../../brand/fonts";
import { KM_PER_UNIT, type GeoState } from "../../site";
import { Caption } from "../Caption";
import { CAPTIONS, COORDINATOR_TAG } from "../copy";
import { put, useDrive } from "../drive";
import { EASE, clamp01, glide, lerp, span, tw } from "../motion";
import { PHONE_W, PhoneRig, type PhonePose } from "../PhoneRig";
import { ReelSky, geoToFrame } from "../sky";
import { COORDINATOR, MIKA, castStars, radarRig, radarRing, rig } from "../sky-frames";
import { length } from "../timeline";
import { s1Coast } from "./S1Sky";

const N = length("S4");
/** The beats: the 5 km ring opens, the camera pulls back 5× to the 25 km ring, the coordinator is erased. */
const AT = { ring5: [4, 22], r25: 40, pull: [26, 54], ring25: [34, 56], tag: [56, 62], erase: 70 } as const;
const R5 = RADII[0];
const R25 = RADII[1];

/** The camera's distance to Mika: 14 (where S3's star arrives) → 20.6 (the 5 km ring fills the frame) → 5× that. */
const distanceAt = (f: number) => Math.exp(glide(f, [[0, Math.log(17)], [AT.ring5[1], Math.log(26)], [AT.pull[0], Math.log(26)], [AT.pull[1], Math.log(130)], [N, Math.log(136)]]));

/** Where S3's post star comes to rest: the radar's centre on S4's first frame. */
export const S4_START = radarRig(17, 18);

export function s4Geo(f: number): GeoState {
  const d = distanceAt(f);
  const ring5 = EASE.camera(span(f, AT.ring5[0], AT.ring5[1]));
  const ring25 = EASE.camera(span(f, AT.ring25[0], AT.ring25[1]));
  // The roster brightens inside the ring as it opens: 5 km, then 25.
  const km = f < AT.ring25[0] ? R5 * ring5 : lerp(R5, R25, ring25);
  // The rings condense back into the stars at the end.
  const condense = tw(f, N - 16, N - 1, EASE.camera);
  return {
    camera: rig(radarRig(d, 18 + 4 * tw(f, 0, N, EASE.inOut))),
    opacity: 1,
    map: 0.11,
    dimOuter: { center: MIKA, radius: 60, amount: 0.5 },
    stars: castStars({ mika: 1, halo: 0.9, crew: 0.45, roster: 0.7, within: { km, lift: 0.5 }, erased: f >= AT.erase, mikaSize: 16 }),
    rings: [
      radarRing(R5 * (1 - 0.8 * condense), ring5, lerp(0.9, 0.42, ring25) * (1 - condense), 1.8),
      ...(ring25 > 0 ? [radarRing(R25 * (1 - 0.8 * condense), ring25, 0.9 * (1 - condense), 1.8)] : []),
    ],
  };
}

const stateAt = (f: number): NearbyState => (f >= AT.erase ? "r25-erased" : f >= AT.r25 ? "r25" : "r5");

/** The phone lies back under the radar, rising into frame, its list in view. */
function pose(f: number): PhonePose {
  const rise = tw(f, 0, 18, EASE.rise);
  // The phone sinks as the rings condense back into stars (the hand-off to Ch3).
  const leave = tw(f, N - 14, N, EASE.camera);
  return {
    fx: PHONE_W / 2,
    fy: 300,
    x: 540,
    y: lerp(2050, 1466, rise) + 700 * leave,
    scale: 2.05,
    rx: lerp(22, 12, rise),
    ry: lerp(-6, -3, rise) + 2 * tw(f, 18, N, EASE.inOut),
    opacity: clamp01(rise * 2) * (1 - tw(f, N - 8, N, EASE.ui)),
  };
}

/** Rows that join at 25 km, nearest first, and when each fades in. */
const JOINERS = rows(R25, undefined, false).filter((n) => n.km > R5);

/**
 * S4 · Ch2 (frames 255–345). The post's star becomes the radar's centre:
 * Mika, over Cebu City, with the roster's stars standing over their places.
 * A 5 km ring opens on the tilted map plane like a ripple, the stars inside
 * it brighten, and Nearby on her phone lists them in whole kilometres. The
 * camera pulls back 5× and the 25 km ring reads at the same size; Bea and the
 * rest join the list. Then an unnamed star 3 km out — a coordinator — turns
 * sharing off and is simply not there in the next frame, and the
 * Coordinator chip goes 1 → 0.
 */
export function S4Nearby() {
  const f = useCurrentFrame();
  const ref = useRef<HTMLDivElement>(null);
  const geo = s4Geo(f);
  const state = stateAt(f);

  useDrive(ref, ({ one }) => {
    // Distances count up in whole kilometres as each row arrives.
    for (const n of rows(R25, undefined, false)) {
      const id = slug(n.name);
      const at = n.km <= R5 ? 6 : AT.r25 + 2 + JOINERS.indexOf(n) * 2;
      const t = EASE.ui(span(f, at, at + 8));
      const km = one(`km-${id}`);
      // Whole kilometres only, and never under 1: the app writes "under 1 km away" below that.
      const from = n.km <= R5 ? 1 : R5;
      if (km) km.textContent = String(Math.round(lerp(from, n.km, t)));
      put(one(`row-${id}`), { opacity: n.km <= R5 ? 1 : t, transform: `translateY(${((1 - t) * 10).toFixed(2)}px)` });
    }
    // The radius is read off the ring; the phone shows who is inside it: the role counts, then the rows.
    put(one("nearby-scroll"), { transform: "translateY(-76px)" });
    // The Coordinator chip's 1 → 0, with a press so the eye finds it.
    put(one("role-coordinator"), { transform: `scale(${(1 - 0.1 * Math.sin(Math.PI * span(f, AT.erase - 1, AT.erase + 7))).toFixed(4)})` });
  });

  const tagAt = geoToFrame(geo, COORDINATOR.world);
  const tag = EASE.enter(span(f, AT.tag[0], AT.tag[1])) * (f < AT.erase ? 1 : 0);
  const ringEdge = (km: number) => geoToFrame(geo, [MIKA[0] + km / KM_PER_UNIT, MIKA[1], MIKA[2]]);
  const l5 = ringEdge(R5);
  const l25 = ringEdge(R25);
  const label = (at: { x: number; y: number } | null, text: string, o: number) =>
    at && o > 0.01 ? (
      <div style={{ position: "absolute", left: at.x + 16, top: at.y, transform: "translateY(-50%)", opacity: o, fontFamily: geistMono, fontSize: 34, letterSpacing: "0.04em", color: "#F0C88E", whiteSpace: "nowrap", textShadow: "0 2px 12px rgba(0,0,0,0.8)" }}>
        {text}
      </div>
    ) : null;

  return (
    <AbsoluteFill>
      <ReelSky geo={geo} time={(255 + f) / 30} coast={s1Coast(75) * 0.9}>
        {label(l5, RADIUS_LABELS[0], tw(f, AT.ring5[1] - 6, AT.ring5[1] + 2) * (1 - tw(f, AT.pull[0], AT.pull[0] + 10)))}
        {label(l25, RADIUS_LABELS[1], tw(f, AT.ring25[1] - 6, AT.ring25[1] + 2) * (1 - tw(f, N - 16, N - 8)))}
        {tagAt && tag > 0.01 ? (
          <div style={{ position: "absolute", left: tagAt.x, top: tagAt.y, opacity: tag }}>
            <div style={{ position: "absolute", left: -34, top: -34, width: 68, height: 68, borderRadius: 999, border: "2px solid rgba(240,200,142,0.65)" }} />
            <div
              style={{
                position: "absolute",
                right: 46,
                top: -26,
                whiteSpace: "nowrap",
                fontFamily: geistMono,
                fontSize: 34,
                letterSpacing: "0.04em",
                color: "#F2EDE8",
                background: "rgba(22,19,17,0.92)",
                border: "2px solid rgba(240,200,142,0.3)",
                borderRadius: 999,
                padding: "6px 20px",
              }}
            >
              {COORDINATOR_TAG}
            </div>
          </div>
        ) : null}
      </ReelSky>
      <div ref={ref}>
        <PhoneRig pose={pose(f)} time="12:04">
          <NearbyPhone state={state} scroll="within" maxRows={6} />
        </PhoneRig>
      </div>
      <Caption copy={CAPTIONS.S4} tone="night" inAt={6} outAt={N} size={84} scrimEnd={600} />
    </AbsoluteFill>
  );
}
