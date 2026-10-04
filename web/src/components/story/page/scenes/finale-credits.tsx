'use client';

import { m, useTransform, type MotionValue } from 'framer-motion';
import { Download } from 'lucide-react';
import { useRef, useState } from 'react';
import { DOWNLOAD_PATH, SIGN_IN_URL, SIGN_UP_URL } from '@/components/landing/links';
import { camera, lerp, r2, seg } from '../cinema/ease';
import { Flare, LightSweep, Particles, useCamera, useReveal } from '../cinema/fx';
import { GearArt, GEAR_ASPECT } from '../cinema/gear';
import { Morph } from '../cinema/morph';
import { Shot, Slate } from '../cinema/shot';
import { FINALE_COPY as T } from '../../data/strings/page-finale';
import { CREW } from './finale-crew';

/**
 * The credits (05-cinema.md §3, Finale · #start): one shot, framed for the
 * 2.39:1 letterbox the chrome brings back over #start on desktop.
 *
 * Progress over the shot (every item eases in and out with useReveal, like
 * end credits rising; the block itself drifts up the whole time):
 * - 0.00–0.08  "The crew";
 * - 0.02–0.24  the crew rise in one by one, each name with its tool and role;
 * - 0.24–0.40  the full crew holds while the camera dollies in;
 * - 0.40–0.59  they rise away in turn, with wind (particles 0.44–0.76);
 * - 0.50–0.76  the last card: a gold sparkle (the H1's star) that becomes a
 *              heart (morph 0.58–0.72), "This one's you.", then the three
 *              ways in, then the honesty line;
 * - 0.58–1.00  a flare blooms behind it and the horizon warms;
 * - 0.72–0.96  one light sweep crosses the title;
 * - 0.76–1.00  it holds until the stage unpins and the bars open onto the FAQ.
 * Transform and opacity only, one scroll source (the Shot), no React state
 * per frame. Loaded only in motion mode, near #start (islands/finale.tsx).
 */

/** The letterbox bar's height on desktop (chrome.tsx), so the frame's content sits between the bars. */
const FRAME = '[--bar:0px] lg:[--bar:min(11vh,max(0px,calc((100vh_-_100vw/2.39)/2)))]';

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#F2EDE8]';

/** A little fixed dust behind everything: the far plane. */
const DUST = [
  [6, 12, 1.2], [14, 38, 0.8], [23, 8, 1], [31, 26, 0.7], [44, 14, 1.1], [52, 34, 0.8], [61, 6, 0.9], [68, 22, 1.2],
  [77, 40, 0.7], [86, 10, 1], [93, 30, 0.8], [9, 62, 0.7], [38, 56, 0.9], [72, 60, 0.8], [96, 52, 1], [57, 70, 0.6],
]
  .map(([x, y, r]) => `radial-gradient(${r}px ${r}px at ${x}% ${y}%, rgba(242,237,232,0.55), rgba(242,237,232,0) 100%)`)
  .join(', ');

/** `length`: the shot's scroll in svh, from the chapter (which also reserves the box). */
export function FinaleCredits({ length }: { length: number }) {
  const root = useRef<HTMLDivElement>(null);
  // Halve the wind below 1024 px (brief: ≤ 24 sprites a shot on phones). Client-only scene, so window exists.
  const [motes] = useState(() => (window.innerWidth < 1024 ? 14 : 28));

  /** A keyboard visitor tabbing into the CTAs before the roll has brought them up: jump to the held frame. */
  const onFocus = () => {
    const el = root.current;
    if (!el) return;
    const range = el.offsetHeight - window.innerHeight;
    const rect = el.getBoundingClientRect();
    const p = range > 0 ? -rect.top / range : 1;
    if (p < 0.76) window.scrollTo({ top: window.scrollY + rect.top + range * 0.84 });
  };

  return (
    <div ref={root}>
      <Shot length={length} className={`bg-[#100D0C] ${FRAME}`}>
        {(p) => <Frame progress={p} motes={motes} onFocus={onFocus} />}
      </Shot>
    </div>
  );
}

