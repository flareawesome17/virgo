import { CH2 } from '../../data/strings/page-ch2';
import { Slab } from '../../frames';
import { Illustrative } from '../cinema/shot';
import { Ch2Motion } from '../islands/ch2';
import { NearbyStill } from '../scenes/ch2-nearby-card';

/**
 * Ch2 · Thursday, 12:04 AM · #nearby. 05-cinema.md §3.
 *
 * Two renders: the static half is the script as a calm editorial block
 * beside one still, the search at 25 km with each role's tool and each
 * person's distance in whole kilometres; the motion half is a lazy client
 * film (scenes/ch2-film.tsx) that draws the radar on the shared sky and
 * plays the erase.
 */
export function Ch2() {
  return (
    <section id="nearby" data-tone="night" data-chapter="nearby" className="relative z-10">
      <div className="static-only mx-auto grid max-w-6xl items-center gap-12 px-5 py-24 sm:px-8 lg:grid-cols-2 lg:gap-16 lg:py-32">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#D18A5A]">{CH2.slate}</p>
          <h2 className="mt-4 max-w-[18ch] text-balance text-[clamp(2rem,1.3rem+3.4vw,4rem)] font-semibold leading-[1.02] tracking-[-0.03em] text-[#F2EDE8]">
            {CH2.ask}
          </h2>
          <p className="mt-6 max-w-[40ch] text-lg leading-relaxed text-[#BCADA3]">{CH2.pick}</p>
          <p className="mt-2 max-w-[40ch] text-lg leading-relaxed text-[#BCADA3]">{CH2.only}</p>
          <p className="mt-2 max-w-[40ch] text-lg font-medium leading-relaxed text-[#F2EDE8]">{CH2.erase}</p>
        </div>
        <figure className="relative mx-auto w-full max-w-[420px] pt-14">
          <Illustrative />
          <Slab rotateX={5} rotateY={8} depth={10} radius="rounded-[22px]" edge="card" shadow="floor" className="w-full">
            <NearbyStill />
          </Slab>
        </figure>
      </div>

      <div className="motion-only">
        <Ch2Motion />
      </div>
    </section>
  );
}
