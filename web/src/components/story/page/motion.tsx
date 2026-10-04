'use client';

import { LazyMotion, useMotionValue, useScroll, type MotionValue } from 'framer-motion';
import { useEffect, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import type { Layout } from './sky/choreography';

/**
 * The story's motion plumbing, shared by every chapter island.
 *
 * Islands enhance the server render in place: they find `[data-part]`
 * elements inside their chapter and drive transform/opacity with MotionValues
 * (storyboard §1.7). Nothing here re-renders on scroll.
 */

/** Motion features load after the page, not with it (LazyMotion strict: use `m.*`, never `motion.*`). */
const features = () => import('framer-motion').then((mod) => mod.domAnimation);

export function MotionRoot({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={features} strict>
      {children}
    </LazyMotion>
  );
}

// ─── The gate ────────────────────────────────────────────────────────────

export type MotionGate = { motion: boolean; paused: boolean; lite: boolean };

const OFF: MotionGate = { motion: false, paused: false, lite: false };
let cached: MotionGate = OFF;
let cachedKey = '';

function read(): MotionGate {
  const d = document.documentElement;
  const key = `${d.getAttribute('data-motion')}|${d.hasAttribute('data-paused')}|${d.hasAttribute('data-lite')}`;
  if (key !== cachedKey) {
    cachedKey = key;
    cached = { motion: d.getAttribute('data-motion') === 'on', paused: d.hasAttribute('data-paused'), lite: d.hasAttribute('data-lite') };
  }
  return cached;
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion', 'data-paused', 'data-lite'] });
  return () => observer.disconnect();
}

/** Whether the story may move (set before paint by PrePaint). The server, and no-JS, are always static. */
export function useMotionGate(): MotionGate {
  return useSyncExternalStore(subscribe, read, () => OFF);
}

// ─── Chapter progress ────────────────────────────────────────────────────

/**
 * How a chapter's progress maps to scroll (storyboard §1.2):
 * - `track`: a pinned stage or a full-height sticky figure. 0 when the
 *   chapter's top reaches the top of the viewport, 1 when its bottom reaches
 *   the bottom.
 * - `cover`: sky-is-the-pin chapters. 0 when the chapter's top enters at the
 *   bottom, 1 when its bottom leaves at the top.
 * - `enter`: from entering at the bottom to reaching the top.
 */
export type ProgressKind = 'track' | 'cover' | 'enter';

const OFFSETS = {
  track: ['start start', 'end end'],
  cover: ['start end', 'end start'],
  enter: ['start end', 'start start'],
} as const;

export function useChapterProgress(target: RefObject<HTMLElement | null>, kind: ProgressKind = 'track'): MotionValue<number> {
  const { scrollYProgress } = useScroll({ target, offset: [...OFFSETS[kind]] as never });
  return scrollYProgress;
}

// ─── Layout ──────────────────────────────────────────────────────────────

/** The viewport, as the sky choreography wants it. Mobile is below 1024 px (the header's breakpoint). */
export function useLayout(): MotionValue<Layout> {
  const layout = useMotionValue<Layout>({ w: 1440, h: 900, mobile: false });
  useEffect(() => {
    const update = () => layout.set({ w: window.innerWidth, h: window.innerHeight, mobile: window.innerWidth < 1024 });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [layout]);
  return layout;
}

/** Finds a part inside an island's root, once. */
export function part<T extends HTMLElement = HTMLElement>(root: HTMLElement | null, name: string): T | null {
  return root?.querySelector<T>(`[data-part="${name}"]`) ?? null;
}
