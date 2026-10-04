'use client';

import { m, useTransform, type MotionValue } from 'framer-motion';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { APPLICANT_ORDER, type Hire } from '../../data/strings/ch3';
import { CH3 } from '../../data/strings/page-ch3';
import { Slab } from '../../frames';
import { ApplicantRow } from '../../mocks/applicant-row';
import { HiredTermsCard } from '../../mocks/hired-terms-card';
import { camera, enter, lerp, r2, seg, window4 } from '../cinema/ease';
import { Flare, LightSweep, Particles, useCamera, useReveal } from '../cinema/fx';
import { GearArt, ROLE_GEAR, type GearKind } from '../cinema/gear';
import { Morph } from '../cinema/morph';
import { Illustrative, Shot, Slate, Subtitles, type Line } from '../cinema/shot';
import { useChapterProgress } from '../motion';
import { usePublishSky } from '../sky-stage';
import { connectFrame } from '../sky/connect';
import { CH3_SHOT } from './ch3-timing';

/**
 * Ch3's film (05-cinema.md §3, Ch3): one continuous take over the shared sky.
 *
 * - The applications arrive as cards out of the dark, each with its role's
 *   tool, while on the ground three threads run to Mika (sky/connect.ts).
 * - She accepts each of them: the rows turn, a gold sweep crosses the frame.
 * - The camera pushes through the cards to the terms Ernie was hired on, a
 *   3D card with the rate on it; he confirms them (a flare).
 * - The card pulls back into the sky and becomes a star, and from Earth the
 *   four of them line up as Virgo.
 *
 * Loaded lazily by islands/ch3.tsx, only with the motion gate on.
 * Transform and opacity only; nothing re-renders on scroll.
 */

const GEAR: Record<Hire, { kind: GearKind; size: string; tilt: number }> = {
  ernie: { kind: ROLE_GEAR.videographer, size: 'h-[44px] w-[70px] lg:h-[64px] lg:w-[102px]', tilt: -6 },
  kenn: { kind: ROLE_GEAR.editor, size: 'h-[40px] w-[62px] lg:h-[56px] lg:w-[87px]', tilt: 4 },
  bea: { kind: ROLE_GEAR.hmua, size: 'h-[76px] w-[23px] lg:h-[104px] lg:w-[31px]', tilt: 28 },
};

/** Each hire's beats on the take's clock. Ernie applied first; the list draws the newest on top. */
const BEATS: Record<Hire, { arrive: number; accept: number }> = {
  ernie: { arrive: 0.02, accept: 0.26 },
  kenn: { arrive: 0.07, accept: 0.29 },
  bea: { arrive: 0.12, accept: 0.32 },
};
/** The camera pushes through the applicant cards. */
const ROWS_OUT = [0.4, 0.5] as const;
/** The terms card: in, Confirm, back into the sky. */
const TERMS = { in: [0.44, 0.56], confirm: 0.6, out: [0.7, 0.79] } as const;

const LINES: readonly Line[] = [
  { text: CH3.applied, from: 0.04, to: 0.42 },
  { text: CH3.rate, from: 0.46, to: 0.76 },
  { text: CH3.consent, from: 0.8, to: 1.06 },
];
const SLATES: readonly Line[] = [{ text: CH3.slate, from: -0.1, to: 1.1 }];

/**
 * The take's clock → the sky choreography's (`connect`): the threads land
 * while the cards arrive, the camera turns up to the sky behind the terms,
 * and Virgo forms once the frame is clear (q 0.72–0.92 ≈ p 0.79–0.94).
 */
const SKY: readonly (readonly [number, number])[] = [
  [0, 0],
  [0.14, 0.1],
  [0.62, 0.5],
  [0.96, 0.95],
  [1, 1],
];

function skyClock(p: number) {
  if (p <= 0) return 0;
  for (let i = 1; i < SKY.length; i++) {
    const [a, qa] = SKY[i - 1];
    const [b, qb] = SKY[i];
    if (p <= b) return lerp(qa, qb, (p - a) / (b - a));
  }
  return 1;
}

const narrowQuery = '(max-width: 1023px)';
const subscribeNarrow = (cb: () => void) => {
  const mq = window.matchMedia(narrowQuery);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};
