'use client';

import { m, useMotionValue, useTransform, type MotionValue } from 'framer-motion';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { camera, clamp01, enter, lerp, r2, seg, window4 } from '../cinema/ease';
import { Flare, LightSweep, Particles, useReveal } from '../cinema/fx';
import { GearArt, GEAR_ASPECT } from '../cinema/gear';
import { Morph } from '../cinema/morph';
import { Shot, Slate } from '../cinema/shot';
import { VirgoConstellation, virgoPoint } from '../cinema/virgo-constellation';
import { FINALE_COPY as T } from '../../data/strings/page-finale';
import { Credits, MoreLinks, PrimaryCtas } from '../chapters/closing';
import { steady } from '../motion';
import { CREW } from './finale-crew';

/**
 * The closing shot (05-cinema.md §3, Finale · #start): the last thing on the
 * page. The credits roll inside the film's frame (cinema/frame.tsx), clear of
 * its corner HUD; then the last screen takes the whole of the frame.
 *
 * Progress over the shot:
 * - 0.00–0.34  the credits: "The crew" and each name with its tool rise in,
 *              hold, and rise away (useReveal), drifting up like end credits;
 * - 0.34–0.42  the dark gathers into one gold star at the centre: Spica,
 *              Mika's star, and Virgo's lines start out of it;
 * - 0.42       the flash: warm light fills the frame and the Virgo logo is
 *              there, big, with "VIRGO" under it, rays turning behind it and
 *              a light sweep crossing it (0.46–0.60), the constellation
 *              drawing on out around and behind it (to 0.52);
 * - 0.52–0.66  the logo glides up and shrinks into its place above the title:
 *              one logo, from the flash to the last screen, never two (the
 *              last screen keeps only an empty slot that says where it
 *              lands). Syrma, the star held back all film, lights last
 *              (0.52–0.60): you;
 * - 0.58–0.80  the last screen eases in around it, item by item: "Start your
 *              journey now.", Join / Download / Sign in, the links the footer
 *              used to carry, and the credits, with Virgo settling faint
 *              behind them;
 * - 0.80–1.00  it holds: the end of the page.
 * Transform and opacity only, one scroll source (the Shot), no React state
 * per frame. Loaded only in motion mode, near #start (islands/finale.tsx).
 */

/** The flash's peak. */
const FLASH = 0.42;

/** Spica in the figure's box, %: the gathering star is this star. */
const SPICA = virgoPoint('alpha');

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

  /** A keyboard visitor tabbing into the buttons before the last screen is up: jump to it. */
  const onFocus = () => {
    const el = root.current;
    if (!el) return;
    const range = el.offsetHeight - window.innerHeight;
    const rect = el.getBoundingClientRect();
    const p = range > 0 ? -rect.top / range : 1;
    if (p < 0.8) window.scrollTo({ top: window.scrollY + rect.top + range * 0.9 });
  };

  return (
    <div ref={root}>
      <Shot length={length} className="bg-[#100D0C]">
        {(p) => <Frame progress={p} motes={motes} onFocus={onFocus} />}
      </Shot>
    </div>
  );
}

