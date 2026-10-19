'use client';

import dynamic from 'next/dynamic';
import { useRef } from 'react';
import { useMotionGate, useNear } from '../motion';

/**
 * Ch3's motion half (05-cinema.md §5): the film (scenes/ch3-scene.tsx) is a
 * client chunk that loads as the chapter comes within ~150% of the viewport,
 * and renders only while the motion gate is on. The chapter's server render
 * already holds the film's scroll length, so nothing jumps when it arrives.
 * The scene also drives the shared sky (`connect`).
 */
const Scene = dynamic(() => import('../scenes/ch3-scene'), { ssr: false });

export function Ch3Motion() {
  const gate = useMotionGate();
  const box = useRef<HTMLDivElement>(null);
  const near = useNear(box, gate.motion);
  return (
    <div ref={box} className="h-full">
      {gate.motion && near && <Scene />}
    </div>
  );
}
