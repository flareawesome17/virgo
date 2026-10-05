'use client';

import { m, useMotionValueEvent, useTransform, type MotionValue } from 'framer-motion';
import { useRef, useSyncExternalStore, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { CH5 } from '../../data/strings/page-ch5';
import { camera, enter, lerp, r2, seg, window4 } from '../cinema/ease';
import { Flare, LightSweep, Particles, useCamera, useReveal } from '../cinema/fx';
import { Float } from '../cinema/float';
import { GEAR_ASPECT, GearArt, type GearKind } from '../cinema/gear';
import { Illustrative, Shot, Slate, Subtitles, type Line } from '../cinema/shot';
import { Viewfinder } from '../cinema/viewfinder';
import { useMotionGate } from '../motion';
import { AlbumCard, AlbumFrame, CH5_LENGTH, cellStyle, COLS, ROWS, SLOTS } from './ch5-album';

/**
 * Ch5 · Saturday, the film (docs/redesign/05-cinema.md §3 and the brief's
 * addendum). One shot, the page's emotional peak. The gold leak into it is
 * drawn centrally (cinema/cuts.tsx); the shot opens as a zoom in.
 *
 *   0.00–0.18  zoom in on golden hour: the sun rises, the world dollies in
 *   0.03–0.26  "Saturday." stands on the horizon; a light sweep, a flare
 *   0.16–0.56  the crew's tools at work, revealed in turn, the camera
 *              dollying round them: the rig rolling (REC through its
 *              viewfinder, its red tally light), the brush, the edit's
 *              playhead; then Mika's viewfinder hunts, locks, and the shutter
 *              fires at 0.41 (a white flash and a rumble)
 *   0.46–0.58  the sun goes down: no files move during the shoot
 *   0.52–0.62  that night: the album's grid draws in, in gold hairlines
 *   0.585–0.84 each frame flies in from the tool that made it (Kenn's film
 *              first, then Ernie's, then Mika's) and lands in its place by
 *              the time it was taken
 *   0.80–1.00  the frames, untouched: a sweep of light, focus marks, and a
 *              slow push until the iris into Ch6 closes on it
 *
 * Compositor-only: every layer moves by transform and opacity from the
 * shot's progress. No React state per frame.
 */

const SLATES: readonly Line[] = [
  { text: CH5.slate, from: 0, to: 0.54 },
  { text: CH5.slateNight, from: 0.54, to: 1.02 },
];

const LINES: readonly Line[] = [
  { text: CH5.lines[0], from: 0.24, to: 0.5 },
  { text: CH5.lines[1], from: 0.57, to: 0.8 },
  { text: CH5.lines[2], from: 0.82, to: 0.99 },
];

/** Mika's viewfinder: its focus box locks at ~0.39, and the shutter follows. */
const LENS = { from: 0.3, to: 0.52 };
const SHUTTER = 0.41;

/** Desktop is 1024 px and up (the layout's breakpoint). */
const WIDE = '(min-width: 1024px)';
function subscribeWide(on: () => void) {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener('change', on);
  return () => mq.removeEventListener('change', on);
}
function useWide() {
  return useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE).matches,
    () => false,
  );
}
const wideNow = () => window.innerWidth >= 1024;

export function Ch5Scene() {
  return (
    <Shot length={CH5_LENGTH} className="bg-[#161311]">
      {(progress) => <Stage progress={progress} />}
    </Shot>
  );
}

