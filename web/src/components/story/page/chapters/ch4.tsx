import { WHEN } from '../../data/story';
import { RINGS } from '../../data/strings/ch4';
import { CH4 } from '../../data/strings/page-ch4';
import { LOCK_WALLPAPER, LockNotification, LockScreen, PHONE_RADIUS, PhoneFrame, Slab, lockDate, lockTime } from '../../frames';
import { Illustrative } from '../cinema/shot';
import { Ch4Motion } from '../islands/ch4';
import { CH4_SVH } from '../scenes/ch4-timing';

/**
 * Ch4 — The Calendar · #calendar (05-cinema.md §3, Ch4). Night, on its own
 * opaque surface (the sky stops behind it). Two halves:
 *
 * - motion-only: an sr-only H2 and a box that holds the film's scroll; the
 *   film (scenes/ch4-scene.tsx) loads into it on the client. The iris into
 *   this chapter is drawn centrally (cinema/cuts.tsx).
 * - static-only (reduced motion, no JS, crawlers): the script as a calm
 *   editorial block, one still (5:00 AM, no service, the reminder ringing)
 *   and a still copper horizon.
 */
export function Ch4() {
  return (
    <section
      id="calendar"
      data-tone="night"
      data-chapter="calendar"
      className="relative z-10 bg-[#161311] bg-[radial-gradient(90%_50%_at_70%_0%,#1E1A17_0%,rgba(22,19,17,0)_70%)] [overflow-x:clip]"
    >
      {/* ── Motion: the film. ── */}
      <div className="motion-only relative" style={{ height: `${CH4_SVH}svh` }}>
        <h2 className="sr-only">{CH4.moved}</h2>
        <Ch4Motion />
      </div>

      {/* ── Static: the script and one still. ── */}
      <div className="static-only relative pb-[30svh] pt-24 lg:pt-32">
        <div className="relative z-10 mx-auto grid max-w-6xl px-5 sm:px-8 items-center gap-x-16 gap-y-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#D18A5A]">
              <time dateTime={WHEN.moved}>{CH4.friday}</time>
            </p>
            <h2 className="mt-4 max-w-[16ch] text-balance text-[clamp(2rem,1.3rem+3.4vw,4.25rem)] font-semibold leading-none tracking-[-0.03em] text-[#F2EDE8]">
              {CH4.moved}
            </h2>
            <p className="mt-10 font-mono text-xs uppercase tracking-[0.2em] text-[#D18A5A]">
              <time dateTime={WHEN.reminder}>{CH4.saturday}</time>
            </p>
            <p className="mt-3 max-w-[24ch] text-pretty text-[clamp(1.375rem,1.1rem+1vw,1.875rem)] font-semibold leading-[1.2] text-[#F2EDE8]">{CH4.rings}</p>
            <p className="mt-3 max-w-[44ch] text-pretty text-base leading-[1.6] text-[#BCADA3] lg:text-[17px]">{CH4.ringsSmall}</p>
          </div>
          <figure className="relative mx-auto w-[min(100%,320px)]">
            <div aria-hidden>
              <Slab className="w-full" rotateX={5} rotateY={8} depth={14} radius={PHONE_RADIUS} edge="device" shadow="floor">
                <PhoneFrame width="100%" time="5:00" signal={0} screen={LOCK_WALLPAPER} ratio={0}>
                  <div className="relative h-[520px]">
                    <LockScreen time={lockTime(WHEN.reminder)} date={lockDate(WHEN.reminder)}>
                      <LockNotification title={RINGS.title} body={RINGS.body} />
                    </LockScreen>
                  </div>
                </PhoneFrame>
              </Slab>
            </div>
            <figcaption className="relative mt-12 h-6">
              <span className="sr-only">{CH4.still}</span>
              <Illustrative />
            </figcaption>
          </figure>
        </div>

        {/* The copper horizon: the first light on the page. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[30svh]">
          <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(107,62,37,0.95)_0%,rgba(107,62,37,0.55)_26%,rgba(61,36,24,0.25)_58%,rgba(22,19,17,0)_100%)]" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(90deg,rgba(232,168,110,0)_0%,rgba(240,200,142,0.9)_50%,rgba(232,168,110,0)_100%)]" />
        </div>
      </div>
    </section>
  );
}