function Frame({ progress, motes, onFocus }: { progress: MotionValue<number>; motes: number; onFocus: () => void }) {
  const far = useTransform(progress, (p) => `translate3d(0,${r2(lerp(0, -5, p))}vh,0)`);
  const glow = useTransform(progress, (p) => r2(lerp(0.3, 1, camera(seg(p, 0.4, 0.8)))));
  const glowY = useTransform(progress, (p) => `translate3d(0,${r2(lerp(18, 0, camera(seg(p, 0.4, 0.8))))}%,0)`);
  // The roll: the crew block drifts straight up the whole time its names are on screen. Flat, like real end
  // credits: names on a tilting, rescaling plane re-render every frame and shimmer as they move.
  const roll = useTransform(progress, (p) => `translate3d(0,${r2(lerp(6, -8, seg(p, 0, 0.36)))}svh,0)`);
  // The last screen takes clicks only once it is there (keyboard focus jumps the scroll to it: onFocus).
  const events = useTransform(progress, (p) => (p > 0.6 ? 'auto' : 'none'));
  const screen = useRef<HTMLDivElement>(null);
  const slot = useRef<HTMLSpanElement>(null);
  const logo = useRef<HTMLDivElement>(null);
  const land = useLanding(screen, slot, logo);

  return (
    <>
      {/* (a) The far plane: night and dust, barely moving. */}
      <m.div aria-hidden style={{ transform: far, backgroundImage: DUST }} className="pointer-events-none absolute -inset-y-[6vh] inset-x-0" />
      {/* (b) Light: the last warm horizon, rising as the film ends. */}
      <m.div
        aria-hidden
        style={{ opacity: glow, transform: glowY }}
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[70%] bg-[radial-gradient(70%_60%_at_50%_100%,rgba(209,138,90,0.22),rgba(107,62,37,0.08)_45%,rgba(16,13,12,0)_75%)]"
      />
      <Flare progress={progress} from={0.38} to={0.66} x={50} y={46} size={820} />

      {/* (c) Virgo: out of the gathering star, around and behind the sting, then faint behind the last screen. */}
      <FinaleVirgo progress={progress} />

      {/* The credits, centred in the frame's inner box, clear of its HUD rows top (watermark, Sign in) and bottom (time card, Pause, Download). */}
      <div className="absolute inset-x-[var(--frame)] bottom-[calc(var(--frame)+60px)] top-[calc(var(--frame)+56px)] z-20">
        <Slate progress={progress} slates={[{ text: T.slate, from: 0, to: 0.36 }]} />
        <m.div style={{ transform: roll }} className="absolute inset-0 grid place-items-center px-5 will-change-transform">
          <Crew progress={progress} />
        </m.div>
      </div>

      <Sting progress={progress} logo={logo} land={land} />

      {/* The last screen: the whole frame. */}
      <m.div ref={screen} style={{ pointerEvents: events }} onFocus={onFocus} className="absolute inset-0 z-30 overflow-hidden">
        <Closing progress={progress} slot={slot} />
      </m.div>

      <LightSweep progress={progress} from={0.46} to={0.6} />
      {/* (d) Wind: the burst from the flash streaming past. */}
      <Particles progress={progress} push={[FLASH - 0.02, 0.66]} count={motes} seed={23} />
      <Flash progress={progress} />
    </>
  );
}

