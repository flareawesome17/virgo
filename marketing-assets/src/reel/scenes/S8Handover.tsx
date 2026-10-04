import { useRef } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { ALBUM } from "../../../../web/src/components/story/data/story";
import { ClientGalleryPage, type ClientGalleryState } from "../../../../web/src/components/story/mocks/client-gallery";
import { geistMono } from "../../brand/fonts";
import { Caption } from "../Caption";
import { CAPTIONS } from "../copy";
import { put, typed, useDrive } from "../drive";
import { EASE, clamp01, lerp, press, pulse, span, tw } from "../motion";
import { PHONE_W, PhoneRig, type PhonePose } from "../PhoneRig";



/** The beats: the link is written, flies into the couple's phone, the page opens, sharpens, they heart, send. */
const AT = {
  paper: [0, 12],
  link: [3, 15],
  fly: [22, 36],
  phone: [18, 36],
  sharp: [38, 46],
  scroll: [44, 54],
  hearts: [48, 60],
  picked: 60,
  press: 66,
  sent: 70,
  push: [64, 86],
} as const;

/** Paper (#FBF7F2, the client page's own ground): the page's day tone (§1.4). */
export const PAPER = "#FBF7F2";

/** The tiles a phone screen holds, and the picked ones among them (the page's first ten; four of the twelve picks are here). */
const TILES = 10;

function stateAt(f: number): ClientGalleryState {
  return f >= AT.sent ? "sent" : f >= AT.picked ? "picked" : f >= AT.sharp[0] ? "opened" : "previews";
}

/** The couple's phone: it rises turning to face you as the link lands; at the end the camera moves in on the picks bar. */
export function s8Pose(f: number): PhonePose {
  const rise = tw(f, AT.phone[0], AT.phone[1], EASE.rise);
  const push = tw(f, AT.push[0], AT.push[1], EASE.camera);
  return {
    fx: PHONE_W / 2,
    fy: lerp(414, 770, push),
    x: 540,
    y: lerp(lerp(2500, 1186, rise), 1240, push),
    scale: lerp(1.8, 2.6, push),
    rx: lerp(14, 3, rise) - 3 * push,
    ry: lerp(17, 0, rise),
    opacity: clamp01(rise * 3),
  };
}

/**
 * S8 · Ch6 (frames 630–720). "One link. No account." The day turns to
 * paper; the album becomes one line of mono type, client.virgo.ph/s/a4f2…,
 * which flies into the address bar of the couple's phone as it turns to face
 * you. The client page opens on its own palette, its blurred previews
 * sharpen, they scroll and heart the ones they love, the picks bar rises —
 * "12 picked · Send to photographer" — and Send presses, becoming "Send
 * again". No sign-in anywhere: the real page has none. The screen-reader
 * sentence the page announces after sending is never drawn.
 */
export function S8Handover() {
  const f = useCurrentFrame();
  const scene = useRef<HTMLDivElement>(null);
  const phone = useRef<HTMLDivElement>(null);
  const link = useRef<HTMLDivElement>(null);
  const state = stateAt(f);

  useDrive(phone, ({ one, all }) => {
    // The previews sharpen (an opacity crossfade, as on the page).
    const sharp = EASE.ui(span(f, AT.sharp[0], AT.sharp[1]));
    for (const el of all("tile-sharp")) put(el, { opacity: f < AT.sharp[0] ? 0 : sharp });
    // They scroll from the hero to the photos.
    put(one("client-scroll"), { transform: `translateY(${(-318 * EASE.camera(span(f, AT.scroll[0], AT.scroll[1]))).toFixed(2)}px)` });
    // Hearts fill one by one on the picked tiles in view, each with a press.
    const picked = all("tile").filter((t) => [1, 3, 6, 8].includes(Number(t.getAttribute("data-index"))));
    picked.forEach((t, i) => {
      const at = AT.hearts[0] + i * 3;
      const heart = t.querySelector<HTMLElement>('[data-part="heart"]');
      if (f >= at) {
        t.setAttribute("data-picked", "");
        heart?.setAttribute("data-on", "");
      } else if (f < AT.picked) {
        t.removeAttribute("data-picked");
        heart?.removeAttribute("data-on");
      }
      put(heart, { transform: `scale(${press(f, at - 1, 7, 0.8).toFixed(4)})` });
    });
    // The picks bar rises; Send presses.
    const bar = EASE.enter(span(f, AT.picked - 2, AT.picked + 8));
    put(one("picks-bar"), { opacity: f < AT.picked - 2 ? 0 : bar, transform: `translateY(${((1 - bar) * 40).toFixed(2)}px)` });
    put(one("send"), { transform: `scale(${press(f, AT.press, 8, 0.94).toFixed(4)})`, display: "inline-flex" });

    // The link flies into the address bar.
    const bar0 = one("browser-bar");
    const origin = scene.current?.getBoundingClientRect();
    if (bar0 && origin && link.current) {
      const r = bar0.getBoundingClientRect();
      const to = { x: r.left + r.width / 2 - origin.left, y: r.top + r.height / 2 - origin.top };
      const t = EASE.camera(span(f, AT.fly[0], AT.fly[1]));
      const x = lerp(540, to.x, t);
      const y = lerp(900, to.y, t) - Math.sin(Math.PI * t) * 60;
      const typedIn = EASE.ui(span(f, AT.link[0], AT.link[1]));
      put(link.current, {
        opacity: t >= 1 ? 0 : 1 - tw(f, AT.fly[1] - 4, AT.fly[1], EASE.ui),
        transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${lerp(1, 0.36, t).toFixed(4)})`,
        "clip-path": typed(typedIn),
      });
    }
  });

  const paper = EASE.inOut(span(f, AT.paper[0], AT.paper[1]));
  const streak = pulse(f, AT.link[1] - 2, AT.fly[1]);

  return (
    <AbsoluteFill ref={scene}>
      <AbsoluteFill style={{ background: "linear-gradient(to bottom, #F7E7CF 0%, #F0C88E 42%, #E8A86E 76%, #D98A55 100%)" }} />
      <AbsoluteFill style={{ background: PAPER, opacity: paper }} />
      <div ref={phone}>
        <PhoneRig pose={s8Pose(f)} time="4:50" tone="dark" screen="#F1EAE3" shadow="drop">
          <ClientGalleryPage state={state} browserBar tiles={TILES} className="absolute inset-0" />
        </PhoneRig>
      </div>
      {/* The album, folded into its link: one line of mono type, then a streak of light into the phone. */}
      <div
        ref={link}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          whiteSpace: "nowrap",
          fontFamily: geistMono,
          fontSize: 62,
          fontWeight: 500,
          letterSpacing: "-0.01em",
          color: "#1E1B18",
          padding: "18px 34px",
          borderRadius: 999,
          background: "rgba(255,255,255,0.72)",
          boxShadow: `0 0 0 2px rgba(168,93,53,0.35), 0 24px 60px -24px rgba(122,62,30,0.55), 0 0 ${Math.round(80 * streak)}px ${Math.round(24 * streak)}px rgba(240,200,142,${(0.55 * streak).toFixed(3)})`,
          opacity: 0,
        }}
      >
        {ALBUM.linkPath}
      </div>
      <Caption copy={CAPTIONS.S8} tone="paper" scrim={false} inAt={6} outAt={AT.push[0] + 12} />
    </AbsoluteFill>
  );
}
