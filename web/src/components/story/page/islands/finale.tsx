'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { useMotionGate } from '../motion';

/**
 * The Finale's motion half (05-cinema.md §5): the credits scene is a client
 * chunk, loaded only in motion mode and only once #start is within ~150% of
 * the viewport. Until then this box holds the shot's height (`length` svh of
 * scroll plus the stage), so the page never jumps and the letterbox, which
 * measures #start, measures the right thing. With motion off it is
 * display:none (motion-only) and stays empty.
 */
const FinaleCredits = dynamic(() => import('../scenes/finale-credits').then((mod) => mod.FinaleCredits), { ssr: false });

export function FinaleFilm({ length }: { length: number }) {
  const gate = useMotionGate();
  const box = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!gate.motion || near || !el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setNear(true);
        io.disconnect();
      },
      { rootMargin: '150% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [gate.motion, near]);

  return (
    <div ref={box} className="motion-only relative bg-[#100D0C]" style={{ minHeight: `${100 + length}svh` }}>
      {gate.motion && near && <FinaleCredits length={length} />}
    </div>
  );
}
