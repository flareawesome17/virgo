import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { RADII, within } from '@/components/story/data/story';
import { ConstellationChart, LinkStreak, MiniFigure, RadarStatic, StarStop } from '@/components/story/svg';

/**
 * Static SVGs: the star full stop, the mini figure, Virgo, the radar, the link.
 *
 * Every piece of storyboard B6 and B11 in every state, as the reduced-motion
 * page and the demos will show them. Server-rendered. Development only.
 */
export const metadata: Metadata = {
  title: 'Story lab · SVG',
  robots: { index: false, follow: false },
};

function Panel({ title, note, children, className = '' }: { title: string; note?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-white/10 bg-[#1E1A17] p-5 sm:p-6 ${className}`}>
      <h2 className="font-mono text-xs tracking-[0.14em] text-[#BCADA3] uppercase">{title}</h2>
      {note && <p className="mt-1.5 text-sm text-[#A08E84]">{note}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default function SvgLab() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <main className="mx-auto max-w-6xl px-4 py-12 text-[#F2EDE8] sm:px-8 sm:py-16">
      <p className="font-mono text-xs tracking-[0.14em] text-[#BCADA3] uppercase">Story lab · svg</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Static SVG pieces</h1>
      <p className="mt-3 max-w-2xl text-[#BCADA3]">
        Server-rendered, no client code. The reduced-motion figures keep their depth: the radar is drawn through the same
        camera as the canvas, frozen.
      </p>

      <div className="mt-10 grid gap-5">
        <Panel title="StarStop" note="The H1's full stop and the Finale's: a 0.3 em star on the baseline, with a real “.” for screen readers and copy-paste.">
          <p className="max-w-4xl text-[clamp(2.75rem,1.6rem+5.6vw,7rem)] leading-[0.95] font-semibold tracking-[-0.035em]">
            <span className="block font-medium text-[#BCADA3]">Where creatives find</span>
            <span className="block bg-gradient-to-r from-[#e8b189] via-[#c17745] to-[#a85f38] bg-clip-text text-transparent">
              each other, and get paid
              <StarStop />
            </span>
          </p>
          <p className="mt-8 text-[clamp(2rem,1.3rem+3.4vw,4.25rem)] leading-none font-semibold tracking-[-0.03em]">
            This one&rsquo;s you
            <StarStop />
          </p>
          <p className="mt-6 text-base text-[#BCADA3]">
            Body size, for scale: it sits like a full stop
            <StarStop />
          </p>
        </Panel>

        <Panel title="MiniFigure" note="Lights one star per chapter (Appendix B). Syrma stays a socket, its two segments missing, until the Finale (lit = 11).">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
            {[0, 1, 3, 5, 10, 11].map((lit) => (
              <figure key={lit} className="m-0">
                <MiniFigure lit={lit} className="max-w-[160px]" />
                <figcaption className="mt-2 font-mono text-[11px] text-[#A08E84]">lit = {lit}</figcaption>
              </figure>
            ))}
          </div>
        </Panel>

        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title="ConstellationChart · Ch3 reduced" note="13 stars, cast names beside the star names, Syrma hollow.">
            <ConstellationChart labels="cast" />
          </Panel>
          <Panel title="ConstellationChart · Finale reduced" note="All 14 lit: Syrma and its two segments drawn.">
            <ConstellationChart syrma labels="cast" />
          </Panel>
          <Panel title="ConstellationChart · names" note="Every star's IAU name or designation.">
            <ConstellationChart labels="names" />
          </Panel>
          <Panel title="ConstellationChart · bare" note="No labels, at a small width.">
            <div className="max-w-[260px]">
              <ConstellationChart />
            </div>
          </Panel>
        </div>

        <Panel title="RadarStatic" note="The app's radii only (5 / 25 / 50 / 100 / 200 km). Rings in one path, stems in one path; the roster stands at its distances; the erased coordinator is absent.">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {RADII.map((r) => (
              <figure key={r} className="m-0">
                <RadarStatic radiusKm={r} />
                <figcaption className="mt-1 font-mono text-[11px] text-[#A08E84]">within {r} km</figcaption>
              </figure>
            ))}
            <figure className="m-0">
              <RadarStatic radiusKm={25} tilt={90} />
              <figcaption className="mt-1 font-mono text-[11px] text-[#A08E84]">within 25 km, from straight above</figcaption>
            </figure>
            <figure className="m-0">
              <RadarStatic radiusKm={25} beforeErase />
              <figcaption className="mt-1 font-mono text-[11px] text-[#A08E84]">within 25 km, before the coordinator turns sharing off ({within(25, false).length} people, then {within(25).length})</figcaption>
            </figure>
          </div>
        </Panel>

        <Panel title="LinkStreak" note="Ch6's link coming out of depth toward you, still.">
          <div className="grid gap-6 sm:grid-cols-2">
            <LinkStreak />
            <div className="max-w-[220px]">
              <LinkStreak />
            </div>
          </div>
        </Panel>
      </div>
    </main>
  );
}
