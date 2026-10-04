'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState, type ComponentType } from 'react';
import { useMotionGate, useNear } from '../motion';

/**
 * Ch7's island, and the lazy-scene plumbing Ch7, The work and Ch8 share
 * (05-cinema.md §5): the server render reserves the film's height; the
 * scene's client chunk loads only when the chapter comes within ~150% of the
 * viewport, and mounts only while the motion gate is on. The HTML carries no
 * second copy of the figures.
 */

/** Below 1024 px: half the particles (the brief's phone budget). Set once and on resize, never per frame. */
export function useNarrow() {
  const [narrow, setNarrow] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023.98px)');
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return narrow;
}

/** Holds a scene's scroll length (100svh of stage plus `length`) and mounts it when it is near. */
export function LazyScene({ length, scene: Scene }: { length: number; scene: ComponentType<{ length: number }> }) {
  const gate = useMotionGate();
  const box = useRef<HTMLDivElement>(null);
  const near = useNear(box, gate.motion);

  return (
    <div ref={box} className="relative" style={{ height: `${100 + length}svh` }}>
      {gate.motion && near && <Scene length={length} />}
    </div>
  );
}

const Scene = dynamic(() => import('../scenes/ch7-scene').then((mod) => mod.Ch7Scene), { ssr: false });

export function Ch7Film({ length }: { length: number }) {
  return <LazyScene length={length} scene={Scene} />;
}
