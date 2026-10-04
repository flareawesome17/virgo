import { WORK_COPY } from '../../data/strings/page-work';
import { Slab } from '../../frames/slab';
import { ShowcaseCard } from '../../mocks/showcase-card';
import { GearArt } from '../cinema/gear';
import { TheWorkFilm } from '../islands/the-work';

/**
 * The work · #the-work (05-cinema.md §3).
 *
 * Motion: one shot (`scenes/work-scene.tsx`, loaded when near): out of Ch7's
 * gold leak onto a flat-lay, the camera cranes up until Mika's showcase card
 * faces us through the viewfinder, then pulls back to the sky for Ch8.
 *
 * Static (reduced motion, no JS, crawlers): the line as the heading, who can
 * see a showcase, and one still: the card with the kit beside it. The card is
 * never tied to the Reyes & Santos album (the clean-up would take it).
 */

/** The shot's scroll, in svh, beyond its 100svh stage. */
const LENGTH = 60;

export function TheWork() {
  return (
    <section
      id="the-work"
      data-tone="night"
      data-chapter="the-work"
      aria-labelledby="the-work-title"
      className="relative z-10 [html[data-motion='on']_&]:-mt-[100svh] text-[#F2EDE8] [overflow-x:clip]"
    >
      <div className="motion-only">
        <h2 className="sr-only">{WORK_COPY.title}</h2>
        <TheWorkFilm length={LENGTH} />
      </div>

      <div className="static-only mx-auto grid max-w-6xl items-center gap-14 px-5 py-24 sm:px-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-10 md:py-32 lg:gap-24">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#D18A5A]">{WORK_COPY.slate}</p>
          <h2
            id="the-work-title"
            className="mt-4 max-w-[16ch] text-[clamp(2rem,1.3rem+3.4vw,4.25rem)] font-semibold leading-none tracking-[-0.03em] [text-wrap:balance]"
          >
            {WORK_COPY.title}
          </h2>
          <p className="mt-6 max-w-[40ch] text-[17px] leading-relaxed text-[#BCADA3] md:text-lg">{WORK_COPY.small}</p>
        </div>

        <figure className="mx-auto w-full max-w-[300px]">
          <div aria-hidden className="relative">
            {/* The kit beside the card: decoration, not a feature. */}
            <GearArt kind="camera" className="absolute -left-[34%] top-[14%] h-auto w-[46%] -rotate-[14deg] lg:-left-[52%] lg:w-[54%]" />
            <GearArt kind="light" className="absolute -right-[22%] -top-[8%] h-auto w-[24%] rotate-[10deg] lg:-right-[38%] lg:w-[28%]" />
            <GearArt kind="lens" className="absolute -right-[26%] top-[60%] h-auto w-[32%] rotate-[8deg] lg:-right-[42%] lg:w-[38%]" />
            <Slab rotateX={5} rotateY={-8} depth={9} radius="rounded-[22px]" edge="card" shadow="drop">
              <ShowcaseCard pieces={3} />
            </Slab>
          </div>
          <figcaption className="mt-8 text-[15px] leading-relaxed text-[#A08E84]">{WORK_COPY.still}</figcaption>
        </figure>
      </div>
    </section>
  );
}