/** Phones and tablets get half the particles (cinema brief). */
function useNarrow() {
  return useSyncExternalStore(subscribeNarrow, () => window.matchMedia(narrowQuery).matches, () => true);
}

export default function Ch3Scene() {
  const wrap = useRef<HTMLDivElement>(null);
  // The sky runs on the chapter's cover clock, so it starts as the chapter enters
  // (no jump from Ch2's last frame), mapped back onto the take's own clock.
  const cover = useChapterProgress(wrap, 'cover');
  const size = useRef({ h: 1, v: 1 });
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => {
      size.current = { h: el.offsetHeight, v: window.innerHeight };
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  usePublishSky(cover, (c, l) => {
    const { h, v } = size.current;
    const p = h > v ? (c * (h + v) - v) / (h - v) : c;
    return connectFrame(skyClock(p), l);
  });
  return (
    <div ref={wrap}>
      <Shot length={CH3_SHOT}>{(p) => <Frame p={p} />}</Shot>
    </div>
  );
}

function Frame({ p }: { p: MotionValue<number> }) {
  const narrow = useNarrow();
  const cam = useCamera(p, [
    { at: 0, scale: 0.9, y: 2, rx: 8, ry: -10 },
    { at: 0.3, scale: 1, y: 0, rx: 3, ry: -2 },
    { at: 0.46, scale: 1.03, y: -1, rx: 1, ry: 5 },
    { at: 0.72, scale: 1.06, y: 0, rx: 3, ry: -5 },
    { at: 1, scale: 1.1, y: -2, rx: -2, ry: 2 },
  ]);
  // A dark pool behind the cards so they read over the sky; it lifts as Virgo forms.
  const pool = useTransform(p, (v) => r2(0.75 * window4(v, 0.02, 0.12, 0.7, 0.8)));
  const glow = useTransform(p, (v) => r2(window4(v, 0, 0.12, 0.7, 0.8) * (0.4 + 0.5 * window4(v, 0.25, 0.3, 0.36, 0.46))));
  const tag = useTransform(p, (v) => r2(1 - seg(v, 0.74, 0.79)));
  // The card's last point of light becomes a star (a morph, circle → sparkle) as Virgo forms.
  const star = useTransform(p, (v) => r2(window4(v, 0.75, 0.78, 0.86, 0.92)));

  return (
    <>
      <m.div aria-hidden style={{ opacity: pool }} className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_55%_at_50%_42%,rgba(14,12,11,0.92)_0%,rgba(14,12,11,0.6)_55%,rgba(14,12,11,0)_100%)]" />
      <m.div aria-hidden style={{ opacity: glow }} className="pointer-events-none absolute inset-0 bg-[radial-gradient(40%_38%_at_50%_42%,rgba(209,138,90,0.32)_0%,rgba(209,138,90,0)_100%)]" />

      <ConstellationLines p={p} />

      <Slate progress={p} slates={SLATES} />
      <m.div style={{ opacity: tag }}>
        <Illustrative />
      </m.div>

      {/* The hero band, clear of the slate above and the subtitles below. */}
      <div aria-hidden className="absolute inset-x-0 bottom-[33svh] top-[9svh] lg:bottom-[27svh] lg:top-[7svh]">
        <m.div style={{ transform: cam }} className="relative grid size-full place-items-center">
          <div className="col-start-1 row-start-1 flex w-[min(86vw,360px)] flex-col lg:gap-3">
            {APPLICANT_ORDER.map((hire, slot) => (
              <ApplicantCard key={hire} p={p} hire={hire} slot={slot} />
            ))}
          </div>
          <div className="col-start-1 row-start-1">
            <TermsCard p={p} />
          </div>
          <m.div style={{ opacity: star }} className="absolute left-1/2 top-[calc(50%-8vh)] size-9 -translate-x-1/2 -translate-y-1/2">
            <span className="absolute -inset-7 rounded-full bg-[radial-gradient(circle,rgba(240,200,142,0.5)_0%,rgba(240,200,142,0)_65%)]" />
            <Morph progress={p} keys={[{ at: 0.77, shape: 'circle' }, { at: 0.84, shape: 'sparkle' }]} className="relative size-full" fill="#FFF0D6" />
          </m.div>
        </m.div>
      </div>

      <LightSweep progress={p} from={0.24} to={0.42} />
      <Flare progress={p} from={0.57} to={0.72} x={50} y={44} size={narrow ? 380 : 560} />
      <Particles progress={p} push={[0.38, 0.56]} count={narrow ? 12 : 24} seed={31} />

      <Subtitles progress={p} lines={LINES} />
    </>
  );
}