function Stage({ progress }: { progress: MotionValue<number> }) {
  const wide = useWide();
  const flash = useTransform(progress, (p) => r2(window4(p, SHUTTER - 0.004, SHUTTER, SHUTTER + 0.004, SHUTTER + 0.045) * 0.34));
  const tag = useReveal(progress, 0.52, 0.57, 1.1, 1.2, { y: 0, scale: 1 });
  // The zoom in: the world dollies toward the sun as the leak clears.
  const world = useTransform(progress, (p) => `scale(${r2(lerp(1, 1.14, camera(seg(p, 0, 0.3))) + 0.06 * camera(seg(p, 0.3, 0.58)))})`);
  return (
    <>
      <m.div style={{ transform: world }} className="absolute inset-0 z-0 origin-[50%_62%]">
        <Light progress={progress} />
        <Word progress={progress} />
      </m.div>
      <Flare progress={progress} from={0.03} to={0.32} x={50} y={60} size={wide ? 760 : 420} />
      <LightSweep progress={progress} from={0.06} to={0.32} />
      <Shoot progress={progress} />
      <Viewfinder progress={progress} from={0.17} to={0.3} focus={{ x: 22, y: 52 }} rec />
      <Viewfinder progress={progress} from={LENS.from} to={LENS.to} focus={{ x: 50, y: 60 }} />
      <Album progress={progress} />
      <LightSweep progress={progress} from={0.8} to={0.97} />
      <Particles progress={progress} push={[0.16, 0.58]} count={wide ? 24 : 12} seed={5} />
      {/* The shutter's flash: white, low, quick. */}
      <m.div aria-hidden style={{ opacity: flash }} className="pointer-events-none absolute inset-0 z-[25] bg-white" />
      <Slate progress={progress} slates={SLATES} />
      <Subtitles progress={progress} lines={LINES} />
      <m.div aria-hidden style={tag}>
        <Illustrative />
      </m.div>
    </>
  );
}

// ─── The light ───────────────────────────────────────────────────────────

const STARS =
  '[background-image:radial-gradient(1.5px_1.5px_at_12%_22%,#F2EDE8,transparent),radial-gradient(1px_1px_at_28%_48%,#BCADA3,transparent),radial-gradient(1.5px_1.5px_at_46%_14%,#F2EDE8,transparent),radial-gradient(1px_1px_at_64%_36%,#BCADA3,transparent),radial-gradient(1.5px_1.5px_at_78%_18%,#F2EDE8,transparent),radial-gradient(1px_1px_at_88%_52%,#BCADA3,transparent),radial-gradient(1px_1px_at_8%_62%,#A08E84,transparent),radial-gradient(1px_1px_at_56%_8%,#A08E84,transparent)]';

/** After sunset, night settles over the golden sky. */
const night = (p: number) => 0.9 * camera(seg(p, 0.46, 0.58));

function Light({ progress }: { progress: MotionValue<number> }) {
  const dark = useTransform(progress, (p) => r2(night(p)));
  const sun = useTransform(progress, (p) => {
    const rise = camera(seg(p, 0, 0.18));
    const sink = camera(seg(p, 0.42, 0.58));
    return `translate3d(-50%,calc(-50% + ${r2(lerp(12, 0, rise) + 16 * sink)}svh),0) scale(${r2(lerp(0.6, 1, rise))})`;
  });
  const raysO = useTransform(progress, (p) => r2(0.9 * enter(seg(p, 0, 0.12)) * (1 - night(p))));
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {/* The golden sky, pre-baked. */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#E3A96F_0%,#F0C88E_32%,#F8E3C0_61%,#FFF0D8_62%)]" />
      <m.div
        // Still: fine stripes turning with the scroll strobe on a phone. They come and go with the light.
        style={{ opacity: raysO }}
        className="absolute left-1/2 top-[62%] size-[150vmax] -translate-x-1/2 -translate-y-1/2 [background-image:repeating-conic-gradient(from_0deg,rgba(255,243,223,0.16)_0deg_3deg,rgba(255,243,223,0)_3deg_13deg)] [mask-image:radial-gradient(closest-side,#000_10%,transparent_75%)]"
      />
      <m.div style={{ transform: sun }} className="absolute left-1/2 top-[62%] size-[104px] lg:size-[176px]">
        <div className="absolute -inset-[140%] rounded-full bg-[radial-gradient(closest-side,rgba(255,240,214,0.75),rgba(255,231,194,0.25)_45%,rgba(255,231,194,0)_100%)]" />
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_45%_40%,#FFFBF2_0%,#FFE7C2_55%,#F6D2A0_100%)]" />
      </m.div>
      {/* The ground, in front of the sun as it sets. */}
      <div className="absolute inset-x-0 bottom-0 top-[62%] bg-[linear-gradient(180deg,#A8653A_0%,#6B3E25_30%,#3B2417_70%,#241912_100%)]" />
      <div className="absolute inset-x-0 top-[62%] h-px bg-[linear-gradient(90deg,rgba(255,231,194,0)_0%,rgba(255,243,223,0.95)_50%,rgba(255,231,194,0)_100%)]" />
      <m.div style={{ opacity: dark }} className="absolute inset-0 bg-[radial-gradient(120%_70%_at_50%_62%,#3a2416_0%,#1E1A17_45%,#161311_100%)]">
        <div className={`absolute inset-x-0 top-0 h-[58%] opacity-80 ${STARS}`} />
      </m.div>
    </div>
  );
}

