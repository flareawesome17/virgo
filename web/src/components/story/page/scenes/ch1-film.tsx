'use client';

import { m, useTransform, type MotionValue } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { CH1, CH1_CHATS, CH1_QUESTION } from '../../data/strings/page-ch1';
import { WHEN } from '../../data/story';
import { LOCK_WALLPAPER, LockScreen, PHONE_RADIUS, PhoneFrame, Slab, lockDate, lockTime } from '../../frames';
import { camera, enter, exit, lerp, r2, seg, window4 } from '../cinema/ease';
import { Flare, LightSweep, Particles, useCamera, useReveal } from '../cinema/fx';
import { Float } from '../cinema/float';
import { Illustrative, Shot, Slate, Subtitles, type Line } from '../cinema/shot';
import { Viewfinder } from '../cinema/viewfinder';
import { useLayout } from '../motion';
import type { Layout } from '../sky/choreography';
import { JobCard } from './ch1-job-card';
import { CH1_SHOT } from './ch1-timing';

/**
 * Ch1 · Wednesday, 11:42 PM (05-cinema.md §3): one continuous shot.
 *
 *   0.00–0.12  through the iris (cinema/cuts.tsx): a zoom in on Mika's phone, the
 *              only light in the room
 *   0.13–0.40  three group chats fly out of it as cards; "Seen by 14"
 *   0.42–0.55  the cards fall away into depth, unanswered
 *   0.50–0.64  the camera pushes through the screen (wind, a bloom) into the
 *              job card
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
const ANCHOR = 'absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2 lg:top-[45%]';

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
      <Phone progress={progress} />
      {CH1_CHATS.map((chat, i) => (
        <Chat key={chat.title} progress={progress} layout={layout} i={i} title={chat.title} sent={chat.sent} seen={chat.seen} />
      ))}
      <Particles progress={progress} push={[0.5, 0.68]} count={motes} seed={11} />
      <Flare progress={progress} from={0.55} to={0.68} x={50} y={46} size={760} />
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
          <Float amp={6} tilt={1.8}>
            <Slab depth={14} radius={PHONE_RADIUS} edge="device" shadow={false} className="w-[calc(min(60svh,620px)*0.4615)]">
              <PhoneFrame width="100%" time={lockTime(WHEN.panic)} screen={LOCK_WALLPAPER}>
                <LockScreen time={lockTime(WHEN.panic)} date={lockDate(WHEN.panic)} />
              </PhoneFrame>
            </Slab>
          </Float>
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
      <Float delay={1.1 + i * 1.7} amp={8} tilt={2.2} duration={5.8 + i * 0.6}>
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
      </Float>
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
            <Float delay={0.8} amp={6} tilt={1.4} duration={7}>
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
            </Float>
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
function PostStar({ progress }: { progress: MotionValue<number> }) {
  const transform = useTransform(progress, (p) => `translate3d(0,${r2(-34 * camera(seg(p, 0.88, 1)))}vh,0) scale(${r2(lerp(0.6, 1.2, enter(seg(p, 0.88, 0.94))))})`);
  const opacity = useTransform(progress, (p) => r2(window4(p, 0.88, 0.91, 0.97, 1)));
  return (
    <div aria-hidden className={`${ANCHOR} z-20`}>
      <m.span style={{ transform, opacity }} className="block size-3.5 rounded-full bg-[#FFE7C2] shadow-[0_0_24px_8px_rgba(240,200,142,0.55)]" />
    </div>
  );
}
