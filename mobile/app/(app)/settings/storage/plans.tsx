import { View, Text, ScrollView, Pressable, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeftIcon, CheckIcon, InfoIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { Linking } from 'react-native';
import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import {
  useBilling,
  useCancelSubscription,
  usePlans,
  useRefreshBilling,
  useSubscribe,
  useUsage,
} from '@/src/hooks';
import { formatMoney, planCurrency, planPrice } from '@/src/api';
import type { PlanInfo } from '@/src/api';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CheckIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(InfoIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const GB = 1024 ** 3;

/** "15 GB", "1 TB" — TB once the number of gigabytes stops reading well. */
function storageLabel(bytes: number): string {
  const gb = bytes / GB;
  if (gb >= 1024) return `${Math.round(gb / 1024)} TB`;
  return `${Math.round(gb)} GB`;
}

/**
 * A plan's price, from whichever field the server sent.
 *
 * Free only when the price is genuinely zero — an unknown price is a dash,
 * never "Free", or a cached catalogue advertises ₱1,400 as gratis.
 */
function priceLabel(plan: PlanInfo): string {
  const minor = planPrice(plan);
  if (minor === null) return '—';
  return minor === 0 ? 'Free' : formatMoney(minor, planCurrency(plan));
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
 * Subscription tiers, and paying for one.
 *
 * The plans come from the API, which serves the same table the quota service
 * enforces — a screen with its own copy of the limits eventually advertises
 * something the server will refuse.
 *
 * The card never touches the app. Upgrading opens PayMongo's hosted checkout
 * in the system browser, and coming back proves nothing: the plan changes when
 * PayMongo tells the server the money arrived. So the return trip refetches and
 * the screen shows what the server says.
 */
export default function PlansScreen() {
  const { plans, isLoading } = usePlans();
  const { usage } = useUsage();
  const { billing } = useBilling();
  const subscribe = useSubscribe();
  const cancelPlan = useCancelSubscription();
  const refresh = useRefreshBilling();
  const { paid } = useLocalSearchParams<{ paid?: string }>();
  const [starting, setStarting] = useState<string | null>(null);

  // PayMongo redirects to ?paid=1. That means "they came back", not "they
  // paid", so it only triggers a refetch.
  useEffect(() => {
    if (paid !== '1') return;
    refresh();
  }, [paid, refresh]);

  // `pro` predates the rename and carries the freelance limits.
  const rawPlan = billing?.plan ?? usage?.plan ?? 'free';
  const currentPlan = rawPlan === 'pro' ? 'freelance' : rawPlan;
  const subscription = billing?.subscription ?? null;

  const upgrade = (plan: PlanInfo) => {
    setStarting(plan.name);
    subscribe.mutate(plan.name, {
      onSuccess: async ({ checkoutUrl }) => {
        if (!checkoutUrl) {
          Alert.alert(
            'Checkout unavailable',
            'PayMongo did not return a payment page. Nothing has been charged — try again in a moment.',
          );
          return;
        }
        // The system browser, not an in-app view: this is a payment page, and
        // people should be able to see the address bar it is on.
        await Linking.openURL(checkoutUrl);
      },
      onError: (err: any) =>
        Alert.alert(
          'Could not start checkout',
          err?.message || 'Please try again.',
        ),
      onSettled: () => setStarting(null),
    });
  };

  const confirmCancel = () => {
    Alert.alert(
      'Cancel your plan?',
      `You keep everything until ${
        dateLabel(subscription?.currentPeriodEnd ?? null) || 'the end of the period'
      }, which you have already paid for. After that the account returns to Free.`,
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Cancel plan',
          style: 'destructive',
          onPress: () =>
            cancelPlan.mutate('other', {
              onError: (err: any) =>
                Alert.alert('Could not cancel', err?.message || 'Please try again.'),
            }),
        },
      ],
    );
  };

  const cardShadow = {
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  } as const;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 60 }}
      >
        <View className="px-5 pt-4 pb-2 flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
            style={cardShadow}
          >
            <ArrowLeftIcon size={18} className="text-foreground" />
          </Pressable>
          <View className="flex-1">
            <Text className="text-foreground text-[22px] font-bold tracking-tight">Plans</Text>
            <Text className="text-muted-foreground text-sm mt-0.5">
              Billed monthly. Cancel any time.
            </Text>
          </View>
        </View>

        {/* What they are on, when it renews, and how to stop it. */}
        {subscription && subscription.status !== 'incomplete' && (
          <View
            className="mx-5 mt-5 rounded-2xl p-4 bg-card"
            style={{ ...cardShadow, borderWidth: 1, borderColor: '#B66A4033' }}
          >
            <Text className="text-foreground text-sm font-bold">
              {plans.find((p) => p.name === subscription.planName)?.label ??
                subscription.planName}
              <Text className="text-muted-foreground font-normal">
                {'  '}
                {formatMoney(subscription.amountMinor, subscription.currency)} a month
              </Text>
            </Text>
            <Text className="text-muted-foreground text-xs mt-1 leading-4">
              {subscription.status === 'past_due'
                ? 'Your last payment did not go through. Update your card to keep this plan.'
                : subscription.cancelledAt
                  ? `Cancelled — your access runs until ${dateLabel(subscription.currentPeriodEnd)}.`
                  : subscription.renews
                    ? `Renews on ${dateLabel(subscription.currentPeriodEnd)}.`
                    : `Paid until ${dateLabel(subscription.currentPeriodEnd)}. This does not renew on its own.`}
            </Text>
            {!subscription.cancelledAt &&
              ['active', 'past_due'].includes(subscription.status) && (
                <Pressable
                  onPress={confirmCancel}
                  disabled={cancelPlan.isPending}
                  className="mt-3 rounded-xl py-2.5 items-center bg-muted active:scale-[0.97]"
                >
                  <Text className="text-foreground text-xs font-bold">
                    {cancelPlan.isPending ? 'Cancelling…' : 'Cancel plan'}
                  </Text>
                </Pressable>
              )}
          </View>
        )}

        {isLoading && plans.length === 0 ? (
          <View className="pt-16 items-center">
            <ActivityIndicator size="small" color="#B66A40" />
          </View>
        ) : (
          <View className="px-5 mt-5 gap-4">
            {plans.map((plan) => {
              const isCurrent = plan.name === currentPlan;
              // Freelance is the paid tier on offer; free is the floor and
              // studio is not purchasable yet.
              const highlight = plan.name === 'freelance' && !isCurrent;

              return (
                <View
                  key={plan.name}
                  className={`rounded-2xl p-5 border-2 ${
                    isCurrent
                      ? 'border-[#6B8E4E] bg-card'
                      : highlight
                        ? 'border-primary bg-card'
                        : 'border-transparent bg-card'
                  }`}
                  style={cardShadow}
                >
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1 min-w-0">
                      <View className="flex-row items-center gap-2">
                        <Text className="text-foreground text-base font-bold">
                          {plan.label}
                        </Text>
                        {isCurrent && (
                          <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: '#6B8E4E18' }}>
                            <Text style={{ color: '#6B8E4E', fontSize: 10, fontWeight: '700' }}>
                              CURRENT
                            </Text>
                          </View>
                        )}
                        {plan.comingSoon && (
                          <View className="rounded-full px-2 py-0.5 bg-muted">
                            <Text className="text-muted-foreground text-[10px] font-bold">
                              COMING SOON
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text className="text-muted-foreground text-xs mt-1">
                        {storageLabel(plan.storageBytes)} cloud storage
                      </Text>
                    </View>

                    <View className="items-end">
                      <Text className="text-foreground text-2xl font-extrabold">
                        {plan.comingSoon ? '—' : priceLabel(plan)}
                      </Text>
                      {(planPrice(plan) ?? 0) > 0 && !plan.comingSoon && (
                        <Text className="text-muted-foreground text-[11px]">/month</Text>
                      )}
                    </View>
                  </View>

                  <View className="mt-4 gap-2">
                    {plan.features.map((f) => (
                      <View key={f} className="flex-row items-center gap-2">
                        <CheckIcon
                          size={13}
                          className={highlight ? 'text-primary' : 'text-[#6B8E4E]'}
                        />
                        <Text className="text-muted-foreground text-xs flex-1">{f}</Text>
                      </View>
                    ))}
                  </View>

                  {isCurrent ? (
                    <View className="mt-4 rounded-xl py-3 items-center bg-muted">
                      <Text className="text-muted-foreground text-sm font-bold">
                        Your plan
                      </Text>
                    </View>
                  ) : plan.comingSoon ? (
                    <View className="mt-4 rounded-xl py-3 items-center bg-muted">
                      <Text className="text-muted-foreground text-sm font-bold">
                        Not available yet
                      </Text>
                    </View>
                  ) : planPrice(plan) === 0 ? null : (
                    <Pressable
                      onPress={() => upgrade(plan)}
                      disabled={
                        starting !== null || billing?.paymentsEnabled === false
                      }
                      className={`mt-4 rounded-xl py-3 items-center active:scale-[0.97] ${
                        billing?.paymentsEnabled === false ? 'bg-muted' : 'bg-primary'
                      }`}
                    >
                      <Text
                        className={`text-sm font-bold ${
                          billing?.paymentsEnabled === false
                            ? 'text-muted-foreground'
                            : 'text-white'
                        }`}
                      >
                        {billing?.paymentsEnabled === false
                          ? 'Payments unavailable'
                          : starting === plan.name
                            ? 'Opening checkout…'
                            : `Get ${plan.label}`}
                      </Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        )}

        <View
          className="mx-5 mt-5 flex-row items-start gap-3 bg-card rounded-2xl px-4 py-3.5"
          style={cardShadow}
        >
          <InfoIcon size={14} className="text-muted-foreground" />
          <Text className="text-muted-foreground text-xs flex-1 leading-5">
            Album limits are per workspace. Storage counts every photo, video and
            audio file you have uploaded, across all workspaces.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
