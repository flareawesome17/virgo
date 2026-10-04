'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMotionGate } from '../motion';
import { CH1_FILM_SVH } from '../scenes/ch1-timing';

/**
 * Ch1's motion half (05-cinema.md §5): the film is a client chunk that loads
 * as the chapter comes within ~150% of the viewport and renders only while
 * the motion gate is on. Until it arrives, its scroll length is held by an
 * empty box, so nothing above or below ever jumps.
 */
const Film = dynamic(() => import('../scenes/ch1-film'), { ssr: false });

/**
 * Holds `svh` of scroll and mounts `children` once the box is near the
 * viewport and the motion gate is open. The empty box is in the server HTML
 * (inside the chapter's `motion-only` wrapper, so it takes space only when
 * the story moves, and hydration never shifts the page); the film itself
 * never is, so the HTML carries one copy of the chapter: the static half.
 */
export function FilmSlot({ svh, children }: { svh: number; children: ReactNode }) {
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
    <div ref={box} className="relative" style={{ height: `${svh}svh` }}>
      {gate.motion && near && children}
    </div>
  );
}

export function Ch1Motion() {
  return (
    <FilmSlot svh={CH1_FILM_SVH}>
      <Film />
    </FilmSlot>
  );
}
