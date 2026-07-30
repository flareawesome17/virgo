import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  ArrowLeftIcon, HardDriveIcon, CloudIcon, ImageIcon, VideoIcon,
  MusicIcon, ChevronRightIcon, ShieldIcon, ZapIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(HardDriveIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CloudIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ImageIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(VideoIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MusicIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ChevronRightIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ShieldIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ZapIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const WORKSPACE_BREAKDOWN = [
  { name: 'Autumn Collection', media: 78.2, color: '#B66A40' },
  { name: 'Riverside Wedding', media: 94.5, color: '#C17745' },
  { name: 'Brand Campaign — Alinea', media: 42.1, color: '#8B5E3C' },
  { name: 'Personal Archive', media: 32.3, color: '#6B8E4E' },
  { name: 'Other', media: 7.3, color: '#A89489' },
];

const MEDIA_TYPES = [
  { type: 'Photos', icon: ImageIcon, size: 156.2, color: '#B66A40', pct: 61 },
  { type: 'Videos', icon: VideoIcon, size: 82.4, color: '#C17745', pct: 32 },
  { type: 'Audio', icon: MusicIcon, size: 15.8, color: '#8B5E3C', pct: 7 },
];

const STORAGE_USED = 254.4;
const STORAGE_LIMIT = 512;
const USED_PCT = Math.round((STORAGE_USED / STORAGE_LIMIT) * 100);

export default function StorageOverviewScreen() {
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
            <Text className="text-foreground text-[22px] font-bold tracking-tight">Storage</Text>
            <Text className="text-muted-foreground text-sm mt-0.5">Manage your cloud storage</Text>
          </View>
        </View>

        {/* Hero gauge */}
        <View className="mx-5 mt-4 bg-card rounded-3xl p-6 items-center" style={{ shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 5 }}>
          {/* Radial-like gauge */}
          <View className="relative mb-4">
            <View style={{ width: 140, height: 140, borderRadius: 70, borderWidth: 14, borderColor: '#F0E8E2' }} />
            <View style={{ position: 'absolute', top: -7, left: -7, width: 140, height: 140, borderRadius: 70, borderWidth: 14, borderColor: 'transparent', borderTopColor: '#B66A40', borderRightColor: '#B66A40', transform: [{ rotate: '45deg' }], opacity: 0.85 }} />
            <View className="absolute inset-0 items-center justify-center">
              <Text className="text-foreground text-4xl font-extrabold">{USED_PCT}<Text className="text-muted-foreground text-lg">%</Text></Text>
              <Text className="text-muted-foreground text-xs mt-0.5">used</Text>
            </View>
          </View>
          <Text className="text-foreground text-lg font-bold">{STORAGE_USED} GB <Text className="text-muted-foreground text-sm font-medium">of {STORAGE_LIMIT} GB</Text></Text>
          <View className="w-full h-2.5 bg-muted rounded-full mt-4 overflow-hidden">
            <View className="h-full rounded-full" style={{ width: `${USED_PCT}%`, backgroundColor: USED_PCT > 80 ? '#C76B4A' : '#B66A40' }} />
          </View>
          <Text className="text-muted-foreground text-xs mt-2 font-medium">{STORAGE_LIMIT - STORAGE_USED} GB remaining</Text>
        </View>

        {/* Upgrade CTA */}
        <Pressable onPress={() => router.push('/settings/storage/plans')}
          className="mx-5 mt-4 bg-primary rounded-2xl p-4 flex-row items-center justify-center gap-2 active:scale-[0.97]"
          style={{ shadowColor: '#B66A40', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 4 }}>
          <ZapIcon size={18} className="text-white" />
          <Text className="text-white text-base font-bold">Upgrade Storage</Text>
        </Pressable>

        {/* Media type breakdown */}
        <View className="px-5 mt-6">
          <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-3 ml-1">Media Breakdown</Text>
          <View className="bg-card rounded-2xl p-4 gap-4" style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            {MEDIA_TYPES.map((m) => {
              const Icon = m.icon;
              return (
                <View key={m.type}>
                  <View className="flex-row items-center justify-between mb-1.5">
                    <View className="flex-row items-center gap-2">
                      <View style={{ width: 24, height: 24, borderRadius: 8, backgroundColor: `${m.color}18`, alignItems: 'center', justifyContent: 'center' }}>
                        <Icon size={12} style={{ color: m.color }} />
                      </View>
                      <Text className="text-foreground text-sm font-semibold">{m.type}</Text>
                    </View>
                    <Text className="text-foreground text-sm font-bold">{m.size} GB</Text>
                  </View>
                  <View className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <View className="h-full rounded-full" style={{ width: `${m.pct}%`, backgroundColor: m.color }} />
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Workspace breakdown */}
        <View className="px-5 mt-6">
          <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-3 ml-1">Workspace Breakdown</Text>
          <View className="bg-card rounded-2xl overflow-hidden" style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            {WORKSPACE_BREAKDOWN.map((ws, i) => (
              <View key={ws.name} className="flex-row items-center gap-3 px-4 py-3" style={i < WORKSPACE_BREAKDOWN.length - 1 ? { borderBottomWidth: 1, borderBottomColor: '#F0E8E2' } : undefined}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: ws.color }} />
                <Text className="text-foreground text-sm flex-1" numberOfLines={1}>{ws.name}</Text>
                <Text className="text-foreground text-sm font-bold">{ws.media.toFixed(1)} GB</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Billing history link */}
        <Pressable onPress={() => router.push('/settings/storage/history')}
          className="mx-5 mt-6 bg-card rounded-2xl p-4 flex-row items-center gap-4 active:scale-[0.98]"
          style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
          <View className="w-10 h-10 rounded-xl bg-primary/10 items-center justify-center">
            <ShieldIcon size={18} className="text-primary" />
          </View>
          <View className="flex-1">
            <Text className="text-foreground text-sm font-semibold">Billing History</Text>
            <Text className="text-muted-foreground text-xs mt-0.5">View invoices and payment history</Text>
          </View>
          <ChevronRightIcon size={14} className="text-muted-foreground" />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
