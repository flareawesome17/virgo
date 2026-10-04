'use client';

import dynamic from 'next/dynamic';
import { LazyScene } from './ch7';

/** Ch8's island: holds the shot's height and loads the scene (and its sky) when near (see `islands/ch7.tsx`). */
const Scene = dynamic(() => import('../scenes/ch8-scene').then((mod) => mod.Ch8Scene), { ssr: false });

export function Ch8Film({ length }: { length: number }) {
  return <LazyScene length={length} scene={Scene} />;
}
