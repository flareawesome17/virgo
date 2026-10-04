'use client';

import { m, useMotionValue, useTransform, type MotionValue } from 'framer-motion';
import { useEffect } from 'react';
import { DESCENT } from '../../data/strings/page-prologue';
import { camera, r2, seg } from '../cinema/ease';
import { Flare, LightSweep, Particles } from '../cinema/fx';
import { GEAR_ASPECT, GearArt, type GearKind } from '../cinema/gear';
import { Subtitles } from '../cinema/shot';
import { Viewfinder } from '../cinema/viewfinder';
import { usePrologueProgress } from '../islands/prologue';
import { useMotionGate } from '../motion';

/**
 * The opening's film layers (05-cinema.md §1.7, §3 Prologue).
 *
 * `GearConstellation`: the tools of the trade float in depth around the title,
 * joined by faint gold lines, and the first scroll pushes the camera through
 * them. Rendered on the server at rest, so the static page shows them too.
 *
 * `HeroFilm`: particles, a light sweep, the landing flare, the reticle on
 * Mika's star and the two subtitles. Motion only.
 */

type Piece = { kind: GearKind; x: number; y: number; h: number; depth: number; rot: number };

/** Desktop: a ring around the title, clear of the letterbox bars. x/y are % of the frame, h is svh. */
const WIDE: Piece[] = [
  { kind: 'camera', x: 12, y: 36, h: 19, depth: 1, rot: -8 },
  { kind: 'timeline', x: 25, y: 21, h: 9, depth: 0.45, rot: -5 },
  { kind: 'brush', x: 75, y: 20, h: 14, depth: 0.5, rot: 32 },
  { kind: 'cinema', x: 87, y: 36, h: 17, depth: 0.95, rot: 7 },
  { kind: 'mic', x: 93, y: 66, h: 15, depth: 0.6, rot: 16 },
  { kind: 'gimbal', x: 79, y: 76, h: 17, depth: 0.75, rot: -7 },
  { kind: 'lens', x: 22, y: 79, h: 10, depth: 0.5, rot: 0 },
  { kind: 'light', x: 7, y: 70, h: 23, depth: 0.7, rot: 3 },
];

/** Phones: a small constellation in the band above the title. */
const NARROW: Piece[] = [
  { kind: 'camera', x: 24, y: 18, h: 8.5, depth: 1, rot: -8 },
  { kind: 'brush', x: 50, y: 11, h: 6.5, depth: 0.5, rot: 32 },
  { kind: 'cinema', x: 77, y: 18, h: 7.5, depth: 0.9, rot: 7 },
  { kind: 'timeline', x: 51, y: 25, h: 3.6, depth: 0.45, rot: -4 },
];

/** Each list is drawn as a closed ring. */
const ring = (list: Piece[]) => list.map((p, i) => [p, list[(i + 1) % list.length]] as const);

const BOB = '@keyframes gear-bob{0%{transform:translate3d(0,-5px,0) rotate(-1deg)}100%{transform:translate3d(0,5px,0) rotate(1.2deg)}}@keyframes gear-in{0%{opacity:0;transform:translate3d(0,14px,0) scale(.92)}100%{opacity:1;transform:none}}';

export function GearConstellation() {
  const progress = usePrologueProgress();
  const gate = useMotionGate();
  // The pointer, -1…1 from the centre of the frame (desktop parallax).
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  // 1 while the film plays; 0 holds every piece at rest (static page, reduced motion).
  const on = useMotionValue(0);
  useEffect(() => on.set(gate.motion ? 1 : 0), [gate.motion, on]);

  useEffect(() => {
    if (!gate.motion || !window.matchMedia('(pointer: fine)').matches) return;
    const onMove = (e: PointerEvent) => {
      mx.set((e.clientX / window.innerWidth) * 2 - 1);
      my.set((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [gate.motion, mx, my]);

  const fallback = useMotionValue(0);
  const p = progress ?? fallback;
  const lines = useTransform([p, on], ([v, o]: number[]) => (o ? r2(1 - seg(v, 0.02, 0.12)) : 1));

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
      <style>{BOB}</style>
      <Field pieces={WIDE} className="hidden lg:block" progress={p} on={on} mx={mx} my={my} lines={lines} />
      <Field pieces={NARROW} className="lg:hidden" progress={p} on={on} mx={mx} my={my} lines={lines} />
    </div>
  );
}

function Field({
  pieces,
  className,
  progress,
  on,
  mx,
  my,
  lines,
}: {
  pieces: Piece[];
  className: string;
  progress: MotionValue<number>;
  on: MotionValue<number>;
  mx: MotionValue<number>;
  my: MotionValue<number>;
  lines: MotionValue<number>;
}) {
  return (
    <div className={`absolute inset-0 ${className}`}>
      <m.svg style={{ opacity: lines }} className="absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {ring(pieces).map(([a, b], i) => (
          <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#F0C88E" strokeOpacity="0.22" strokeWidth="1" strokeDasharray="2 5" vectorEffect="non-scaling-stroke" />
        ))}
        {pieces.map((a, i) => (
          <circle key={i} cx={a.x} cy={a.y} r="0.35" fill="#F0C88E" fillOpacity="0.7" />
        ))}
      </m.svg>
      {pieces.map((piece, i) => (
        <GearPiece key={piece.kind} piece={piece} index={i} progress={progress} on={on} mx={mx} my={my} />
      ))}
    </div>
  );
}

