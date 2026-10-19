'use client';

import dynamic from 'next/dynamic';
import { useRef } from 'react';
import { useMotionGate, useNear } from '../motion';

/** The film's own chunk: mocks, gear and kit load only for readers who get the film. */
const Scene = dynamic(() => import('../scenes/ch6-scene').then((mod) => mod.Ch6Scene), { ssr: false });

/**
 * Ch6's film (05-cinema.md §5): mounted when the motion gate is on and the
 * chapter is within ~150% of the viewport. The server reserves its height.
 */
export function Ch6Film() {
  const { motion } = useMotionGate();
  const ref = useRef<HTMLDivElement>(null);
  const near = useNear(ref, motion);
  return (
    <div ref={ref} className="h-full">
      {motion && near && <Scene />}
    </div>
  );
}