/** One application: the row as Mika's phone draws it, as a card in depth, with the role's tool beside it. */
function ApplicantCard({ p, hire, slot }: { p: MotionValue<number>; hire: Hire; slot: number }) {
  const b = BEATS[hire];
  const gear = GEAR[hire];
  const transform = useTransform(p, (v) => {
    const a = enter(seg(v, b.arrive, b.arrive + 0.1));
    // The push: the cards stream past the camera, spreading from the centre.
    const out = camera(seg(v, ROWS_OUT[0] + slot * 0.012, ROWS_OUT[1]));
    const z = lerp(-760, 0, a) + 520 * out;
    const y = lerp(56, 0, a) + (slot - 1) * 70 * out;
    const rx = lerp(22, 0, a) - 8 * out;
    const ry = lerp(slot === 1 ? -16 : 16, 0, a);
    return `perspective(900px) translate3d(0,${r2(y)}px,${r2(z)}px) rotateX(${r2(rx)}deg) rotateY(${r2(ry)}deg)`;
  });
  const opacity = useTransform(p, (v) => r2(enter(seg(v, b.arrive, b.arrive + 0.05)) * (1 - seg(v, ROWS_OUT[0] + 0.03, ROWS_OUT[1]))));
  // Accept: the row turns from the buttons to "accepted" and its booking.
  const yes = useTransform(p, (v) => r2(seg(v, b.accept, b.accept + 0.018)));
  const no = useTransform(yes, (v) => r2(1 - v));
  const rim = useTransform(p, (v) => r2(0.3 * seg(v, b.accept, b.accept + 0.02) + 0.7 * window4(v, b.accept, b.accept + 0.012, b.accept + 0.03, b.accept + 0.1)));
  const reveal = useReveal(p, b.arrive + 0.04, b.arrive + 0.1, ROWS_OUT[0], ROWS_OUT[0] + 0.05, { y: 14, scale: 0.8 });
  const tool = useTransform(p, (v) => {
    const k = window4(v, b.accept, b.accept + 0.01, b.accept + 0.02, b.accept + 0.07);
    const drift = Math.sin((v + slot * 0.31) * 16) * 3;
    return `translate3d(0,${r2(drift - 6 * k)}px,0) rotate(${r2(gear.tilt + 5 * k)}deg) scale(${r2(1 + 0.12 * k)})`;
  });
  return (
    <m.div style={{ transform, opacity }} className={`relative ${slot > 0 ? 'max-lg:-mt-[74px]' : ''}`}>
      <div className="grid overflow-hidden rounded-[12px] shadow-[0_24px_48px_-20px_rgba(0,0,0,0.95)] ring-1 ring-[rgba(242,237,232,0.1)]">
        <m.div style={{ opacity: no }} className="col-start-1 row-start-1 bg-[#161311]">
          <ApplicantRow hire={hire} platform="phone" state="new" />
        </m.div>
        <m.div style={{ opacity: yes }} className="col-start-1 row-start-1 bg-[#161311]">
          <ApplicantRow hire={hire} platform="phone" state="accepted" />
        </m.div>
      </div>
      <m.div
        style={{ opacity: rim }}
        className="pointer-events-none absolute -inset-[3px] rounded-[15px] ring-2 ring-[#F0C88E] shadow-[0_0_36px_-4px_rgba(240,200,142,0.65)]"
      />
      <div className="pointer-events-none absolute -top-8 right-4 lg:left-[calc(100%+24px)] lg:right-auto lg:top-1/2 lg:-translate-y-1/2">
        <m.div style={reveal}>
          <m.div style={{ transform: tool }} className={`flex items-center justify-center ${gear.size}`}>
            <GearArt kind={gear.kind} className="size-full" />
          </m.div>
        </m.div>
      </div>
    </m.div>
  );
}

