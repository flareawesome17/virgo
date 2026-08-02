'use client';

import Link from 'next/link';
import { ArrowLeft, Check, Info } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { AppShell, PageHeader } from '@/components/app-shell';
import { CenteredSpinner } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { usePlans, useUsage } from '@/hooks/useUsage';
import type { PlanInfo } from '@/api';

const GB = 1024 ** 3;

/** "15 GB", "1 TB" — TB once the number of gigabytes stops reading well. */
function storageLabel(bytes: number): string {
  const gb = bytes / GB;
  return gb >= 1024 ? `${Math.round(gb / 1024)} TB` : `${Math.round(gb)} GB`;
}

function priceLabel(cents: number): string {
  if (cents === 0) return 'Free';
  const dollars = cents / 100;
  return `$${dollars % 1 === 0 ? dollars.toFixed(0) : dollars.toFixed(2)}`;
}

/**
 * Plans.
 *
 * Served from the API, which reads the same table the quota service enforces —
 * a page with its own copy of the limits eventually advertises something the
 * server refuses.
 *
 * There is no checkout: no billing backend exists, and a card form in front of
 * nothing is worse than saying so.
 */
export default function PlansPage() {
  const { plans, isLoading } = usePlans();
  const { usage } = useUsage();

  // `pro` predates the rename and carries the freelance limits.
  const raw = usage?.plan ?? 'free';
  const currentPlan = raw === 'pro' ? 'freelance' : raw;

  const upgrade = (plan: PlanInfo) => {
    toast.info(`${plan.label} — ${priceLabel(plan.priceCents)}/month`, {
      description:
        'Payments are not connected yet, so this plan cannot be purchased. Your account stays on its current plan until billing goes live.',
    });
  };

  return (
    <AppShell title="Plans">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Button asChild size="icon" variant="ghost" className="-ml-2 shrink-0">
              <Link href="/settings" aria-label="Back">
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            Plans
          </span>
        }
        description="Billed monthly. Cancel any time."
      />

      <div className="mx-auto w-full max-w-5xl px-6 py-6">
        {isLoading && plans.length === 0 ? (
          <CenteredSpinner />
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            {plans.map((plan) => {
              const isCurrent = plan.name === currentPlan;
              const highlight = plan.name === 'freelance' && !isCurrent;

              return (
                <Card
                  key={plan.name}
                  className={cn(
                    'flex flex-col border-2',
                    isCurrent
                      ? 'border-success'
                      : highlight
                        ? 'border-primary'
                        : 'border-transparent',
                  )}
                >
                  <CardContent className="flex flex-1 flex-col py-6">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold">{plan.label}</h2>
                      {isCurrent && (
                        <Badge className="bg-success/15 text-[10px] text-success">CURRENT</Badge>
                      )}
                      {plan.comingSoon && (
                        <Badge variant="secondary" className="text-[10px]">
                          COMING SOON
                        </Badge>
                      )}
                    </div>

                    <p className="mt-4 text-3xl font-extrabold tabular-nums">
                      {plan.comingSoon ? '—' : priceLabel(plan.priceCents)}
                      {plan.priceCents > 0 && !plan.comingSoon && (
                        <span className="text-sm font-normal text-muted-foreground">
                          /month
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {storageLabel(plan.storageBytes)} cloud storage
                    </p>

                    <ul className="mt-5 flex flex-1 flex-col gap-2">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2">
                          <Check
                            className={cn(
                              'mt-0.5 size-3.5 shrink-0',
                              highlight ? 'text-primary' : 'text-success',
                            )}
                          />
                          <span className="text-xs text-muted-foreground">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-6">
                      {isCurrent ? (
                        <Button variant="secondary" className="w-full" disabled>
                          Your plan
                        </Button>
                      ) : plan.comingSoon ? (
                        <Button variant="secondary" className="w-full" disabled>
                          Not available yet
                        </Button>
                      ) : plan.priceCents === 0 ? null : (
                        <Button className="w-full" onClick={() => upgrade(plan)}>
                          Upgrade to {plan.label}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <Card className="mt-6">
          <CardContent className="flex items-start gap-3 py-4">
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Album limits are counted per workspace, not in total. Storage
              counts every photo, video and audio file you have uploaded, across
              all workspaces.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
