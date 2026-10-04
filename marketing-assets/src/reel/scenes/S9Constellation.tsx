import { useLayoutEffect, useRef } from "react";
import { AbsoluteFill, Img, useCurrentFrame } from "remotion";
import { ClientGalleryPage } from "../../../../web/src/components/story/mocks/client-gallery";
import { geist, geistMono } from "../../brand/fonts";
import { STARS, mulberry32 } from "../../site";
import { Caption } from "../Caption";
import { CAPTIONS, END_CARD, typeset } from "../copy";
import { put, useDrive } from "../drive";
import { EASE, clamp01, pulse, span, tw } from "../motion";
import { PhoneRig } from "../PhoneRig";
import { ReelSky, deepToFrame } from "../sky";
import { END_RECT, earthFor, mixRig, virgo } from "../sky-frames";
import { logo } from "../Stage";
import { S9_DISSOLVE, TYPE, length } from "../timeline";
import { PAPER, s8Pose } from "./S8Handover";

const N = length("S9");
const D = S9_DISSOLVE;

/** The end card's beats (local frames): the sky comes up, the logo and the line, Syrma ignites and pulses twice, then the hold. */
const AT = {
  night: [0, 12],
  dissolve: [4, D],
  sky: [D - 8, D + 10],
  brand: [D + 4, D + 16],
  line: D + 6,
  support: D + 16,
  ignite: [D + 18, D + 46],
  pulses: [D + 46, D + 82],
} as const;

const SYRMA = STARS.find((s) => s.id === "iota")!;

/** Particles per tile, seeded so every render draws the same dust. */
const PER_TILE = 14;

/**
 * S9 · Ch7 + Finale (frames 720–840). Day 91: the paper goes to night and the
 * delivered files dissolve — each tile on the couple's page breaks into
 * points of light that rise into the sky (30 frames). Then the end card,
 * held 3 s: Virgo as Ch3 left it, Syrma an unlit socket, until a new star
 * ignites there, completing the figure, with the logo, "Every shoot is a
 * constellation." and "virgo.ph · Free to start, 15 GB". It ends on night
 * sky and a star, as S1 opens, so a replay reads as the story starting again.
 */