function Frame({ progress, motes, onFocus }: { progress: MotionValue<number>; motes: number; onFocus: () => void }) {
  const far = useTransform(progress, (p) => `translate3d(0,${r2(lerp(0, -5, p))}vh,0)`);
  const glow = useTransform(progress, (p) => r2(lerp(0.35, 1, camera(seg(p, 0.4, 0.85)))));
  const glowY = useTransform(progress, (p) => `translate3d(0,${r2(lerp(18, 0, camera(seg(p, 0.4, 0.85))))}%,0)`);
  const cam = useCamera(progress, [
    { at: 0, scale: 1.05, y: 1, rx: 5 },
    { at: 0.46, scale: 1, rx: 1.5 },
    { at: 0.7, scale: 1.035, rx: 0 },
    { at: 1, scale: 1, rx: 0 },
  ]);
  // The roll: the crew block drifts up slowly the whole time its names are on screen.
  const roll = useTransform(progress, (p) => `translate3d(0,${r2(lerp(6, -8, seg(p, 0, 0.58)))}svh,0)`);
  const mark = useReveal(progress, 0.5, 0.62, 2, 3, { y: 50, scale: 0.6 });
  const title = useReveal(progress, 0.54, 0.68, 2, 3, { y: 70, scale: 0.86 });
  const ctas = useReveal(progress, 0.59, 0.72, 2, 3, { y: 40, scale: 0.96 });
  const fine = useReveal(progress, 0.63, 0.76, 2, 3, { y: 24, scale: 1 });
  // The last card takes clicks only once it is there (keyboard focus jumps the scroll to it: onFocus).
  const events = useTransform(progress, (p) => (p > 0.57 ? 'auto' : 'none'));

  return (
    <>
      {/* (a) The far plane: night and dust, barely moving. */}
      <m.div aria-hidden style={{ transform: far, backgroundImage: DUST }} className="pointer-events-none absolute -inset-y-[6vh] inset-x-0" />
      {/* (b) Light: the last warm horizon, rising as the final card arrives. */}
      <m.div
        aria-hidden
        style={{ opacity: glow, transform: glowY }}
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[70%] bg-[radial-gradient(70%_60%_at_50%_100%,rgba(209,138,90,0.22),rgba(107,62,37,0.08)_45%,rgba(16,13,12,0)_75%)]"
      />
      <Flare progress={progress} from={0.58} to={1.2} x={50} y={44} size={760} />

      {/* The frame between the bars: the slate and the hero plane. */}
      <div className="absolute inset-x-0 top-[var(--bar)] bottom-[var(--bar)] z-20">
        <Slate progress={progress} slates={[{ text: T.slate, from: 0, to: 0.72 }]} />

        {/* (c) The hero plane, under the camera. */}
        <m.div style={{ transform: cam }} className="absolute inset-0">
          <m.div style={{ transform: roll }} className="absolute inset-0 grid place-items-center px-5">
            <Crew progress={progress} />
          </m.div>

          <m.div style={{ pointerEvents: events }} onFocus={onFocus} className="absolute inset-0 grid place-items-center px-5">
            <div className="flex max-w-4xl flex-col items-center text-center">
              {/* The one morph: the page's star becomes a heart as the last card lands. */}
              <m.div aria-hidden style={mark} className="relative mb-6 size-10 sm:mb-8 sm:size-14">
                <span className="absolute -inset-6 rounded-full bg-[radial-gradient(closest-side,rgba(240,200,142,0.35),rgba(240,200,142,0))]" />
                <Morph
                  progress={progress}
                  keys={[
                    { at: 0.58, shape: 'sparkle' },
                    { at: 0.72, shape: 'heart' },
                  ]}
                  className="relative size-full"
                />
              </m.div>
              <m.h2
                style={title}
                className="text-[clamp(3rem,1.2rem+7vw,7.5rem)] leading-[0.92] font-semibold tracking-[-0.045em] text-[#F2EDE8] [text-wrap:balance]"
              >
                {T.title}
              </m.h2>
              <m.div style={ctas} className="w-full sm:w-auto">
                <Ctas />
              </m.div>
              <m.p style={fine} className="mt-8 max-w-[52ch] text-[13px] leading-relaxed text-[#A08E84] sm:text-sm">
                {T.honesty}
              </m.p>
            </div>
          </m.div>
        </m.div>
      </div>

      <LightSweep progress={progress} from={0.72} to={0.96} />
      {/* (d) Wind: dust streaming past as the roll carries on. */}
      <Particles progress={progress} push={[0.44, 0.76]} count={motes} seed={23} />
    </>
  );
}

