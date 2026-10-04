'use client';

import { m, useScroll } from 'framer-motion';
import { useRef, type ReactNode } from 'react';
import { useReveal } from '../cinema/fx';
import { Float } from '../cinema/float';
import { useMotionGate } from '../motion';

/**
 * One tile or plan card that eases in as it rises into view and eases out as
 * it leaves the top (useReveal, 05-cinema.md addendum), on its own place in
 * the scroll. `delay` staggers neighbours (~0.03–0.05 of progress); `out` is
 * the exit window, later for tall cards so their button stays readable.
 *
 * The children are server-rendered; with motion off (and on the server) no
 * style is written, so the static page is the settled item. While on screen
 * each card floats gently (Float), its rhythm offset by its stagger.
 */
export function Reveal({
  children,
  delay = 0,
  out = [0.8, 0.99],
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  out?: readonly [number, number];
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const gate = useMotionGate();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const style = useReveal(scrollYProgress, 0.02 + delay, 0.3 + delay, out[0], out[1], { y: 64, scale: 0.88 });
  return (
    <Float className="h-full" delay={delay * 40} amp={4} tilt={1.1} duration={6 + ((delay * 50) % 2)}>
      <m.div ref={ref} style={gate.motion ? style : undefined} className={className}>
        {children}
      </m.div>
    </Float>
  );
}