function GearPiece({
  piece,
  index,
  progress,
  on,
  mx,
  my,
}: {
  piece: Piece;
  index: number;
  progress: MotionValue<number>;
  on: MotionValue<number>;
  mx: MotionValue<number>;
  my: MotionValue<number>;
}) {
  const { x, y, h, depth, rot } = piece;
  // The push: every piece streams out from the centre and past the viewer, nearer ones faster.
  const transform = useTransform([progress, on, mx, my], ([p, o, px, py]: number[]) => {
    const t = o ? camera(seg(p, 0.02, 0.3)) : 0;
    const fly = 1.1 + depth * 1.9;
    const dx = (x - 50) * t * fly;
    const dy = (y - 50) * t * fly;
    const s = 1 + t * (1.4 + depth * 2.6);
    const ry = t * (x < 50 ? -28 : 28);
    const parX = o ? px * depth * 16 : 0;
    const parY = o ? py * depth * 10 : 0;
    return `translate3d(calc(-50% + ${r2(dx)}vw + ${r2(parX)}px), calc(-50% + ${r2(dy)}vh + ${r2(parY)}px), 0) perspective(900px) rotateY(${r2(ry)}deg) rotate(${rot}deg) scale(${r2(s)})`;
  });
  const opacity = useTransform([progress, on], ([p, o]: number[]) => {
    const rest = 0.45 + depth * 0.55;
    return o ? r2(rest * (1 - seg(p, 0.12, 0.3))) : rest;
  });
  return (
    <m.div style={{ transform, opacity, left: `${x}%`, top: `${y}%`, height: `${h}svh`, width: `${r2(h * GEAR_ASPECT[piece.kind])}svh` }} className="absolute">
      <div
        className="size-full [html[data-motion='on']_&]:animate-[gear-in_1.2s_cubic-bezier(0.16,1,0.3,1)_both]"
        style={{ animationDelay: `${300 + index * 110}ms` }}
      >
        <div
          className="autoplay relative size-full [html[data-motion='on']_&]:animate-[gear-bob_6s_ease-in-out_infinite_alternate]"
          style={{ animationDelay: `${-index * 1.7}s` }}
        >
          {/* The warm key light behind each piece. */}
          <div className="absolute -inset-[30%] rounded-full bg-[radial-gradient(closest-side,rgba(209,138,90,0.22),rgba(209,138,90,0))]" />
          <GearArt kind={piece.kind} className="relative size-full drop-shadow-[0_18px_30px_rgba(0,0,0,0.65)]" />
        </div>
      </div>
    </m.div>
  );
}

/** The film layers over the opening: motion only, so nothing here is in the static HTML. */
export function HeroFilm() {
  const progress = usePrologueProgress();
  const gate = useMotionGate();
  const fallback = useMotionValue(0);
  const p = progress ?? fallback;
  if (!gate.motion) return null;
  return (
    <>
      <LightSweep progress={p} from={0} to={0.18} />
      <Particles progress={p} push={[0.02, 0.42]} count={typeof window !== 'undefined' && window.innerWidth < 1024 ? 14 : 28} seed={11} />
      <Flare progress={p} from={0.78} to={1.05} x={50} y={50} size={460} />
      {/* The camera finds her: the viewfinder draws in and the focus box locks on her star. */}
      <Viewfinder progress={p} from={0.66} to={1.25} />
      <Subtitles
        progress={p}
        lines={[
          { text: DESCENT[0], from: 0.3, to: 0.58 },
          { text: DESCENT[1], from: 0.72, to: 1.08 },
        ]}
      />
    </>
  );
}
