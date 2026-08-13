'use client';

import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { Reveal } from './reveal';
import { SIGN_IN_URL, SIGN_UP_URL } from './links';

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

/**
 * The hero.
 *
 * Leads with the community, not the file storage. Anyone can sell a folder in
 * the cloud; the thing here that does not exist elsewhere is the other
 * photographers in it.
 *
 * Its entrance is staggered on load rather than on scroll — it is already in
 * view, so an IntersectionObserver would fire everything at once anyway.
 */
export function LandingHero() {
  return (
    <section id="top" className="grain relative overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-28">
      <div className="hero-glow hero-glow-animate" aria-hidden />

      <div className="relative mx-auto w-full max-w-6xl px-5 text-center sm:px-8">
        <Reveal from="none" delay={0}>
          <span className="figure inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/5 px-3.5 py-1.5 text-[11px] font-semibold text-white/70 uppercase backdrop-blur">
            <span className="size-1.5 rounded-full bg-[#c17745]" />
            Built in the Philippines, for Filipino creatives
          </span>
        </Reveal>

        <Reveal delay={80} className="mt-7">
          <Image
            src="/logo.png"
            alt=""
            width={72}
            height={72}
            priority
            className="mx-auto size-16 object-contain sm:size-[72px]"
          />
        </Reveal>

        <Reveal delay={140}>
          {/* Two weights, not one. The whole page was extrabold-or-nothing,
              which is why a 68px headline still read flat — there was no
              lighter mass for the heavy line to be heavy against. */}
          <h1 className="mx-auto mt-6 max-w-5xl text-balance text-[2.6rem] leading-[1.02] tracking-tight text-white sm:text-[4.25rem] lg:text-[5.25rem]">
            <span className="block font-medium text-white/70">
              Where creatives find
            </span>
            <span className="block font-extrabold bg-gradient-to-r from-[#e8b189] via-[#c17745] to-[#a85f38] bg-clip-text text-transparent">
              each other, and get paid.
            </span>
          </h1>
        </Reveal>

        <Reveal delay={220}>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-white/60 sm:text-lg">
            Virgo is a network of photographers, videographers, editors and
            HMUAs — and the workspace they run the job from. Find a second
            shooter near you, book them, shoot it, and hand the client a link
            that cleans itself up when the job is done.
          </p>
        </Reveal>

        <Reveal delay={300}>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={SIGN_UP_URL}
              className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#c17745] px-7 py-3.5 text-[15px] font-bold text-white shadow-xl shadow-[#c17745]/30 transition-all hover:bg-[#cd8250] hover:shadow-2xl hover:shadow-[#c17745]/40 active:scale-[0.98] sm:w-auto"
            >
              Join the community
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </a>
            {/* No Play icon. It sat on a button that opens a login form, so it
                promised a video that does not exist. */}
            <a
              href={SIGN_IN_URL}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-7 py-3.5 text-[15px] font-semibold text-white backdrop-blur transition-colors hover:bg-white/10 active:scale-[0.98] sm:w-auto"
            >
              Sign in
            </a>
          </div>
        </Reveal>

        <Reveal delay={380}>
          <p className="mt-5 text-xs text-white/35">
            Free plan with 15&nbsp;GB. No card needed to start.
          </p>
        </Reveal>

        <Reveal delay={460} className="mt-16 sm:mt-20">
          <HeroPanel />
        </Reveal>
      </div>
    </section>
  );
}

/**
 * Three of the six; the Nearby section further down shows the other three.
 * The same trio used to appear in both places, which is a tell: a reader who
 * scrolls meets the identical list twice and concludes the whole thing is
 * placeholder — on the one page whose job is to answer "is anyone actually
 * on this".
 *
 * Everyone here is a videographer because the panel's chrome says it is
 * filtering for one. It previously advertised a search for an SDE editor and
 * then returned an HMUA, which is the kind of detail that gives a mock away
 * to precisely the audience being pitched.
 */
const NEARBY_ROWS = [
  { name: 'Ernie Saavedra', meta: '2.2 km away', role: 'Videographer', tone: '#c17745' },
  { name: 'Juvanry Borata', meta: '5.6 km away', role: 'Videographer', tone: '#6b8e4e' },
  { name: 'Rellon Mark Allen', meta: '8.9 km away', role: 'Videographer', tone: '#5b7b9a' },
];

/**
 * A sketch of the product, drawn rather than screenshotted.
 *
 * Shows the hiring flow, because that is the part people have to see to
 * believe. A real screenshot would go stale the first time the UI moves.
 */

function HeroPanel() {
  return (
    <div className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-white/10 bg-[#1e1b18]/80 shadow-2xl shadow-black/50 backdrop-blur-xl">
      <div className="flex items-center gap-1.5 border-b border-white/8 px-4 py-3">
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="ml-3 text-[11px] font-medium text-white/30">
          Nearby · looking for a Videographer within 30 km
        </span>
      </div>

      <div className="divide-y divide-white/6">
        {NEARBY_ROWS.map((row) => (
          <div key={row.name} className="flex items-center gap-3 px-4 py-4 text-left sm:px-5">
            <span
              className="grid size-9 shrink-0 place-items-center rounded-full text-[11px] font-bold"
              style={{ background: `${row.tone}22`, color: row.tone }}
            >
              {initials(row.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-white/90">
                {row.name}
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-white/40">
                {row.meta}
              </span>
            </span>
            <span
              className="hidden shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold sm:block"
              style={{ background: `${row.tone}1f`, color: row.tone }}
            >
              {row.role}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