/** "Saturday." on the horizon; the sun is its full stop. The h2 is in the server render. */
function Word({ progress }: { progress: MotionValue<number> }) {
  const word = useReveal(progress, 0.03, 0.12, 0.2, 0.27, { y: 36, scale: 0.7 });
  return (
    <m.p
      aria-hidden
      style={word}
      className="pointer-events-none absolute inset-x-0 bottom-[38%] z-10 origin-bottom select-none pb-[1.2svh] text-center text-[22vw] font-semibold leading-[0.86] tracking-[-0.05em] text-[#2A1C14] lg:text-[clamp(3.5rem,15vw,13rem)]"
    >
      {CH5.display}
      <span className="relative ml-[0.04em] inline-block size-[0.2em] rounded-full bg-[#FFF3DF] align-baseline shadow-[0_0_0.35em_0.08em_rgba(255,231,194,0.85),0_0_1.2em_0.3em_rgba(240,200,142,0.45)]" />
    </m.p>
  );
}

// ─── The shoot ───────────────────────────────────────────────────────────

/**
 * A tool standing in the golden light: it eases in at `at` and out at
 * `out`, with its own parallax (`drift`, vw across the shot). `spin` turns
 * the tool itself; `inner` is the art's box (the rumble's target, the hooks).
 */
function Piece({
  progress,
  kind,
  className,
  at,
  out,
  drift,
  spin,
  inner,
  children,
}: {
  progress: MotionValue<number>;
  kind: GearKind;
  className: string;
  at: number;
  out: number;
  drift: number;
  spin?: MotionValue<string>;
  inner?: RefObject<HTMLDivElement | null>;
  children?: ReactNode;
}) {
  const reveal = useReveal(progress, at, at + 0.08, out, out + 0.06, { y: 48, scale: 0.82 });
  const transform = useTransform(progress, (p) => `translate3d(${r2(lerp(drift, -drift, camera(seg(p, 0.14, 0.6))))}vw,0,0)`);
  const face: CSSProperties = { aspectRatio: GEAR_ASPECT[kind] };
  return (
    <m.div style={reveal} className={`absolute ${className}`}>
      <m.div style={{ transform }}>
        {/* Warm rim light pooled behind the piece: the sun is behind the crew. */}
        <div className="absolute -inset-[30%] rounded-full bg-[radial-gradient(closest-side,rgba(255,231,194,0.35),rgba(255,231,194,0))]" />
        <m.div ref={inner} style={spin ? { ...face, transform: spin } : face} className="relative origin-bottom">
          <GearArt kind={kind} className="block h-full w-full" />
          {children}
        </m.div>
      </m.div>
    </m.div>
  );
}

