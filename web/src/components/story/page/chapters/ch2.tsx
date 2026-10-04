import { RADII, SEARCH_ROLES, demoSentence } from '@/components/story/data/story';
import { CH2, CH2_CITY, CH2_DEMO, CH2_FIGCAPTION, CH2_KICKERS, CH2_PAIR } from '@/components/story/data/strings/page-ch2';
import { PHONE_RADIUS, PhoneFrame, Slab } from '@/components/story/frames';
import { LocationCard } from '@/components/story/mocks/location-card';
import { NearbyPanel } from '@/components/story/mocks/nearby-panel';
import { NEARBY_STATES, NearbyPhone, nearbySearch, slug } from '@/components/story/mocks/nearby-phone';
import { RadarStatic } from '@/components/story/svg';
import { Ch2Demo, Ch2Island, type NearbyBeats } from '../islands/ch2';

/**
 * Ch2 — Nearby (storyboard Ch2). Server-rendered in its final state: the
 * copy, the panel (desktop) or phone (mobile) at 25 km after the erase, the
 * two-frame location card and the distance demo. Static readers also get the
 * radar still and the before/after pair; with motion on, the sky draws the
 * radar and the island flips the mocks in step (islands/ch2.tsx).
 */

/** Each beat's search, for the island: computed here so the roster never ships to the client. */
function beats(): NearbyBeats {
  const out = {} as NearbyBeats;
  for (const s of NEARBY_STATES) {
    const r = nearbySearch(s);
    out[s] = {
      radius: r.radius,
      counts: Object.fromEntries(Object.entries(r.counts).map(([role, n]) => [slug(role), n])),
      shown: [...r.shown].map(slug),
      selected: SEARCH_ROLES.map(slug),
    };
  }
  return out;
}

const CARD = 'rounded-[20px] border border-[#2A2522] bg-[rgba(22,19,17,0.92)] p-5 sm:p-7';
const KICKER = 'font-mono text-[11px] uppercase tracking-[0.14em] text-[#D18A5A]';
const H3 = 'text-[clamp(1.25rem,1.1rem+0.8vw,1.625rem)] font-semibold leading-[1.2] tracking-[-0.015em] text-[#F2EDE8]';
const BODY = 'text-base leading-[1.6] text-[#BCADA3] lg:text-[17px]';

const DEMO_CSS = [
  '.ch2-demo [data-km]{display:none}',
  '.ch2-demo:not(:has(input:checked)) [data-km="25"]{display:block}',
  ...RADII.map((km) => `.ch2-demo:has(input[value="${km}"]:checked) [data-km="${km}"]{display:block}`),
].join('\n');

