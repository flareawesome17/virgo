import { View, Text, ScrollView, Pressable, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeftIcon, CheckIcon, InfoIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { usePlans, useUsage } from '@/src/hooks';
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

function priceLabel(cents: number): string {
  if (cents === 0) return 'Free';
  const dollars = cents / 100;
  return `$${dollars % 1 === 0 ? dollars.toFixed(0) : dollars.toFixed(2)}`;
}

/**
 * Subscription tiers.
 *
 * The plans come from the API, which serves the same table the quota service
 * enforces — a screen with its own copy of the limits eventually advertises
 * something the server will refuse.
 *
 * The upgrade button does not open a card form. There is no billing backend
 * yet, and the previous checkout flow collected a card number and then simply
 * navigated to a success screen.
 */
export default function PlansScreen() {
  const { plans, isLoading } = usePlans();
  const { usage } = useUsage();

  // `pro` predates the rename and carries the freelance limits.
  const rawPlan = usage?.plan ?? 'free';
  const currentPlan = rawPlan === 'pro' ? 'freelance' : rawPlan;

  const upgrade = (plan: PlanInfo) => {
    Alert.alert(
      `${plan.label} — ${priceLabel(plan.priceCents)}/month`,
      'Payments are not connected yet, so this plan cannot be purchased from the app. Your account stays on its current plan until billing goes live.',
      [{ text: 'OK' }],
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
                        {plan.comingSoon ? '—' : priceLabel(plan.priceCents)}
                      </Text>
                      {plan.priceCents > 0 && !plan.comingSoon && (
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
                  ) : plan.priceCents === 0 ? null : (
                    <Pressable
                      onPress={() => upgrade(plan)}
                      className="mt-4 rounded-xl py-3 items-center bg-primary active:scale-[0.97]"
                    >
                      <Text className="text-white text-sm font-bold">
                        Upgrade to {plan.label}
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
