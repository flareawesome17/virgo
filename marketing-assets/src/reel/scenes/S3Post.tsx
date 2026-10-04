import { useRef } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { LOCK_WALLPAPER } from "../../../../web/src/components/story/frames";
import { ChatCardStack } from "../../../../web/src/components/story/mocks/chat-card-stack";
import { JOB_FORM_SCROLL, JobPostForm, type JobPostFormState } from "../../../../web/src/components/story/mocks/job-post-form";
import { Caption } from "../Caption";
import { CAPTIONS } from "../copy";
import { put, typed, useDrive } from "../drive";
import { EASE, glide, lerp, press, span, tw } from "../motion";
import { PHONE_W, PhoneRig, type PhonePose } from "../PhoneRig";
import { ReelSky, geoToFrame } from "../sky";
import { LANDED, MIKA, mixRig, rig } from "../sky-frames";
import { length } from "../timeline";
import { s1Coast, s1Geo } from "./S1Sky";
import { s2Pose } from "./S2Chats";
import { S4_START, s4Geo } from "./S4Nearby";

const N = length("S3");
/** Where S4 finds Mika's star on its first frame: the post's star flies there. */
const MIKA_AT = geoToFrame(s4Geo(0), MIKA) ?? { x: 540, y: 720 };

/** The beats, local frames: the wipe, the roles, the budgets, the brief, Post it, and the star leaving. */
const AT = { wipe: [2, 14], roles: 14, budgets: 32, brief: 48, press: 56, posted: 60, rise: [63, 88] } as const;
/** The roles Mika picks, in order, by part name. */
const PICKS = ["videographer", "sde-editor-video", "hmua"] as const;
const BUDGET_PARTS = PICKS.flatMap((r) => [`budget-${r}-min-value`, `budget-${r}-max-value`]);

const stateAt = (f: number): JobPostFormState =>
  f >= AT.posted ? "posted" : f >= AT.brief ? "brief" : f >= AT.budgets ? "budgets" : f >= AT.roles ? "roles" : "empty";

/** The form's scroll, 0 top … 1 bottom: from the title, down to the budgets, then to Post it. */
const scrollAt = (f: number) =>
  glide(f, [
    [AT.roles, JOB_FORM_SCROLL.empty],
    [AT.roles + 10, JOB_FORM_SCROLL.roles],
    [AT.budgets - 2, JOB_FORM_SCROLL.roles],
    [AT.budgets + 10, JOB_FORM_SCROLL.budgets],
    [AT.brief - 2, JOB_FORM_SCROLL.budgets],
    [AT.brief + 8, JOB_FORM_SCROLL.brief],
  ]);

/** The phone: from S2's last pose it eases flat to face you for the form, then drops back as the post leaves. */
export function s3Pose(f: number): PhonePose {
  const from = s2Pose(length("S2"));
  const settle = tw(f, 0, 18, EASE.camera);
  const leave = tw(f, AT.rise[0], AT.rise[1] - 2, EASE.camera);
  return {
    fx: lerp(from.fx ?? PHONE_W / 2, PHONE_W / 2, settle),
    fy: lerp(from.fy ?? 414, 414, settle),
    x: 540,
    y: lerp(from.y, 1162, settle) + 900 * leave,
    scale: lerp(from.scale, 2.0, settle) * (1 - 0.2 * leave),
    rx: lerp(from.rx ?? 0, 0, settle) + 18 * leave,
    ry: lerp(from.ry ?? 0, 0, settle) + 3 * Math.sin(Math.PI * span(f, 18, AT.press)) * (1 - leave),
    opacity: 1 - tw(f, AT.rise[0] + 6, AT.rise[1] - 4, EASE.ui),
    glow: 0.4 * (1 - leave),
  };
}

/** The sky behind: S2's drift, turning toward S4's radar framing as the post leaves. */
export function s3Sky(f: number) {
  const s2end = { ...LANDED, distance: 15.6, heading: 25 };
  const camera = rig(mixRig(s2end, S4_START, tw(f, AT.rise[0] - 4, N, EASE.camera)));
  return { ...s1Geo(75), camera };
}

/**
 * S3 · Ch1 (frames 165–255). "Or post the job once." The frozen pile wipes
 * away and the same phone turns flat to face you with the app's own "Post a
 * job" form, filling as it scrolls: the title, the three roles switching on
 * one by one, the date and the place, a budget for each role, the brief and
 * its counter. "Post it" presses, the page's "Posted · 11:58 PM" stamp lands,
 * and the post rises off the phone as a small star — the hand-off to Nearby.
 */
