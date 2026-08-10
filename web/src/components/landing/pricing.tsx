'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Reveal } from './reveal';
import { SIGN_UP_URL } from './links';
import { formatMoney, planCurrency, planPrice, type PlanInfo } from '@/api';

const GB = 1024 ** 3;

function storageLabel(bytes: number): string {
  const gb = bytes / GB;
  return gb >= 1024 ? `${Math.round(gb / 1024)} TB` : `${Math.round(gb)} GB`;
}

/**
 * Pricing.
 *
 * The plans are passed in from the server, fetched from the same /plans
 * endpoint the app and the quota service use. A landing page with its own copy
 * of the prices is a page that will one day advertise a number the checkout
 * refuses to charge.
 */
export function LandingPricing({ plans }: { plans: PlanInfo[] }) {
  /**
   * Only what someone can actually buy today.
   *
   * A "Soon — price —, Not available yet" column sat at the point of highest
   * intent doing nothing but adding a third thing to weigh up. The fact that
   * more is coming is worth one line under the grid, not a third of it.
   */
  const sellable = plans.filter((plan) => !plan.comingSoon);
  const upcoming = plans.filter((plan) => plan.comingSoon);

  return (
    <section id="pricing" className="relative py-24 sm:py-32">
      <div className="rule-fade mx-auto mb-24 w-full max-w-6xl" />

      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#c17745]">
            Pricing
          </span>
          <h2 className="mt-3 text-balance text-3xl font-extrabold tracking-tight text-white sm:text-[2.6rem] sm:leading-[1.1]">
            Start free. Pay when it earns.
          </h2>
          <p className="mt-4 text-pretty text-[15px] leading-relaxed text-white/55">
            In pesos, billed monthly, cancel whenever. Card, GCash, Maya and
            GrabPay — handled by PayMongo, so your card details never reach us.
          </p>
        </Reveal>

        {sellable.length === 0 ? (
          // The API was unreachable at build time. Better to send people to
          // sign-up than to invent numbers on a pricing page.
          <Reveal className="mt-14 text-center">
            <a
              href={SIGN_UP_URL}
              className="inline-flex rounded-xl bg-[#c17745] px-7 py-3.5 text-[15px] font-bold text-white"
            >
              See plans in the app
            </a>
          </Reveal>
        ) : (
          <div
            className={cn(
              'mx-auto mt-14 grid max-w-4xl gap-5',
              sellable.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3',
            )}
          >
            {sellable.map((plan, i) => {
              const minor = planPrice(plan);
              const featured = plan.name === 'freelance';

              return (
                <Reveal key={plan.name} delay={i * 90}>
                  <div
                    className={cn(
                      'flex h-full flex-col rounded-2xl border p-6',
                      featured
                        ? 'border-[#c17745] bg-[#c17745]/[0.07] shadow-2xl shadow-[#c17745]/10'
                        : 'border-white/10 bg-white/[0.02]',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <h3 className="text-[15px] font-bold text-white">{plan.label}</h3>
                      {featured && (
                        <span className="rounded-full bg-[#c17745] px-2 py-0.5 text-[9px] font-bold tracking-wide text-white uppercase">
                          Most picked
                        </span>
                      )}
                      {plan.comingSoon && (
                        <span className="rounded-full border border-white/15 px-2 py-0.5 text-[9px] font-bold tracking-wide text-white/40 uppercase">
                          Soon
                        </span>
                      )}
                    </div>

                    <p className="mt-5 text-4xl font-extrabold tabular-nums text-white">
                      {plan.comingSoon || minor === null
                        ? '—'
                        : minor === 0
                          ? 'Free'
                          : formatMoney(minor, planCurrency(plan))}
                      {!plan.comingSoon && !!minor && (
                        <span className="text-sm font-normal text-white/40">/mo</span>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-white/40">
                      {storageLabel(plan.storageBytes)} cloud storage
                    </p>

                    <ul className="mt-6 flex flex-1 flex-col gap-2.5">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2.5">
                          <Check
                            className={cn(
                              'mt-0.5 size-3.5 shrink-0',
                              featured ? 'text-[#c17745]' : 'text-white/30',
                            )}
                          />
                          <span className="text-[13px] leading-snug text-white/55">
                            {feature}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {plan.comingSoon ? (
                      <span className="mt-7 block rounded-xl border border-white/10 py-3 text-center text-[13px] font-semibold text-white/30">
                        Not available yet
                      </span>
                    ) : (
                      <a
                        href={SIGN_UP_URL}
                        className={cn(
                          'mt-7 block rounded-xl py-3 text-center text-[13px] font-bold transition-colors active:scale-[0.98]',
                          featured
                            ? 'bg-[#c17745] text-white hover:bg-[#cd8250]'
                            : 'border border-white/15 text-white hover:bg-white/5',
                        )}
                      >
                        {minor === 0 ? 'Start free' : `Get ${plan.label}`}
                      </a>
                    )}
                  </div>
                </Reveal>
              );
            })}
          </div>
        )}

        {/* What used to be a dead third column, as one line. */}
        {upcoming.length > 0 && (
          <p className="mt-8 text-center text-[13px] text-white/40">
            {upcoming.map((plan) => plan.label).join(' and ')} for teams{' '}
            {upcoming.length === 1 ? 'is' : 'are'} in the works.
          </p>
        )}
      </div>
    </section>
  );
}