export function Ch2() {
  const sentences = Object.fromEntries(RADII.map((km) => [String(km), demoSentence(km)]));
  return (
    <section id="nearby" data-tone="night" data-chapter="nearby" className="relative z-10 [overflow-x:clip]">
      <Ch2Island beats={beats()}>
        <div
          data-part="ch2-track"
          className={`relative mx-auto grid max-w-7xl gap-x-12 px-4 pb-20 pt-28 sm:px-8 lg:grid-cols-[minmax(0,55fr)_minmax(0,45fr)] [html[data-motion='on']_&]:pt-[18svh]`}
        >
          {/* ── The copy column: step cards, in normal flow over the sky. ── */}
          <div className="relative z-10 flex min-w-0 flex-col">
            <div className={`${CARD} max-w-[34rem] [html[data-motion='on']_&]:mb-[48svh] lg:[html[data-motion='on']_&]:mb-[62svh]`}>
              <p className={KICKER}>
                {CH2.eyebrowNo} · <time dateTime={CH2.eyebrowTimeIso}>{CH2.eyebrowTime}</time> · {CH2.eyebrowLabel}
              </p>
              <h2 className="mt-4 max-w-[18ch] text-[clamp(2rem,1.3rem+3.4vw,4.25rem)] font-semibold leading-none tracking-[-0.03em] text-[#F2EDE8]">
                {CH2.h2}
              </h2>
              <p className={`mt-5 max-w-[52ch] ${BODY}`}>{CH2.body}</p>
              <p aria-hidden className="mt-6 flex flex-wrap gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[#A08E84]">
                <span className="rounded-full border border-[#362F2B] px-3 py-1.5">{CH2_KICKERS.r5}</span>
                <span className="rounded-full border border-[#362F2B] px-3 py-1.5">{CH2_KICKERS.r25}</span>
              </p>
            </div>

            {/* Reduced motion and no-JS: the radar still at 25 km. */}
            <figure className="static-only mt-10 max-w-[34rem]">
              <div className="rounded-[20px] border border-[#2A2522] bg-[radial-gradient(80%_70%_at_50%_45%,#221d19_0%,#161311_75%)] px-2 py-4">
                <RadarStatic radiusKm={25} />
              </div>
              <figcaption className="mt-3 text-sm leading-relaxed text-[#A08E84]">{CH2_PAIR.caption}</figcaption>
            </figure>

            {/* Mobile: the phone, in flow between the cards. */}
            <figure className={`mt-12 lg:hidden [html[data-motion='on']_&]:mb-[30svh]`}>
              <div className="mx-auto w-[min(100%,360px)]" data-part="ch2-phone-slab">
                <Slab
                  className="w-full"
                  rotateX={4}
                  rotateY={-7}
                  depth={14}
                  radius={PHONE_RADIUS}
                  edge="device"
                  shadow="floor"
                >
                  <PhoneFrame width="100%" time="12:04">
                    <NearbyPhone state="r25-erased" maxRows={6} />
                  </PhoneFrame>
                </Slab>
              </div>
              <figcaption className={`mt-6 text-sm leading-relaxed text-[#A08E84] [html[data-motion='on']_&]:sr-only`}>{CH2_FIGCAPTION}</figcaption>
            </figure>

            <div className={`${CARD} mt-12 max-w-[34rem] [html[data-motion='on']_&]:mb-[46svh] lg:[html[data-motion='on']_&]:mb-[58svh]`}>
              <h3 className={H3}>{CH2.h3}</h3>
              <p className={`mt-4 max-w-[52ch] ${BODY}`}>{CH2.privacy}</p>
            </div>

            {/* Reduced motion: the before/after pair. */}
            <figure className="static-only mt-10 max-w-[40rem]">
              <div className="grid grid-cols-2 gap-3">
                {([true, false] as const).map((before) => (
                  <div key={String(before)} className="rounded-[16px] border border-[#2A2522] bg-[#1A1614] p-2">
                    <RadarStatic radiusKm={25} beforeErase={before} />
                    <p aria-hidden className="mt-1 px-1 pb-1 font-mono text-[11px] uppercase leading-snug tracking-[0.1em] text-[#BCADA3]">
                      {before ? CH2_PAIR.before : CH2_PAIR.after}
                    </p>
                  </div>
                ))}
              </div>
              <figcaption className="sr-only">{CH2_PAIR.caption}</figcaption>
            </figure>

            <div className={`${CARD} mt-12 max-w-[40rem]`}>
              <p className={BODY}>{CH2.closing}</p>
              <figure className="mt-6">
                <div aria-hidden className="grid gap-5 sm:grid-cols-2">
                  {(['off', 'on'] as const).map((s, i) => (
                    <div key={s}>
                      <p className={`${KICKER} mb-3`}>{s === 'off' ? CH2_CITY.off : CH2_CITY.on}</p>
                      <Slab className="w-full" rotateX={6} rotateY={i === 0 ? -6 : 6} depth={8} radius="rounded-[16px]" edge="card">
                        <LocationCard platform="phone" state={s} />
                      </Slab>
                    </div>
                  ))}
                </div>
                <figcaption className="sr-only">{CH2_CITY.caption}</figcaption>
              </figure>
            </div>
          </div>

          {/* ── Desktop: the Nearby panel, sticky beside the radar. ── */}
          <div className="relative hidden min-w-0 lg:block">
            <div className={`flex flex-col justify-center py-10 [html[data-motion='on']_&]:sticky [html[data-motion='on']_&]:top-0 [html[data-motion='on']_&]:h-svh [html[data-motion='on']_&]:py-0`}>
              {/* The radar's readout, over the sky to the left (motion only). */}
              <div
                aria-hidden
                data-part="ch2-hud"
                className="motion-only pointer-events-none absolute bottom-[14svh] right-[calc(100%+3rem)] grid font-mono leading-none text-[#F0C88E]"
              >
                {(['5', '25'] as const).map((km) => (
                  <span key={km} data-face={km} className="col-start-1 row-start-1 flex items-baseline gap-2 opacity-0 transition-none">
                    <span className="text-[11px] uppercase tracking-[0.18em] text-[#BCADA3]">{CH2_DEMO.legend}</span>
                    <span className="text-5xl font-medium tabular-nums tracking-[-0.04em]">{km}</span>
                    <span className="text-sm tracking-[0.08em]">km</span>
                  </span>
                ))}
              </div>
              <figure className="w-full">
                <div data-part="ch2-panel-slab" className="mx-auto w-full max-w-[540px]">
                  <Slab className="w-full" rotateX={4} rotateY={-8} depth={10} radius="rounded-xl" edge="card">
                    <div className="h-[760px] overflow-hidden rounded-xl border border-[#362F2B] [html[data-motion='on']_&]:h-[min(80svh,720px)]">
                      <NearbyPanel state="r25-erased" maxRows={6} />
                    </div>
                  </Slab>
                </div>
                <figcaption className={`mx-auto mt-6 max-w-[540px] text-sm leading-relaxed text-[#A08E84] [html[data-motion='on']_&]:sr-only`}>
                  {CH2_FIGCAPTION}
                </figcaption>
              </figure>
            </div>
          </div>
        </div>
      </Ch2Island>

      {/* ── Try the distance: normal flow, real controls, works with no JS. ── */}
      <div className="relative z-10 mx-auto max-w-7xl px-4 pb-16 sm:px-8">
        <style>{DEMO_CSS}</style>
        <div className={`${CARD} grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center`}>
          <div>
            <h3 className={H3}>{CH2_DEMO.heading}</h3>
            <p className={`mt-3 max-w-[44ch] ${BODY}`}>{CH2_DEMO.intro}</p>
          </div>
          <Ch2Demo sentences={sentences}>
            <div className="ch2-demo">
              <fieldset>
                <legend className="mb-3 font-mono text-xs uppercase tracking-[0.14em] text-[#BCADA3]">{CH2_DEMO.legend}</legend>
                <div className="flex flex-wrap gap-2">
                  {CH2_DEMO.options.map((o) => (
                    <label
                      key={o.km}
                      className="relative inline-flex min-h-11 min-w-[4.5rem] cursor-pointer items-center justify-center rounded-full border border-[#362F2B] bg-[#1E1B18] px-4 text-sm font-semibold tabular-nums text-[#F2EDE8] transition-colors duration-200 hover:border-[#6B5A50] has-[:checked]:border-[#D18A5A] has-[:checked]:bg-[#D18A5A] has-[:checked]:text-[#161311] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-[3px] has-[:focus-visible]:outline-[#F2EDE8]"
                    >
                      <input type="radio" name="ch2-within" value={o.km} defaultChecked={o.km === 25} className="sr-only" />
                      {o.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <figure className="mt-6">
                <div className="rounded-[16px] bg-[radial-gradient(80%_70%_at_50%_45%,#221d19_0%,#161311_75%)] px-1 py-3">
                  {RADII.map((km) => (
                    <div key={km} data-km={km}>
                      <RadarStatic radiusKm={km} />
                    </div>
                  ))}
                </div>
                <figcaption className="sr-only">{CH2_DEMO.figcaption}</figcaption>
              </figure>
              <p aria-hidden className="mt-4 font-mono text-[13px] tracking-[0.02em] text-[#F2EDE8]">
                {RADII.map((km) => (
                  <span key={km} data-km={km}>
                    {sentences[String(km)]}
                  </span>
                ))}
              </p>
            </div>
          </Ch2Demo>
        </div>
        <p className="mt-6 max-w-[60ch] text-[13px] leading-relaxed text-[#A08E84]">{CH2.footnote}</p>
      </div>
    </section>
  );
}
