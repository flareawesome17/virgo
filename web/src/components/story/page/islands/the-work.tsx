'use client';

import dynamic from 'next/dynamic';
import { LazyScene } from './ch7';

/** The work's island: holds the shot's height and loads the scene when near (see `islands/ch7.tsx`). */
const Scene = dynamic(() => import('../scenes/work-scene').then((mod) => mod.WorkScene), { ssr: false });

export function TheWorkFilm({ length }: { length: number }) {
  return <LazyScene length={length} scene={Scene} />;
}
