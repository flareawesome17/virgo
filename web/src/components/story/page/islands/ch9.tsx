'use client';

import { m, useTransform } from 'framer-motion';
import { useRef, type ReactNode } from 'react';
import { camera, lerp, r2, seg } from '../cinema/ease';
import { LightSweep } from '../cinema/fx';
import { useMotionGate, useRawProgress } from '../motion';

/**
 * Ch9's film (05-cinema.md §3 and its addendum): lighter cinema, "after the
 * film". The server render is the static page; with motion off nothing here
 * writes a style or draws a layer.
 *
 * - `Ch9Film` wraps the title and the grid. As the central iris cut opens on
 *   #features, the camera zooms in (scale 0.6 → 1 from the top centre), then
 *   drifts (the block parallaxes against the page), and one light sweep
 *   crosses it mid-way. The tiles themselves ease in and out (Reveal).
 */
export function Ch9Film({ children, className = '' }: { children: ReactNode; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const gate = useMotionGate();
  const arrive = useRawProgress(root, 'enter');
  const cover = useRawProgress(root, 'cover');
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
