'use client';

import { m, useTransform, type MotionValue } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { CH1, CH1_CHATS, CH1_QUESTION } from '../../data/strings/page-ch1';
import { WHEN } from '../../data/story';
import { LOCK_WALLPAPER, LockScreen, PHONE_RADIUS, PhoneFrame, Slab, lockDate, lockTime } from '../../frames';
import { camera, enter, exit, lerp, r2, seg, window4 } from '../cinema/ease';
import { Flare, LightSweep, Particles, useCamera, useReveal, useRumble } from '../cinema/fx';
import { Illustrative, Shot, Slate, Subtitles, type Line } from '../cinema/shot';
import { Morph } from '../cinema/morph';
import { Viewfinder } from '../cinema/viewfinder';
import { useLayout } from '../motion';
import type { Layout } from '../sky/choreography';
import { JobCard } from './ch1-job-card';
import { CH1_SHOT } from './ch1-timing';

/**
 * Ch1 · Wednesday, 11:42 PM (05-cinema.md §3): one continuous shot.
 *
 *   0.00–0.12  through the iris (cinema/cuts.tsx): a zoom in on Mika's phone, the
 *              only light in the room; gold hairlines (thirds, an aperture) draw in
 *   0.13–0.40  three group chats fly out of it as cards; "Seen by 14"
 *   0.42–0.55  the cards fall away into depth, unanswered
 *   0.50–0.64  the camera pushes through the screen (wind, a bloom); the chat
 *              bubble morphs into the job card's square
 *   0.58–0.88  the job post: each role with its tool and its rate; a viewfinder
 *              hunts and locks on Post it, which presses (rumble) at 0.79
 *   0.88–1.00  the post rises as a star and the night opens back to the sky
 */

const SLATES: readonly Line[] = [{ text: CH1.slate, from: 0, to: 0.97 }];
const LINES: readonly Line[] = [
  { text: CH1.lines[0], from: 0.03, to: 0.25 },
  { text: CH1.lines[1], from: 0.27, to: 0.5 },
  { text: CH1.lines[2], from: 0.62, to: 0.88 },
];

/** When each chat lands, and when they all fall away. */
const ARRIVE = [0.13, 0.19, 0.25] as const;
const SEEN = 0.31;
const FALL = 0.42;
/** Post it: the press, the rumble and the stamp. */
const POST = 0.79;

/** Where the chats settle around the phone, vw / vh from its centre. */
const SPOT: Record<'wide' | 'narrow', readonly { x: number; y: number; ry: number }[]> = {
  wide: [
    { x: -25, y: -16, ry: 14 },
    { x: 24, y: -5, ry: -14 },
    { x: -21, y: 15, ry: 12 },
  ],
  narrow: [
    { x: -6, y: -24, ry: 8 },
    { x: 6, y: -9, ry: -8 },
    { x: -4, y: 6, ry: 6 },
  ],
};

/** The hero's anchor: a little high on phones, so the subtitles have the lower third. */
const ANCHOR = 'absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2 lg:top-1/2';

export default function Ch1Film() {
  const [wide] = useState(() => window.innerWidth >= 1024);
  return <Shot length={CH1_SHOT}>{(progress) => <Frame progress={progress} motes={wide ? 24 : 12} />}</Shot>;
}

function Frame({ progress, motes }: { progress: MotionValue<number>; motes: number }) {
  const layout = useLayout();
  const night = useTransform(progress, (p) => r2(1 - exit(seg(p, 0.9, 0.99))));
  const backdrop = useTransform(night, (v) => r2(v * 0.94));
  return (
    <>
      <h2 className="sr-only">{CH1.lines[0]}</h2>
      {/* The room at night: it closes over the sky, and opens again as the post goes up. */}
      <m.div aria-hidden style={{ opacity: backdrop }} className="absolute inset-0 bg-[radial-gradient(90%_70%_at_50%_45%,#1A1512_0%,#0E0C0B_60%,#080706_100%)]" />
      <Geometry progress={progress} />
      <Phone progress={progress} />
      {CH1_CHATS.map((chat, i) => (
        <Chat key={chat.title} progress={progress} layout={layout} i={i} title={chat.title} sent={chat.sent} seen={chat.seen} />
      ))}
      <Particles progress={progress} push={[0.5, 0.68]} count={motes} seed={11} />
      <Flare progress={progress} from={0.55} to={0.68} x={50} y={46} size={760} />
      <BubbleToCard progress={progress} />
      <Job progress={progress} />
      <LightSweep progress={progress} from={0.76} to={0.9} />
      <PostStar progress={progress} />
      <Flare progress={progress} from={0.88} to={1} x={50} y={16} size={420} />
      <Slate progress={progress} slates={SLATES} />
      <m.div aria-hidden style={{ opacity: night }} className="pointer-events-none absolute inset-0 z-30">
        <Illustrative />
      </m.div>
      <Subtitles progress={progress} lines={LINES} />
    </>
  );
}

