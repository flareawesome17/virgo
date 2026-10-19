import { CH6 } from '../../data/strings/page-ch6';
import { ClientGalleryPage } from '../../mocks/client-gallery';
import { Illustrative } from '../cinema/shot';
import { Ch6Film } from '../islands/ch6';
import { CH6_LENGTH, PhoneShell } from '../scenes/ch6-parts';

/**
 * Ch6 — The Handover · #delivery (05-cinema.md §3).
 *
 * Two renders. Motion: one pinned shot on the client page's paper
 * (scenes/ch6-scene.tsx), loaded as its own chunk near the viewport; the
 * server only reserves its height and carries the heading. Static (reduced
 * motion, no JS, crawlers): the script as a calm editorial block, with one
 * still: the couple's phone three weeks later, picks and films together.
 */

const LINE = 'text-[clamp(1.25rem,1rem+1vw,1.75rem)] font-semibold leading-[1.25] tracking-[-0.015em]';
const SLATE = 'font-mono text-xs uppercase tracking-[0.2em] text-[#7A3E1E]';

function StaticScene() {
  return (
    <div className="static-only mx-auto grid max-w-6xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-12 lg:items-center lg:gap-14 lg:py-28">
      <div className="lg:col-span-6">
        <p className={SLATE}>{CH6.slate}</p>
        <h2 className="mt-4 max-w-[16ch] text-[clamp(2rem,1.3rem+3.4vw,4.25rem)] font-semibold leading-none tracking-[-0.03em]">{CH6.title}</h2>
        <p className={`mt-6 text-[#3B322C] ${LINE}`}>{CH6.picks}</p>
        <p className={`mt-12 ${SLATE}`}>{CH6.slateLater}</p>
        <p className={`mt-3 text-[#3B322C] ${LINE}`}>{CH6.later}</p>
      </div>
      <figure aria-hidden className="relative m-0 flex justify-center pt-12 lg:col-span-6">
        <Illustrative tone="day" />
        <PhoneShell time="11:00" className="w-[min(100%,300px)]">
          <ClientGalleryPage className="absolute inset-0" state="rescoped" tiles={8} browserBar />
        </PhoneShell>
      </figure>
    </div>
  );
}

export function Ch6() {
  return (
    <section id="delivery" data-tone="day" data-chapter="delivery" className="relative z-10 bg-[#FBF7F2] text-[#1E1B18] [overflow-x:clip]">
      <div className="motion-only relative" style={{ height: `${100 + CH6_LENGTH}svh` }}>
        <h2 className="sr-only">{CH6.title}</h2>
        <Ch6Film />
      </div>
      <StaticScene />
    </section>
  );
}
