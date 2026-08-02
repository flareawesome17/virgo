'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, Check, Info, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { AppShell, PageHeader } from '@/components/app-shell';
import { CenteredSpinner } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { usePlans, useUsage } from '@/hooks/useUsage';
import {
  useBilling,
  useCancelSubscription,
  useRefreshBilling,
  useSubscribe,
} from '@/hooks/useBilling';
import { formatMoney, type PlanInfo } from '@/api';

const GB = 1024 ** 3;

/** "15 GB", "1 TB" — TB once the number of gigabytes stops reading well. */
function storageLabel(bytes: number): string {
  const gb = bytes / GB;
  return gb >= 1024 ? `${Math.round(gb / 1024)} TB` : `${Math.round(gb)} GB`;
}

function dateLabel(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-PH', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Plans, and paying for one.
 *
 * The card never touches this app: starting a checkout returns a PayMongo URL
 * and the browser goes there. Coming back proves nothing — the plan changes
 * when PayMongo tells the server the money arrived — so the return trip
 * refetches and the screen reports what the server says rather than what the
 * redirect implies.
 */
function PlansContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const { plans, isLoading } = usePlans();
  const { usage } = useUsage();
  const { billing } = useBilling();
  const subscribe = useSubscribe();
  const cancel = useCancelSubscription();
  const refresh = useRefreshBilling();

  const [cancelling, setCancelling] = useState(false);
  /** Which plan's button is mid-flight. */
  const [starting, setStarting] = useState<string | null>(null);

  // ?paid=1 is where PayMongo sends people back to. It means "they came back",
  // not "they paid" — so this only prompts a refetch.
  useEffect(() => {
    if (searchParams.get('paid') !== '1') return;
    refresh();
    toast.success('Thanks — checking your payment', {
      description: 'Your plan updates as soon as PayMongo confirms it.',
    });
    router.replace('/settings/plans');
  }, [searchParams, router, refresh]);

  // `pro` predates the rename and carries the freelance limits.
  const raw = billing?.plan ?? usage?.plan ?? 'free';
  const currentPlan = raw === 'pro' ? 'freelance' : raw;
  const subscription = billing?.subscription ?? null;

  const upgrade = (plan: PlanInfo) => {
    setStarting(plan.name);
    subscribe.mutate(plan.name, {
      onSuccess: ({ checkoutUrl }) => {
        if (!checkoutUrl) {
          toast.error('PayMongo did not return a checkout page', {
            description: 'Nothing has been charged. Try again in a moment.',
          });
          return;
        }
        // Same tab: PayMongo redirects back here when it is done, and a popup
        // would be blocked as often as not.
        window.location.href = checkoutUrl;
      },
      onError: (err: Error) =>
        toast.error('Could not start checkout', { description: err.message }),
      onSettled: () => setStarting(null),
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
        description="Billed monthly in Philippine pesos. Cancel any time."
      />

      <div className="mx-auto w-full max-w-5xl px-6 py-6">
        {/* What they are on now, when it renews, and how to stop it. */}
        {subscription && subscription.status !== 'incomplete' && (
          <Card className="mb-6 border-primary/30">
            <CardContent className="flex flex-wrap items-center gap-4 py-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {plans.find((p) => p.name === subscription.planName)?.label ??
                    subscription.planName}
                  <span className="ml-2 font-normal text-muted-foreground">
                    {formatMoney(subscription.amountMinor, subscription.currency)} a month
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {subscription.status === 'past_due'
                    ? 'Your last payment did not go through. Update your card to keep this plan.'
                    : subscription.cancelledAt
                      ? `Cancelled — your access runs until ${dateLabel(subscription.currentPeriodEnd)}.`
                      : subscription.renews
                        ? `Renews on ${dateLabel(subscription.currentPeriodEnd)}.`
                        : `Paid until ${dateLabel(subscription.currentPeriodEnd)}. This does not renew on its own.`}
                </p>
              </div>
              {!subscription.cancelledAt &&
                ['active', 'past_due'].includes(subscription.status) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCancelling(true)}
                  >
                    Cancel plan
                  </Button>
                )}
            </CardContent>
          </Card>
        )}

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
                      {plan.comingSoon
                        ? '—'
                        : plan.priceMinor === 0
                          ? 'Free'
                          : formatMoney(plan.priceMinor, plan.currency)}
                      {plan.priceMinor > 0 && !plan.comingSoon && (
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
                      ) : plan.priceMinor === 0 ? null : (
                        <Button
                          className="w-full"
                          disabled={
                            starting !== null || billing?.paymentsEnabled === false
                          }
                          onClick={() => upgrade(plan)}
                        >
                          {starting === plan.name && (
                            <Loader2 className="size-4 animate-spin" />
                          )}
                          {billing?.paymentsEnabled === false
                            ? 'Payments unavailable'
                            : `Get ${plan.label}`}
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
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Payment is handled by PayMongo — card, GCash, Maya and GrabPay.
              Your card details never reach Virgo&rsquo;s servers.
            </p>
          </CardContent>
        </Card>

        <Card className="mt-3">
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

      <AlertDialog open={cancelling} onOpenChange={setCancelling}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel your plan?</AlertDialogTitle>
            <AlertDialogDescription>
              You keep everything until{' '}
              {dateLabel(subscription?.currentPeriodEnd ?? null) || 'the end of the period'}
              , which you have already paid for. After that the account returns
              to Free — nothing is deleted, but uploads stop once you are over
              the free storage limit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancel.isPending}
              onClick={(event) => {
                event.preventDefault();
                cancel.mutate('other', {
                  onSuccess: ({ accessUntil }) => {
                    setCancelling(false);
                    toast.success('Plan cancelled', {
                      description: accessUntil
                        ? `You keep it until ${dateLabel(accessUntil)}.`
                        : undefined,
                    });
                  },
                  onError: (err: Error) =>
                    toast.error('Could not cancel', { description: err.message }),
                });
              }}
            >
              {cancel.isPending && <Loader2 className="size-4 animate-spin" />}
              Cancel plan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

export default function PlansPage() {
  return (
    <Suspense fallback={null}>
      <PlansContent />
    </Suspense>
  );
}
