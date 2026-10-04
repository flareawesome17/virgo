import { useRef } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { aim } from "../../../../web/src/components/story/sky/camera";
import { ApplicantsCard, type ApplicantsBeat } from "../../../../web/src/components/story/mocks/applicant-row";
import type { Hire } from "../../../../web/src/components/story/data/strings/ch3";
import { geistMono } from "../../brand/fonts";
import { CAST, CAST_STARS, CAST_WORLD, STARS, smoothstep, type GeoState, type Vec3 } from "../../site";
import { Caption } from "../Caption";
import { CAPTIONS } from "../copy";
import { put, useDrive } from "../drive";
import { EASE, clamp01, lerp, press, span, tw } from "../motion";
import { PHONE_W, PhoneRig, type PhonePose } from "../PhoneRig";
import { ReelSky, deepToFrame } from "../sky";
import { MIKA, VIRGO_RECT, castStars, earthFor, mixRig, radarRig, rig, sideFor, thread, virgo } from "../sky-frames";
import { length } from "../timeline";
import { s1Coast } from "./S1Sky";

const N = length("S5");
const CREW = ["ernie", "kenn", "bea"] as const;

/** The beats. Threads arrive; Mika accepts from the bottom of the list up (the API sends the newest first: Bea, Kenn, Ernie). */
const AT = {
  arrive: { ernie: 2, kenn: 7, bea: 12 } as Record<Hire, number>,
  accept: { ernie: 20, kenn: 30, bea: 39 } as Record<Hire, number>,
  look: [50, 68],
  morph: [52, 74],
  orbit: [52, 94],
  form: [70, 97],
} as const;

/** Where the threads read best: pulled back over the crew, Mika low in the frame. */
const OVER_CREW = { target: MIKA as Vec3, distance: 25, pitch: 52, heading: 20, fov: 42, shift: [0.04, -0.03] as const };

const beatAt = (f: number): { state: ApplicantsBeat; accepting?: Hire } => {
  const done = (h: Hire) => f >= AT.accept[h] + 4;
  const pressing = CREW.find((h) => f >= AT.accept[h] && !done(h));
  const state: ApplicantsBeat = done("bea") ? "filled" : done("kenn") ? "kenn" : done("ernie") ? "ernie" : "new";
  return { state, accepting: pressing };
};

/** The geo sky: from S4's wide radar into the crew, then the camera tilts up from where it stands. */
export function s5Geo(f: number): GeoState {
  const near = EASE.camera(span(f, 0, 26));
  const ground = mixRig(radarRig(136, 22), OVER_CREW, near);
  const standing = rig(ground).position;
  const look = EASE.camera(span(f, AT.look[0], AT.look[1]));
  const camera = look <= 0 ? rig(ground) : aim(standing, lerp(OVER_CREW.pitch, -30, look), lerp(OVER_CREW.heading, 12, look), OVER_CREW.fov, 40);
  return {
    camera,
    opacity: 1 - smoothstep(AT.look[0] + 2, AT.look[1] - 2, f),
    map: 0.11 * (1 - smoothstep(AT.look[0], AT.look[0] + 10, f)),
    // The night stays full around them: the city stars dim only a little, the roster stays lit.
    dimOuter: { center: MIKA, radius: 40, amount: 0.3 },
    stars: castStars({ mika: 1, halo: 0.95, crew: 0.95, roster: 0.85 * (1 - near * 0.3), mikaSize: 17 }),
    threads: CREW.flatMap((h) => {
      const arrive = EASE.ui(span(f, AT.arrive[h], AT.arrive[h] + 14));
      const solid = EASE.ui(span(f, AT.accept[h] + 2, AT.accept[h] + 6));
      const back = span(f, AT.accept[h] + 2, AT.accept[h] + 10);
      return [
        // As the camera looks up, the threads hand over to the sky's own (the deep scene's crew lines).
        thread(h, arrive, lerp(0.5, 0.95, solid) * (1 - look), lerp(1.4, 2.4, solid)),
        // A pulse runs back from Mika to them as she accepts.
        ...(back > 0 && back < 1 ? [{ a: MIKA, b: CAST_WORLD[h], progress: EASE.ui(back), alpha: 1 - back * 0.7, width: 3.2 }] : []),
      ];
    }),
  };
}

export function s5Deep(f: number) {
  const orbit = EASE.camera(span(f, AT.orbit[0], AT.orbit[1]));
  return virgo({
    camera: mixRig(sideFor(VIRGO_RECT), earthFor(VIRGO_RECT), orbit),
    opacity: smoothstep(AT.look[0] - 2, AT.look[0] + 8, f),
    stars: smoothstep(AT.look[0] + 2, AT.look[0] + 12, f),
    form: span(f, AT.form[0], AT.form[1]),
    syrma: 0,
    cast: smoothstep(AT.form[0] + 4, AT.form[0] + 18, f),
    crew: 1 - smoothstep(AT.form[0], AT.form[0] + 16, f),
    field: smoothstep(AT.look[0] - 12, AT.look[0] + 4, f),
    morph: span(f, AT.morph[0], AT.morph[1]),
  });
}

