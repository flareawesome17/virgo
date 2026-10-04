import { useRef } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { LOCK_WALLPAPER } from "../../../../web/src/components/story/frames";
import { CHAT_PILE, ChatCardStack, chatStackClock, type ChatStackCount } from "../../../../web/src/components/story/mocks/chat-card-stack";
import { Caption } from "../Caption";
import { CAPTIONS } from "../copy";
import { put, useDrive } from "../drive";
import { EASE, clamp01, glide, lerp, pulse, span, tw } from "../motion";
import { PHONE_W, PhoneRig, type PhonePose } from "../PhoneRig";
import { ReelSky, geoToFrame } from "../sky";
import { LANDED, MIKA, rig } from "../sky-frames";
import { length } from "../timeline";
import { s1Coast, s1Geo } from "./S1Sky";

const N = length("S2");
/** The phones' deck (5 cards), landing faster and faster: the gaps tighten 24 → 11 → 9 frames after "Seen by 14" has had its moment. */
const LAND = [6, 20, 44, 55, 64] as const;
/** How long a card takes to land. */
const FLIGHT = 11;
/** The freeze: the #161311 overlay settles to 60% (storyboard Ch1 0.50–0.58). */
const FREEZE = [74, 86] as const;

/** Where the pile's middle is on the phone, CSS px (the lock screen's notifications sit in its lower half). */
const PILE_FOCUS = { fx: PHONE_W / 2, fy: 548 };
/** Mika's star on S1's last frame, where the phone comes from. */
const STAR = geoToFrame(s1Geo(75), MIKA) ?? { x: 540, y: 1000 };

/** The phone's pose at local frame f. S3 starts from `s2Pose(N)`. */
export function s2Pose(f: number): PhonePose {
  const rise = EASE.rise(span(f, 0, 20));
  const from = STAR;
  return {
    ...PILE_FOCUS,
    x: lerp(from.x, 540, rise),
    y: lerp(from.y, glide(f, [[0, 1290], [18, 1290], [72, 1250]]), rise),
    scale: lerp(0.16, 1, rise) * glide(f, [[0, 1.72], [18, 1.72], [72, 2.0]]),
    rx: lerp(28, 7, rise) - 3 * tw(f, 18, 72, EASE.inOut),
    ry: lerp(-18, -9, rise) + 5 * tw(f, 18, 72, EASE.inOut),
    rz: lerp(-4, 0, rise),
    opacity: clamp01(rise * 2.2),
    glow: lerp(1, 0.4, rise),
  };
}

/** How far each card has landed (0..1) at frame f. */
const landed = (f: number) => LAND.map((at) => EASE.enter(span(f, at, at + FLIGHT)));

/** A continuous version of the pile's rest pose (chatCardPose) for a depth k ≥ 0, and the entry pose blended in by p. */
function pose(k: number, p: number) {
  const i = Math.min(Math.floor(k), CHAT_PILE.twist.length - 2);
  const u = k - i;
  const nudge = lerp(CHAT_PILE.nudge[i], CHAT_PILE.nudge[i + 1], u);
  const twist = lerp(CHAT_PILE.twist[i], CHAT_PILE.twist[i + 1], u);
  const x = lerp(0, nudge, p);
  const y = lerp(56, -k * CHAT_PILE.peek, p);
  const z = lerp(80, -k * CHAT_PILE.depth, p);
  const r = lerp(0, twist, p);
  return {
    transform: `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, ${z.toFixed(2)}px) rotate(${r.toFixed(3)}deg)`,
    opacity: clamp01(p * 1.8),
    fog: Math.min(CHAT_PILE.fogMax, k * CHAT_PILE.fog),
  };
}

/**
 * S2 · Ch1 (frames 75–165). Mika's star glow becomes a lit phone screen: a
 * phone rises out of it and turns toward you. On its lock screen the
 * unbranded chats pile up, each card landing a step in front and pushing the
 * rest back in depth, the clock running 11:44 → 11:57 and the unread count
 * climbing; "Seen by 14" gets its moment, the rest come faster. Then
 * everything stops under the freeze. The mock is Ch1's own ChatCardStack
 * (the phones' 5-card deck), moved part by part.
 */
export function S2Chats() {
  const f = useCurrentFrame();
  const ref = useRef<HTMLDivElement>(null);
  const p = landed(f);
  const count = p.filter((x) => x >= 0.5).length as ChatStackCount;
  const clock = chatStackClock(count, 5);
  const dim = tw(f, 0, 20, EASE.ui);

  useDrive(ref, ({ one }) => {
    p.forEach((pi, i) => {
      // Depth = how many cards have landed in front of this one.
      const k = p.slice(i + 1).reduce((s, x) => s + x, 0);
      const ps = pose(k, pi);
      put(one(`chat-card-${i + 1}`), { transform: ps.transform, opacity: ps.opacity });
      put(one(`chat-card-${i + 1}-fog`), { opacity: ps.fog });
    });
    // The notification card's unread count climbs as it lands: 12 earlier in the night, 38 now.
    const unread = one("chat-card-3-unread");
    if (unread) unread.textContent = String(Math.round(lerp(12, 38, EASE.ui(span(f, LAND[2], LAND[2] + 12)))));
    put(one("freeze"), { opacity: 0.6 * tw(f, FREEZE[0], FREEZE[1], EASE.ui) });
  });

  const sky = s1Geo(75);
  const drift = { ...sky, camera: rig({ ...LANDED, distance: lerp(17, 15.6, f / N), heading: lerp(22, 25, f / N) }) };
  return (
    <AbsoluteFill>
      <ReelSky geo={drift} time={(75 + f) / 30} coast={s1Coast(75)} />
      <AbsoluteFill style={{ background: "#161311", opacity: 0.62 * dim }} />
      {/* Her star's glow blooms and the phone comes out of it (storyboard §1.8: the glow becomes the lit screen). */}
      <div
        style={{
          position: "absolute",
          left: STAR.x,
          top: STAR.y,
          width: 900,
          height: 900,
          marginLeft: -450,
          marginTop: -450,
          borderRadius: 999,
          opacity: pulse(f, -6, 22),
          transform: `scale(${(0.2 + 0.8 * EASE.rise(span(f, 0, 16))).toFixed(4)})`,
          background: "radial-gradient(closest-side, rgba(255,240,214,0.85) 0%, rgba(240,200,142,0.45) 18%, rgba(240,200,142,0.12) 50%, rgba(240,200,142,0) 100%)",
        }}
      />
      <div ref={ref}>
        <PhoneRig pose={s2Pose(f)} time={clock} screen={LOCK_WALLPAPER}>
          <ChatCardStack state={count} cards={5} />
        </PhoneRig>
      </div>
      <Caption copy={CAPTIONS.S2} tone="night" inAt={10} outAt={N} />
    </AbsoluteFill>
  );
}

