'use client';

import { m, useTransform, type MotionValue } from 'framer-motion';
import { CalendarDays, Clock, MapPin, type LucideIcon } from 'lucide-react';
import { useRef, useSyncExternalStore, type ReactNode } from 'react';
import { CALL_ROLL, EVENT, GUEST_NAME, NOTICES_CH4, RINGS, type Guest } from '../../data/strings/ch4';
import { TODAY } from '../../data/strings/common';
import { CH4 } from '../../data/strings/page-ch4';
import { WHEN } from '../../data/story';
import { LOCK_WALLPAPER, LockNotification, LockScreen, PhoneFrame, lockDate, lockTime } from '../../frames';
import { NotificationList, NotificationRow } from '../../mocks/notification-row';
import { camera, enter, lerp, r2, seg, window4 } from '../cinema/ease';
import { Flare, LightSweep, Particles, useReveal } from '../cinema/fx';
import { Float } from '../cinema/float';
import { GearArt, ROLE_GEAR, type GearKind } from '../cinema/gear';
import { Illustrative, Shot, Slate, Subtitles, type Line } from '../cinema/shot';
import { CH4_SHOT } from './ch4-timing';

/**
 * Ch4's film (05-cinema.md §3, Ch4): one take, Friday night to Saturday dawn.
 *
 * - FRIDAY · 9:20 PM. The iris (cinema/cuts.tsx) opens on the wedding's event
 *   card and the camera zooms in. Its call time rolls 6:30 → 6:00.
 * - The card steps back and the crew's three phones rise in a row in depth;
 *   they all light at once with the same notice.
 * - The camera pushes through the middle phone's screen into the dark.
 * - SATURDAY · 5:00 AM. Mika's phone, no service, and the reminder rings: a
 *   rumble, a flare, two sound rings. Only the reminder; nothing else here
 *   works offline. First light comes up on the horizon.
 *
 * Loaded lazily by islands/ch4.tsx, only with the motion gate on.
 * Transform and opacity only; nothing re-renders on scroll.
 */

/** Beats on the take's clock. */
const AT = {
  /** The opening zoom, as the iris opens. */
  open: [0, 0.16],
  /** The call time rolls. */
  roll: [0.18, 0.23],
  /** The card steps up and back for the phones. */
  step: [0.24, 0.34],
  /** Every phone lights at once. */
  light: 0.35,
  /** Through the middle phone's screen. */
  push: [0.44, 0.57],
  /** Saturday: Mika's phone comes out of the dark. */
  lock: [0.55, 0.68],
  /** It rings. */
  ring: 0.7,
} as const;

const LINES: readonly Line[] = [
  { text: CH4.moved, from: 0.05, to: 0.5 },
  { text: CH4.rings, from: 0.6, to: 1.06, small: CH4.ringsSmall },
];
const SLATES: readonly Line[] = [
  { text: CH4.friday, from: -0.1, to: 0.55 },
  { text: CH4.saturday, from: 0.55, to: 1.1 },
];

const CREW: readonly { guest: Guest; kind: GearKind; gear: string; place: string; side: -1 | 0 | 1 }[] = [
  { guest: 'ernie', kind: ROLE_GEAR.videographer, gear: 'h-[64px] w-[102px]', place: 'left-[19%] lg:left-[36%]', side: -1 },
  { guest: 'kenn', kind: ROLE_GEAR.editor, gear: 'h-[60px] w-[93px]', place: 'left-1/2', side: 0 },
  { guest: 'bea', kind: ROLE_GEAR.hmua, gear: 'h-[110px] w-[33px]', place: 'left-[81%] lg:left-[64%]', side: 1 },
];

const narrowQuery = '(max-width: 1023px)';
const subscribeNarrow = (cb: () => void) => {
  const mq = window.matchMedia(narrowQuery);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};
/** Phones and tablets: half the particles, and the layout's own offsets. */
function useNarrow() {
  return useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia(narrowQuery).matches,
    () => true,
  );
}

export default function Ch4Scene() {
  return <Shot length={CH4_SHOT}>{(p) => <Frame p={p} />}</Shot>;
}

