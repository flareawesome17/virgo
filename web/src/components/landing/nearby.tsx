'use client';

import { ArrowRight, MapPin, Search } from 'lucide-react';
import { Reveal } from './reveal';
import { SectionHeader } from './section-header';
import { ROLES, initials } from './roles';
import { SIGN_UP_URL } from './links';

/**
 * What this mock is searching for.
 *
 * A set rather than one string, because the real filter is multi-select
 * (`roleFilter: string[]` in the Nearby page) and its empty-state literally
 * reads "Anyone who does X or Y". Every person listed below matches one of
 * these — a filter that returns people who do not match it is the detail
 * that tells a visitor the screenshot is invented.
 */
const LOOKING_FOR = new Set(['Photographer', 'SDE Editor Video']);

/**
 * The Nearby feature, given its own section.
 *
 * It is the one thing here that no general-purpose file tool does, so it earns
 * more room than a tile in the features grid.
 */
export function LandingNearby() {
  return (
    <section id="nearby" className="relative overflow-hidden py-24 sm:py-32">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(38rem_26rem_at_18%_50%,color-mix(in_oklab,var(--primary)_16%,transparent),transparent_70%)]"
      />

      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-2 lg:gap-20">
        <div>
          {/* The first of the two splits, and the one that sets the pattern —
              so it stays copy-left. Delivery further down runs the other way
              round rather than repeating it. */}
          <SectionHeader
            index="04"
            eyebrow="Nearby"
            size="lg"
            title="Need an SDE editor by Saturday?"
            lead="Pick the role and the distance. Virgo shows the people around you who actually do that job — and somebody who both shoots and cuts the same-day edit turns up under either search."
          />
          <Reveal from="left" delay={190}>
            <p className="mt-4 max-w-2xl text-pretty text-[14px] leading-relaxed text-white/40">
              Discovery works both ways: only people sharing their location can
              see each other, and the only thing anyone learns is how far away
              you are. Turning it off erases the position rather than hiding it.
            </p>

            {/* The page ran seven consecutive sections without a single call
                to action — from here to Pricing there was nothing to click.
                A quiet inline one, not a third slab button: the loud asks
                belong in the hero and the close. */}
            <a
              href={SIGN_UP_URL}
              className="group mt-6 inline-flex items-center gap-2 text-[14px] font-semibold text-[#e0a274] transition-colors hover:text-[#f0bb92]"
            >
              See who is working near you
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </a>
          </Reveal>
        </div>

        <Reveal from="right" delay={120} duration={900}>
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#1e1b18]/80 shadow-2xl shadow-black/40 backdrop-blur-xl">
            <div className="flex items-center gap-2.5 border-b border-white/8 px-4 py-3.5">
              <Search className="size-3.5 text-white/30" />
              <span className="text-[12px] text-white/35">Looking for</span>
            </div>

            <div className="flex flex-wrap gap-2 border-b border-white/8 p-4">
              {ROLES.map((role) => {
                const on = LOOKING_FOR.has(role);
                return (
                  <span
                    key={role}
                    className={
                      on
                        ? 'rounded-full bg-[#c17745] px-3 py-1.5 text-[11px] font-bold text-white'
                        : 'rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-white/40'
                    }
                  >
                    {role}
                  </span>
                );
              })}
            </div>

            <ul className="divide-y divide-white/6">
              {[
                // Deliberately not the three in the hero — see the note there.
                // Kenn carries both SDE roles, which is what makes the body
                // copy's "turns up under either search" visible rather than
                // just asserted.
                {
                  name: 'Kenn Francis',
                  km: '1.8 km',
                  roles: ['SDE Editor Photo', 'SDE Editor Video'],
                },
                { name: 'Julanie Bation', km: '4.3 km', roles: ['Photographer'] },
                { name: 'Shairo Baguio', km: '7.1 km', roles: ['Photographer'] },
              ].map((person) => (
                <li key={person.name} className="flex items-center gap-3 px-4 py-3.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#c17745]/15 text-[11px] font-bold text-[#c17745]">
                    {initials(person.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-white/90">
                      {person.name}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1 text-[11px] text-white/35">
                      <MapPin className="size-3" />
                      {person.km} away
                    </span>
                  </span>
                  <span className="hidden gap-1 sm:flex">
                    {person.roles.map((r) => (
                      <span
                        key={r}
                        // Matches the app, where the role you searched for is
                        // highlighted so a person with five roles still shows
                        // why they are in this list.
                        className={
                          LOOKING_FOR.has(r)
                            ? 'rounded bg-[#c17745] px-1.5 py-0.5 text-[9px] font-bold text-white'
                            : 'rounded bg-[#c17745]/12 px-1.5 py-0.5 text-[9px] font-bold text-[#c17745]'
                        }
                      >
                        {r}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Says out loud what the panel is, in the same place and voice as
              the showcase's note. The names are of real creatives; the
              distances and the search are not a live query. */}
          <p className="mt-4 text-center text-[12px] leading-relaxed text-white/25">
            Interface shown as rendered by the app. People and distances are
            illustrative.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
