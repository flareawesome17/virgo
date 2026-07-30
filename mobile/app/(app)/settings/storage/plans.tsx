import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ArrowLeftIcon, HardDriveIcon, UsersIcon, ShieldIcon, ZapIcon,
  CheckIcon, InfinityIcon, ChevronRightIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(HardDriveIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UsersIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ShieldIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ZapIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CheckIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(InfinityIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ChevronRightIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const PLANS = [
  {
    key: 'free', name: 'Free', storage: '5 GB', priceMonthly: 0, priceYearly: 0,
    features: ['1 workspace', '5 GB storage', 'Basic sharing', '7-day retention'],
    color: '#A89489', recommended: false,
  },
  {
    key: 'creator', name: 'Creator', storage: '100 GB', priceMonthly: 9.99, priceYearly: 7.99,
    features: ['Unlimited workspaces', '100 GB storage', 'Priority support', '30-day retention', 'Offline sync', '2 collaborators'],
    color: '#B66A40', recommended: true,
  },
  {
    key: 'studio', name: 'Studio', storage: '500 GB', priceMonthly: 24.99, priceYearly: 19.99,
    features: ['Unlimited workspaces', '500 GB storage', 'Priority support', 'Custom retention', 'Offline sync', '10 collaborators', 'Advanced sharing', 'Custom watermark'],
    color: '#C17745', recommended: false,
  },
  {
    key: 'team', name: 'Team', storage: '2 TB', priceMonthly: 49.99, priceYearly: 39.99,
    features: ['Unlimited workspaces', '2 TB storage', 'Dedicated support', 'Custom retention', 'Offline sync', 'Unlimited collaborators', 'Admin controls', 'SSO / SAML', 'API access'],
    color: '#8B5E3C', recommended: false,
  },
];

export default function PlansScreen() {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

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
            <Text className="text-foreground text-[22px] font-bold tracking-tight">Storage Plans</Text>
            <Text className="text-muted-foreground text-sm mt-0.5">Choose the plan that fits your studio</Text>
          </View>
        </View>

        {/* Billing cycle toggle */}
        <View className="mx-5 mt-5 flex-row bg-muted rounded-2xl p-1">
          <Pressable onPress={() => setBillingCycle('monthly')}
            className={`flex-1 py-2.5 rounded-xl items-center active:scale-[0.97] ${billingCycle === 'monthly' ? 'bg-card shadow-sm' : ''}`}
            style={billingCycle === 'monthly' ? { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 } : undefined}>
            <Text className={`text-sm font-bold ${billingCycle === 'monthly' ? 'text-foreground' : 'text-muted-foreground'}`}>Monthly</Text>
          </Pressable>
          <Pressable onPress={() => setBillingCycle('yearly')}
            className={`flex-1 py-2.5 rounded-xl items-center active:scale-[0.97] ${billingCycle === 'yearly' ? 'bg-card shadow-sm' : ''}`}
            style={billingCycle === 'yearly' ? { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 } : undefined}>
            <View className="flex-row items-center gap-2">
              <Text className={`text-sm font-bold ${billingCycle === 'yearly' ? 'text-foreground' : 'text-muted-foreground'}`}>Yearly</Text>
              <View className="bg-[#6B8E4E18] rounded-md px-1.5 py-0.5">
                <Text className="text-[#6B8E4E] text-[10px] font-bold">-20%</Text>
              </View>
            </View>
          </Pressable>
        </View>

        {/* Plan cards */}
        <View className="px-5 mt-5 gap-4">
          {PLANS.map((plan) => {
            const price = billingCycle === 'monthly' ? plan.priceMonthly : plan.priceYearly;
            const isRec = plan.recommended;
            return (
              <Pressable key={plan.key}
                onPress={() => router.push(`/settings/storage/checkout?plan=${plan.key}&cycle=${billingCycle}`)}
                className={`rounded-2xl p-5 active:scale-[0.98] border-2 ${
                  isRec ? 'border-primary bg-primary/[0.02]' : 'border-transparent bg-card'
                }`}
                style={{ shadowColor: '#000', shadowOpacity: isRec ? 0.08 : 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: isRec ? 4 : 2 }}>
                {isRec && (
                  <View className="absolute -top-3 left-1/2 -ml-12 bg-primary rounded-full px-4 py-1">
                    <Text className="text-white text-[11px] font-bold">RECOMMENDED</Text>
                  </View>
                )}
                <View className="flex-row items-start justify-between mt-1">
                  <View>
                    <Text className={`text-base font-bold ${isRec ? 'text-primary' : 'text-foreground'}`}>{plan.name}</Text>
                    <Text className="text-muted-foreground text-xs mt-0.5">{plan.storage} storage</Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-foreground text-2xl font-extrabold">
                      {price === 0 ? 'Free' : `$${price}`}
                    </Text>
                    {price > 0 && (
                      <Text className="text-muted-foreground text-[11px]">/{billingCycle === 'monthly' ? 'mo' : 'mo · billed yearly'}</Text>
                    )}
                  </View>
                </View>
                <View className="mt-4 gap-2">
                  {plan.features.map((f) => (
                    <View key={f} className="flex-row items-center gap-2">
                      <CheckIcon size={13} className={isRec ? 'text-primary' : 'text-[#6B8E4E]'} />
                      <Text className="text-muted-foreground text-xs">{f}</Text>
                    </View>
                  ))}
                </View>
                <Pressable onPress={() => router.push(`/settings/storage/checkout?plan=${plan.key}&cycle=${billingCycle}`)}
                  className={`mt-4 rounded-xl py-3 items-center active:scale-[0.97] ${isRec ? 'bg-primary' : 'bg-muted'}`}>
                  <Text className={`text-sm font-bold ${isRec ? 'text-white' : 'text-foreground'}`}>
                    {price === 0 ? 'Current Plan' : isRec ? 'Upgrade to Creator' : `Choose ${plan.name}`}
                  </Text>
                </Pressable>
              </Pressable>
            );
          })}
        </View>

        {/* Compare all link */}
        <Pressable onPress={() => router.push('/settings/storage/compare')}
          className="mx-5 mt-6 bg-card rounded-2xl p-4 flex-row items-center gap-3 active:scale-[0.98]"
          style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
          <View className="w-10 h-10 rounded-xl bg-primary/10 items-center justify-center">
            <ShieldIcon size={18} className="text-primary" />
          </View>
          <View className="flex-1">
            <Text className="text-foreground text-sm font-semibold">Compare all plans</Text>
            <Text className="text-muted-foreground text-xs mt-0.5">See a side-by-side feature comparison</Text>
          </View>
          <ChevronRightIcon size={14} className="text-muted-foreground" />
        </Pressable>

        {/* Enterprise */}
        <Pressable className="mx-5 mt-4 bg-card rounded-2xl p-4 flex-row items-center gap-4 active:scale-[0.98]"
          style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#8B5E3C18', alignItems: 'center', justifyContent: 'center' }}>
            <ZapIcon size={18} style={{ color: '#8B5E3C' }} />
          </View>
          <View className="flex-1">
            <Text className="text-foreground text-sm font-semibold">Enterprise</Text>
            <Text className="text-muted-foreground text-xs mt-0.5">Custom storage, dedicated support, SLA</Text>
          </View>
          <ChevronRightIcon size={14} className="text-muted-foreground" />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