/** An aperture hexagon on a 100-unit box, flat side down. */
const HEX = Array.from({ length: 6 }, (_, i) => {
  const a = (Math.PI / 3) * i + Math.PI / 6;
  return `${r2(50 + 48 * Math.cos(a))},${r2(50 + 48 * Math.sin(a))}`;
}).join(' ');

/**
 * The backdrop's geometry (cinema brief addendum): the rule of thirds and two
 * aperture hexagons in gold hairlines, low in opacity. The thirds draw in
 * (scaleX / scaleY) and drift; the hexagons open and turn slowly with the
 * camera, swell on the push through the glass, and ease out as the night opens.
 */
function Geometry({ progress }: { progress: MotionValue<number> }) {
  const life = useTransform(progress, (p) => r2(enter(seg(p, 0, 0.08)) * (1 - exit(seg(p, 0.86, 0.95)))));
  const drawX = useTransform(progress, (p) => `scaleX(${r2(camera(seg(p, 0.01, 0.14)))})`);
  const drawY = useTransform(progress, (p) => `scaleY(${r2(camera(seg(p, 0.03, 0.16)))})`);
  const thirds = useTransform(progress, (p) => `translate3d(0,${r2(lerp(2, -3, p))}vh,0) scale(${r2(1 + 0.35 * camera(seg(p, 0.5, 0.64)))})`);
  const outer = useTransform(
    progress,
    (p) => `translate(-50%,-50%) rotate(${r2(lerp(-10, 14, p))}deg) scale(${r2(lerp(0.7, 1, camera(seg(p, 0, 0.2))) * (1 + 0.9 * camera(seg(p, 0.5, 0.64))))})`,
  );
  const inner = useTransform(
    progress,
    (p) => `translate(-50%,-50%) rotate(${r2(lerp(18, -8, p))}deg) scale(${r2(lerp(0.5, 0.62, camera(seg(p, 0.02, 0.24))) * (1 + 1.4 * camera(seg(p, 0.5, 0.64))))})`,
  );
  return (
    <m.div aria-hidden style={{ opacity: life }} className="pointer-events-none absolute inset-0">
      <m.div style={{ transform: thirds }} className="absolute inset-[8%]">
        {[33.333, 66.667].map((at) => (
          <m.span key={`h${at}`} style={{ top: `${at}%`, transform: drawX }} className="absolute inset-x-0 h-px bg-[#D18A5A]/[0.14]" />
        ))}
        {[33.333, 66.667].map((at) => (
          <m.span key={`v${at}`} style={{ left: `${at}%`, transform: drawY }} className="absolute inset-y-0 w-px bg-[#D18A5A]/[0.1]" />
        ))}
      </m.div>
      {[
        { transform: outer, alpha: 0.16 },
        { transform: inner, alpha: 0.12 },
      ].map(({ transform, alpha }, i) => (
        <m.svg key={i} viewBox="0 0 100 100" style={{ transform }} className="absolute left-1/2 top-[44%] size-[96vmin] lg:top-1/2" fill="none">
          <polygon points={HEX} stroke="#F0C88E" strokeOpacity={alpha} strokeWidth="1" vectorEffect="non-scaling-stroke" />
        </m.svg>
      ))}
    </m.div>
  );
}

/** Mika's phone on the lock screen: the only light in the room. The camera dollies in, orbits, then pushes through the glass. */
function Phone({ progress }: { progress: MotionValue<number> }) {
  const transform = useCamera(progress, [
    { at: 0, scale: 0.42, y: 10, rx: 24, ry: -32 },
    { at: 0.06, scale: 0.7, y: 5, rx: 14, ry: -22 },
    { at: 0.2, scale: 0.86, y: 2, rx: 8, ry: -14 },
    { at: 0.42, scale: 0.92, rx: 4, ry: 12 },
    { at: 0.52, scale: 1 },
    { at: 0.63, scale: 4.2 },
    { at: 1, scale: 4.2 },
  ]);
  const opacity = useTransform(progress, (p) => r2((0.55 + 0.45 * enter(seg(p, 0, 0.06))) * (1 - seg(p, 0.57, 0.63))));
  const glow = useTransform(opacity, (v) => r2(v * 0.9));
  return (
    <>
      <m.div
        aria-hidden
        style={{ opacity: glow }}
        className={`${ANCHOR} pointer-events-none size-[120vmin] rounded-full bg-[radial-gradient(closest-side,rgba(240,200,142,0.16),rgba(209,138,90,0.06)_45%,rgba(209,138,90,0)_100%)]`}
      />
      <div aria-hidden className={ANCHOR}>
        <m.div style={{ transform, opacity }}>
          <Slab depth={14} radius={PHONE_RADIUS} edge="device" shadow={false} className="w-[calc(min(60svh,620px)*0.4615)]">
            <PhoneFrame width="100%" time={lockTime(WHEN.panic)} screen={LOCK_WALLPAPER}>
              <LockScreen time={lockTime(WHEN.panic)} date={lockDate(WHEN.panic)} />
            </PhoneFrame>
          </Slab>
        </m.div>
      </div>
    </>
  );
}