function Frame({ p }: { p: MotionValue<number> }) {
  const narrow = useNarrow();
  // The Friday camera: the opening zoom, a slow orbit, then the push through the middle phone.
  const friday = useTransform(p, (v) => {
    const open = camera(seg(v, AT.open[0], AT.open[1]));
    const push = camera(seg(v, AT.push[0], AT.push[1]));
    const s = lerp(0.6, 1, open) * (1 + 0.05 * seg(v, AT.open[1], AT.push[0])) * (1 + 7 * push * push);
    const rx = lerp(12, 3, open) * (1 - push);
    const ry = lerp(-8, 5, seg(v, 0, AT.push[0])) * (1 - push);
    return `perspective(1200px) rotateX(${r2(rx)}deg) rotateY(${r2(ry)}deg) scale(${r2(s)})`;
  });
  const fridayOn = useTransform(p, (v) => r2(1 - seg(v, AT.push[1] - 0.05, AT.push[1])));
  const sun = useTransform(p, (v) => r2(seg(v, 0.8, 1)));
  const rise = useTransform(p, (v) => `translate3d(0,${r2(30 * (1 - camera(seg(v, 0.8, 1))))}%,0)`);

  return (
    <>
      {/* First light: the horizon comes up as Saturday starts. */}
      <m.div aria-hidden style={{ opacity: sun, transform: rise }} className="pointer-events-none absolute inset-x-0 bottom-0 h-[36svh]">
        <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(107,62,37,0.95)_0%,rgba(107,62,37,0.55)_26%,rgba(61,36,24,0.25)_58%,rgba(22,19,17,0)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(90deg,rgba(232,168,110,0)_0%,rgba(240,200,142,0.9)_50%,rgba(232,168,110,0)_100%)]" />
      </m.div>

      <Slate progress={p} slates={SLATES} />
      <Illustrative />

      {/* ── Friday: the card and the crew's phones, under one camera. ── */}
      <m.div aria-hidden style={{ transform: friday, opacity: fridayOn }} className="absolute inset-0 origin-[50%_44%] lg:origin-[50%_50%]">
        <div className="absolute left-1/2 top-[30%] w-[min(86vw,380px)] -translate-x-1/2 -translate-y-1/2 lg:top-[34%]">
          <EventCard p={p} lift={narrow ? -11 : -17} />
        </div>
        {CREW.map((c, i) => (
          <CrewPhone key={c.guest} p={p} index={i} {...c} />
        ))}
      </m.div>

      {/* ── Saturday, 5:00 AM. ── */}
      <LockPhone p={p} />

      <LightSweep progress={p} from={0.15} to={0.31} />
      <Particles progress={p} push={[0.42, 0.6]} count={narrow ? 12 : 24} seed={44} />
      <Flare progress={p} from={0.68} to={0.86} x={50} y={narrow ? 38 : 43} size={narrow ? 420 : 640} />

      <Subtitles progress={p} lines={LINES} />
    </>
  );
}

/** One item that eases in at `at`, holds, and leaves with its scene (cinema brief, addendum). */
function Reveal({
  p,
  at,
  out = [2, 3],
  y = 16,
  scale = 0.96,
  className = '',
  children,
}: {
  p: MotionValue<number>;
  at: number;
  out?: readonly [number, number];
  y?: number;
  scale?: number;
  className?: string;
  children: ReactNode;
}) {
  const style = useReveal(p, at, at + 0.07, out[0], out[1], { y, scale });
  return (
    <m.div style={style} className={className}>
      {children}
    </m.div>
  );
}

function Detail({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Icon aria-hidden size={18} className="shrink-0 text-[#D18A5A]" />
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#A08E84]">{label}</p>
        <div className="mt-0.5 text-[15px] font-semibold leading-snug">{children}</div>
      </div>
    </div>
  );
}

