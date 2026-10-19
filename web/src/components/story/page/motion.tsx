'use client';

import { LazyMotion, useMotionValue, useMotionValueEvent, useScroll, useSpring, type MotionValue } from 'framer-motion';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
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

/**
 * The progress glides after the scroll rather than snapping to it: a mouse
 * wheel moves the page in 100 px steps, and every scene drawn straight from
 * those steps judders. A light, well-damped spring (settles in ~0.3 s, no
 * overshoot) turns the steps into one move, like a camera on a fluid head.
 */
export const GLIDE = { stiffness: 170, damping: 32, mass: 0.6, restDelta: 0.0002 } as const;

/** Near-instant: when the page itself scrolls smoothly (Lenis), the scenes follow it rather than glide twice. */
const DIRECT = { stiffness: 2000, damping: 120, mass: 0.2, restDelta: 0.0002 } as const;

let steadyNow: boolean | null = null;

/**
 * Phones and touch screens get a steady film (owner, 2026-10-05: on an
 * iPhone the motion read as shaking, "it makes my brain busy"): no 3D turns
 * (a turning card re-renders its text every frame there, and shimmers), no
 * idle float, no rotating light. The camera still dollies and pushes, by
 * translate and scale. Read in transform callbacks, so it is cached and kept
 * current by a media-query listener rather than queried per frame.
 */
export function steady(): boolean {
  if (typeof window === 'undefined') return false;
  if (steadyNow === null) {
    const q = window.matchMedia('(max-width: 1023.98px), (hover: none)');
    steadyNow = q.matches;
    q.addEventListener('change', (e) => {
      steadyNow = e.matches;
    });
  }
  return steadyNow;
}

/** Whether the page scrolls smoothly (decided before paint: pre-paint.tsx). */
export function lenisOn(): boolean {
  return typeof document !== 'undefined' && document.documentElement.getAttribute('data-lenis') === 'on';
}

export function useChapterProgress(target: RefObject<HTMLElement | null>, kind: ProgressKind = 'track'): MotionValue<number> {
  const raw = useRawProgress(target, kind);
  const glide = useSpring(raw, lenisOn() ? DIRECT : GLIDE);
  // Phones: no glide. Touch scrolling is smooth already, and with a spring the cards trailed the pinned stage,
  // which moves with the finger: they seemed to bounce against it as the page scrolled (owner, 2026-10-05).
  const [stable] = useState(() => steady());
  return stable ? raw : glide;
}

let smallViewport = 0;
let smallViewportWidth = 0;

/**
 * The small viewport's height (100svh), measured once per width. On a phone
 * it holds still while the address bar slides in and out; innerHeight does
 * not, and the stages are 100svh tall anyway.
 */
export function stableViewportHeight(): number {
  if (!smallViewport || smallViewportWidth !== window.innerWidth) {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100svh;visibility:hidden;pointer-events:none';
    document.body.appendChild(probe);
    smallViewport = probe.offsetHeight || window.innerHeight;
    smallViewportWidth = window.innerWidth;
    probe.remove();
  }
  return smallViewport;
}

/**
 * A chapter's scroll progress (0 → 1, by `kind`), unsmoothed.
 *
 * On desktop, Motion's own. On phones (steady), computed here against the
 * small viewport: Motion measures against innerHeight, which changes by the
 * address bar's height every time it slides, so every scene on the page
 * lurched a few per cent at each change of direction (owner, 2026-10-05: "the
 * frames are shaky"). Measured on mount and when the page's layout changes;
 * each scroll is then one subtraction and one division.
 */
export function useRawProgress(target: RefObject<HTMLElement | null>, kind: ProgressKind = 'track'): MotionValue<number> {
  const { scrollYProgress } = useScroll({ target, offset: [...OFFSETS[kind]] as never });
  const { scrollY } = useScroll();
  const [stable] = useState(() => steady());
  const out = useMotionValue(0);
  const range = useRef({ start: 0, end: 1 });
  const set = (y: number) => {
    const { start, end } = range.current;
    const p = (y - start) / (end - start || 1);
    out.set(p < 0 ? 0 : p > 1 ? 1 : p);
  };
  useMotionValueEvent(scrollY, 'change', (y) => stable && set(y));
  useEffect(() => {
    const el = target.current;
    if (!stable || !el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const top = r.top + window.scrollY;
      const vh = stableViewportHeight();
      range.current =
        kind === 'track'
          ? { start: top, end: top + r.height - vh }
          : kind === 'cover'
            ? { start: top - vh, end: top + r.height }
            : { start: top - vh, end: top };
      set(window.scrollY);
    };
    measure();
    // The layout above a chapter can still settle (fonts, a static figure): re-measure when the page's size changes.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(document.querySelector('.story-page') ?? document.documentElement);
    return () => ro.disconnect();
    // `set` reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stable, target, kind]);
  return stable ? out : scrollYProgress;
}

// ─── Nearness ─────────────────────────────────────────────────────────

/**
 * Whether `target` is within about one and a half screens of the viewport.
 * Scenes mount as they approach and unmount once they are well past, so a
 * phone only ever holds the few nearest: holding every scene at once is what
 * made iOS close the tab partway down the page. (Their code stays cached, so
 * coming back is instant.)
 */
export function useNear(target: RefObject<HTMLElement | null>, enabled: boolean, margin = '150% 0px'): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = target.current;
    if (!enabled || !el) return;
    const io = new IntersectionObserver((entries) => setNear(entries[entries.length - 1].isIntersecting), { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [enabled, target, margin]);
  return enabled && near;
}

// ─── Layout ──────────────────────────────────────────────────────────────

/** The viewport, as the sky choreography wants it. Mobile is below 1024 px (the header's breakpoint). */
export function useLayout(): MotionValue<Layout> {
  const layout = useMotionValue<Layout>({ w: 1440, h: 900, mobile: false });
  useEffect(() => {
    let last = { w: 0, h: 0 };
    const update = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      // Phones: the address bar sliding in and out as you scroll changes the height by a toolbar's worth.
      // Re-framing the sky for it reads as a jolt; only a real resize (the width, or a big change: a turn, a split view) does.
      if (steady() && w === last.w && Math.abs(h - last.h) < last.h * 0.2) return;
      last = { w, h };
      layout.set({ w, h, mobile: w < 1024 });
    };
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