/** One group chat as a card in depth: it flies out of the phone, gets its receipt, and falls away unanswered. */
function Chat({ progress, layout, i, title, sent, seen }: { progress: MotionValue<number>; layout: MotionValue<Layout>; i: number; title: string; sent: string; seen: string }) {
  const at = ARRIVE[i];
  const fall = FALL + i * 0.015;
  const transform = useTransform(progress, (p) => {
    const spot = SPOT[layout.get().mobile ? 'narrow' : 'wide'][i];
    const a = enter(seg(p, at, at + 0.07));
    const f = camera(seg(p, fall, fall + 0.1));
    const x = lerp(0, spot.x, a);
    const y = lerp(0, spot.y, a) + f * 24;
    const z = lerp(-220, 40, a) - f * 720;
    return `perspective(1200px) translate3d(${r2(x)}vw,${r2(y)}vh,${r2(z)}px) rotateX(${r2(f * 36)}deg) rotateY(${r2(lerp(0, spot.ry, a))}deg) scale(${r2(lerp(0.5, 1, a))})`;
  });
  const opacity = useTransform(progress, (p) => r2(enter(seg(p, at, at + 0.05)) * (1 - seg(p, fall + 0.03, fall + 0.1))));
  const turn = SEEN + i * 0.02;
  const before = useTransform(progress, (p) => r2(1 - seg(p, turn, turn + 0.02)));
  const after = useTransform(progress, (p) => r2(seg(p, turn, turn + 0.02)));
  return (
    <div aria-hidden className={`${ANCHOR} z-10`}>
      <m.div
        style={{ transform, opacity }}
        className="w-[min(76vw,300px)] rounded-2xl border border-[#2F2925] bg-[#1C1815] p-4 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.05)]"
      >
        <p className="truncate text-[15px] font-semibold text-[#F2EDE8]">{title}</p>
        <p className="ml-auto mt-3 w-fit max-w-[88%] rounded-2xl rounded-br-md bg-[#A85D35] px-3.5 py-2 text-[15px] leading-snug text-white">{CH1_QUESTION}</p>
        <p className="mt-1.5 grid justify-items-end text-[15px]">
          <m.span style={{ opacity: before }} className="col-start-1 row-start-1 text-[#A08E84]">
            {sent}
          </m.span>
          <m.span style={{ opacity: after }} className={`col-start-1 row-start-1 ${i === 0 ? 'font-semibold text-[#F0C88E]' : 'text-[#BCADA3]'}`}>
            {seen}
          </m.span>
        </p>
      </m.div>
    </div>
  );
}

/** The job post, on the other side of the glass: rows play in with their tools, Post it presses, the stamp lands. */
function Job({ progress }: { progress: MotionValue<number> }) {
  const transform = useCamera(progress, [
    { at: 0.56, scale: 0.6, y: 6, rx: 14, ry: -22 },
    { at: 0.7, scale: 1, rx: 5, ry: -8 },
    { at: 0.86, scale: 1.03, rx: 2, ry: 8 },
    { at: 0.97, scale: 0.28, y: -30, rx: 16, ry: 10 },
  ]);
  const opacity = useTransform(progress, (p) => r2(enter(seg(p, 0.58, 0.66)) * (1 - seg(p, 0.9, 0.96))));
  const shake = useRef<HTMLDivElement>(null);
  useRumble(progress, POST, shake);
  const anchor = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLSpanElement>(null);
  const focus = useFocusOn(anchor, button);
  return (
    <>
      {/* Through the lens: brackets close, the grid draws, the focus box hunts and locks on Post it at ~0.77. */}
      <Viewfinder progress={progress} from={0.66} to={0.92} focus={focus} />
      <div ref={anchor} className={`${ANCHOR} z-10 w-[min(88vw,420px)]`}>
        <m.div style={{ transform, opacity }}>
          <div ref={shake}>
            <JobCard
              wrapRow={(node, i) => (
                <Reveal progress={progress} at={0.66 + i * 0.035} out={0.86 + i * 0.012}>
                  {node}
                </Reveal>
              )}
              wrapButton={(node) => (
                <Press progress={progress} target={button}>
                  {node}
                </Press>
              )}
              wrapStamp={(node) => <Stamp progress={progress}>{node}</Stamp>}
            />
          </div>
        </m.div>
      </div>
    </>
  );
}