export function S9Constellation() {
  const f = useCurrentFrame();
  const scene = useRef<HTMLDivElement>(null);
  const phone = useRef<HTMLDivElement>(null);
  const dust = useRef<HTMLCanvasElement>(null);
  const earth = earthFor(END_RECT, 0.05);
  const dolly = tw(f, D, N, EASE.inOut);
  const deep = virgo({
    camera: mixRig(earth, { ...earth, distance: earth.distance * 0.965 }, dolly),
    opacity: tw(f, AT.sky[0], AT.sky[1], EASE.ui),
    stars: tw(f, AT.sky[0] + 2, AT.sky[1] + 2, EASE.ui),
    form: 1,
    syrma: EASE.inOut(span(f, AT.ignite[0], AT.ignite[1])),
    cast: 0.55,
    crew: 0,
    field: tw(f, AT.sky[0], AT.sky[1], EASE.ui),
  });
  const night = EASE.inOut(span(f, AT.night[0], AT.night[1]));

  // The tiles go first, staggered, as their dust rises.
  useDrive(phone, ({ one, all }) => {
    // The page as S8 left it: scrolled to the photos.
    put(one("client-scroll"), { transform: "translateY(-318px)" });
    all("tile").forEach((t, i) => put(t, { opacity: 1 - tw(f, AT.dissolve[0] + i * 1.4, AT.dissolve[0] + i * 1.4 + 9, EASE.ui) }));
  });

  // The dust: drawn from each tile's rect on the frame, rising, brightening, fading into the sky.
  useLayoutEffect(() => {
    const g = dust.current?.getContext("2d");
    const origin = scene.current?.getBoundingClientRect();
    if (!g || !origin) return;
    g.clearRect(0, 0, 1080, 1920);
    const tiles = phone.current ? [...phone.current.querySelectorAll<HTMLElement>('[data-part="tile"]')] : [];
    tiles.forEach((t, i) => {
      const r = t.getBoundingClientRect();
      if (r.width < 2) return;
      const rand = mulberry32(0x56495247 ^ (i * 7919));
      for (let k = 0; k < PER_TILE; k++) {
        const born = AT.dissolve[0] + i * 1.4 + rand() * 8;
        const life = 26 + rand() * 18;
        const t0 = span(f, born, born + life);
        if (t0 <= 0 || t0 >= 1) continue;
        const x0 = r.left - origin.left + rand() * r.width;
        const y0 = r.top - origin.top + rand() * r.height;
        const vx = (rand() - 0.5) * 220;
        const rise = 520 + rand() * 640;
        const e = EASE.enter(t0);
        const x = x0 + vx * e;
        const y = y0 - rise * e;
        const a = Math.sin(Math.PI * Math.min(1, t0 * 1.6)) * (1 - t0 * 0.6);
        const s = 2.2 + rand() * 3.4;
        const glow = g.createRadialGradient(x, y, 0, x, y, s * 5);
        const warm = rand() > 0.45;
        glow.addColorStop(0, warm ? `rgba(255,236,206,${a.toFixed(3)})` : `rgba(242,237,232,${a.toFixed(3)})`);
        glow.addColorStop(0.25, warm ? `rgba(240,200,142,${(a * 0.55).toFixed(3)})` : `rgba(220,214,208,${(a * 0.4).toFixed(3)})`);
        glow.addColorStop(1, "rgba(240,200,142,0)");
        g.fillStyle = glow;
        g.fillRect(x - s * 5, y - s * 5, s * 10, s * 10);
      }
    });
  });

  const syrmaAt = deepToFrame(deep, SYRMA.pos);
  const brand = EASE.enter(span(f, AT.brand[0], AT.brand[1]));
  const support = EASE.enter(span(f, AT.support, AT.support + 14));
  const glowPulse = pulse(f, AT.pulses[0], AT.pulses[0] + 18) + pulse(f, AT.pulses[0] + 18, AT.pulses[1]);
  const ignite = Math.sin(Math.PI * span(f, AT.ignite[0], AT.ignite[1]));
  const phoneOut = tw(f, AT.dissolve[0] + 10, D + 2, EASE.ui);

  return (
    <AbsoluteFill ref={scene}>
      <ReelSky geo={null} deep={deep} time={(720 + f) / 30} />
      {/* Day 91, 3:00 AM: the paper goes to night. */}
      <AbsoluteFill style={{ background: PAPER, opacity: 1 - night }} />
      {phoneOut < 1 ? (
        <div ref={phone} style={{ opacity: 1 - phoneOut }}>
          <PhoneRig pose={s8Pose(length("S8"))} time="3:00" tone="dark" screen="#F1EAE3">
            <ClientGalleryPage state="sent" browserBar tiles={10} className="absolute inset-0" />
          </PhoneRig>
        </div>
      ) : (
        <div ref={phone} />
      )}
      <canvas ref={dust} width={1080} height={1920} style={{ position: "absolute", inset: 0 }} />
      {/* Syrma: the new star, igniting, then two slow pulses, then still. */}
      {syrmaAt ? (
        <div
          style={{
            position: "absolute",
            left: syrmaAt.x,
            top: syrmaAt.y,
            width: 220,
            height: 220,
            marginLeft: -110,
            marginTop: -110,
            borderRadius: 999,
            opacity: clamp01(0.9 * ignite + 0.55 * glowPulse),
            transform: `scale(${(0.5 + 0.5 * EASE.enter(span(f, AT.ignite[0], AT.ignite[1])) + 0.18 * glowPulse).toFixed(4)})`,
            background: "radial-gradient(closest-side, rgba(255,246,228,0.95) 0%, rgba(255,231,194,0.6) 14%, rgba(240,200,142,0.22) 40%, rgba(240,200,142,0) 100%)",
          }}
        />
      ) : null}
      {/* The slate over the dissolve. */}
      <Caption copy={CAPTIONS.S9} tone="night" scrim={false} inAt={8} outAt={D + 2} />
      {/* The end card: the logo and wordmark, the line, the address and the offer. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 262,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 22,
          opacity: brand,
          transform: `translateY(${((1 - brand) * 24).toFixed(1)}px)`,
        }}
      >
        <Img src={logo} style={{ width: 120, height: 120 }} />
        <span style={{ fontFamily: geist, fontWeight: 600, fontSize: 76, letterSpacing: "-0.02em", color: "#F2EDE8" }}>{END_CARD.wordmark}</span>
      </div>
      <div style={{ position: "absolute", left: 80, right: 80, top: 1040, textAlign: "center" }}>
        <div style={{ fontFamily: geist, fontSize: 92, fontWeight: 700, lineHeight: 1.04, letterSpacing: "-0.032em", color: "#F2EDE8", textWrap: "balance" }}>
          {typeset(END_CARD.headline)
            .split(" ")
            .map((w, i, ws) => {
              const e = EASE.enter(span(f, AT.line + i * 2, AT.line + i * 2 + 16));
              const accent = i >= 3;
              return (
                <span key={`${w}-${i}`}>
                  <span style={{ display: "inline-block", opacity: e, transform: `translateY(${((1 - e) * 36).toFixed(1)}px)`, color: accent ? "#E8B189" : undefined }}>{w}</span>
                  {i < ws.length - 1 ? " " : null}
                </span>
              );
            })}
        </div>
        <div
          style={{
            marginTop: 34,
            fontFamily: geistMono,
            fontSize: TYPE.support,
            fontWeight: 500,
            letterSpacing: "0.02em",
            color: "#D18A5A",
            opacity: support,
            transform: `translateY(${((1 - support) * 16).toFixed(1)}px)`,
          }}
        >
          {END_CARD.support}
        </div>
      </div>
    </AbsoluteFill>
  );
}
