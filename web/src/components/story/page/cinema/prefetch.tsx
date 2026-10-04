'use client';

import { useEffect } from 'react';
import { useMotionGate } from '../motion';

/**
 * Each scene mounts only as it nears the viewport (05-cinema.md §5), but its
 * code should already be here by then: a fast scroll must never land on an
 * empty frame. Once the page is idle, fetch every scene's chunk, in film
 * order. Motion only: the static page never needs them.
 */
const SCENES = [
  () => import('../scenes/ch1-film'),
  () => import('../scenes/ch2-film'),
  () => import('../scenes/ch3-scene'),
  () => import('../scenes/ch4-scene'),
  () => import('../scenes/ch5-scene'),
  () => import('../scenes/ch6-scene'),
  () => import('../scenes/ch7-scene'),
  () => import('../scenes/work-scene'),
  () => import('../scenes/ch8-scene'),
  () => import('../scenes/finale-credits'),
];

export function ScenePrefetch() {
  const gate = useMotionGate();
  useEffect(() => {
    if (!gate.motion) return;
    let cancelled = false;
    const run = async () => {
      for (const load of SCENES) {
        if (cancelled) return;
        await load().catch(() => undefined);
      }
    };
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const id = idle(() => void run(), { timeout: 4000 });
    return () => {
      cancelled = true;
      cancel(id);
    };
  }, [gate.motion]);
  return null;
}