function Shoot({ progress }: { progress: MotionValue<number> }) {
  const cam = useCamera(progress, [
    { at: 0.14, scale: 0.7, y: 10, rx: 8, ry: -16 },
    { at: 0.4, scale: 1, y: 0, rx: 2, ry: 0 },
    { at: 0.58, scale: 1.14, x: -2, y: -4, rx: -2, ry: 12 },
  ]);
  const brush = useTransform(progress, (p) => `rotate(${r2(lerp(-16, 12, camera(seg(p, 0.2, 0.56))))}deg)`);
  const playhead = useTransform(progress, (p) => `translate3d(${r2(lerp(0, 100, seg(p, 0.22, 0.56)))}%,0,0)`);
  const shutter = useRef<HTMLDivElement>(null);
  const rig = useRef<HTMLDivElement>(null);
  // The gear's hooks: the rig's tally light rolls, the camera's shutter blinks on the beat.
  const gate = useMotionGate();
  const last = useRef(progress.get());
  const rolling = useRef<boolean | null>(null);
  useMotionValueEvent(progress, 'change', (p) => {
    const prev = last.current;
    last.current = p;
    const on = p >= 0.24 && p < 0.53;
    if (on !== rolling.current) {
      rolling.current = on;
      const tally = rig.current?.querySelector<SVGElement>('[data-part="tally"]');
      if (tally) {
        tally.style.opacity = on ? '1' : '0.25';
        tally.classList.add('autoplay');
        tally.classList.toggle('animate-pulse', on);
      }
    }
    if (gate.motion && !gate.paused && prev < SHUTTER && p >= SHUTTER) {
      shutter.current?.querySelector<SVGElement>('[data-part="shutter"]')?.animate([{ opacity: 1 }, { opacity: 0.1 }, { opacity: 1 }], { duration: 180, easing: 'linear' });
    }
  });

  return (
    <m.div aria-hidden style={{ transform: cam }} className="pointer-events-none absolute inset-0 z-10">
      {/* Kenn's edit, up in the light. */}
      <Piece progress={progress} kind="timeline" at={0.16} out={0.48} drift={0.8} className="right-[5vw] top-[15svh] w-[42vw] lg:right-[6vw] lg:top-[16svh] lg:w-[22vw]">
        <div className="absolute inset-x-[8%] inset-y-[16%] overflow-hidden">
          <m.div style={{ transform: playhead }} className="absolute inset-y-0 left-0 w-full border-l-2 border-[#FFE7C2] shadow-[-6px_0_14px_-6px_rgba(255,231,194,0.9)]" />
        </div>
      </Piece>
      {/* Ernie's rig, rolling: its red tally light on. */}
      <Piece
        progress={progress}
        kind="cinema"
        at={0.19}
        out={0.5}
        drift={1.6}
        inner={rig}
        className="bottom-[40svh] left-[3vw] w-[44vw] lg:bottom-[32svh] lg:left-[7vw] lg:w-[24vw]"
      />
      {/* Bea's brush, mid-stroke. */}
      <Piece
        progress={progress}
        kind="brush"
        at={0.22}
        out={0.47}
        drift={2.4}
        spin={brush}
        className="bottom-[37svh] right-[7vw] w-[8vw] lg:bottom-[33svh] lg:left-[66vw] lg:right-auto lg:w-[4vw]"
      />
      {/* Mika's camera, in front of the sun. The shutter rumbles it. */}
      <Piece progress={progress} kind="camera" at={0.25} out={0.52} drift={2} inner={shutter} className="bottom-[29svh] left-[30vw] w-[40vw] lg:left-[40vw] lg:w-[20vw]" />
    </m.div>
  );
}

// ─── That night: the album ───────────────────────────────────────────────

type Spot = { cx: number; cy: number; w: number };
type Source = { kind: GearKind; at: number; m: Spot; d: Spot };

/**
 * Where each tool sits around the album that night, in grid cells from the
 * grid's top-left (cells are square): above it on phones, beside it on
 * desktop. Each frame flies from its maker's tool.
 */
