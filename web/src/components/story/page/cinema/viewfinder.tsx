'use client';

import { m, useTransform, type MotionValue } from 'framer-motion';
import { camera, r2, seg, window4 } from './ease';

/**
 * The camera finding its subject (05-cinema.md §1.8): a focus box that hunts
 * (big and soft) and locks onto the point, with a flash of the lock colour,
 * over [from, to]. The film's frame (frame.tsx) already carries the corner
 * marks, so there are no brackets or thirds grid here: one gesture, not a
 * pattern. Decorative.
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
  const box = useTransform(progress, (p) => `translate3d(-50%,-50%,0) scale(${r2(1.6 - 0.6 * camera(seg(p, from + span * 0.2, from + span * 0.42)))})`);
  const lock = useTransform(progress, (p) => r2(window4(p, from + span * 0.4, from + span * 0.44, from + span * 0.5, from + span * 0.6)));
  const ink = tone === 'day' ? 'border-[#1E1B18]/50' : 'border-[#F2EDE8]/55';
  return (
    <m.div aria-hidden style={{ opacity: life }} className="pointer-events-none absolute inset-[6%] z-20 sm:inset-[7%]">
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
