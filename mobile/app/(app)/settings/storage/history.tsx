import { View, Text, ScrollView, Pressable } from 'react-native';
import { useTheme } from '@/src/hooks';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  ArrowLeftIcon, CreditCardIcon, DownloadIcon, ChevronRightIcon,
  CheckCircleIcon, ClockIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CreditCardIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(DownloadIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ChevronRightIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CheckCircleIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ClockIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const INVOICES = [
  { id: 'INV-2025-004', date: 'Nov 28, 2025', amount: 24.99, plan: 'Studio', status: 'paid', card: 'Visa ···· 4242' },
  { id: 'INV-2025-003', date: 'Oct 28, 2025', amount: 24.99, plan: 'Studio', status: 'paid', card: 'Visa ···· 4242' },
  { id: 'INV-2025-002', date: 'Sep 28, 2025', amount: 24.99, plan: 'Studio', status: 'paid', card: 'Visa ···· 4242' },
  { id: 'INV-2025-001', date: 'Aug 28, 2025', amount: 9.99, plan: 'Creator', status: 'paid', card: 'Visa ···· 4242' },
];

const PAYMENT_METHODS = [
  { id: 'pm-1', brand: 'Visa', last4: '4242', exp: '11/27', isDefault: true, color: '#5B7B9A' },
];

export default function BillingHistoryScreen() {
  const { isDark } = useTheme();
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 80 }}>
        {/* Header */}
        <View className="px-5 pt-4 pb-2 flex-row items-center gap-3">
          <Pressable onPress={() => router.back()} className="w-10 h-10 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
            style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            <ArrowLeftIcon size={18} className="text-foreground" />
          </Pressable>
          <View>
            <Text className="text-foreground text-[22px] font-bold tracking-tight">Billing History</Text>
            <Text className="text-muted-foreground text-sm mt-0.5">Invoices & payment methods</Text>
          </View>
        </View>

        {/* Payment methods */}
        <View className="px-5 mt-5">
          <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-3 ml-1">Payment Method</Text>
          {PAYMENT_METHODS.map((pm) => (
            <View key={pm.id} className="bg-card rounded-2xl p-4 flex-row items-center gap-4"
              style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: `${pm.color}18`, alignItems: 'center', justifyContent: 'center' }}>
                <CreditCardIcon size={18} style={{ color: pm.color }} />
              </View>
              <View className="flex-1">
                <Text className="text-foreground text-sm font-bold">{pm.brand} ···· {pm.last4}</Text>
                <Text className="text-muted-foreground text-xs mt-0.5">Expires {pm.exp}{pm.isDefault ? ' · Default' : ''}</Text>
              </View>
              {pm.isDefault && (
                <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: '#6B8E4E18' }}>
                  <Text style={{ color: '#6B8E4E', fontSize: 10, fontWeight: '700' }}>DEFAULT</Text>
                </View>
              )}
            </View>
          ))}
        </View>

        {/* Invoice history */}
        <View className="px-5 mt-6">
          <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-3 ml-1">Invoice History</Text>
          <View className="bg-card rounded-2xl overflow-hidden" style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            {INVOICES.map((inv, i) => (
              <Pressable key={inv.id}
                className="flex-row items-center gap-3 px-4 py-3.5 active:bg-muted/30"
                style={i < INVOICES.length - 1 ? { borderBottomWidth: 1, borderBottomColor: isDark ? '#2A2522' : '#F0E8E2' } : undefined}>
                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: inv.status === 'paid' ? '#6B8E4E18' : '#C1774518', alignItems: 'center', justifyContent: 'center' }}>
                  {inv.status === 'paid' ? <CheckCircleIcon size={14} style={{ color: '#6B8E4E' }} /> : <ClockIcon size={14} style={{ color: '#C17745' }} />}
                </View>
                <View className="flex-1 min-w-0">
                  <Text className="text-foreground text-sm font-semibold">{inv.id}</Text>
                  <Text className="text-muted-foreground text-xs mt-0.5">{inv.date} · {inv.plan} Plan · {inv.card}</Text>
                </View>
                <View className="items-end">
                  <Text className="text-foreground text-sm font-bold">${inv.amount}</Text>
                  <Pressable className="flex-row items-center gap-0.5 mt-0.5 active:opacity-60">
                    <DownloadIcon size={9} className="text-primary" />
                    <Text className="text-primary text-[10px] font-semibold">PDF</Text>
                  </Pressable>
                </View>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Summary card */}
        <View className="mx-5 mt-6 bg-card rounded-2xl p-4" style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
          <View className="flex-row justify-between mb-2">
            <Text className="text-muted-foreground text-sm">Total spent (2025)</Text>
            <Text className="text-foreground text-sm font-bold">$99.96</Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-muted-foreground text-sm">Current plan</Text>
            <Text className="text-primary text-sm font-bold">Studio · $24.99/mo</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
