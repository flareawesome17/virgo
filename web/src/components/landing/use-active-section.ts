'use client';

import { useEffect, useState } from 'react';

/**
 * Which section the reader is currently looking at.
 *
 * An IntersectionObserver with a narrow band rather than a scroll handler
 * measuring rects: the band is a strip across the upper third of the viewport,
 * and whichever section is crossing it is the one being read. The browser
 * works this out off the main thread and only calls back when it changes,
 * where a scroll listener would fire on every frame and force layout each time
 * it measured.
 *
 * Returns the empty string when nothing qualifies — over the hero, say — so
 * the nav simply has nothing highlighted rather than guessing.
 */
export function useActiveSection(ids: readonly string[]): string {
  const [active, setActive] = useState('');

  useEffect(() => {
    const sections = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;

    // Tracked outside the callback because the observer reports only what
    // *changed*; deciding from one callback's entries alone would drop a
    // section that is still in the band but did not move.
    const visible = new Map<string, boolean>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          visible.set(entry.target.id, entry.isIntersecting);
        }
        // Document order, so when the band spans two sections the upper one
        // wins — that is the one whose heading the reader just passed.
        const current = sections.find((s) => visible.get(s.id));
        if (current) setActive(current.id);
      },
      // A strip roughly a quarter to a third of the way down the viewport.
      { rootMargin: '-25% 0px -65% 0px', threshold: 0 },
    );

    for (const section of sections) observer.observe(section);

    /**
     * The last section can never reach the band on a short final screen —
     * the page runs out of scroll first — so it would never light up. At the
     * bottom, the last one is by definition what you are looking at.
     */
    const onScroll = () => {
      const atBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 80;
      if (atBottom) setActive(sections[sections.length - 1].id);
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, [ids]);

  return active;
}
