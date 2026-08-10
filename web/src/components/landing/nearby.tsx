'use client';

import { MapPin, Search } from 'lucide-react';
import { Reveal } from './reveal';

/**
 * "Kenn Francis" → "KF".
 *
 * The first two letters of the string gave "KE" and "JU", which reads as a
 * truncation bug rather than an avatar. Falls back to the first two letters
 * only for a single-word name.
 */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** The nine roles the product actually knows about. See api/src/auth/roles.ts. */
const ROLES = [
  'Photographer',
  'Videographer',
  'Photo Editor',
  'Video Editor',
  'SDE Editor Photo',
  'SDE Editor Video',
  'Coordinator',
  'Host',
  'HMUA',
];

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
        <Reveal from="left">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#c17745]">
            Nearby
          </span>
          <h2 className="mt-3 text-balance text-3xl font-extrabold tracking-tight text-white sm:text-[2.6rem] sm:leading-[1.1]">
            Need an SDE editor by Saturday?
          </h2>
          <p className="mt-5 text-pretty text-[15px] leading-relaxed text-white/55">
            Pick the role and the distance. Virgo shows the people around you
            who actually do that job — and somebody who both shoots and cuts the
            same-day edit turns up under either search.
          </p>
          <p className="mt-4 text-pretty text-[14px] leading-relaxed text-white/40">
            Discovery works both ways: only people sharing their location can
            see each other, and the only thing anyone learns is how far away you
            are. Turning it off erases the position rather than hiding it.
          </p>
        </Reveal>

        <Reveal from="right" delay={120}>
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#1e1b18]/80 shadow-2xl shadow-black/40 backdrop-blur-xl">
            <div className="flex items-center gap-2.5 border-b border-white/8 px-4 py-3.5">
              <Search className="size-3.5 text-white/30" />
              <span className="text-[12px] text-white/35">Looking for</span>
            </div>

            <div className="flex flex-wrap gap-2 border-b border-white/8 p-4">
              {ROLES.map((role) => {
                const on = role === 'SDE Editor Photo';
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
                { name: 'Ernie Saavedra', km: '1.8 km', roles: ['Videographer', 'SDE Editor Video'] },
                { name: 'Juvanry Borata', km: '4.3 km', roles: ['Photo Editor'] },
                { name: 'Rellon Mark Allen', km: '7.1 km', roles: ['Coordinator', 'Photographer'] },
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
                        className={
                          r === 'SDE Editor Photo'
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
        </Reveal>
      </div>
    </section>
  );
}
