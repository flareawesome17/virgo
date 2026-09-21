'use client';

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/** One query for every Reveal on the page; `matches` stays live. */
let motionQuery: MediaQueryList | undefined;

function reducedMotionQuery(): MediaQueryList {
  motionQuery ??= window.matchMedia(REDUCED_MOTION);
  return motionQuery;
}

function prefersReducedMotion(): boolean {
  return reducedMotionQuery().matches;
}

function subscribeToReducedMotion(onChange: () => void): () => void {
  const query = reducedMotionQuery();
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** The server cannot know, and the page it sends is the animated one. */
function reducedMotionOnServer(): boolean {
  return false;
}

/**
 * Reveals its children when they scroll into view.
 *
 * An IntersectionObserver rather than a scroll listener: the browser does the
 * work off the main thread and reports only when something actually crosses
 * the threshold, where a scroll handler fires on every frame of every scroll
 * whether anything changed or not.
 *
 * It also unobserves after the first reveal. A landing page is read top to
 * bottom; re-animating on the way back up is the kind of thing that looks
 * clever once and irritating every time after.
 *
 * The transition itself lives in CSS (see globals.css) so it is compositor-only
 * — transform and opacity, no layout.
 */
export function Reveal({
  children,
  /** Milliseconds to hold before revealing. Used to stagger a group. */
  delay = 0,
  /** Which way it travels in from. */
  from = 'up',
  /**
   * How long the travel takes, in milliseconds.
   *
   * Every reveal on the page ran at the CSS default of 700ms, so eleven
   * sections arrived at exactly the same speed however big or small the thing
   * arriving was. A heading block wants to be quicker than a full mock panel;
   * matching them makes the page feel metronomic rather than composed.
   */
  duration,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  delay?: number;
  from?: 'up' | 'down' | 'left' | 'right' | 'none';
  duration?: number;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'span';
}) {
  const ref = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);

  // Anyone who has asked for less motion gets the end state immediately, from
  // the first render after hydration rather than once an effect has run.
  const reducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    prefersReducedMotion,
    reducedMotionOnServer,
  );
  const shown = reducedMotion || inView;

  useEffect(() => {
    const node = ref.current;
    // Checked here as well as in CSS so the observer is never even set up for
    // them. Read live rather than from `reducedMotion`, which still holds the
    // server's answer when this first runs after hydration. Runs again if the
    // preference changes, so switching it off mid-page sets up the observer
    // that was skipped rather than leaving the content hidden.
    if (!node || prefersReducedMotion()) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setInView(true);
        observer.disconnect();
      },
      // A negative bottom margin means it fires slightly before the element
      // reaches the fold, so the motion is finishing as it arrives rather
      // than starting once the reader is already looking at it.
      { threshold: 0.1, rootMargin: '0px 0px -8% 0px' },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [reducedMotion]);

  return (
    <Tag
      // The ref type varies with the tag; the cast keeps the polymorphic API
      // without making every caller specify an element type.
      ref={ref as React.Ref<never>}
      data-reveal={from}
      data-shown={shown ? '' : undefined}
      style={
        delay || duration
          ? {
              ...(delay ? { transitionDelay: `${delay}ms` } : null),
              // Overrides the 700ms in globals.css. The reduced-motion rule
              // there kills the transition outright with !important, so this
              // cannot reintroduce motion for anyone who asked for none.
              ...(duration ? { transitionDuration: `${duration}ms` } : null),
            }
          : undefined
      }
      className={cn('reveal', className)}
    >
      {children}
    </Tag>
  );
}
