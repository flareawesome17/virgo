import { useRef } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { ALBUM_TILES, TILE_SETS, uploadStamp, type Source } from "../../../../web/src/components/story/data/strings/ch5";
import { AlbumGrid } from "../../../../web/src/components/story/mocks/album-grid";
import { AlbumHeader } from "../../../../web/src/components/story/mocks/album-header";
import { DeviceChip, type DeviceChipState } from "../../../../web/src/components/story/mocks/device-chip";
import { litePlateStyle } from "../../../../web/src/components/story/mocks/plate";
import { SectionChips } from "../../../../web/src/components/story/mocks/section-chips";
import { Viewfinder } from "../../../../web/src/components/story/mocks/viewfinder";
import { geist, geistMono } from "../../brand/fonts";
import { Caption } from "../Caption";
import { CAPTIONS, S7_SLATES, SATURDAY_WORD } from "../copy";
import { put, useDrive } from "../drive";
import { EASE, clamp01, lerp, pulse, span, tw } from "../motion";
import { PHONE_W, PhoneRig, Rig, type PhonePose } from "../PhoneRig";
import { ReelSky } from "../sky";
import { VIRGO_RECT, earthFor, mixRig, rig } from "../sky-frames";
import { length } from "../timeline";
import { s5Deep } from "./S5Connect";

const N = length("S7");

/** The beats: the light changes, "Saturday." lands with the sun, the crew's devices send, the album sorts, and the camera reads its count. */
const AT = {
  light: [0, 24],
  word: [8, 22],
  bloom: [17, 27],
  wordOut: [30, 40],
  sunDown: [32, 48],
  chips: [30, 42],
  phone: [30, 46],
  threads: [42, 54],
  fly: 46,
  sort: [78, 90],
  read: [86, 104],
} as const;

/** The nine tiles the phone's grid draws, in the order they arrived (Kenn's film first, then Ernie's card, then Mika's). */
const TILES = TILE_SETS[9].map((i) => ALBUM_TILES[i]);
const ARRIVAL = [...TILES].sort((a, b) => Date.parse(a.uploadedAt) - Date.parse(b.uploadedAt));
const FLIGHT = 15;
const STAGGER = 3;
const landAt = (i: number) => AT.fly + i * STAGGER + FLIGHT;

/** The three devices, fanned above the album: where each sits on the frame. */
const CHIPS: Record<Source, { x: number; y: number; port: "bottom" }> = {
  mika: { x: 252, y: 672, port: "bottom" },
  kenn: { x: 540, y: 584, port: "bottom" },
  ernie: { x: 828, y: 672, port: "bottom" },
};
const CHIP_SCALE = 1.72;

/** The display word's line (§1.6 display-xxl: weight 600, 0.86 leading, −0.05em). */
const WORD = {
  position: "absolute",
  left: 80,
  top: 700,
  fontFamily: geist,
  fontWeight: 600,
  fontSize: 206,
  lineHeight: 0.86,
  letterSpacing: "-0.05em",
  color: "#1E1B18",
  whiteSpace: "nowrap",
} as const;

/** The album phone: it rises under the devices, then the camera moves in on its header to read the count. */
function pose(f: number): PhonePose {
  const rise = tw(f, AT.phone[0], AT.phone[1], EASE.rise);
  const read = tw(f, AT.read[0], AT.read[1], EASE.camera);
  return {
    fx: PHONE_W / 2,
    fy: lerp(420, 150, read),
    x: 540,
    y: lerp(lerp(2500, 1478, rise), 900, read),
    scale: lerp(1.52, 2.5, read),
    rx: lerp(18, 5, rise) - 5 * read,
    ry: lerp(-6, -2, rise) + 2 * read,
    opacity: clamp01(rise * 2.5) * (1 - tw(f, N - 7, N - 1, EASE.ui)),
  };
}

const chipState = (f: number, who: Source): DeviceChipState => {
  const mine = ARRIVAL.map((t, i) => ({ t, i })).filter(({ t }) => t.who === who);
  const first = AT.fly + mine[0].i * STAGGER;
  const last = landAt(mine[mine.length - 1].i);
  return f < first ? "idle" : f < last ? "sending" : "sent";
};

