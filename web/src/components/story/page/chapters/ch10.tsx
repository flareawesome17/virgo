import type { PlanInfo } from '@/api';
import { Check } from 'lucide-react';
import { SIGN_UP_URL } from '@/components/landing/links';
import { CH10_COPY as T } from '../../data/strings/page-ch10';
import { Ch10Film, FreeSweep } from '../islands/ch10';
import { Reveal } from '../scenes/ch9-reveal';

/**
 * Ch10 — Pricing · #pricing (05-cinema.md §3): "Free for now." Free is the
 * bright card; Freelancer, Studio and Business sit dimmed beside it, marked
 * Soon. The plans are the page's props (`/plans` on the server, the launch
 * catalogue at build), never typed here. Only the surfaces dim: every word on
 * a Soon card keeps AA contrast.
 *
 * One render serves both modes. In motion `Ch10Film` dollies the camera in
 * over the plans, each card eases in and out (`Reveal`: Free first, the Soon
 * tiers a beat behind), and `FreeSweep` runs one light sweep over Free.
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

/** 15 GB, 2 TB. */
function storage(bytes: number) {
  const tb = bytes / 1024 ** 4;
  if (tb >= 1) return `${Number(tb.toFixed(1))} TB`;
  return `${Math.round(bytes / 1024 ** 3)} GB`;
}

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#F2EDE8]';

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
      {/* A faint warm ground under the cards. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_50%_at_30%_70%,rgba(209,138,90,0.12),rgba(22,19,17,0)_70%)]"
      />
      <div className="relative mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
        <h2
          id="pricing-title"
          className="text-[clamp(2.25rem,1.3rem+4vw,5rem)] leading-none font-semibold tracking-[-0.035em] text-[#F2EDE8]"
        >
          {T.title}
        </h2>
        <p className="mt-5 text-[clamp(1.125rem,1rem+0.6vw,1.5rem)] leading-snug text-[#BCADA3]">
          {free ? `${storage(free.storageBytes)}. ` : ''}
          {T.sub}
        </p>

        <Ch10Film className="mt-12 grid gap-4 sm:mt-16 lg:grid-cols-[1.4fr_3fr] lg:items-stretch lg:gap-5">
          {/* Free: the one plan anyone can have today. */}
          <Reveal
            out={[0.9, 1]}
            className="relative flex flex-col rounded-[1.75rem] border border-[#D18A5A]/55 bg-[linear-gradient(160deg,#33261E_0%,#211A16_50%,#1A1513_100%)] p-6 shadow-[0_30px_80px_-30px_rgba(209,138,90,0.45),inset_0_1px_0_rgba(255,231,194,0.18)] sm:p-8"
          >
            <FreeSweep />
            <div aria-hidden className="pointer-events-none absolute inset-x-8 -top-px h-px bg-[linear-gradient(90deg,rgba(240,200,142,0),rgba(240,200,142,0.9),rgba(240,200,142,0))]" />
            {free ? (
              <>
                <h3 className="relative text-xl leading-tight font-semibold text-[#F2EDE8] sm:text-2xl">{free.label}</h3>
                <p className="relative mt-4 text-6xl font-semibold tracking-[-0.03em] text-[#FFF6E8] tabular-nums">{T.freePrice}</p>
                <ul className="relative mt-6 grid gap-2.5 text-base text-[#E4DCD5]">
                  {free.features.map((f) => (
                    <li key={f} className="flex items-start gap-3">
                      <Check aria-hidden className="mt-1 size-4 shrink-0 text-[#F0C88E]" strokeWidth={2.5} />
                      {f}
                    </li>
                  ))}
                </ul>
                <a
                  href={SIGN_UP_URL}
                  className={`relative mt-8 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[#D18A5A] px-6 text-base font-semibold text-[#161311] transition-colors hover:bg-[#E09A69] lg:mt-auto ${FOCUS}`}
                >
                  {T.startFree}
                </a>
              </>
            ) : (
              <>
                <h3 className="relative text-xl leading-tight font-semibold text-[#F2EDE8] sm:text-2xl">{T.fallbackTitle}</h3>
                <p className="relative mt-3 text-base text-[#BCADA3]">{T.fallbackBody}</p>
                <a
                  href={SIGN_UP_URL}
                  className={`relative mt-8 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[#D18A5A] px-6 text-base font-semibold text-[#161311] ${FOCUS}`}
                >
                  {T.seePlans}
                </a>
              </>
            )}
          </Reveal>

          {/* Soon: where pricing is heading. Nothing here can be bought. */}
          {soon.length > 0 && (
            <ul className="grid gap-3 sm:grid-cols-3 lg:gap-5">
              {soon.map((p, i) => {
                const m = minor(p);
                return (
                  <li key={p.name}>
                    <Reveal delay={0.04 * (i + 1)} className="flex h-full flex-col rounded-2xl border border-white/[0.07] bg-[#181412] p-5 sm:p-6">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-lg leading-tight font-medium text-[#BCADA3]">{p.label}</h3>
                      <span className="shrink-0 rounded-full border border-white/[0.14] px-2.5 py-1 font-mono text-[11px] tracking-[0.14em] text-[#BCADA3] uppercase">
                        {T.soon}
                      </span>
                    </div>
                    {m !== null && (
                      <p className="mt-4 flex items-baseline gap-1 sm:mt-6">
                        <span className="text-3xl font-semibold tracking-[-0.02em] text-[#BCADA3] tabular-nums">{peso(m)}</span>
                        <span className="text-sm text-[#9C8B81]">{T.perMonth}</span>
                      </p>
                    )}
                    <p className="mt-1 text-sm text-[#9C8B81]">{storage(p.storageBytes)}</p>
                    </Reveal>
                  </li>
                );
              })}
            </ul>
          )}
        </Ch10Film>
      </div>
    </section>
  );
}
