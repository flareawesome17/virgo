import { CH5 } from '../../data/strings/page-ch5';
import { GEAR_ASPECT, GearArt, type GearKind } from '../cinema/gear';
import { Illustrative } from '../cinema/shot';
import { Ch5Film } from '../islands/ch5';
import { AlbumCard, CH5_LENGTH } from '../scenes/ch5-album';

/**
 * Ch5 — Saturday · #saturday (05-cinema.md §3): the emotional peak.
 *
 * Two renders. Motion: one pinned shot (scenes/ch5-scene.tsx), loaded as its
 * own chunk near the viewport; the server only reserves its height and
 * carries the heading. Static (reduced motion, no JS, crawlers): the script
 * as a calm golden block, with one still: the crew's tools and the album.
 */

/** The static still's tools, left to right, with their share of the row. */
const TOOLS: { kind: GearKind; w: string }[] = [
  { kind: 'cinema', w: 'w-[27%]' },
  { kind: 'camera', w: 'w-[23%]' },
  { kind: 'brush', w: 'w-[6%]' },
  { kind: 'timeline', w: 'w-[27%]' },
];

function StaticScene() {
  return (
    <div className="static-only bg-[linear-gradient(180deg,#161311_0%,#24180f_35%,#4a2c1b_62%,#8a5230_84%,#C47E4A_100%)]">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-12 lg:items-center lg:gap-14 lg:py-28">
        <div className="lg:col-span-5">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#D18A5A]">{CH5.slate}</p>
          <h2 className="mt-4 text-[clamp(3.5rem,2rem+8vw,8rem)] font-semibold leading-[0.9] tracking-[-0.045em] text-[#F2EDE8]">
            {CH5.display}
            <span
              aria-hidden
              className="relative ml-[0.04em] inline-block size-[0.2em] rounded-full bg-[#FFE7C2] align-baseline shadow-[0_0_0.35em_0.08em_rgba(255,231,194,0.85),0_0_1.2em_0.3em_rgba(240,200,142,0.45)]"
            />
            <span className="sr-only">.</span>
          </h2>
          <div className="mt-8 space-y-2 text-[clamp(1.25rem,1rem+1vw,1.75rem)] font-semibold leading-[1.25] tracking-[-0.015em] text-[#F7E7CF]">
            {CH5.lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>
        <figure aria-hidden className="relative m-0 pt-12 lg:col-span-7">
          <Illustrative />
          <div className="mb-6 flex items-end justify-between gap-3 px-2">
            {TOOLS.map((t) => (
              <div key={t.kind} className={t.w} style={{ aspectRatio: GEAR_ASPECT[t.kind] }}>
                <GearArt kind={t.kind} className="block h-full w-full" />
              </div>
            ))}
          </div>
          <AlbumCard />
        </figure>
      </div>
    </div>
  );
}

export function Ch5() {
  return (
    <section id="saturday" data-tone="gold" data-chapter="saturday" className="relative z-10 bg-[#161311] [overflow-x:clip]">
      <div className="motion-only relative" style={{ height: `${100 + CH5_LENGTH}svh` }}>
        <h2 className="sr-only">{CH5.title}</h2>
        <Ch5Film />
      </div>
      <StaticScene />
    </section>
  );
}
