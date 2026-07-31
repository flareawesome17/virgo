import { View, Text, ScrollView, Pressable } from 'react-native';
import { useTheme } from '@/src/hooks';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  ArrowLeftIcon, CheckIcon, XIcon, ZapIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CheckIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(XIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ZapIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const FEATURES = [
  { label: 'Storage', free: '5 GB', creator: '100 GB', studio: '500 GB', team: '2 TB' },
  { label: 'Workspaces', free: '1', creator: 'Unlimited', studio: 'Unlimited', team: 'Unlimited' },
  { label: 'Collaborators', free: '1', creator: '2', studio: '10', team: 'Unlimited' },
  { label: 'Retention', free: '7 days', creator: '30 days', studio: 'Custom', team: 'Custom' },
  { label: 'Offline Sync', free: false, creator: true, studio: true, team: true },
  { label: 'Custom Watermark', free: false, creator: false, studio: true, team: true },
  { label: 'Advanced Sharing', free: false, creator: false, studio: true, team: true },
  { label: 'Admin Controls', free: false, creator: false, studio: false, team: true },
  { label: 'SSO / SAML', free: false, creator: false, studio: false, team: true },
  { label: 'API Access', free: false, creator: false, studio: false, team: true },
  { label: 'Priority Support', free: false, creator: true, studio: true, team: false },
  { label: 'Dedicated Support', free: false, creator: false, studio: false, team: true },
];

const PLAN_HEADERS = [
  { key: 'free', label: 'Free', color: '#A89489' },
  { key: 'creator', label: 'Creator', color: '#B66A40', recommended: true },
  { key: 'studio', label: 'Studio', color: '#C17745' },
  { key: 'team', label: 'Team', color: '#8B5E3C' },
];

export default function ComparePlansScreen() {
  const { isDark } = useTheme();
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ minWidth: 520 }}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 80 }}>
            {/* Header */}
            <View className="px-5 pt-4 pb-4 flex-row items-center gap-3">
              <Pressable onPress={() => router.back()} className="w-10 h-10 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
                style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
                <ArrowLeftIcon size={18} className="text-foreground" />
              </Pressable>
              <Text className="text-foreground text-[22px] font-bold tracking-tight">Compare Plans</Text>
            </View>

            {/* Table */}
            <View className="mx-5 bg-card rounded-2xl overflow-hidden" style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3 }}>
              {/* Plan headers */}
              <View className="flex-row" style={{ borderBottomWidth: 1, borderBottomColor: isDark ? '#2A2522' : '#F0E8E2' }}>
                <View style={{ width: 130 }} className="p-4 justify-end">
                  <Text className="text-muted-foreground text-[10px] font-bold uppercase tracking-[1.5px]">Feature</Text>
                </View>
                {PLAN_HEADERS.map((h) => (
                  <View key={h.key} style={{ width: 90 }} className={`p-4 items-center ${h.recommended ? 'bg-primary/[0.03]' : ''}`}>
                    {h.recommended && (
                      <View className="bg-primary rounded-full px-2 py-0.5 mb-1.5"><Text className="text-white text-[9px] font-bold">BEST</Text></View>
                    )}
                    <Text className={`text-sm font-bold ${h.recommended ? 'text-primary' : 'text-foreground'}`}>{h.label}</Text>
                  </View>
                ))}
              </View>

              {/* Feature rows */}
              {FEATURES.map((f, i) => (
                <View key={f.label} className="flex-row" style={i < FEATURES.length - 1 ? { borderBottomWidth: 1, borderBottomColor: isDark ? '#2A2522' : '#F0E8E2' } : undefined}>
                  <View style={{ width: 130 }} className="p-3.5 justify-center">
                    <Text className="text-foreground text-xs font-semibold">{f.label}</Text>
                  </View>
                  {(['free', 'creator', 'studio', 'team'] as const).map((key) => {
                    const val = f[key as keyof typeof f];
                    const col = PLAN_HEADERS.find(h => h.key === key)!;
                    return (
                      <View key={key} style={{ width: 90 }} className={`p-3.5 items-center justify-center ${col.recommended ? 'bg-primary/[0.015]' : ''}`}>
                        {typeof val === 'boolean' ? (
                          val ? <CheckIcon size={16} className="text-[#6B8E4E]" /> : <XIcon size={14} className="text-muted-foreground/30" />
                        ) : (
                          <Text className={`text-xs font-semibold text-center ${col.recommended ? 'text-primary' : 'text-foreground'}`}>{val}</Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>

            {/* Upgrade CTA */}
            <Pressable onPress={() => router.push('/settings/storage/plans')}
              className="mx-5 mt-6 bg-primary rounded-2xl p-4 flex-row items-center justify-center gap-2 active:scale-[0.97]"
              style={{ shadowColor: '#B66A40', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 4 }}>
              <ZapIcon size={18} className="text-white" />
              <Text className="text-white text-base font-bold">See Plans & Pricing</Text>
            </Pressable>
          </ScrollView>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
