'use client';

import { Check } from 'lucide-react';
import { Reveal } from './reveal';
import { SectionHeader } from './section-header';
import { SIGN_UP_URL } from './links';
import { formatMoney, planCurrency, planPrice, type PlanInfo } from '@/api';

const GB = 1024 ** 3;

function storageLabel(bytes: number): string {
  const gb = bytes / GB;
  return gb >= 1024 ? `${Math.round(gb / 1024)} TB` : `${Math.round(gb)} GB`;
}

/**
 * Pricing, during the pre-release.
 *
 * The plans are passed in from the server, fetched from the same /plans
 * endpoint the app and the quota service use. A landing page with its own copy
 * of the prices is a page that will one day advertise a number the checkout
 * refuses to charge.
 *
 * Two parts, because they are two different asks. Free is the only thing
 * anyone can act on, so it gets the whole width and the only button. The paid
 * ladder is shown priced but inert — the point of a pre-release is to hear
 * that ₱399 is wrong while that is still cheap to change, and you cannot hear
 * that if you never show the number.
 *
 * The previous version collapsed everything coming soon into one line of
 * prose. That was right when it was one unpriced tier; it would now throw away
 * the three figures most worth getting feedback on.
 */
export function LandingPricing({ plans }: { plans: PlanInfo[] }) {
  const free = plans.find((plan) => !plan.comingSoon);
  const upcoming = plans.filter((plan) => plan.comingSoon);

  return (
    <section id="pricing" className="relative py-24 sm:py-32">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <SectionHeader
          index="09"
          eyebrow="Pricing"
          align="center"
          title="Free while we are in pre-release."
          lead="No card, no trial clock. We would rather find out what a working photographer actually needs than guess at a price and be wrong about it."
        />

        {!free ? (
          // The API was unreachable at build time. Better to send people to
          // sign-up than to invent numbers on a pricing page.
          <Reveal className="mt-14 text-center">
            <a
              href={SIGN_UP_URL}
              className="inline-flex min-h-11 items-center rounded-xl bg-[#c17745] px-7 py-3.5 text-[15px] font-bold text-white"
            >
              See plans in the app
            </a>
          </Reveal>
        ) : (
          <Reveal delay={90} className="mx-auto mt-14 block max-w-md">
            <div className="flex h-full flex-col rounded-2xl border border-[#c17745] bg-[#c17745]/[0.07] p-6 shadow-2xl shadow-[#c17745]/10">
              <div className="flex items-center gap-2">
                <h3 className="text-[15px] font-bold text-white">{free.label}</h3>
                <span className="rounded-full bg-[#c17745] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                  Available now
                </span>
              </div>

              <p className="mt-5 text-4xl font-extrabold tabular-nums text-white">
                Free
              </p>
              <p className="mt-1 text-xs text-white/40">
                {storageLabel(free.storageBytes)} cloud storage
              </p>

              <ul className="mt-6 flex flex-1 flex-col gap-2.5">
                {free.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-[#c17745]" />
                    <span className="text-[13px] leading-snug text-white/55">
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              <a
                href={SIGN_UP_URL}
                className="mt-7 flex min-h-11 items-center justify-center rounded-xl bg-[#c17745] py-3 text-center text-[13px] font-bold text-white transition-colors hover:bg-[#cd8250] active:scale-[0.98]"
              >
                Start free
              </a>
            </div>
          </Reveal>
        )}

        {upcoming.length > 0 && (
          <Reveal delay={150} className="mt-16">
            <p className="text-center text-[13px] text-white/40">
              Where pricing is heading once the pre-release ends. Nothing here
              is charged yet — if a number looks wrong,{' '}
              <a
                href="mailto:hello@virgo.ph"
                className="text-white/60 underline hover:text-white"
              >
                tell us
              </a>
              .
            </p>

            <div className="mx-auto mt-6 grid max-w-4xl gap-4 sm:grid-cols-3">
              {upcoming.map((plan) => {
                const minor = planPrice(plan);
                return (
                  <div
                    key={plan.name}
                    className="rounded-xl border border-white/8 bg-white/[0.02] p-5"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="text-[13px] font-bold text-white/70">
                        {plan.label}
                      </h3>
                      <span className="text-[9px] font-bold uppercase tracking-wide text-white/25">
                        Soon
                      </span>
                    </div>
                    <p className="mt-2 text-xl font-extrabold tabular-nums text-white/80">
                      {minor === null
                        ? '—'
                        : formatMoney(minor, planCurrency(plan))}
                      <span className="text-[11px] font-normal text-white/30">
                        /mo
                      </span>
                    </p>
                    <p className="mt-1 text-[11px] text-white/35">
                      {storageLabel(plan.storageBytes)} storage
                    </p>
                  </div>
                );
              })}
            </div>
          </Reveal>
        )}
      </div>
    </section>
  );
}