const SOURCES: Record<'ernie' | 'mika' | 'kenn', Source> = {
  ernie: { kind: 'cinema', at: 0.52, m: { cx: 0.55, cy: -1.9, w: 1.45 }, d: { cx: -1.75, cy: 0.55, w: 1.9 } },
  mika: { kind: 'camera', at: 0.55, m: { cx: 2.05, cy: -1.9, w: 1.3 }, d: { cx: -1.55, cy: 2.2, w: 1.6 } },
  kenn: { kind: 'timeline', at: 0.49, m: { cx: 3.5, cy: -1.9, w: 1.35 }, d: { cx: 5.55, cy: 1.2, w: 2 } },
};

/** The box a spot takes, in % of the grid box. */
function spotVars(kind: GearKind, mo: Spot, de: Spot): CSSProperties {
  const box = (s: Spot, p: string) => {
    const h = s.w / GEAR_ASPECT[kind];
    return {
      [`--${p}l`]: `${r2((s.cx - s.w / 2) * (100 / COLS))}%`,
      [`--${p}t`]: `${r2((s.cy - h / 2) * (100 / ROWS))}%`,
      [`--${p}w`]: `${r2(s.w * (100 / COLS))}%`,
    };
  };
  return { ...box(mo, 'm'), ...box(de, 'd') } as CSSProperties;
}

/** Arrival order: Kenn's film at 9:24 PM, then Ernie's card, then Mika's. Each lands by capture time. */
const FLIGHT = 0.07;
const ARRIVE: number[] = (() => {
  const start = { kenn: 0.585, ernie: 0.615, mika: 0.665 };
  const step = { kenn: 0, ernie: 0.024, mika: 0.017 };
  const n = { kenn: 0, ernie: 0, mika: 0 };
  return SLOTS.map((s) => {
    const who = s.who as keyof typeof start;
    return start[who] + n[who]++ * step[who];
  });
})();

/** The focus marks for "kept exactly as shot": one frame, in Ceremony. */
const KEPT = 6;

function Album({ progress }: { progress: MotionValue<number> }) {
  const cam = useCamera(progress, [
    { at: 0.5, scale: 0.62, y: 8, rx: 12, ry: -14 },
    { at: 0.8, scale: 1, y: 0, rx: 4, ry: 4 },
    { at: 1, scale: 1.14, y: -2, rx: 0, ry: -2 },
  ]);
  const card = useReveal(progress, 0.5, 0.58, 1.1, 1.2, { y: 40, scale: 0.9 });
  const marks = useReveal(progress, 0.83, 0.88, 1.1, 1.2, { y: 0, scale: 1.3 });
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-[31svh] z-10 flex justify-center lg:top-[15svh]">
      <m.div style={{ transform: cam }} className="w-[80vw] lg:w-[min(40vw,72svh)]">
        <m.div style={card}>
          <Float amp={6} tilt={1.4} duration={7.4}>
            <AlbumCard
              grid={
                <>
                  <GridLines progress={progress} from={0.54} />
                  {SLOTS.map((_, i) => (
                    <Flyer key={i} i={i} progress={progress} />
                  ))}
                  <m.div style={{ ...cellStyle(KEPT), ...marks }} className="absolute">
                    {MARKS.map((c) => (
                      <span key={c} className={`absolute size-3 border-[#FFE7C2] ${c}`} />
                    ))}
                  </m.div>
                  {/* The tools, set down around the album. */}
                  {(Object.keys(SOURCES) as (keyof typeof SOURCES)[]).map((who) => (
                    <Tool key={who} progress={progress} source={SOURCES[who]} />
                  ))}
                </>
              }
            />
          </Float>
        </m.div>
      </m.div>
    </div>
  );
}

const MARKS = ['left-0 top-0 border-l-2 border-t-2', 'right-0 top-0 border-r-2 border-t-2', 'bottom-0 left-0 border-b-2 border-l-2', 'bottom-0 right-0 border-b-2 border-r-2'];

