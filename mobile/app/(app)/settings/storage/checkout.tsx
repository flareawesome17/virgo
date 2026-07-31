import { View, Text, ScrollView, Pressable } from 'react-native';
import { useTheme } from '@/src/hooks';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeftIcon, ShieldIcon, CheckIcon, LockIcon, CreditCardIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ShieldIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CheckIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(LockIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CreditCardIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const PLAN_DATA: Record<string, { name: string; storage: string; priceMonthly: number; priceYearly: number; color: string }> = {
  creator: { name: 'Creator', storage: '100 GB', priceMonthly: 9.99, priceYearly: 7.99, color: '#B66A40' },
  studio: { name: 'Studio', storage: '500 GB', priceMonthly: 24.99, priceYearly: 19.99, color: '#C17745' },
  team: { name: 'Team', storage: '2 TB', priceMonthly: 49.99, priceYearly: 39.99, color: '#8B5E3C' },
  free: { name: 'Free', storage: '5 GB', priceMonthly: 0, priceYearly: 0, color: '#A89489' },
};

export default function CheckoutScreen() {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { plan: planKey = 'creator', cycle = 'monthly' } = useLocalSearchParams<{ plan?: string; cycle?: string }>();
  const plan = PLAN_DATA[planKey] || PLAN_DATA.creator;
  const price = cycle === 'monthly' ? plan.priceMonthly : plan.priceYearly;
  const period = cycle === 'monthly' ? 'month' : 'mo · billed yearly';
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Header */}
        <View className="px-5 pt-4 pb-2 flex-row items-center gap-3">
          <Pressable onPress={() => router.back()} className="w-10 h-10 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
            style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            <ArrowLeftIcon size={18} className="text-foreground" />
          </Pressable>
          <View>
            <Text className="text-foreground text-[22px] font-bold tracking-tight">Checkout</Text>
            <Text className="text-muted-foreground text-sm mt-0.5">Review your plan upgrade</Text>
          </View>
        </View>

        {/* Plan summary card */}
        <View className="mx-5 mt-4 bg-card rounded-2xl p-5" style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 }}>
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: `${plan.color}18`, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <ShieldIcon size={20} style={{ color: plan.color }} />
          </View>
          <Text className="text-foreground text-xl font-bold">{plan.name} Plan</Text>
          <Text className="text-muted-foreground text-sm mt-1">{plan.storage} · {cycle === 'monthly' ? 'Monthly' : 'Yearly'} billing</Text>
        </View>

        {/* Price summary */}
        <View className="mx-5 mt-4 bg-card rounded-2xl overflow-hidden" style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
          <View className="px-4 py-3.5 flex-row items-center justify-between" style={{ borderBottomWidth: 1, borderBottomColor: isDark ? '#2A2522' : '#F0E8E2' }}>
            <Text className="text-foreground text-sm">{plan.name} Plan</Text>
            <Text className="text-foreground text-sm font-semibold">${price}/{period}</Text>
          </View>
          <View className="px-4 py-3.5 flex-row items-center justify-between" style={{ borderBottomWidth: 1, borderBottomColor: isDark ? '#2A2522' : '#F0E8E2' }}>
            <Text className="text-foreground text-sm">Start date</Text>
            <Text className="text-muted-foreground text-sm">{today}</Text>
          </View>
          {cycle === 'yearly' && (
            <View className="px-4 py-3.5 flex-row items-center justify-between" style={{ borderBottomWidth: 1, borderBottomColor: isDark ? '#2A2522' : '#F0E8E2' }}>
              <Text className="text-foreground text-sm">Annual discount</Text>
              <Text className="text-[#6B8E4E] text-sm font-semibold">-20%</Text>
            </View>
          )}
          <View className="px-4 py-3.5 flex-row items-center justify-between bg-muted/50">
            <Text className="text-foreground text-base font-bold">Total due today</Text>
            <Text className="text-foreground text-xl font-extrabold">${price}</Text>
          </View>
        </View>

        {/* Features included */}
        <View className="px-5 mt-5">
          <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-3 ml-1">What’s Included</Text>
          <View className="bg-card rounded-2xl p-4 gap-3" style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            {[
              `${plan.storage} cloud storage`,
              'Unlimited workspaces',
              'Offline sync support',
              '30-day retention',
              'Priority email support',
            ].map((f) => (
              <View key={f} className="flex-row items-center gap-2">
                <CheckIcon size={14} className="text-[#6B8E4E]" />
                <Text className="text-foreground text-sm">{f}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Security note */}
        <View className="mx-5 mt-5 flex-row items-center gap-3 bg-card rounded-2xl px-4 py-3"
          style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
          <LockIcon size={14} className="text-muted-foreground" />
          <Text className="text-muted-foreground text-xs flex-1">Secure payment processed by Stripe. Your data is encrypted end-to-end.</Text>
        </View>
      </ScrollView>

      {/* Bottom CTA */}
      <View className="absolute bottom-0 left-0 right-0 px-5 pt-4 bg-background" style={{ paddingBottom: insets.bottom + 16 }}>
        <Pressable onPress={() => router.push(`/settings/storage/payment?plan=${planKey}&cycle=${cycle}`)}
          className="bg-primary rounded-2xl py-3.5 flex-row items-center justify-center gap-2 active:scale-[0.97]"
          style={{ shadowColor: '#B66A40', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 4 }}>
          <CreditCardIcon size={18} className="text-white" />
          <Text className="text-white text-base font-bold">Add Payment Method</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
