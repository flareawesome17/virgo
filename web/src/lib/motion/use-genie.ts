'use client';

import { useCallback, useEffect, useRef } from 'react';
import { bounceKeyframes, fadeKeyframes, genieKeyframes } from './genie';
import { MOTION, SPRING_FALLBACK } from './tokens';
import { prefersReducedMotion } from './use-reduced-motion';

function springEasing(): string {
  return typeof CSS !== 'undefined' && CSS.supports('transition-timing-function', 'linear(0, 1)')
    ? MOTION.ease.spring
    : SPRING_FALLBACK;
}

function rectOf(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

/**
 * Genie open/close between a panel and an icon. Under prefers-reduced-motion
 * it is a plain fade. Starting a new one cancels the one running.
 */
export function useGenie() {
  const running = useRef<Animation | null>(null);
  useEffect(() => () => running.current?.cancel(), []);

  const play = useCallback(
    async (panel: HTMLElement, icon: HTMLElement, direction: 'open' | 'close'): Promise<void> => {
      running.current?.cancel();
      if (typeof panel.animate !== 'function') return;
      const reduced = prefersReducedMotion();
      const genie = genieKeyframes(rectOf(panel), rectOf(icon), direction);
      const animation = panel.animate(
        reduced ? fadeKeyframes(direction === 'open' ? 'in' : 'out') : genie.keyframes,
        {
          duration: reduced
            ? MOTION.duration.fast
            : direction === 'open'
              ? MOTION.duration.genieOpen
              : MOTION.duration.genieClose,
          easing: reduced ? 'linear' : direction === 'open' ? springEasing() : MOTION.ease.in,
          fill: direction === 'close' ? 'forwards' : 'none',
        },
      );
      if (!reduced) panel.style.transformOrigin = genie.transformOrigin;
      running.current = animation;
      try {
        await animation.finished;
      } catch {
        // cancelled by a newer animation
      } finally {
        if (running.current === animation) running.current = null;
        // Close leaves the panel invisible via fill; the caller unmounts it.
        if (direction === 'open') animation.cancel();
      }
    },
    [],
  );
  return { play };
}

/** One-shot bounce for an element; a fade under reduced motion. */
export function useBounce<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const bounce = useCallback(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== 'function') return;
    if (prefersReducedMotion()) {
      el.animate([{ opacity: 0.5 }, { opacity: 1 }], { duration: MOTION.duration.fast });
      return;
    }
    el.animate(bounceKeyframes(), { duration: MOTION.duration.slow, easing: MOTION.ease.out });
  }, []);
  return { ref, bounce };
}
