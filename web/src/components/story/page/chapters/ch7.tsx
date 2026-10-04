import { CH7_COPY } from '../../data/strings/page-ch7';
import { StorageMeter } from '../../mocks/storage-meter';
import { Ch7Film } from '../islands/ch7';

/**
 * Ch7 · Day 91 · #forget (05-cinema.md §3).
 *
 * Motion: one calm shot (`scenes/ch7-scene.tsx`, loaded when near): the
 * album's files leave on their own sweeps like stars fading, the meter
 * drains, and a gold leak carries the frame into The work.
 *
 * Static (reduced motion, no JS, crawlers): the script as a heading and one
 * line, and one still: Mika's meter after the last clean-up.
 */

/** The shot's scroll, in svh, beyond its 100svh stage. */
const LENGTH = 220;

export function Ch7() {
  return (
    <section
      id="forget"
      data-tone="night"
      data-chapter="forget"
      aria-labelledby="ch7-title"
      className="relative z-10 bg-[#161311] text-[#F2EDE8] [overflow-x:clip]"
    >
      <div className="motion-only">
        <h2 className="sr-only">{CH7_COPY.title}</h2>
        <Ch7Film length={LENGTH} />
      </div>

      <div className="static-only mx-auto grid max-w-6xl items-center gap-12 px-5 py-24 sm:px-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-16 md:py-32">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#D18A5A]">{CH7_COPY.slate}</p>
          <h2
            id="ch7-title"
            className="mt-4 max-w-[16ch] text-[clamp(2rem,1.3rem+3.4vw,4.25rem)] font-semibold leading-none tracking-[-0.03em] [text-wrap:balance]"
          >
            {CH7_COPY.title}
          </h2>
          <p className="mt-6 max-w-[40ch] text-[17px] leading-relaxed text-[#BCADA3] md:text-lg">{CH7_COPY.body}</p>
        </div>
        <figure className="mx-auto w-full max-w-[420px]">
          <StorageMeter platform="web" state="day112" className="shadow-[0_30px_60px_-24px_rgba(0,0,0,0.9)]" />
          <figcaption className="mt-4 text-[15px] leading-relaxed text-[#A08E84]">{CH7_COPY.still}</figcaption>
        </figure>
      </div>
    </section>
  );
}
