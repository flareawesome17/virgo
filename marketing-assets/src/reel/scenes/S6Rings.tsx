import { useRef } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { WHEN } from "../../../../web/src/components/story/data/story";
import { RINGS } from "../../../../web/src/components/story/data/strings/ch4";
import { LOCK_WALLPAPER, LockNotification, LockScreen, lockDate, lockTime } from "../../../../web/src/components/story/frames";
import { Caption } from "../Caption";
import { CAPTIONS } from "../copy";
import { put, useDrive } from "../drive";
import { EASE, clamp01, lerp, span, tw } from "../motion";
import { PHONE_W, PhoneRig, type PhonePose } from "../PhoneRig";
import { ReelSky } from "../sky";
import { VIRGO_RECT, earthFor, mixRig, rig } from "../sky-frames";
import { length } from "../timeline";
import { s5Deep } from "./S5Connect";

const N = length("S6");
/** The notification lands, then two sound rings (≤ 2 cycles, storyboard Ch4), then the first light. */
const AT = { notify: 16, rings: [22, 40] as const, ringLife: 26, horizon: [44, N] as const } as const;

/** The lock screen's "5:00" and its date, from the reminder's instant. */
const TIME = lockTime(WHEN.reminder);
/** The notification's middle on the phone, CSS px from its top (the lock screen stacks it above an 18% foot). */
const NOTIFY_Y = 636;
const DATE = lockDate(WHEN.reminder);

function pose(f: number): PhonePose {
  const rise = tw(f, 0, 20, EASE.rise);
  // It sinks away as the light comes, so S7 opens on the horizon alone.
  const leave = tw(f, N - 14, N, EASE.camera);
  return {
    fx: PHONE_W / 2,
    fy: 430,
    x: 540,
    y: lerp(2400, 1150, rise) + 40 * tw(f, AT.horizon[0], N, EASE.inOut) + 900 * leave,
    scale: lerp(1.5, 1.62, tw(f, 0, N, EASE.inOut)),
    rx: lerp(26, 4, rise),
    ry: lerp(8, -2, rise) + 3 * tw(f, 20, N, EASE.inOut),
    opacity: clamp01(rise * 2.4) * (1 - leave),
    glow: 0.25 + 0.35 * Math.max(...AT.rings.map((r) => Math.sin(Math.PI * span(f, r, r + AT.ringLife)))),
  };
}

/**
 * S6 · Ch4 (frames 450–525). "5:00 AM. No signal. It rings anyway." The
 * phone rises into the night under Virgo: a generic lock screen, zero bars
 * and "No service", a large 5:00. A plain notification lands — Virgo · Leave
 * for the hotel — and two sound rings spread from it. Then a thin copper
 * horizon rises behind it: the first light on the page.
 */
export function S6Rings() {
  const f = useCurrentFrame();
  const ref = useRef<HTMLDivElement>(null);
  // The figure as S5 left it, the camera easing a little closer.
  const earth = earthFor(VIRGO_RECT);
  const deep = { ...s5Deep(length("S5")), camera: rig(mixRig(earth, { ...earth, distance: earth.distance * 0.96 }, tw(f, 0, N, EASE.inOut))) };
  const p = pose(f);

  useDrive(ref, ({ one }) => {
    const n = EASE.enter(span(f, AT.notify, AT.notify + 12));
    put(one("lock-notification"), { opacity: n, transform: `translateY(${((1 - n) * -26).toFixed(2)}px) scale(${lerp(0.94, 1, n).toFixed(4)})` });
  });

  // The rings spread from the notification, behind the phone, on the night.
  const notifyAt = { x: 540, y: p.y + (NOTIFY_Y - (p.fy ?? 0)) * p.scale };
  const horizon = EASE.camera(span(f, AT.horizon[0], AT.horizon[1]));

  return (
    <AbsoluteFill>
      <ReelSky geo={null} deep={deep} time={(450 + f) / 30} />
      <AbsoluteFill style={{ background: "#161311", opacity: 0.45 * tw(f, 0, 20, EASE.ui) }} />
      {/* The first light: the copper horizon (storyboard §1.4, "Pre-dawn band" #6B3E25), rising behind the phone. */}
      <AbsoluteFill
        style={{
          opacity: horizon,
          transform: `translateY(${((1 - horizon) * 520).toFixed(1)}px)`,
          background: "linear-gradient(to top, #8A4E2C 0%, #6B3E25 16%, rgba(107,62,37,0.55) 30%, rgba(107,62,37,0.18) 44%, rgba(107,62,37,0) 58%)",
        }}
      />
      {AT.rings.map((r) => {
        const t = span(f, r, r + AT.ringLife);
        if (t <= 0 || t >= 1) return null;
        const e = EASE.ui(t);
        return (
          <div
            key={r}
            style={{
              position: "absolute",
              left: notifyAt.x,
              top: notifyAt.y,
              width: 760,
              height: 760,
              marginLeft: -380,
              marginTop: -380,
              borderRadius: 999,
              border: "5px solid rgba(240,200,142,0.9)",
              boxShadow: "0 0 40px rgba(240,200,142,0.35), inset 0 0 40px rgba(240,200,142,0.2)",
              opacity: (1 - t) * Math.min(1, t * 6),
              transform: `scale(${lerp(0.55, 1.45, e).toFixed(4)})`,
            }}
          />
        );
      })}
      <div ref={ref}>
        <PhoneRig pose={p} time={TIME} signal={0} screen={LOCK_WALLPAPER}>
          <LockScreen time={TIME} date={DATE}>
            <LockNotification title={RINGS.title} body={RINGS.body} />
          </LockScreen>
        </PhoneRig>
      </div>
      <Caption copy={CAPTIONS.S6} tone="night" inAt={6} outAt={N} scrimEnd={520} />
    </AbsoluteFill>
  );
}