/**
 * Where the button sits in the viewfinder's frame (inset 6%, 7% from sm), in
 * %: measured from layout offsets, which ignore the camera's transforms, so
 * it is the card's rest pose. Re-measured on resize, never per frame.
 */
function useFocusOn(anchor: RefObject<HTMLDivElement | null>, button: RefObject<HTMLSpanElement | null>) {
  const [focus, setFocus] = useState({ x: 40, y: 70 });
  useEffect(() => {
    const a = anchor.current;
    const b = button.current;
    if (!a || !b) return;
    const measure = () => {
      const W = window.innerWidth;
      const H = window.innerHeight;
      const inset = W >= 640 ? 0.07 : 0.06;
      // The anchor is centred on its left/top by a -50% translate; the button's offsetParent is the anchor.
      const x = a.offsetLeft - a.offsetWidth / 2 + b.offsetLeft + b.offsetWidth / 2;
      const y = a.offsetTop - a.offsetHeight / 2 + b.offsetTop + b.offsetHeight / 2;
      const fx = ((x - inset * W) / (W * (1 - 2 * inset))) * 100;
      const fy = ((y - inset * H) / (H * (1 - 2 * inset))) * 100;
      setFocus({ x: Math.round(fx * 10) / 10, y: Math.round(fy * 10) / 10 });
    };
    // The observer measures once on observe, then on every resize of the card.
    const ro = new ResizeObserver(measure);
    ro.observe(a);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [anchor, button]);
  return focus;
}

function Reveal({ progress, at, out, children }: { progress: MotionValue<number>; at: number; out: number; children: ReactNode }) {
  const { opacity, transform } = useReveal(progress, at, at + 0.045, out, out + 0.04, { y: 18 });
  return <m.div style={{ opacity, transform }}>{children}</m.div>;
}

function Press({ progress, target, children }: { progress: MotionValue<number>; target: RefObject<HTMLSpanElement | null>; children: ReactNode }) {
  const transform = useTransform(progress, (p) => `scale(${r2(1 - 0.07 * Math.max(0, 1 - Math.abs(p - POST) / 0.012))})`);
  const opacity = useTransform(progress, (p) => r2(0.45 + 0.55 * seg(p, 0.72, 0.76)));
  return (
    <m.span ref={target} style={{ transform, opacity }} className="inline-flex">
      {children}
    </m.span>
  );
}

function Stamp({ progress, children }: { progress: MotionValue<number>; children: ReactNode }) {
  const { opacity, transform } = useReveal(progress, POST, POST + 0.04, 0.88, 0.92, { y: 10, scale: 1.4 });
  return (
    <m.span style={{ opacity, transform }} className="inline-flex origin-left">
      {children}
    </m.span>
  );
}

/** The post goes up as a small star, and the night opens back onto the sky (the hand-off to Ch2). */
/**
 * The morph (cinema brief addendum 2): as the camera goes through the glass,
 * a gold chat bubble swells toward us and squares off into the job
 * card, which takes its place. Small: one path, under a scale and a fade.
 */
function BubbleToCard({ progress }: { progress: MotionValue<number> }) {
  const opacity = useTransform(progress, (p) => r2(window4(p, 0.49, 0.53, 0.6, 0.65)));
  const transform = useTransform(progress, (p) => `scale(${r2(lerp(0.45, 1.25, camera(seg(p, 0.49, 0.64))))})`);
  return (
    <div aria-hidden className={`${ANCHOR} z-10`}>
      <m.div style={{ opacity, transform }}>
        <Morph
          progress={progress}
          keys={[
            { at: 0.53, shape: 'bubble' },
            { at: 0.62, shape: 'square' },
          ]}
          fill="rgba(240,200,142,0.22)"
          stroke="#F0C88E"
          className="size-[min(62vw,320px)]"
        />
      </m.div>
    </div>
  );
}

function PostStar({ progress }: { progress: MotionValue<number> }) {
  const transform = useTransform(progress, (p) => `translate3d(0,${r2(-34 * camera(seg(p, 0.88, 1)))}vh,0) scale(${r2(lerp(0.6, 1.2, enter(seg(p, 0.88, 0.94))))})`);
  const opacity = useTransform(progress, (p) => r2(window4(p, 0.88, 0.91, 0.97, 1)));
  return (
    <div aria-hidden className={`${ANCHOR} z-20`}>
      <m.span style={{ transform, opacity }} className="block size-3.5 rounded-full bg-[#FFE7C2] shadow-[0_0_24px_8px_rgba(240,200,142,0.55)]" />
    </div>
  );
}
