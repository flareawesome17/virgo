import { FINALE_COPY as T } from '../../data/strings/page-finale';
import { GEAR_ASPECT, GearArt } from '../cinema/gear';
import { VirgoConstellation } from '../cinema/virgo-constellation';
import { FinaleFilm } from '../islands/finale';
import { CREW } from '../scenes/finale-crew';
import { Credits, MoreLinks, PrimaryCtas } from './closing';

/**
 * Finale, the closing screen · #start (05-cinema.md §3). The end of the page:
 * there is no FAQ and no footer after it.
 *
 * Two renders:
 * - static-only (reduced motion, no JS, crawlers): the crew by role with
 *   their tools, the Virgo logo over the constellation (Syrma lit: "you"),
 *   "Start your journey now.", every way in as buttons, and the credits.
 * - motion-only: `FinaleFilm` lazy-loads the closing shot (scenes/finale-
 *   credits.tsx): the credits roll, the logo flashes in and Virgo draws out
 *   of it, and the last screen holds the same buttons and credits.
 *
 * Download is inline in both, as well as on the frame.
 */

/** The closing shot's scroll, in svh beyond its 100svh stage. */
const LENGTH = 210;

export function Finale() {
  return (
    <section id="start" data-tone="night" data-chapter="start" aria-labelledby="start-title" className="relative z-10 bg-[#100D0C] [overflow-x:clip]">
      <div className="static-only relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[70%] bg-[radial-gradient(70%_60%_at_50%_100%,rgba(209,138,90,0.16),rgba(107,62,37,0.06)_45%,rgba(16,13,12,0)_75%)]"
        />
        <div className="relative mx-auto flex max-w-5xl flex-col items-center px-[calc(var(--frame)+1.25rem)] pb-[max(calc(var(--frame)+4rem),env(safe-area-inset-bottom))] pt-24 text-center sm:px-[calc(var(--frame)+2rem)] sm:pt-32">
          {/* The credits: the crew by role, each with its tool. */}
          <h3 className="font-mono text-xs uppercase tracking-[0.24em] text-[#D18A5A]">{T.crew}</h3>
          <ul className="mt-8 grid w-full grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-4">
            {CREW.map((c) => (
              <li key={c.first} className="flex flex-col items-center gap-3">
                <span className="block h-12" style={{ aspectRatio: GEAR_ASPECT[c.gear] }}>
                  <GearArt kind={c.gear} className="size-full" />
                </span>
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-[#BCADA3]">{c.role}</span>
                <span className="text-2xl font-semibold leading-none text-[#F2EDE8]">{c.first}</span>
              </li>
            ))}
          </ul>

          {/* The logo, then the way in. */}
          <div aria-hidden className="relative mt-24 size-24 sm:size-28">
            <div className="absolute left-1/2 top-1/2 w-[min(88vw,560px)] -translate-x-1/2 -translate-y-1/2 opacity-60">
              <VirgoConstellation syrma="ignite" twinkle={false} lineAlpha={0.3} />
            </div>
            <span className="absolute -inset-10 rounded-full bg-[radial-gradient(closest-side,rgba(240,200,142,0.3),rgba(240,200,142,0))]" />
            <span className="relative block size-full bg-contain bg-center bg-no-repeat" style={{ backgroundImage: 'url(/logo.png)' }} />
          </div>
          <p aria-hidden className="mt-3 font-mono text-xs uppercase tracking-[0.5em] text-[#F0C88E]">
            {T.name}
          </p>
          <h2
            id="start-title"
            className="mt-8 text-balance text-[clamp(2.5rem,1.2rem+5vw,5.5rem)] font-semibold leading-[0.95] tracking-[-0.04em] text-[#F2EDE8]"
          >
            {T.title}
          </h2>
          <div className="mt-9 w-full sm:w-auto">
            <PrimaryCtas />
          </div>
          <div className="mt-8">
            <MoreLinks />
          </div>
          <div className="mt-14">
            <Credits />
          </div>
        </div>
      </div>

      <FinaleFilm length={LENGTH} />
    </section>
  );
}
