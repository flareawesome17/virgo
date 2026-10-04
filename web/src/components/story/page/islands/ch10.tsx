'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useMotionGate } from '../motion';

/**
 * Ch10's stage (storyboard §2 Ch10): entry-triggered, once, never
 * scroll-linked. The server render is the final state (Free's star risen,
 * the paid tiers' stars below the horizon). In motion mode this arms the
 * scene on mount and lights it when the stage is 30% visible; the CSS in
 * the chapter does the rest with transform and opacity transitions.
 *
 * Copy never waits on it: the cards only tilt and lift, they never fade.
 */
export function Ch10Stage({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { motion } = useMotionGate();

  useEffect(() => {
    const root = ref.current;
    if (!motion || !root) return;
    root.dataset.state = 'armed';
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        // Commit the armed pose before lighting, so the transitions run even
        // when the stage is already in view on mount (an anchor jump).
        void root.offsetWidth;
        root.dataset.state = 'lit';
        io.disconnect();
      },
      { threshold: 0.3 },
    );
    io.observe(root);
    return () => {
      io.disconnect();
      delete root.dataset.state;
    };
  }, [motion]);

  return (
    <div ref={ref} data-stage="pricing" className="pricing-stage">
      {children}
    </div>
  );
}
