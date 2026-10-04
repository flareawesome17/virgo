import { HIRES, type Hire } from '@/components/story/data/strings/ch3';
import { CH3 } from '@/components/story/data/strings/page-ch3';
import { WHEN } from '@/components/story/data/story';
import { Slab } from '@/components/story/frames';
import { HiredTermsCard } from '@/components/story/mocks/hired-terms-card';
import { GearArt, ROLE_GEAR, type GearKind } from '../cinema/gear';
import { Illustrative } from '../cinema/shot';
import { Ch3Motion } from '../islands/ch3';
import { CH3_SVH } from '../scenes/ch3-timing';

/**
 * Ch3 — Connect (05-cinema.md §3, Ch3). Two halves:
 *
 * - motion-only: an sr-only H2 and a box that holds the film's scroll; the
 *   film itself (scenes/ch3-scene.tsx) loads into it on the client and
 *   drives the shared sky, where the crew line up as Virgo.
 * - static-only (reduced motion, no JS, crawlers): the script as a calm
 *   editorial block, and one still: the terms Ernie was hired on, with the
 *   crew's tools around them.
 */

/** The crew's tools around the still, aria-hidden. */
const STILL_GEAR: { hire: Hire; kind: GearKind; place: string }[] = [
  { hire: 'ernie', kind: ROLE_GEAR.videographer, place: '-left-6 -top-10 h-[56px] w-[90px] -rotate-6 sm:-left-14 sm:h-[72px] sm:w-[115px]' },
  { hire: 'kenn', kind: ROLE_GEAR.editor, place: '-bottom-10 -left-4 h-[44px] w-[68px] rotate-3 sm:-left-16 sm:h-[56px] sm:w-[87px]' },
  { hire: 'bea', kind: ROLE_GEAR.hmua, place: '-right-3 top-8 h-[96px] w-[29px] rotate-[24deg] sm:-right-10 sm:h-[120px] sm:w-[36px]' },
];

export function Ch3() {
  return (
    <section id="connect" data-tone="night" data-chapter="connect" className="relative z-10 [overflow-x:clip]">
      {/* ── Motion: the film. ── */}
      <div className="motion-only relative" style={{ height: `${CH3_SVH}svh` }}>
        <h2 className="sr-only">{CH3.applied}</h2>
        <Ch3Motion />
      </div>

      {/* ── Static: the script and one still. ── */}
      <div className="static-only relative mx-auto max-w-6xl px-5 py-24 sm:px-8 lg:py-32">
        <div className="grid items-center gap-x-16 gap-y-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#D18A5A]">
              <time dateTime={WHEN.appliedErnie}>{CH3.slate}</time>
            </p>
            <h2 className="mt-4 max-w-[16ch] text-balance text-[clamp(2rem,1.3rem+3.4vw,4.25rem)] font-semibold leading-none tracking-[-0.03em] text-[#F2EDE8]">
              {CH3.applied}
            </h2>
            <p className="mt-6 max-w-[34ch] text-pretty text-[clamp(1.125rem,1rem+0.6vw,1.375rem)] leading-[1.45] text-[#F2EDE8]">{CH3.rate}</p>
            <p className="mt-3 max-w-[40ch] text-pretty text-base leading-[1.6] text-[#BCADA3] lg:text-[17px]">{CH3.consent}</p>
          </div>
          <figure className="relative mx-auto w-[min(100%,340px)]">
            <div aria-hidden className="relative">
              <Slab className="w-full" rotateX={5} rotateY={-8} depth={10} radius="rounded-[16px]" edge="card" shadow="floor">
                <HiredTermsCard side="creative" state="confirmed" />
              </Slab>
              {HIRES.map((hire) => {
                const g = STILL_GEAR.find((s) => s.hire === hire)!;
                return <GearArt key={hire} kind={g.kind} className={`absolute ${g.place}`} />;
              })}
            </div>
            <figcaption className="relative mt-14 h-6">
              <span className="sr-only">{CH3.still}</span>
              <Illustrative />
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
