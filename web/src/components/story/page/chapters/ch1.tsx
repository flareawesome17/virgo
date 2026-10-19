import { CH1 } from '../../data/strings/page-ch1';
import { Slab } from '../../frames';
import { Illustrative } from '../cinema/shot';
import { Ch1Motion } from '../islands/ch1';
import { JobCard } from '../scenes/ch1-job-card';

/**
 * Ch1 · Wednesday, 11:42 PM · #hire (alias #how). 05-cinema.md §3.
 *
 * Two renders: the static half (reduced motion, no JS, crawlers) is the
 * script as a calm editorial block beside one still, the job post with each
 * role's tool and rate; the motion half is a lazy client film
 * (scenes/ch1-film.tsx) that mounts only while the motion gate is on.
 */
export function Ch1() {
  return (
    <section id="hire" data-tone="night" data-chapter="hire" className="relative z-10">
      <span id="how" aria-hidden className="absolute top-0" />

      <div className="static-only mx-auto grid max-w-6xl items-center gap-12 px-5 py-24 sm:px-8 lg:grid-cols-2 lg:gap-16 lg:py-32">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#D18A5A]">{CH1.slate}</p>
          <h2 className="mt-4 max-w-[18ch] text-balance text-[clamp(2rem,1.3rem+3.4vw,4rem)] font-semibold leading-[1.02] tracking-[-0.03em] text-[#F2EDE8]">
            {CH1.lines[0]}
          </h2>
          <p className="mt-6 max-w-[40ch] text-lg leading-relaxed text-[#BCADA3]">{CH1.lines[1]}</p>
          <p className="mt-2 max-w-[40ch] text-lg font-medium leading-relaxed text-[#F2EDE8]">{CH1.lines[2]}</p>
        </div>
        <figure className="relative mx-auto w-full max-w-[420px] pt-14">
          <Illustrative />
          <Slab rotateX={5} rotateY={-8} depth={10} radius="rounded-[22px]" edge="card" shadow="floor" className="w-full">
            <JobCard />
          </Slab>
        </figure>
      </div>

      <div className="motion-only">
        <Ch1Motion />
      </div>
    </section>
  );
}