function Crew({ progress }: { progress: MotionValue<number> }) {
  const head = useReveal(progress, 0, 0.08, 0.38, 0.48, { y: 60, scale: 0.94 });
  return (
    <div className="w-full max-w-3xl">
      <m.p style={head} className="text-center font-mono text-xs tracking-[0.24em] text-[#D18A5A] uppercase">
        {T.crew}
      </m.p>
      {/* Two by two on phones, so the whole crew fits a short screen; a credits column from sm. */}
      <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 sm:mt-10 sm:grid-cols-1 sm:gap-6">
        {CREW.map((c, i) => (
          <CrewRow key={c.first} progress={progress} i={i} c={c} />
        ))}
      </ul>
    </div>
  );
}

/** One credit: rises in on its turn (0.04 apart), holds, and rises away (0.03 apart). */
function CrewRow({ progress, i, c }: { progress: MotionValue<number>; i: number; c: (typeof CREW)[number] }) {
  const style = useReveal(progress, 0.02 + i * 0.04, 0.12 + i * 0.04, 0.4 + i * 0.03, 0.5 + i * 0.03, { y: 80, scale: 0.9 });
  return (
    <m.li style={style} className="grid justify-items-center gap-2 text-center sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-x-8">
      <span className="order-2 font-mono text-xs tracking-[0.14em] text-[#BCADA3] uppercase sm:order-1 sm:justify-self-end sm:text-[13px] sm:tracking-[0.2em]">
        {c.role}
      </span>
      <span className="order-1 block h-10 sm:order-2 sm:h-14" style={{ aspectRatio: GEAR_ASPECT[c.gear] }}>
        <GearArt kind={c.gear} className="size-full" />
      </span>
      <span className="order-3 text-[clamp(1.75rem,1.2rem+2vw,2.75rem)] leading-none font-semibold tracking-[-0.02em] text-[#F2EDE8] sm:justify-self-start">
        {c.first}
      </span>
    </m.li>
  );
}

function Ctas() {
  return (
    <div className="mt-9 flex w-full flex-col items-center gap-3 sm:flex-row sm:gap-4">
      <a
        href={SIGN_UP_URL}
        className={`inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[#D18A5A] px-7 text-base font-semibold text-[#161311] shadow-[0_10px_40px_-12px_rgba(209,138,90,0.6)] transition-colors hover:bg-[#E09A69] sm:w-auto ${FOCUS}`}
      >
        {T.join}
      </a>
      <a
        href={DOWNLOAD_PATH}
        className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#F2EDE8] px-7 text-base font-semibold text-[#161311] transition-colors hover:bg-white sm:w-auto ${FOCUS}`}
      >
        <Download aria-hidden className="size-4" />
        {T.download}
      </a>
      <a
        href={SIGN_IN_URL}
        className={`inline-flex min-h-12 items-center justify-center rounded-xl px-4 text-base font-medium text-[#BCADA3] transition-colors hover:text-[#F2EDE8] ${FOCUS}`}
      >
        {T.signIn}
      </a>
    </div>
  );
}
