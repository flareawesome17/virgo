'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { useMotionGate } from '../motion';

/**
 * Ch4's motion half (05-cinema.md §5): the film (scenes/ch4-scene.tsx) is a
 * client chunk that loads as the chapter comes within ~150% of the viewport,
 * and renders only while the motion gate is on. The chapter's server render
 * already holds the film's scroll length, so nothing jumps when it arrives.
 * The chapter keeps its own night surface; the sky stops behind it.
 */
const Scene = dynamic(() => import('../scenes/ch4-scene'), { ssr: false });

export function Ch4Motion() {
  const gate = useMotionGate();
  const box = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!gate.motion || near || !el) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), { rootMargin: '150% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [gate.motion, near]);
  return (
    <div ref={box} className="h-full">
      {gate.motion && near && <Scene />}
    </div>
  );
}
