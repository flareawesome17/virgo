'use client';

import { m, useTransform, type MotionValue } from 'framer-motion';
import { camera, r2, seg, window4 } from './ease';

/**
 * The camera's point of view (05-cinema.md §1.8): corner brackets, a
 * rule-of-thirds grid and a focus box that draw in, snap to focus, and ease
 * out over [from, to]. Geometry a photographer reads at once. Decorative.
 */
export function Viewfinder({
  progress,
  from,
  to,
  focus = { x: 50, y: 50 },
  rec = false,
  tone = 'night',
}: {
  progress: MotionValue<number>;
  from: number;
  to: number;
  /** Where the focus box locks, in % of the frame. */
  focus?: { x: number; y: number };
  /** A blinking REC dot (videographer shots). */
  rec?: boolean;
  tone?: 'night' | 'day';
}) {
  const span = to - from;
  const life = useTransform(progress, (p) => r2(window4(p, from, from + span * 0.15, to - span * 0.15, to)));
  // Brackets close in from wide; the grid lines draw from the centre out.
  const brackets = useTransform(progress, (p) => `scale(${r2(1.12 - 0.12 * camera(seg(p, from, from + span * 0.25)))})`);
  const draw = useTransform(progress, (p) => camera(seg(p, from + span * 0.05, from + span * 0.35)));
  const drawX = useTransform(draw, (v) => `scaleX(${r2(v)})`);
  const drawY = useTransform(draw, (v) => `scaleY(${r2(v)})`);
  // The focus box hunts, then locks: big and soft → snapped, with a flash of the lock colour.
  const box = useTransform(progress, (p) => `translate3d(-50%,-50%,0) scale(${r2(1.6 - 0.6 * camera(seg(p, from + span * 0.2, from + span * 0.42)))})`);
  const lock = useTransform(progress, (p) => r2(window4(p, from + span * 0.4, from + span * 0.44, from + span * 0.5, from + span * 0.6)));
  const ink = tone === 'day' ? 'border-[#1E1B18]/50' : 'border-[#F2EDE8]/55';
  const line = tone === 'day' ? 'bg-[#1E1B18]/15' : 'bg-[#F2EDE8]/12';
  const corner = `absolute size-8 sm:size-12 ${ink}`;
  return (
    <m.div aria-hidden style={{ opacity: life }} className="pointer-events-none absolute inset-[6%] z-20 sm:inset-[7%]">
      <m.div style={{ transform: brackets }} className="absolute inset-0">
        <span className={`${corner} left-0 top-0 border-l-2 border-t-2`} />
        <span className={`${corner} right-0 top-0 border-r-2 border-t-2`} />
        <span className={`${corner} bottom-0 left-0 border-b-2 border-l-2`} />
        <span className={`${corner} bottom-0 right-0 border-b-2 border-r-2`} />
      </m.div>
      {[33.333, 66.667].map((at) => (
        <m.span key={`h${at}`} style={{ top: `${at}%`, transform: drawX }} className={`absolute inset-x-0 h-px ${line}`} />
      ))}
      {[33.333, 66.667].map((at) => (
        <m.span key={`v${at}`} style={{ left: `${at}%`, transform: drawY }} className={`absolute inset-y-0 w-px ${line}`} />
      ))}
      <m.span style={{ left: `${focus.x}%`, top: `${focus.y}%`, transform: box }} className={`absolute size-14 border sm:size-20 ${ink}`}>
        <m.span style={{ opacity: lock }} className="absolute -inset-px border-2 border-[#7FD08A]" />
      </m.span>
      {rec && (
        <span className="absolute right-0 top-0 mr-12 mt-1 flex items-center gap-2 font-mono text-[11px] tracking-[0.2em] text-[#F2EDE8]/80 sm:mr-16 sm:mt-2">
          <span className="autoplay size-2 rounded-full bg-[#E5484D] [html[data-motion='on']_&]:animate-pulse" />
          REC
        </span>
      )}
    </m.div>
  );
}