function Crew({ progress }: { progress: MotionValue<number> }) {
  // Phones: the names only fade; the roll is the one movement (two speeds at once read as shaking).
  const head = useReveal(progress, 0, 0.06, 0.26, 0.32, { y: steady() ? 0 : 40, scale: 1 });
  return (
    <div className="w-full max-w-3xl">
      <m.p style={head} className="text-center font-mono text-xs uppercase tracking-[0.24em] text-[#D18A5A]">
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

/** One credit: rises in on its turn, holds, and rises away. */
function CrewRow({ progress, i, c }: { progress: MotionValue<number>; i: number; c: (typeof CREW)[number] }) {
  const style = useReveal(progress, 0.02 + i * 0.035, 0.1 + i * 0.035, 0.24 + i * 0.025, 0.32 + i * 0.025, { y: steady() ? 0 : 48, scale: 1 });
  return (
    <m.li style={style} className="will-change-transform grid justify-items-center gap-2 text-center sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-x-8">
      <span className="order-2 font-mono text-xs uppercase tracking-[0.14em] text-[#BCADA3] sm:order-1 sm:justify-self-end sm:text-[13px] sm:tracking-[0.2em]">
        {c.role}
      </span>
      <span className="order-1 block h-10 sm:order-2 sm:h-14" style={{ aspectRatio: GEAR_ASPECT[c.gear] }}>
        <GearArt kind={c.gear} className="size-full" />
      </span>
      <span className="order-3 text-[clamp(1.75rem,1.2rem+2vw,2.75rem)] font-semibold leading-none tracking-[-0.02em] text-[#F2EDE8] sm:justify-self-start">
        {c.first}
      </span>
    </m.li>
  );
}

/**
 * The logo sting: one gold star gathers out of the dark, the frame flashes,
 * and the Virgo logo is there with its name under it, rays turning behind.
 * Then it lifts away for the last screen.
 */
function Sting({ progress, logo, land }: { progress: MotionValue<number>; logo: RefObject<HTMLDivElement | null>; land: Landing }) {
  // The star: from a point to a burst, gone in the flash.
  const starO = useTransform(progress, (p) => r2(window4(p, 0.34, 0.38, FLASH - 0.01, FLASH + 0.01)));
  // It turns as it grows on desktop; on phones it only grows (motion.tsx steady()).
  const spin = steady() ? 0 : 1;
  const starT = useTransform(progress, (p) => `translate3d(-50%,-50%,0) rotate(${r2(spin * lerp(-30, 40, seg(p, 0.34, FLASH)))}deg) scale(${r2(lerp(0.15, 1.6, camera(seg(p, 0.34, FLASH))))})`);
  // The logo: there at the flash, settling from big; then one glide, up and smaller, into its place on the last
  // screen, where it stays. It never fades out and nothing fades in for it, so there is only ever one.
  const logoO = useTransform(progress, (p) => r2(enter(seg(p, FLASH - 0.005, FLASH + 0.03))));
  const logoT = useTransform([progress, land.dx, land.dy, land.k], ([p, x, y, k]: number[]) => {
    const settle = camera(seg(p, FLASH, 0.5));
    const glide = camera(seg(p, 0.52, 0.66));
    return `translate3d(calc(-50% + ${r2(x * glide)}px),calc(-50% + ${r2(y * glide)}px),0) scale(${r2(lerp(1.3, 1, settle) * lerp(1, k, glide))})`;
  });
  // "VIRGO" under it goes before the glide: the name belongs to the flash, not to the last screen.
  const nameO = useTransform(progress, (p) => r2(window4(p, 0.45, 0.49, 0.5, 0.53)));
  const nameT = useTransform(progress, (p) => `translate3d(0,${r2((1 - enter(seg(p, 0.45, 0.5))) * 14)}px,0)`);
  // The rays open out; they never turn (fine stripes turning with the scroll strobe).
  const rays = useTransform(progress, (p) => `translate3d(-50%,-50%,0) scale(${r2(lerp(0.7, 1.15, seg(p, FLASH, 0.6)))})`);
  const raysO = useTransform(progress, (p) => r2(window4(p, FLASH, FLASH + 0.02, 0.52, 0.6) * 0.8));
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-20">
      <m.div
        style={{ opacity: raysO, transform: rays }}
        className="absolute left-1/2 top-1/2 size-[130vmin] rounded-full bg-[repeating-conic-gradient(from_0deg,rgba(240,200,142,0.16)_0deg_3deg,rgba(240,200,142,0)_3deg_15deg)] [mask-image:radial-gradient(closest-side,black_20%,transparent_70%)]"
      />
      <m.div style={{ opacity: starO, transform: starT }} className="absolute left-1/2 top-1/2 size-24 sm:size-32">
        <span className="absolute -inset-8 rounded-full bg-[radial-gradient(closest-side,rgba(255,231,194,0.7),rgba(240,200,142,0))]" />
        <Morph
          progress={progress}
          keys={[
            { at: 0.36, shape: 'sparkle' },
            { at: FLASH, shape: 'circle' },
          ]}
          fill="#FFE7C2"
          className="relative size-full"
        />
      </m.div>
      {/* Centred on the logo itself (the name hangs below it), so the glide lands it exactly on the slot. */}
      <m.div ref={logo} style={{ opacity: logoO, transform: logoT }} className="absolute left-1/2 top-1/2 size-[min(34vmin,180px)] will-change-transform">
        <span className="absolute -inset-[45%] rounded-full bg-[radial-gradient(closest-side,rgba(240,200,142,0.42),rgba(209,138,90,0.12)_50%,rgba(209,138,90,0))]" />
        <span className="relative block size-full bg-contain bg-center bg-no-repeat" style={{ backgroundImage: 'url(/logo.png)' }} />
        <m.span
          style={{ opacity: nameO, transform: nameT }}
          className="absolute left-1/2 top-full mt-5 -translate-x-1/2 whitespace-nowrap pl-[0.6em] font-mono text-sm uppercase tracking-[0.6em] text-[#F0C88E] sm:text-base"
        >
          {T.name}
        </m.span>
      </m.div>
    </div>
  );
}

/** From the stage's centre to the slot's, px; and the slot's size over the logo's. */
type Landing = { dx: MotionValue<number>; dy: MotionValue<number>; k: MotionValue<number> };

/**
 * Where the one logo lands: `slot` in the last screen's layer `screen` (the
 * stage's box), for the sting's `logo` at its own size (a transform does not
 * change offsetWidth). Measured from the layout, never through a transform,
 * and again whenever the stage resizes.
 */
function useLanding(
  screen: RefObject<HTMLDivElement | null>,
  slot: RefObject<HTMLSpanElement | null>,
  logo: RefObject<HTMLDivElement | null>,
): Landing {
  const dx = useMotionValue(0);
  const dy = useMotionValue(-200);
  const k = useMotionValue(0.4);
  useEffect(() => {
    const box = screen.current;
    if (!box) return;
    const measure = () => {
      const a = box.getBoundingClientRect();
      const b = slot.current?.getBoundingClientRect();
      const size = logo.current?.offsetWidth;
      if (!b || !size) return;
      dx.set(b.left + b.width / 2 - (a.left + a.width / 2));
      dy.set(b.top + b.height / 2 - (a.top + a.height / 2));
      k.set(b.width / size);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, [screen, slot, logo, dx, dy, k]);
  return { dx, dy, k };
}

/**
 * Virgo at the close (the owner: seen in the hero, midway, and at the end).
 * The figure is placed so Spica sits exactly on the gathering star; its
 * lines race out from it in figure order through the flash and around the
 * logo; Syrma, the socket all film long, ignites last as the logo lifts (the
 * new star is you); then the figure drifts to centre behind the last screen
 * and rests there, faint, twinkling. Lines are compositor-only spans
 * (cinema/virgo-constellation.tsx); the drift is one transform.
 */
function FinaleVirgo({ progress }: { progress: MotionValue<number> }) {
  const draw = useTransform(progress, (p) => seg(p, 0.37, 0.52));
  const stars = useTransform(progress, (p) => r2(enter(seg(p, 0.35, 0.41))));
  const ignite = useTransform(progress, (p) => seg(p, 0.52, 0.6));
  const glow = useTransform(progress, (p) => r2(window4(p, 0.4, 0.44, 0.52, 0.66)));
  // From Spica on the star, to the figure's centre a little above the frame's middle, behind the title.
  const transform = useTransform(progress, (p) => {
    const t = camera(seg(p, 0.54, 0.76));
    return `translate3d(${r2(-lerp(SPICA.x, 50, t))}%,calc(${r2(-lerp(SPICA.y, 50, t))}% - ${r2(8 * t)}svh),0) scale(${r2(lerp(1, 1.1, t))})`;
  });
  const opacity = useTransform(progress, (p) => r2(seg(p, 0.34, 0.37) * lerp(1, 0.3, camera(seg(p, 0.56, 0.78)))));
  return (
    <m.div style={{ transform, opacity }} className="pointer-events-none absolute left-1/2 top-1/2 z-10 w-[min(84vw,89svh)]">
      <VirgoConstellation draw={draw} stars={stars} glow={glow} syrma="ignite" ignite={ignite} lineAlpha={0.78} starScale={1.5} />
    </m.div>
  );
}

/** The flash itself: warm light over the whole frame for an instant. */
function Flash({ progress }: { progress: MotionValue<number> }) {
  const opacity = useTransform(progress, (p) => r2(clamp01(window4(p, FLASH - 0.012, FLASH, FLASH + 0.004, FLASH + 0.05)) * 0.92));
  return (
    <m.div
      aria-hidden
      style={{ opacity }}
      className="pointer-events-none absolute inset-0 z-40 bg-[radial-gradient(60%_60%_at_50%_46%,#FFF6E8_0%,#FFE7C2_35%,rgba(240,200,142,0.85)_70%,rgba(209,138,90,0.7)_100%)]"
    />
  );
}

/** The last screen: around the logo's place, the line, every way in, and the credits, easing in one by one. */
function Closing({ progress, slot }: { progress: MotionValue<number>; slot: RefObject<HTMLSpanElement | null> }) {
  const title = useReveal(progress, 0.58, 0.68, 2, 3, { y: 60, scale: 0.9 });
  const ctas = useReveal(progress, 0.62, 0.72, 2, 3, { y: 40, scale: 0.96 });
  const more = useReveal(progress, 0.66, 0.76, 2, 3, { y: 30, scale: 0.98 });
  const fine = useReveal(progress, 0.7, 0.8, 2, 3, { y: 20, scale: 1 });
  return (
    <div className="mx-auto flex min-h-full max-w-4xl flex-col items-center justify-center px-[calc(var(--frame)+1.25rem)] pb-[max(calc(var(--frame)+4rem),env(safe-area-inset-bottom))] pt-[calc(var(--frame)+3.5rem)] text-center sm:px-[calc(var(--frame)+2rem)] sm:pt-[calc(var(--frame)+4.5rem)]">
      {/* The logo's place: empty. The one logo glides in from the flash and rests here (Sting). */}
      <span ref={slot} aria-hidden className="relative block size-16 sm:size-20" />
      <m.h2
        style={title}
        className="mt-6 text-balance text-[clamp(2.25rem,1.1rem+4.6vw,5.25rem)] font-semibold leading-[0.95] tracking-[-0.04em] text-[#F2EDE8]"
      >
        {T.title}
      </m.h2>
      <m.div style={ctas} className="mt-8 w-full sm:w-auto">
        <PrimaryCtas />
      </m.div>
      <m.div style={more} className="mt-6">
        <MoreLinks />
      </m.div>
      <m.div style={fine} className="mt-8 sm:mt-10">
        <Credits />
      </m.div>
    </div>
  );
}
