import type { PlanInfo } from '@/api';
import { Check } from 'lucide-react';
import { SIGN_UP_URL } from '@/components/landing/links';
import { Slab } from '../../frames';
import { CH10_COPY as T } from '../../data/strings/page-ch10';
import { CONTACT_EMAIL } from '../../data/strings/page-faq';
import { Ch10Stage } from '../islands/ch10';

/**
 * Ch10 — Pricing · #pricing (storyboard §2 Ch10, §1.13).
 *
 * Free for now, and where the prices are heading. The plans are the page's
 * props (`/plans` on the server, the launch catalogue at build), never typed
 * here. The Free plan's star has risen above a horizon; the three upcoming
 * plans' stars sit below it, at depth. Only decoration dims: every word on a
 * "Soon" tier keeps full AA.
 *
 * Static first: this render is the final state. `Ch10Stage` arms and lights
 * it once on entry in motion mode (no scroll-linked motion here).
 */

const minor = (p: PlanInfo) => {
  const v = p.priceMinor ?? p.priceCents;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

/** ₱2,499 from 249900 centavos. Grouped by hand, no Intl, no decimals on whole pesos. */
function peso(m: number) {
  const whole = Math.round(m / 100);
  return `₱${String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/** 100 GB, 2 TB. */
function storage(bytes: number) {
  const tb = bytes / 1024 ** 4;
  if (tb >= 1) return `${Number(tb.toFixed(1))} TB`;
  return `${Math.round(bytes / 1024 ** 3)} GB`;
}

/** The cards' grid and the sky strip's share one template, so each star sits over its plan. */
const COLS = 'grid grid-cols-[1.2fr_1fr_1fr_1fr] gap-4 lg:grid-cols-[1.35fr_1fr_1fr_1fr] lg:gap-5';

export function Ch10({ plans }: { plans: PlanInfo[] }) {
  const free = plans.find((p) => !p.comingSoon && minor(p) === 0) ?? null;
  const soon = plans
    .filter((p) => p.comingSoon)
    .sort((a, b) => (minor(a) ?? 0) - (minor(b) ?? 0))
    .slice(0, 3);

  return (
    <section
      id="pricing"
      data-tone="night"
      data-chapter="pricing"
      aria-labelledby="pricing-title"
      className="relative z-10 bg-[#161311] [overflow-x:clip]"
    >
      {/* A faint warm ground, the page's horizon since Ch9 landed. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_55%_at_50%_100%,rgba(209,138,90,0.10),rgba(22,19,17,0)_70%)]"
      />
      <div className="relative mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
        <header>
          <p className="font-mono text-xs tracking-[0.14em] text-[#D18A5A] uppercase">{T.eyebrow}</p>
          <h2
            id="pricing-title"
            className="mt-3 max-w-[18ch] text-[clamp(2rem,1.3rem+3.4vw,4.25rem)] leading-none font-semibold tracking-[-0.03em] text-[#F2EDE8]"
          >
            {T.title}
          </h2>
          <p className="mt-5 max-w-[34ch] text-[1.0625rem] leading-[1.55] text-[#BCADA3] sm:text-lg lg:max-w-[52ch] lg:text-xl">
            {T.lead}
          </p>
        </header>

        <Ch10Stage>
          {/* The sky strip: Free's star above the horizon, the others below it at depth. */}
          <div aria-hidden className="relative mt-10 h-28 sm:mt-14 sm:h-36">
            <div className="absolute inset-x-0 top-[58%] bottom-[-1.5rem] overflow-hidden [mask-image:linear-gradient(to_bottom,#000_10%,transparent)] [perspective:520px]">
              <div
                className="absolute inset-x-[-40%] top-0 h-[320%] origin-top"
                style={{
                  transform: 'rotateX(72deg)',
                  backgroundImage:
                    'repeating-linear-gradient(90deg, rgba(209,138,90,0.16) 0 1px, transparent 1px 64px), repeating-linear-gradient(0deg, rgba(209,138,90,0.12) 0 1px, transparent 1px 48px)',
                }}
              />
            </div>
            <div className="p-horizon absolute inset-x-0 top-[58%] h-px bg-[linear-gradient(90deg,rgba(209,138,90,0),rgba(240,200,142,0.75)_22%,rgba(209,138,90,0.45)_60%,rgba(209,138,90,0))]" />
            <div className="p-horizon absolute inset-x-[8%] top-[calc(58%-6px)] h-3 bg-[radial-gradient(50%_50%_at_25%_50%,rgba(240,200,142,0.22),rgba(240,200,142,0))]" />
            <div className={`absolute inset-0 ${COLS}`}>
              <div className="relative">
                <div className="p-free-star absolute top-[24%] left-1/2 -mt-12 -ml-12 size-24">
                  <span className="p-free-halo absolute inset-0 rounded-full bg-[radial-gradient(closest-side,rgba(240,200,142,0.42),rgba(240,200,142,0.12)_55%,rgba(240,200,142,0))]" />
                  <span className="absolute top-1/2 left-1/2 h-px w-16 -translate-x-1/2 bg-[linear-gradient(90deg,rgba(255,233,201,0),#FFE9C9,rgba(255,233,201,0))]" />
                  <span className="absolute top-1/2 left-1/2 h-12 w-px -translate-y-1/2 bg-[linear-gradient(180deg,rgba(255,233,201,0),#FFE9C9,rgba(255,233,201,0))]" />
                  <span className="absolute top-1/2 left-1/2 size-3 -translate-1/2 rounded-full bg-[radial-gradient(closest-side,#FFF6E8,#F0C88E_70%,rgba(240,200,142,0))]" />
                </div>
              </div>
              {soon.map((p, i) => (
                <div key={p.name} className="relative" data-tier-star={i}>
                  <div className="p-paid-star absolute top-[76%] left-1/2 -mt-3 -ml-3 size-6" style={{ ['--d' as string]: `${520 + i * 70}ms` }}>
                    <span className="p-paid-lift absolute inset-0 rounded-full bg-[radial-gradient(closest-side,rgba(242,237,232,0.55),rgba(242,237,232,0.12)_50%,rgba(242,237,232,0))] opacity-[0.28]" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <p className="sr-only">{T.caption}</p>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.35fr_1fr_1fr_1fr] lg:items-stretch lg:gap-5">
            {/* Free: the one plan anyone can have today. */}
            <div className="p-card" style={{ ['--d' as string]: '0ms' }}>
              <Slab radius="rounded-[1.75rem]" depth={12} shadow="drop" edge="card" className="h-full">
                <div className="relative flex h-full flex-col rounded-[1.75rem] border border-[#D18A5A]/45 bg-[linear-gradient(160deg,#2A211C_0%,#1E1916_45%,#191513_100%)] p-6 sm:p-8">
                  <div aria-hidden className="pointer-events-none absolute inset-x-8 -top-px h-px bg-[linear-gradient(90deg,rgba(240,200,142,0),rgba(240,200,142,0.8),rgba(240,200,142,0))]" />
                  {free ? (
                    <>
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-[clamp(1.25rem,1.1rem+0.8vw,1.625rem)] leading-tight font-semibold text-[#F2EDE8]">{free.label}</h3>
                        <span className="rounded-full bg-[#D18A5A]/15 px-2.5 py-1 font-mono text-[11px] tracking-[0.12em] text-[#E9A877] uppercase">
                          {T.freeBadge}
                        </span>
                      </div>
                      <p className="mt-5 flex items-baseline gap-1.5">
                        <span className="text-5xl font-semibold tracking-[-0.03em] text-[#F2EDE8] tabular-nums">{T.freePrice}</span>
                        <span className="text-base text-[#BCADA3]">{T.freePriceNote}</span>
                      </p>
                      <ul className="mt-6 grid gap-3 text-base text-[#E4DCD5]">
                        {free.features.map((f) => (
                          <li key={f} className="flex items-start gap-3">
                            <Check aria-hidden className="mt-1 size-4 shrink-0 text-[#D18A5A]" strokeWidth={2.5} />
                            {f}
                          </li>
                        ))}
                      </ul>
                      <a
                        href={SIGN_UP_URL}
                        className="mt-8 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[#D18A5A] px-6 text-base font-semibold text-[#161311] transition-colors hover:bg-[#E09A69] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#F2EDE8] lg:mt-auto"
                      >
                        {T.startFree}
                      </a>
                    </>
                  ) : (
                    <>
                      <h3 className="text-[clamp(1.25rem,1.1rem+0.8vw,1.625rem)] leading-tight font-semibold text-[#F2EDE8]">{T.fallbackTitle}</h3>
                      <p className="mt-3 text-base text-[#BCADA3]">{T.fallbackBody}</p>
                      <a
                        href={SIGN_UP_URL}
                        className="mt-8 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[#D18A5A] px-6 text-base font-semibold text-[#161311] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#F2EDE8]"
                      >
                        {T.seePlans}
                      </a>
                    </>
                  )}
                </div>
              </Slab>
            </div>

            {/* Soon: where pricing is heading. Nothing here can be bought. */}
            <div className="flex flex-col gap-4 lg:col-span-3">
              <p className="max-w-[60ch] text-base leading-[1.6] text-[#BCADA3]">
                <span className="mr-2 font-mono text-xs tracking-[0.14em] text-[#D18A5A] uppercase">{T.upcomingTitle}</span>
                {T.upcoming}{' '}
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="rounded-sm text-[#D18A5A] underline decoration-[#D18A5A]/40 underline-offset-4 hover:decoration-[#D18A5A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F2EDE8]"
                >
                  {T.tellUs}
                </a>
                {T.tellUsEnd}
              </p>
              <ul className="divide-y divide-white/[0.07] rounded-2xl border border-white/[0.08] bg-[#1A1614]/70 px-5 lg:grid lg:grid-cols-3 lg:items-start lg:gap-5 lg:divide-y-0 lg:border-0 lg:bg-transparent lg:px-0">
                {soon.map((p, i) => {
                  const m = minor(p);
                  return (
                    <li
                      key={p.name}
                      data-tier={i}
                      className="p-card flex items-center justify-between gap-4 py-4 lg:flex-col lg:items-start lg:justify-start lg:rounded-2xl lg:border lg:border-white/[0.08] lg:bg-[linear-gradient(170deg,#1C1816,#171312)] lg:p-6"
                      style={{ ['--d' as string]: `${120 + i * 70}ms` }}
                    >
                      <div className="min-w-0">
                        <h3 className="text-lg leading-tight font-medium text-[#F2EDE8] lg:text-[clamp(1.25rem,1.1rem+0.8vw,1.625rem)]">{p.label}</h3>
                        <p className="mt-1 text-sm text-[#9C8B81] tabular-nums lg:hidden">
                          {m !== null && (
                            <>
                              {peso(m)}
                              {T.perMonth} ·{' '}
                            </>
                          )}
                          {storage(p.storageBytes)}
                        </p>
                      </div>
                      <div className="hidden lg:mt-5 lg:block">
                        {m !== null && (
                          <p className="flex items-baseline gap-1">
                            <span className="text-3xl font-semibold tracking-[-0.02em] text-[#F2EDE8] tabular-nums">{peso(m)}</span>
                            <span className="text-sm text-[#9C8B81]">{T.perMonth}</span>
                          </p>
                        )}
                        <p className="mt-2 text-sm text-[#9C8B81]">{storage(p.storageBytes)}</p>
                      </div>
                      <span className="shrink-0 rounded-full border border-white/[0.14] px-2.5 py-1 font-mono text-[11px] tracking-[0.14em] text-[#BCADA3] uppercase lg:mt-6 lg:self-start">
                        {T.soon}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </Ch10Stage>
      </div>

      <style>{`
        .pricing-stage .p-free-star { transition: transform 300ms cubic-bezier(0.16,1,0.3,1) 260ms, opacity 300ms cubic-bezier(0.16,1,0.3,1) 260ms; }
        .pricing-stage .p-free-halo { transition: transform 1200ms cubic-bezier(0.16,1,0.3,1) 420ms, opacity 1200ms cubic-bezier(0.16,1,0.3,1) 420ms; }
        .pricing-stage .p-horizon { transition: transform 600ms cubic-bezier(0.16,1,0.3,1), opacity 600ms cubic-bezier(0.16,1,0.3,1); }
        .pricing-stage .p-paid-star { transition: transform 600ms cubic-bezier(0.16,1,0.3,1) var(--d), opacity 600ms cubic-bezier(0.16,1,0.3,1) var(--d); }
        .pricing-stage .p-card { transform: perspective(1000px) translateY(0) rotateX(0deg); transition: transform 900ms cubic-bezier(0.16,1,0.3,1) var(--d, 0ms); }
        .pricing-stage .p-paid-lift { transition: transform 200ms cubic-bezier(0.2,0,0,1); }
        html[data-motion='on'] .pricing-stage[data-state='armed'] .p-free-star { transform: translateY(44px) scale(0.4); opacity: 0; }
        html[data-motion='on'] .pricing-stage[data-state='armed'] .p-free-halo { transform: scale(0.3); opacity: 0; }
        html[data-motion='on'] .pricing-stage[data-state='armed'] .p-horizon { transform: scaleX(0); opacity: 0; }
        html[data-motion='on'] .pricing-stage[data-state='armed'] .p-paid-star { transform: translateY(-14px); opacity: 0; }
        html[data-motion='on'] .pricing-stage[data-state='armed'] .p-card { transform: perspective(1000px) translateY(22px) rotateX(8deg); }
        @media (min-width: 1024px) {
          html[data-motion='on'] .pricing-stage[data-state='armed'] .p-card { transform: perspective(1000px) translateY(32px) rotateX(14deg); }
        }
        @media (hover: hover) {
          .pricing-stage:has([data-tier='0']:hover) [data-tier-star='0'] .p-paid-lift,
          .pricing-stage:has([data-tier='1']:hover) [data-tier-star='1'] .p-paid-lift,
          .pricing-stage:has([data-tier='2']:hover) [data-tier-star='2'] .p-paid-lift { transform: translateY(-4px); opacity: 0.4; }
        }
        html:not([data-motion='on']) .pricing-stage * { transition: none !important; }
      `}</style>
    </section>
  );
}