export function S3Post() {
  const f = useCurrentFrame();
  const ref = useRef<HTMLDivElement>(null);
  const star = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const state = stateAt(f);
  const wipe = tw(f, AT.wipe[0], AT.wipe[1], EASE.ui);

  useDrive(ref, ({ one }) => {
    // The scroll: job-scroll down by t of the viewport, job-column up by t of itself (the mock's own scheme).
    const t = scrollAt(f);
    put(one("job-scroll"), { transform: `translateY(${(t * 100).toFixed(3)}%)` });
    put(one("job-column"), { transform: `translateY(-${(t * 100).toFixed(3)}%)` });
    // The title and the place type in; the date crossfades.
    const title = tw(f, AT.roles, AT.roles + 12, EASE.ui);
    put(one("title-value"), { opacity: title > 0 ? 1 : 0, "clip-path": typed(title) });
    put(one("title-placeholder"), { opacity: title > 0 ? 0 : 1 });
    const place = tw(f, AT.roles + 12, AT.roles + 18, EASE.ui);
    put(one("where-value"), { opacity: place > 0 ? 1 : 0, "clip-path": typed(place) });
    put(one("where-placeholder"), { opacity: place > 0 ? 0 : 1 });
    put(one("date-value"), { opacity: tw(f, AT.roles + 8, AT.roles + 14) });
    put(one("date-empty"), { opacity: 1 - tw(f, AT.roles + 8, AT.roles + 14) });
    put(one("date-clear"), { opacity: tw(f, AT.roles + 8, AT.roles + 14) });
    // The roles switch on one at a time, each with a small press.
    PICKS.forEach((r, i) => {
      const at = AT.roles + 4 + i * 4;
      const chip = one(`role-${r}`);
      if (!chip) return;
      if (f >= at) chip.setAttribute("data-on", "");
      else chip.removeAttribute("data-on");
      put(chip, { transform: `scale(${press(f, at - 2, 8, 0.9).toFixed(4)})` });
    });
    // The budgets type in, row by row.
    BUDGET_PARTS.forEach((part, i) => {
      const at = AT.budgets + 4 + i * 2.2;
      const b = tw(f, at, at + 5, EASE.ui);
      put(one(part), { opacity: b > 0 ? 1 : 0, "clip-path": typed(b) });
      put(one(part.replace(/-value$/, "-placeholder")), { opacity: b > 0 ? 0 : 1 });
    });
    // The brief arrives line by line.
    const brief = tw(f, AT.brief, AT.brief + 9, EASE.ui);
    put(one("brief-value"), { opacity: brief > 0 ? 1 : 0, "clip-path": brief >= 1 ? "none" : `inset(0 0 ${((1 - brief) * 100).toFixed(2)}% 0)` });
    put(one("brief-placeholder"), { opacity: brief > 0 ? 0 : 1 });
    // Post it presses; the stamp lands.
    put(one("post-button"), { transform: `scale(${press(f, AT.press, 8, 0.97).toFixed(4)})` });
    const stamp = EASE.enter(span(f, AT.posted, AT.posted + 8));
    put(one("posted-stamp"), { opacity: stamp, transform: `scale(${lerp(1.6, 1, stamp).toFixed(4)})` });
    // The post leaves as a star, from the button up to where S4 finds Mika's star.
    const btn = one("post-button");
    const scene = sceneRef.current;
    if (btn && scene && star.current) {
      // Measured against the scene's origin, at 1:1 (while Remotion lays a frame out, the stage box itself reports no size).
      const k = 1;
      const b = btn.getBoundingClientRect();
      const s = scene.getBoundingClientRect();
      const bx = (b.left + b.width / 2 - s.left) * k;
      const by = (b.top + b.height / 2 - s.top) * k;
      const up = EASE.camera(span(f, AT.rise[0], AT.rise[1]));
      const x = lerp(bx, MIKA_AT.x, up) + Math.sin(Math.PI * up) * 90;
      const y = lerp(by, MIKA_AT.y, up);
      put(star.current, { opacity: tw(f, AT.posted + 1, AT.posted + 5) * (1 - 0.6 * tw(f, AT.rise[1] - 4, N)), transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${lerp(0.5, 0.9, up).toFixed(3)})` });
    }
  });

  return (
    <AbsoluteFill ref={sceneRef}>
      <ReelSky geo={s3Sky(f)} time={(165 + f) / 30} coast={s1Coast(75)} />
      <AbsoluteFill style={{ background: "#161311", opacity: 0.62 * (1 - tw(f, AT.rise[0], N, EASE.ui)) }} />
      <div ref={ref}>
        <PhoneRig pose={s3Pose(f)} time={f >= AT.posted ? "11:58" : "11:57"} screen={LOCK_WALLPAPER}>
          {/* The frozen pile, as S2 left it, until the form has risen over it. */}
          {wipe < 1 ? <ChatCardStack state="frozen" cards={5} /> : null}
          <div style={{ position: "absolute", inset: 0, zIndex: 50, background: "#161311", clipPath: wipe >= 1 ? "none" : `inset(${((1 - wipe) * 100).toFixed(2)}% 0 0 0)` }}>
            <JobPostForm state={state} />
          </div>
        </PhoneRig>
      </div>
      <div
        ref={star}
        aria-hidden
        style={{ position: "absolute", left: 0, top: 0, width: 260, height: 260, opacity: 0, zIndex: 5, background: "radial-gradient(closest-side, rgba(255,246,230,1) 0%, rgba(255,232,196,0.95) 7%, rgba(240,200,142,0.5) 16%, rgba(240,200,142,0.16) 40%, rgba(193,119,69,0) 100%)" }}
      />
      <Caption copy={CAPTIONS.S3} tone="night" inAt={6} outAt={N} scrimEnd={400} />
    </AbsoluteFill>
  );
}