/** Ernie's terms: a card with the rate written on it, turning in the light; he confirms. */
function TermsCard({ p }: { p: MotionValue<number> }) {
  const transform = useTransform(p, (v) => {
    const a = enter(seg(v, TERMS.in[0], TERMS.in[1]));
    const turn = camera(seg(v, TERMS.in[1], TERMS.out[0]));
    // Back into the sky: far and up, where it becomes a star.
    const o = camera(seg(v, TERMS.out[0], TERMS.out[1]));
    const ry = lerp(-32, -8, a) + 16 * turn;
    const rx = lerp(20, 5, a) - 6 * turn - 12 * o;
    const z = lerp(-600, 0, a) - 1500 * o;
    const y = lerp(8, 0, a) - 20 * o;
    return `perspective(1000px) translate3d(0,${r2(y)}vh,${r2(z)}px) rotateX(${r2(rx)}deg) rotateY(${r2(ry)}deg)`;
  });
  const opacity = useTransform(p, (v) => r2(enter(seg(v, TERMS.in[0], TERMS.in[0] + 0.05)) * (1 - seg(v, TERMS.out[0] + 0.04, TERMS.out[1]))));
  const done = useTransform(p, (v) => r2(seg(v, TERMS.confirm, TERMS.confirm + 0.02)));
  const ask = useTransform(done, (v) => r2(1 - v));
  return (
    <m.div style={{ transform, opacity }} className="w-[min(84vw,340px)]">
      <Slab className="w-full" depth={10} radius="rounded-[16px]" edge="card" shadow="drop">
        <div className="grid">
          <m.div style={{ opacity: ask }} className="col-start-1 row-start-1">
            <HiredTermsCard side="creative" state="needs-you" className="h-full" />
          </m.div>
          <m.div style={{ opacity: done }} className="col-start-1 row-start-1">
            <HiredTermsCard side="creative" state="confirmed" className="h-full" />
          </m.div>
        </div>
      </Slab>
    </m.div>
  );
}

/**
 * The scene's geometry (cinema brief, addendum): faint constellation lines
 * that draw in one by one (scaleX) while the applications arrive, drifting
 * slower than the cards and zooming with the take. They give way as the real
 * Virgo forms in the sky. Coordinates are % of a square, so angles hold at
 * any aspect.
 */
const NODES: readonly (readonly [number, number])[] = [
  [14, 34], [28, 24], [41, 36], [56, 27], [71, 38], [86, 26], [62, 55], [45, 52], [30, 66], [55, 74], [80, 64],
];
const EDGES: readonly (readonly [number, number])[] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [2, 7], [7, 6], [6, 4], [7, 8], [6, 9], [6, 10],
];
const SEGMENTS = EDGES.map(([i, j]) => {
  const [x1, y1] = NODES[i];
  const [x2, y2] = NODES[j];
  return { x: x1, y: y1, len: Math.hypot(x2 - x1, y2 - y1), deg: (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI };
});

function ConstellationLines({ p }: { p: MotionValue<number> }) {
  const drift = useTransform(p, (v) => {
    const t = camera(seg(v, 0, 1));
    return `translate3d(-50%,${r2(-50 - 4 * t)}%,0) rotate(${r2(-3 + 6 * t)}deg) scale(${r2(0.92 + 0.22 * t)})`;
  });
  const opacity = useTransform(p, (v) => r2(window4(v, -0.05, 0.06, 0.64, 0.76)));
  return (
    <m.div
      aria-hidden
      style={{ transform: drift, opacity }}
      className="pointer-events-none absolute left-1/2 top-[42%] aspect-square w-[max(120vw,120vh)]"
    >
      {SEGMENTS.map((sg, i) => (
        <Rule key={i} p={p} at={0.02 + i * 0.025} {...sg} />
      ))}
      {NODES.map(([x, y], i) => (
        <span key={i} className="absolute size-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[rgba(240,200,142,0.5)]" style={{ left: `${x}%`, top: `${y}%` }} />
      ))}
    </m.div>
  );
}

function Rule({ p, at, x, y, len, deg }: { p: MotionValue<number>; at: number; x: number; y: number; len: number; deg: number }) {
  const transform = useTransform(p, (v) => `rotate(${r2(deg)}deg) scaleX(${r2(enter(seg(v, at, at + 0.08)))})`);
  return (
    <m.span
      style={{ transform, left: `${x}%`, top: `${y}%`, width: `${len}%` }}
      className="absolute h-px origin-left bg-[linear-gradient(90deg,rgba(240,200,142,0.28),rgba(240,200,142,0.12))]"
    />
  );
}
