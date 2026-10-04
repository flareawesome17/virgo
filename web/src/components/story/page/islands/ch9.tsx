'use client';

import { m, useScroll, useTransform, type MotionValue } from 'framer-motion';
import { useRef, type ReactNode } from 'react';
import { camera, lerp, r2, seg } from '../cinema/ease';
import { LightSweep } from '../cinema/fx';
import { useMotionGate } from '../motion';

/**
 * Ch9's film (05-cinema.md §3 and its addendum): lighter cinema, "after the
 * film". The server render is the static page; with motion off nothing here
 * writes a style or draws a layer.
 *
 * - `Ch9Film` wraps the title and the grid. As the central iris cut opens on
 *   #features, the camera zooms in (scale 0.6 → 1 from the top centre), then
 *   drifts (the block parallaxes against the page), and one light sweep
 *   crosses it mid-way. The tiles themselves ease in and out (Reveal).
 * - `Ch9Backdrop` is the geometry: hexagonal aperture outlines that turn and
 *   grow with the scroll, and thin gold rules that draw in. Hairlines, low
 *   opacity, behind everything.
 */
export function Ch9Film({ children, className = '' }: { children: ReactNode; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const gate = useMotionGate();
  const { scrollYProgress: arrive } = useScroll({ target: root, offset: ['start end', 'start start'] });
  const { scrollYProgress: cover } = useScroll({ target: root, offset: ['start end', 'end start'] });
  const camera3 = useTransform([arrive, cover], ([a, c]: number[]) => {
    const zoom = lerp(0.6, 1, camera(seg(a, 0.5, 1)));
    return `translate3d(0,${r2(lerp(40, -40, camera(c)))}px,0) scale(${r2(zoom)})`;
  });

  return (
    <m.div ref={root} style={gate.motion ? { transform: camera3 } : undefined} className={`relative origin-top ${className}`}>
      {children}
      {gate.motion && <LightSweep progress={cover} from={0.3} to={0.72} />}
    </m.div>
  );
}

const HEXES = [
  { size: 'size-[62vmin]', turn: 1, opacity: 0.16 },
  { size: 'size-[100vmin]', turn: -0.6, opacity: 0.11 },
  { size: 'size-[150vmin]', turn: 0.35, opacity: 0.07 },
];

const RULES = [14, 31, 48, 65, 82];

export function Ch9Backdrop() {
  const ref = useRef<HTMLDivElement>(null);
  const gate = useMotionGate();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  return (
    <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {gate.motion && (
        <>
          {HEXES.map((h, i) => (
            <Hex key={i} progress={scrollYProgress} {...h} />
          ))}
          {RULES.map((top, i) => (
            <Rule key={top} progress={scrollYProgress} top={top} i={i} />
          ))}
        </>
      )}
    </div>
  );
}

function Hex({ progress, size, turn, opacity }: { progress: MotionValue<number>; size: string; turn: number; opacity: number }) {
  const transform = useTransform(progress, (p) => {
    const t = camera(p);
    return `translate3d(-50%,-50%,0) rotate(${r2(lerp(-12, 24, t) * turn)}deg) scale(${r2(lerp(0.82, 1.3, t))})`;
  });
  return (
    <m.div style={{ transform, opacity }} className={`absolute left-1/2 top-[38%] ${size}`}>
      <svg viewBox="-100 -100 200 200" className="size-full" fill="none">
        <polygon points="0,-96 83.1,-48 83.1,48 0,96 -83.1,48 -83.1,-48" stroke="#F0C88E" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
    </m.div>
  );
}

function Rule({ progress, top, i }: { progress: MotionValue<number>; top: number; i: number }) {
  const transform = useTransform(progress, (p) => `scaleX(${r2(camera(seg(p, 0.06 + i * 0.05, 0.34 + i * 0.05)))})`);
  return (
    <m.div
      style={{ transform, top: `${top}%` }}
      className={`absolute inset-x-0 h-px bg-[linear-gradient(90deg,rgba(240,200,142,0),rgba(240,200,142,0.22)_30%,rgba(240,200,142,0.22)_70%,rgba(240,200,142,0))] ${i % 2 ? 'origin-right' : 'origin-left'}`}
    />
  );
}
