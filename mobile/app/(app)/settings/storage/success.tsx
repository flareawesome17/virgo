import { View, Text, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import {
  CheckCircleIcon, ShieldIcon, HardDriveIcon, DownloadIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';

cssInterop(CheckCircleIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ShieldIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(HardDriveIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(DownloadIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const PLAN_DATA: Record<string, { name: string; storage: string; priceMonthly: number; priceYearly: number; color: string }> = {
  creator: { name: 'Creator', storage: '100 GB', priceMonthly: 9.99, priceYearly: 7.99, color: '#B66A40' },
  studio: { name: 'Studio', storage: '500 GB', priceMonthly: 24.99, priceYearly: 19.99, color: '#C17745' },
  team: { name: 'Team', storage: '2 TB', priceMonthly: 49.99, priceYearly: 39.99, color: '#8B5E3C' },
  free: { name: 'Free', storage: '5 GB', priceMonthly: 0, priceYearly: 0, color: '#A89489' },
};

export default function PurchaseSuccessScreen() {
  const { plan: planKey = 'creator', cycle = 'monthly' } = useLocalSearchParams<{ plan?: string; cycle?: string }>();
  const plan = PLAN_DATA[planKey] || PLAN_DATA.creator;
  const price = cycle === 'monthly' ? plan.priceMonthly : plan.priceYearly;
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const orderId = `VGO-${today}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <View className="flex-1 px-5 justify-center items-center" style={{ paddingBottom: 60 }}>
        {/* Success icon */}
        <View className="w-24 h-24 rounded-full bg-[#6B8E4E18] items-center justify-center mb-6"
          style={{ shadowColor: '#6B8E4E', shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 0, height: 4 }, elevation: 6 }}>
          <CheckCircleIcon size={44} className="text-[#6B8E4E]" />
        </View>

        <Text className="text-foreground text-[26px] font-extrabold tracking-tight">Purchase Complete</Text>
        <Text className="text-muted-foreground text-sm mt-2 text-center">Your {plan.name} plan is now active</Text>

        {/* Plan detail card */}
        <View className="mt-8 bg-card rounded-2xl p-5 w-full" style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 5 }}>
          <View className="flex-row items-center gap-4 mb-5">
            <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: `${plan.color}18`, alignItems: 'center', justifyContent: 'center' }}>
              <ShieldIcon size={22} style={{ color: plan.color }} />
            </View>
            <View>
              <Text className="text-foreground text-base font-bold">{plan.name} Plan</Text>
              <Text className="text-muted-foreground text-sm">${price}/{cycle === 'monthly' ? 'month' : 'mo · yearly'}</Text>
            </View>
          </View>

          <View className="gap-2 pt-4" style={{ borderTopWidth: 1, borderTopColor: '#F0E8E2' }}>
            <Row label="Order ID" value={orderId} />
            <Row label="Storage" value={plan.storage} />
            <Row label="Billing" value={cycle === 'monthly' ? 'Monthly' : 'Yearly (-20%)'} />
            <Row label="Status" value="Active" valueColor="#6B8E4E" />
          </View>
        </View>

        {/* Quick actions */}
        <View className="mt-6 w-full gap-3">
          <Pressable onPress={() => router.push('/settings/storage/plans')}
            className="bg-card rounded-2xl p-4 flex-row items-center gap-3 active:scale-[0.98]"
            style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            <HardDriveIcon size={18} className="text-primary" />
            <Text className="text-foreground text-sm font-semibold flex-1">View Storage Overview</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/settings/storage/history')}
            className="bg-card rounded-2xl p-4 flex-row items-center gap-3 active:scale-[0.98]"
            style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            <DownloadIcon size={18} className="text-primary" />
            <Text className="text-foreground text-sm font-semibold flex-1">Download Receipt</Text>
          </Pressable>
        </View>

        {/* Back */}
        <Pressable onPress={() => router.navigate('/settings')}
          className="mt-5 py-3 active:scale-[0.97]">
          <Text className="text-primary text-sm font-semibold">Back to Settings</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View className="flex-row justify-between">
      <Text className="text-muted-foreground text-sm">{label}</Text>
      <Text className="text-foreground text-sm font-semibold" style={valueColor ? { color: valueColor } : undefined}>{value}</Text>
    </View>
  );
}
