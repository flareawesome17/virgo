'use client';

import Image from 'next/image';
import { ArrowRight, Play } from 'lucide-react';
import { Reveal } from './reveal';
import { SIGN_IN_URL, SIGN_UP_URL } from './links';

/**
 * The hero.
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
          <span className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/5 px-3.5 py-1.5 text-[11px] font-semibold tracking-wide text-white/70 uppercase backdrop-blur">
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
          <h1 className="mx-auto mt-6 max-w-4xl text-balance text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-[4.25rem]">
            Every shoot, every file,
            <br className="hidden sm:block" />{' '}
            <span className="bg-gradient-to-r from-[#e0a274] via-[#c17745] to-[#b66a40] bg-clip-text text-transparent">
              and everyone on it.
            </span>
          </h1>
        </Reveal>

        <Reveal delay={220}>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-white/60 sm:text-lg">
            Virgo is the workspace photographers and videographers actually run
            a business from — albums your clients can open without an account,
            a team you can message in real time, and a calendar everyone has
            said yes to.
          </p>
        </Reveal>

        <Reveal delay={300}>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={SIGN_UP_URL}
              className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#c17745] px-7 py-3.5 text-[15px] font-bold text-white shadow-xl shadow-[#c17745]/30 transition-all hover:bg-[#cd8250] hover:shadow-2xl hover:shadow-[#c17745]/40 active:scale-[0.98] sm:w-auto"
            >
              Create your account
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </a>
            <a
              href={SIGN_IN_URL}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-7 py-3.5 text-[15px] font-semibold text-white backdrop-blur transition-colors hover:bg-white/10 active:scale-[0.98] sm:w-auto"
            >
              <Play className="size-3.5 fill-current" />
              Sign in
            </a>
          </div>
        </Reveal>

        <Reveal delay={380}>
          <p className="mt-5 text-xs text-white/35">
            Free plan with 15&nbsp;GB. No card needed to start.
          </p>
        </Reveal>

        {/* A suggestion of the product, drawn rather than screenshotted — a
            real screenshot would go stale the first time the UI moves. */}
        <Reveal delay={460} className="mt-16 sm:mt-20">
          <HeroPanel />
        </Reveal>
      </div>
    </section>
  );
}

const PANEL_ROWS = [
  { name: 'Reyes Wedding — Ceremony', meta: 'Shoot · Sat, 6 Sept · 3:00 PM', tone: '#c17745', going: '4 going' },
  { name: 'Same-day edit — Reyes', meta: 'SDE Editor Photo · Due 6 Sept', tone: '#6b8e4e', going: '2 going' },
  { name: 'Delivery — Cruz prenup', meta: 'Client link opened 3 times', tone: '#5b7b9a', going: null },
];

function HeroPanel() {
  return (
    <div className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-white/10 bg-[#1e1b18]/80 shadow-2xl shadow-black/50 backdrop-blur-xl">
      <div className="flex items-center gap-1.5 border-b border-white/8 px-4 py-3">
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="ml-3 text-[11px] font-medium text-white/30">
          web.virgo.ph / schedule
        </span>
      </div>

      <div className="divide-y divide-white/6">
        {PANEL_ROWS.map((row) => (
          <div key={row.name} className="flex items-center gap-3 px-4 py-4 text-left sm:px-5">
            <span
              className="size-9 shrink-0 rounded-lg"
              style={{ background: `${row.tone}22`, border: `1px solid ${row.tone}44` }}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-white/90">
                {row.name}
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-white/40">
                {row.meta}
              </span>
            </span>
            {row.going && (
              <span className="hidden shrink-0 rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/50 sm:block">
                {row.going}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
