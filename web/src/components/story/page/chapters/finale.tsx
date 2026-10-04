import { Download } from 'lucide-react';
import { DOWNLOAD_PATH, SIGN_IN_URL, SIGN_UP_URL } from '@/components/landing/links';
import { FINALE_COPY as T } from '../../data/strings/page-finale';
import { GEAR_ASPECT, GearArt } from '../cinema/gear';
import { FinaleFilm } from '../islands/finale';
import { CREW } from '../scenes/finale-crew';

/**
 * Finale, the credits · #start (05-cinema.md §3): "This one's you."
 *
 * Two renders:
 * - static-only (reduced motion, no JS, crawlers): the title, the three ways
 *   in, the crew by role with their tools, and the page's one honesty line.
 * - motion-only: `FinaleFilm` lazy-loads the credits shot (scenes/finale-
 *   credits.tsx), framed for the 2.39:1 letterbox the chrome brings back here.
 *
 * The Download pill hides from #start down, so Download is inline in both.
 */

/** The credits shot's scroll, in svh beyond its 100svh stage. */
const LENGTH = 130;

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#F2EDE8]';

export function Finale() {
  return (
    <section id="start" data-tone="night" data-chapter="start" aria-labelledby="start-title" className="relative z-10 bg-[#100D0C] [overflow-x:clip]">
      <div className="static-only relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[60%] bg-[radial-gradient(70%_60%_at_50%_100%,rgba(209,138,90,0.16),rgba(107,62,37,0.06)_45%,rgba(16,13,12,0)_75%)]"
        />
        <div className="relative mx-auto flex max-w-5xl flex-col items-center px-5 py-24 text-center sm:px-8 sm:py-32">
          <h2
            id="start-title"
            className="text-[clamp(3rem,1.2rem+7vw,7rem)] leading-[0.92] font-semibold tracking-[-0.045em] text-[#F2EDE8] [text-wrap:balance]"
          >
            {T.title}
          </h2>

          <div className="mt-9 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row sm:gap-4">
            <a
              href={SIGN_UP_URL}
              className={`inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[#D18A5A] px-7 text-base font-semibold text-[#161311] transition-colors hover:bg-[#E09A69] sm:w-auto ${FOCUS}`}
            >
              {T.join}
            </a>
            <a
              href={DOWNLOAD_PATH}
              className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#F2EDE8] px-7 text-base font-semibold text-[#161311] transition-colors hover:bg-white sm:w-auto ${FOCUS}`}
            >
              <Download aria-hidden className="size-4" />
              {T.download}
            </a>
            <a
              href={SIGN_IN_URL}
              className={`inline-flex min-h-12 items-center justify-center rounded-xl px-4 text-base font-medium text-[#BCADA3] transition-colors hover:text-[#F2EDE8] ${FOCUS}`}
            >
              {T.signIn}
            </a>
          </div>

          {/* The credits: the crew by role, each with its tool. */}
          <h3 className="mt-20 font-mono text-xs tracking-[0.24em] text-[#D18A5A] uppercase">{T.crew}</h3>
          <ul className="mt-8 grid w-full grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-4">
            {CREW.map((c) => (
              <li key={c.first} className="flex flex-col items-center gap-3">
                <span className="block h-12" style={{ aspectRatio: GEAR_ASPECT[c.gear] }}>
                  <GearArt kind={c.gear} className="size-full" />
                </span>
                <span className="font-mono text-xs tracking-[0.18em] text-[#BCADA3] uppercase">{c.role}</span>
                <span className="text-2xl leading-none font-semibold text-[#F2EDE8]">{c.first}</span>
              </li>
            ))}
          </ul>

          <p className="mt-16 max-w-[52ch] text-sm leading-relaxed text-[#A08E84]">{T.honesty}</p>
        </div>
      </div>

      <FinaleFilm length={LENGTH} />
    </section>
  );
}