function Tool({ progress, source }: { progress: MotionValue<number>; source: Source }) {
  const reveal = useReveal(progress, source.at, source.at + 0.07, 1.1, 1.2, { y: 30, scale: 0.8 });
  return (
    <m.div
      style={{ ...spotVars(source.kind, source.m, source.d), ...reveal }}
      className="absolute left-[var(--ml)] top-[var(--mt)] w-[var(--mw)] lg:left-[var(--dl)] lg:top-[var(--dt)] lg:w-[var(--dw)]"
    >
      <div className="absolute -inset-[25%] rounded-full bg-[radial-gradient(closest-side,rgba(240,200,142,0.18),rgba(240,200,142,0))]" />
      <div className="relative" style={{ aspectRatio: GEAR_ASPECT[source.kind] }}>
        <GearArt kind={source.kind} className="block h-full w-full" />
      </div>
    </m.div>
  );
}

/** One frame's flight, from its maker's tool to its place by capture time. */
function Flyer({ i, progress }: { i: number; progress: MotionValue<number> }) {
  const slot = SLOTS[i];
  const src = SOURCES[slot.who as keyof typeof SOURCES];
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const a = ARRIVE[i];
  const transform = useTransform(progress, (p) => {
    const e = camera(seg(p, a, a + FLIGHT));
    const s = wideNow() ? src.d : src.m;
    const dx = (s.cx - (col + 0.5)) * (1 - e) * 100;
    const dy = (s.cy - (row + 0.5)) * (1 - e) * 100 - Math.sin(Math.PI * e) * 45;
    const sc = lerp(0.3, 1, e) + Math.sin(Math.PI * e) * 0.12;
    return `translate3d(${r2(dx)}%,${r2(dy)}%,0) scale(${r2(sc)})`;
  });
  const opacity = useTransform(progress, (p) => {
    const t = seg(p, a, a + FLIGHT);
    return t <= 0 ? 0 : r2(Math.min(1, t * 6));
  });
  // Each frame leaves its tool as a spark of light and lands as its tile.
  const spark = useTransform(progress, (p) => r2(1 - camera(seg(p, a + FLIGHT * 0.35, a + FLIGHT * 0.9))));
  const tile = useTransform(progress, (p) => r2(camera(seg(p, a + FLIGHT * 0.35, a + FLIGHT * 0.9))));
  return (
    <m.div style={{ ...cellStyle(i), transform, opacity }} className="absolute p-[2px]">
      <m.div style={{ opacity: tile }} className="size-full">
        <AlbumFrame i={i} />
      </m.div>
      <m.span style={{ opacity: spark }} className="absolute inset-[18%] rounded-full bg-[radial-gradient(closest-side,rgba(255,244,226,0.95),rgba(255,231,194,0.45)_40%,rgba(240,200,142,0)_100%)]" />
    </m.div>
  );
}

/** The album's grid draws in as gold hairlines before the frames land. */
function GridLines({ progress, from }: { progress: MotionValue<number>; from: number }) {
  const x = useTransform(progress, (p) => `scaleX(${r2(camera(seg(p, from, from + 0.06)))})`);
  const y = useTransform(progress, (p) => `scaleY(${r2(camera(seg(p, from + 0.02, from + 0.08)))})`);
  const o = useTransform(progress, (p) => r2(window4(p, from, from + 0.03, 0.84, 0.9) * 0.7));
  return (
    <m.div style={{ opacity: o }} className="absolute inset-0">
      {Array.from({ length: ROWS + 1 }, (_, r) => (
        <m.span key={`r${r}`} style={{ top: `${(r * 100) / ROWS}%`, transform: x }} className="absolute inset-x-0 h-px bg-[#F0C88E]/60" />
      ))}
      {Array.from({ length: COLS + 1 }, (_, c) => (
        <m.span key={`c${c}`} style={{ left: `${(c * 100) / COLS}%`, transform: y }} className="absolute inset-y-0 w-px bg-[#F0C88E]/60" />
      ))}
    </m.div>
  );
}