/** The phone, lying back under the sky with the post's applicants; it drops away as the camera looks up. */
function pose(f: number): PhonePose {
  const rise = tw(f, 0, 16, EASE.rise);
  const leave = tw(f, AT.look[0] - 4, AT.look[0] + 10, EASE.camera);
  return {
    fx: PHONE_W / 2,
    fy: 420,
    x: 540,
    y: lerp(2300, 1724, rise) + 700 * leave,
    scale: 1.7,
    rx: lerp(20, 9, rise) + 16 * leave,
    ry: -3 + 3 * tw(f, 0, AT.look[0], EASE.inOut),
    opacity: clamp01(rise * 2) * (1 - tw(f, AT.look[0] + 2, AT.look[0] + 10)),
  };
}

/** Each label's side of its star: Heze and Porrima sit close, so Bea's reads to the left and Ernie's to the right. */
const SIDE = { mika: { dx: 0, dy: 40, anchor: -0.5 }, kenn: { dx: 0, dy: -78, anchor: -0.5 }, ernie: { dx: 20, dy: 22, anchor: 0 }, bea: { dx: -20, dy: 22, anchor: -1 } } as const;
const LABELS = (["mika", "ernie", "kenn", "bea"] as const).map((who) => {
  const s = STARS.find((x) => x.id === CAST_STARS[who])!;
  return { who, star: s, side: SIDE[who], text: `${CAST[who].first} · ${s.label}` };
});

/**
 * S5 · Ch3 (frames 345–450). "Nobody lands in your network without agreeing
 * to it." Threads of light travel from Ernie's, Kenn's and Bea's stars to
 * Mika's: applications arriving. On her phone, the post's applicants (the
 * app's own rows, newest first) and Accept presses, bottom up; each thread
 * turns solid gold and a pulse runs back. Then the phone falls away, the
 * camera looks up from Cebu, the four stars rise off the map and, seen from
 * Earth at their real distances, line up with nine more into Virgo. Syrma
 * stays an unlit socket.
 */
export function S5Connect() {
  const f = useCurrentFrame();
  const ref = useRef<HTMLDivElement>(null);
  const geo = s5Geo(f);
  const deep = s5Deep(f);
  const beat = beatAt(f);

  useDrive(ref, ({ one }) => {
    for (const h of CREW) put(one(`accept-${h}`), { transform: `scale(${press(f, AT.accept[h], 8, 0.93).toFixed(4)})` });
  });

  const labels = deep.opacity > 0.5 ? LABELS.map((l) => ({ ...l, at: deepToFrame(deep, l.star.pos) })) : [];
  const labelIn = (i: number) => EASE.enter(span(f, AT.form[1] - 14 + i * 2, AT.form[1] - 4 + i * 2)) * (1 - tw(f, N - 6, N - 1, EASE.ui));

  return (
    <AbsoluteFill>
      <ReelSky geo={geo} deep={deep} time={(345 + f) / 30} coast={s1Coast(75) * 0.9 * (1 - smoothstep(AT.look[0], AT.look[0] + 10, f))}>
        {labels.map((l, i) =>
          l.at ? (
            <div
              key={l.who}
              style={{
                position: "absolute",
                left: l.at.x + l.side.dx,
                top: l.at.y + l.side.dy,
                transform: `translate(${l.side.anchor * 100}%, ${(1 - labelIn(i)) * 10}px)`,
                opacity: labelIn(i),
                fontFamily: geistMono,
                fontSize: 32,
                letterSpacing: "0.04em",
                color: l.who === "mika" ? "#F0C88E" : "#F2EDE8",
                whiteSpace: "nowrap",
                textShadow: "0 2px 14px rgba(0,0,0,0.9)",
              }}
            >
              {l.text}
            </div>
          ) : null,
        )}
      </ReelSky>
      <div ref={ref}>
        <PhoneRig pose={pose(f)} time="12:52">
          {/* Scrolled to the applicants, as the screen would be to answer them. */}
          <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
            <div style={{ padding: "12px 12px 0", transform: "translateY(-178px)" }}>
              <ApplicantsCard platform="phone" state={beat.state} accepting={beat.accepting} />
            </div>
          </div>
        </PhoneRig>
      </div>
      <Caption copy={CAPTIONS.S5} tone="night" inAt={6} outAt={N} size={84} scrimEnd={600} />
    </AbsoluteFill>
  );
}