/** The wedding's event card: its details ease in one by one, then the call time rolls. */
function EventCard({ p, lift }: { p: MotionValue<number>; lift: number }) {
  const step = useTransform(p, (v) => {
    const t = camera(seg(v, AT.step[0], AT.step[1]));
    return `translate3d(0,${r2(lift * t)}vh,0) scale(${r2(1 - 0.45 * t)})`;
  });
  const roll = useTransform(p, (v) => `translate3d(0,${r2(-40 * camera(seg(v, AT.roll[0], AT.roll[1])))}px,0)`);
  const flash = useTransform(p, (v) => r2(window4(v, AT.roll[0], AT.roll[0] + 0.02, AT.roll[1], AT.roll[1] + 0.08)));
  return (
    <m.div style={{ transform: step }}>
      <Reveal p={p} at={-0.08} y={30} scale={0.9}>
        <Float amp={7} tilt={1.8} duration={6.6}>
          <div className="rounded-[22px] border border-[#2A2522] bg-[#1E1B18] p-5 text-[#F2EDE8] shadow-[0_30px_60px_-24px_rgba(0,0,0,0.95)]">
            <Reveal p={p} at={0.04}>
              <span className="inline-block rounded-full bg-[rgba(182,106,64,0.14)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[#D18A5A]">
                {EVENT.type}
              </span>
            </Reveal>
            <Reveal p={p} at={0.07}>
              <p className="mt-3 text-[20px] font-bold leading-tight">{EVENT.title}</p>
            </Reveal>
            <div className="mt-4 divide-y divide-[#2A2522] rounded-[14px] bg-[#161311]">
              <Reveal p={p} at={0.1}>
                <Detail icon={CalendarDays} label={EVENT.labels.date}>
                  {EVENT.date}
                </Detail>
              </Reveal>
              <Reveal p={p} at={0.13} className="relative">
                <m.div
                  style={{ opacity: flash }}
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_90%_at_30%_50%,rgba(240,200,142,0.22),rgba(240,200,142,0))]"
                />
                <Detail icon={Clock} label={EVENT.labels.time}>
                  <span className="flex whitespace-nowrap text-[34px] font-semibold leading-[40px] tracking-[-0.02em] tabular-nums">
                    {CALL_ROLL.hour}
                    <span className="inline-block h-[40px] overflow-hidden">
                      <m.span style={{ transform: roll }} className="flex flex-col">
                        <span className="h-[40px]">{CALL_ROLL.from}</span>
                        <span className="h-[40px] text-[#F0C88E]">{CALL_ROLL.to}</span>
                      </m.span>
                    </span>
                    {CALL_ROLL.suffix}
                  </span>
                </Detail>
              </Reveal>
              <Reveal p={p} at={0.16}>
                <Detail icon={MapPin} label={EVENT.labels.where}>
                  {EVENT.location}
                </Detail>
              </Reveal>
            </div>
          </div>
        </Float>
      </Reveal>
    </m.div>
  );
}

/** A crew member's phone in the row: it rises, lights with the notice at the same instant as the others, and names its owner by their tool. */
function CrewPhone({
  p,
  index,
  guest,
  kind,
  gear,
  place,
  side,
}: {
  p: MotionValue<number>;
  index: number;
  guest: Guest;
  kind: GearKind;
  gear: string;
  place: string;
  side: -1 | 0 | 1;
}) {
  const at = AT.step[0] + 0.01 + index * 0.03;
  const transform = useTransform(p, (v) => {
    const a = enter(seg(v, at, at + 0.09));
    const z = side === 0 ? 0 : -140;
    return `perspective(1000px) translate3d(0,${r2(lerp(40, 0, a))}vh,${z}px) rotateY(${side * -18}deg)`;
  });
  const opacity = useTransform(p, (v) => r2(enter(seg(v, at, at + 0.05))));
  const dark = useTransform(p, (v) => r2(1 - seg(v, AT.light, AT.light + 0.02)));
  const glow = useTransform(p, (v) => r2(window4(v, AT.light, AT.light + 0.02, AT.push[0], AT.push[0] + 0.06)));
  const tag = useReveal(p, AT.light + 0.01 + index * 0.03, AT.light + 0.07 + index * 0.03, AT.push[0], AT.push[0] + 0.04, { y: 18, scale: 0.85 });
  return (
    <div className={`absolute top-[44%] -translate-x-1/2 -translate-y-1/2 lg:top-[50%] ${place}`}>
      <m.div style={{ transform, opacity }}>
        <Float delay={index * 1.6} amp={5} tilt={1.6} duration={5.6 + index * 0.5}>
          <div className="relative w-[240px] scale-[0.46] sm:scale-[0.56] lg:scale-[0.62]">
            <m.div
              style={{ opacity: glow }}
              className="pointer-events-none absolute -inset-16 rounded-full bg-[radial-gradient(closest-side,rgba(240,200,142,0.35),rgba(240,200,142,0))]"
            />
            <PhoneFrame width="100%" time="9:20" ratio={9 / 16}>
              <div className="px-2.5 pt-2">
                <NotificationList platform="phone" heading={TODAY}>
                  <NotificationRow platform="phone" first {...NOTICES_CH4.moved} />
                </NotificationList>
              </div>
            </PhoneFrame>
            {/* The screen asleep, until the notice wakes it. */}
            <m.div style={{ opacity: dark }} className="absolute inset-0 rounded-[38px] bg-[#050404] md:rounded-[46px]" />
            <div className="absolute left-1/2 top-full mt-6 -translate-x-1/2">
              <m.div style={tag} className="flex flex-col items-center gap-3">
                <GearArt kind={kind} className={gear} />
                <span className="font-mono text-[26px] uppercase tracking-[0.16em] text-[#BCADA3]">{GUEST_NAME[guest]}</span>
              </m.div>
            </div>
          </div>
        </Float>
      </m.div>
    </div>
  );
}

