'use client';

import { m, useScroll, useTransform } from 'framer-motion';
import { useRef, type ReactNode } from 'react';
import { camera, lerp, r2, seg } from '../cinema/ease';
import { LightSweep } from '../cinema/fx';
import { useMotionGate } from '../motion';

/**
 * Ch10's film (05-cinema.md §3 and addendum, "after the film"): the camera
 * dollies in over the plans (scale 0.9 → 1 as they arrive), then drifts,
 * tipping from a low angle to level. The cards ease in and out on their own
 * (Reveal, in the chapter). The server render is the final state; with motion
 * off nothing here touches it. Transform and opacity only.
 */
export function Ch10Film({ children, className = '' }: { children: ReactNode; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const gate = useMotionGate();
  const { scrollYProgress: cover } = useScroll({ target: root, offset: ['start end', 'end start'] });
  const drift = useTransform(cover, (p) => {
    const t = camera(p);
    const zoom = lerp(0.9, 1, camera(seg(p, 0, 0.4)));
    return `perspective(1600px) translate3d(0,${r2(lerp(48, -32, t))}px,0) rotateX(${r2(lerp(7, -2, t))}deg) scale(${r2(zoom)})`;
  });

  return (
    <m.div ref={root} style={gate.motion ? { transform: drift } : undefined} className={className}>
      {children}
    </m.div>
  );
}

/**
 * The one light sweep: a band of gold that crosses the Free card as it
 * passes the middle of the screen. Sits inside the card, clipped to it.
 */
export function FreeSweep() {
  const ref = useRef<HTMLDivElement>(null);
  const gate = useMotionGate();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  return (
    <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
      {gate.motion && <LightSweep progress={scrollYProgress} from={0.32} to={0.7} />}
    </div>
  );
}
