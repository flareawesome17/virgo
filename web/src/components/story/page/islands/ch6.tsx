'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { useMotionGate } from '../motion';

/** The film's own chunk: mocks, gear and kit load only for readers who get the film. */
const Scene = dynamic(() => import('../scenes/ch6-scene').then((mod) => mod.Ch6Scene), { ssr: false });

/**
 * Ch6's film (05-cinema.md §5): mounted when the motion gate is on and the
 * chapter is within ~150% of the viewport. The server reserves its height.
 */
export function Ch6Film() {
  const { motion } = useMotionGate();
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!motion || near || !el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setNear(true);
    }, { rootMargin: '150% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [motion, near]);
  return (
    <div ref={ref} className="h-full">
      {motion && near && <Scene />}
    </div>
  );
}