/** Saturday, 5:00 AM: Mika's phone, no service. The reminder rings. */
function LockPhone({ p }: { p: MotionValue<number> }) {
  const shake = useRef<HTMLDivElement>(null);
  const transform = useTransform(p, (v) => {
    const a = camera(seg(v, AT.lock[0], AT.lock[1]));
    const d = camera(seg(v, AT.lock[1], 1));
    const s = lerp(0.6, 1, a) * (1 + 0.08 * d);
    return `perspective(1100px) translate3d(0,0,${r2(lerp(-500, 0, a))}px) rotateX(${r2(lerp(12, 4, a) - 2 * d)}deg) rotateY(${r2(lerp(-18, -5, a) + 8 * d)}deg) scale(${r2(s)})`;
  });
  const opacity = useTransform(p, (v) => r2(enter(seg(v, AT.lock[0], AT.lock[0] + 0.07))));
  const note = useReveal(p, AT.ring - 0.01, AT.ring + 0.02, 2, 3, { y: -24, scale: 0.94 });
  return (
    <div aria-hidden className="absolute inset-x-0 bottom-[24svh] top-0 flex items-center justify-center lg:bottom-[14svh]">
      <m.div style={{ transform, opacity }}>
        <div ref={shake}>
          <Float amp={5} tilt={1.4} duration={6.2}>
            <div className="relative w-[300px] scale-[0.62] sm:scale-[0.7] lg:scale-[0.8]">
              {[0, 1].map((i) => (
                <SoundRing key={i} p={p} at={AT.ring + i * 0.06} />
              ))}
              <PhoneFrame width="100%" time="5:00" signal={0} screen={LOCK_WALLPAPER} ratio={9 / 16}>
                <LockScreen time={lockTime(WHEN.reminder)} date={lockDate(WHEN.reminder)}>
                  <m.div style={note}>
                    <LockNotification title={RINGS.title} body={RINGS.body} />
                  </m.div>
                </LockScreen>
              </PhoneFrame>
            </div>
          </Float>
        </div>
      </m.div>
    </div>
  );
}

function SoundRing({ p, at }: { p: MotionValue<number>; at: number }) {
  const transform = useTransform(p, (v) => `scale(${r2(lerp(0.7, 1.9, enter(seg(v, at, at + 0.14))))})`);
  const opacity = useTransform(p, (v) => {
    const t = seg(v, at, at + 0.14);
    return r2(t <= 0 ? 0 : 0.7 * (1 - t));
  });
  return (
    <m.span
      style={{ transform, opacity }}
      className="pointer-events-none absolute left-1/2 top-1/2 -ml-[230px] -mt-[230px] size-[460px] rounded-full border-2 border-[rgba(232,168,110,0.55)] shadow-[0_0_60px_-10px_rgba(232,168,110,0.35),inset_0_0_60px_-10px_rgba(232,168,110,0.25)]"
    />
  );
}
