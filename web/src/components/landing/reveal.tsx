'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

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
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  delay?: number;
  from?: 'up' | 'down' | 'left' | 'right' | 'none';
  className?: string;
  as?: 'div' | 'section' | 'li' | 'span';
}) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Anyone who has asked for less motion gets the end state immediately.
    // Checked here rather than only in CSS so the observer is never even set
    // up, and the content is present for anything that does not run effects.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setShown(true);
        observer.disconnect();
      },
      // A negative bottom margin means it fires slightly before the element
      // reaches the fold, so the motion is finishing as it arrives rather
      // than starting once the reader is already looking at it.
      { threshold: 0.1, rootMargin: '0px 0px -8% 0px' },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      // The ref type varies with the tag; the cast keeps the polymorphic API
      // without making every caller specify an element type.
      ref={ref as React.Ref<never>}
      data-reveal={from}
      data-shown={shown ? '' : undefined}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={cn('reveal', className)}
    >
      {children}
    </Tag>
  );
}