/** A point along a quadratic curve. */
const quad = (a: { x: number; y: number }, c: { x: number; y: number }, b: { x: number; y: number }, t: number) => ({
  x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c.x + t * t * b.x,
  y: (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * c.y + t * t * b.y,
});

/**
 * S7 · Ch5 (frames 525–630). The page's one change of light: the night
 * lifts, the copper horizon becomes the day, and "Saturday." lands with the
 * sun as its full stop, in a camera's framing, with one soft bloom. Then
 * that night: three gold threads run from Mika's camera, Ernie's camera and
 * Kenn's laptop to one album, and the frames fly along them stamped with
 * when they were uploaded. In the album they fall into the order they were
 * taken, and the camera moves in to read it: 412 photos · 1 film.
 */
export function S7Saturday() {
  const f = useCurrentFrame();
  const scene = useRef<HTMLDivElement>(null);
  const phone = useRef<HTMLDivElement>(null);
  const chipRefs = useRef<Partial<Record<Source, HTMLDivElement | null>>>({});
  const fly = useRef<(HTMLDivElement | null)[]>([]);
  const glows = useRef<Partial<Record<Source, SVGPathElement | null>>>({});
  const cores = useRef<Partial<Record<Source, SVGPathElement | null>>>({});
  const sorted = f >= AT.sort[0];

  useDrive(phone, ({ one, all }) => {
    const origin = scene.current?.getBoundingClientRect();
    if (!origin) return;
    const at = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2 - origin.left, y: r.top + r.height / 2 - origin.top, w: r.width, h: r.height };
    };
    const grid = one("grid");
    const gridTop = grid ? at(grid) : { x: 540, y: 1200, w: 600, h: 600 };
    const entry = { x: gridTop.x, y: gridTop.y - gridTop.h / 2 + 30 };
    // The threads: from each device's port, arcing up and down into the album.
    (Object.keys(CHIPS) as Source[]).forEach((who) => {
      const port = chipRefs.current[who]?.querySelector('[data-part="device-port"]');
      if (!port) return;
      const p = at(port);
      const c = { x: (p.x + entry.x) / 2 + (p.x - entry.x) * 0.25, y: Math.min(p.y, entry.y) - 40 };
      const draw = EASE.ui(span(f, AT.threads[0] + (who === "kenn" ? 0 : who === "ernie" ? 2 : 4), AT.threads[1]));
      const fade = 1 - tw(f, AT.sort[0], AT.read[0] + 4, EASE.ui);
      for (const path of [glows.current[who], cores.current[who]]) {
        if (!path) continue;
        path.setAttribute("d", `M ${p.x.toFixed(1)} ${p.y.toFixed(1)} Q ${c.x.toFixed(1)} ${c.y.toFixed(1)} ${entry.x.toFixed(1)} ${entry.y.toFixed(1)}`);
        path.style.strokeDashoffset = String(1 - draw);
        path.style.opacity = String(fade * (draw > 0 ? 1 : 0));
      }
    });
    // Each frame flies from its device to its cell, and the cell takes it over as it lands.
    const cells = all("tile");
    ARRIVAL.forEach((tile, i) => {
      const el = fly.current[i];
      const cell = cells.find((c) => c.getAttribute("data-index") === String(tile.index));
      const port = chipRefs.current[tile.who]?.querySelector('[data-part="device-port"]');
      if (!el || !cell || !port) return;
      const start = AT.fly + i * STAGGER;
      const t = span(f, start, start + FLIGHT);
      const a = at(port);
      const b = at(cell);
      const e = EASE.camera(t);
      const p = quad(a, { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - 160 }, b, e);
      const lift = Math.sin(Math.PI * e);
      const size = lerp(54, b.w, e) * (1 + 0.35 * lift);
      put(el, {
        opacity: t <= 0 || t >= 1 ? 0 : Math.min(1, t * 6),
        transform: `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -50%) rotate(${((1 - e) * (i % 2 ? 9 : -9)).toFixed(2)}deg) scale(${(size / 120).toFixed(4)})`,
      });
      put(cell, { opacity: f >= start + FLIGHT - 1 ? 1 : 0 });
    });
    // The sort: the cells slide from where they arrived to where they were taken.
    const k = EASE.camera(span(f, AT.sort[0], AT.sort[1]));
    for (const c of cells) {
      const arrive = Number(c.style.getPropertyValue("--arrive"));
      const capture = Number(c.style.getPropertyValue("--capture"));
      const from = sorted ? arrive : capture;
      const to = sorted ? capture : arrive;
      const dx = ((from % 3) - (to % 3)) * 126 * (1 - k);
      const dy = (Math.floor(from / 3) - Math.floor(to / 3)) * 126 * (1 - k);
      put(c, { transform: sorted && k < 1 ? `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px)` : null });
    }
    // The count, once the album has sorted: a small lift so the eye finds it.
    put(one("album-counts"), { transform: `scale(${(1 + 0.14 * pulse(f, AT.read[0] + 4, AT.read[1])).toFixed(4)})`, "transform-origin": "0% 50%" });
  });

  // The light: night → the copper band → gold.
  const gold = EASE.inOut(span(f, AT.light[0] + 4, AT.light[1]));
  const night = 1 - EASE.inOut(span(f, AT.light[0], AT.light[1] - 6));
  const earth = earthFor(VIRGO_RECT);
  const deep = { ...s5Deep(length("S5")), camera: rig(mixRig(earth, { ...earth, distance: earth.distance * 0.96 }, 1)) };
  const word = EASE.enter(span(f, AT.word[0], AT.word[1]));
  const wordOut = EASE.exit(span(f, AT.wordOut[0], AT.wordOut[1]));
  const sunRise = EASE.enter(span(f, AT.word[0] - 4, AT.word[1] + 2));
  const sunDown = EASE.camera(span(f, AT.sunDown[0], AT.sunDown[1]));
  const slate = f < AT.wordOut[0] ? S7_SLATES[0] : f < AT.threads[0] ? S7_SLATES[1] : S7_SLATES[2];

  return (
    <AbsoluteFill ref={scene}>
      {night > 0.001 ? (
        <AbsoluteFill style={{ opacity: night }}>
          <ReelSky geo={null} deep={deep} time={(525 + f) / 30} />
          <AbsoluteFill style={{ background: "linear-gradient(to top, #8A4E2C 0%, #6B3E25 16%, rgba(107,62,37,0.55) 30%, rgba(107,62,37,0.18) 44%, rgba(107,62,37,0) 58%)" }} />
        </AbsoluteFill>
      ) : null}
      {/* Golden hour (storyboard §1.4): #F7E7CF → #F0C88E → #E8A86E → #D98A55. */}
      <AbsoluteFill style={{ opacity: gold, background: "linear-gradient(to bottom, #F7E7CF 0%, #F0C88E 42%, #E8A86E 76%, #D98A55 100%)" }} />
      {/* The sun: Mika's star become the low sun, the full stop of "Saturday."; after 5:05 PM it sinks. It sits in a twin of the word's line, so it lands exactly where the stop goes. */}
      <div style={{ ...WORD, opacity: gold, color: "transparent" }}>
        {SATURDAY_WORD}
        <span
          style={{
            display: "inline-block",
            width: "0.34em",
            height: "0.34em",
            marginLeft: "0.06em",
            borderRadius: 999,
            background: "radial-gradient(circle, #FFF8EE 0%, #FFE7C2 58%, #FFE0B0 70%, rgba(255,231,194,0) 72%)",
            boxShadow: "0 0 120px 50px rgba(255,231,194,0.55), 0 0 280px 120px rgba(240,200,142,0.32)",
            transform: `translateY(${((1 - sunRise) * 700 + sunDown * 1300).toFixed(1)}px)`,
          }}
        />
      </div>
      {/* "Saturday." — the page's aria-hidden display word. Ink on gold. */}
      <div style={{ ...WORD, opacity: word * (1 - wordOut), transform: `translateY(${((1 - word) * 60 - wordOut * 80).toFixed(1)}px)` }}>{SATURDAY_WORD}</div>
      <Rig pose={{ x: 540, y: 960, scale: 2.4, opacity: tw(f, AT.word[0] + 2, AT.word[1] + 4) * (1 - tw(f, AT.wordOut[0] + 2, AT.wordOut[1] + 2)) }} w={410} h={470}>
        <Viewfinder state="readout" tone="gold" />
      </Rig>
      {/* One soft bloom (≤ 0.25, never white-out). */}
      <AbsoluteFill style={{ opacity: 0.22 * pulse(f, AT.bloom[0], AT.bloom[1]), background: "radial-gradient(70% 50% at 78% 46%, #FFF8EC 0%, rgba(255,248,236,0.4) 45%, rgba(255,248,236,0) 100%)" }} />

      {/* The three gold threads: a soft glow under a bright core, drawn from each device to the album. */}
      <svg width={1080} height={1920} style={{ position: "absolute", inset: 0 }} aria-hidden>
        <defs>
          <filter id="s7-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
        </defs>
        {(Object.keys(CHIPS) as Source[]).map((who) => (
          <g key={who}>
            <path ref={(el) => void (glows.current[who] = el)} d="M 0 0" fill="none" stroke="#FFF3DE" strokeWidth={14} strokeLinecap="round" pathLength={1} strokeDasharray="1 1" filter="url(#s7-glow)" style={{ opacity: 0 }} />
            <path ref={(el) => void (cores.current[who] = el)} d="M 0 0" fill="none" stroke="#FFFBF2" strokeWidth={3.5} strokeLinecap="round" pathLength={1} strokeDasharray="1 1" style={{ opacity: 0 }} />
          </g>
        ))}
      </svg>

      {(Object.keys(CHIPS) as Source[]).map((who, i) => {
        const c = CHIPS[who];
        const inn = EASE.enter(span(f, AT.chips[0] + i * 3, AT.chips[1] + i * 3));
        const out = tw(f, AT.read[0], AT.read[0] + 8, EASE.ui);
        return (
          <Rig key={who} pose={{ x: c.x, y: c.y - (1 - inn) * 80, scale: CHIP_SCALE, opacity: inn * (1 - out) }} w={230} h={52}>
            <div ref={(el) => void (chipRefs.current[who] = el)} style={{ display: "flex", justifyContent: "center" }}>
              <DeviceChip who={who} state={chipState(f, who)} port={c.port} />
            </div>
          </Rig>
        );
      })}

      <div ref={phone}>
        <PhoneRig pose={pose(f)} time="11:55">
          <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
            <AlbumHeader platform="phone" state="draft" />
            <SectionChips platform="phone" state="none" />
            <AlbumGrid platform="phone" count={9} state={sorted ? "sorted" : "arriving"} />
          </div>
        </PhoneRig>
      </div>

      {ARRIVAL.map((tile, i) => (
        <div
          key={tile.index}
          ref={(el) => void (fly.current[i] = el)}
          style={{ position: "absolute", left: 0, top: 0, width: 120, height: 120, opacity: 0, borderRadius: 6, boxShadow: "0 18px 40px -16px rgba(60,30,10,0.6)", ...litePlateStyle(tile.seed) }}
        >
          <span
            style={{
              position: "absolute",
              left: "50%",
              top: "100%",
              marginTop: 8,
              transform: "translateX(-50%)",
              whiteSpace: "nowrap",
              fontFamily: geistMono,
              fontSize: 32,
              lineHeight: 1,
              color: "#F2EDE8",
              background: "rgba(22,19,17,0.86)",
              borderRadius: 8,
              padding: "6px 10px",
            }}
          >
            {uploadStamp(tile.uploadedAt)}
          </span>
        </div>
      ))}

      {/* The caption arrives with the light: set in night ink, it turns to gold ink as the ground turns gold. */}
      <AbsoluteFill style={{ opacity: 1 - gold }}>
        <Caption copy={CAPTIONS.S7} tone="night" scrim={false} inAt={4} outAt={N} slate={slate} />
      </AbsoluteFill>
      <AbsoluteFill style={{ opacity: gold }}>
        <Caption copy={CAPTIONS.S7} tone="gold" scrim={false} inAt={4} outAt={N} slate={slate} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
