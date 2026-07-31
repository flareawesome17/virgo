import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  ArrowLeftIcon, HardDriveIcon, CloudIcon, ImageIcon, VideoIcon,
  MusicIcon, ChevronRightIcon, ShieldIcon, ZapIcon, FileIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { formatBytes } from '@/src/api';
import { useStorageBreakdown, useUsage, useTheme } from '@/src/hooks';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(HardDriveIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CloudIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ImageIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(VideoIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MusicIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ChevronRightIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ShieldIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ZapIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(FileIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/** Presentation for each media kind the API reports. */
const TYPE_META: Record<string, { label: string; icon: typeof ImageIcon; color: string }> = {
  image: { label: 'Photos', icon: ImageIcon, color: '#B66A40' },
  video: { label: 'Videos', icon: VideoIcon, color: '#C17745' },
  audio: { label: 'Audio', icon: MusicIcon, color: '#8B5E3C' },
  other: { label: 'Other', icon: FileIcon, color: '#A89489' },
};

/** Album row colours, cycled — the API returns names and sizes, not colours. */
const ALBUM_COLORS = ['#B66A40', '#C17745', '#8B5E3C', '#6B8E4E', '#5B7B9A', '#A89489'];

export default function StorageOverviewScreen() {
  const { isDark } = useTheme();
  // Every number on this screen used to be hardcoded — 254.4 GB of 512 GB with
  // an invented workspace breakdown, shown identically to every account.
  const { storageUsedBytes, storageLimitBytes, storageFraction, usage } = useUsage();
  const { breakdown } = useStorageBreakdown();

  const usedPct = Math.round(storageFraction * 100);
  const remainingBytes =
    storageLimitBytes != null ? Math.max(storageLimitBytes - storageUsedBytes, 0) : null;
  const fileCount = usage?.storage.fileCount ?? 0;

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

        {/* Hero gauge. The old version layered a fixed 45°-rotated arc over the
            ring, so the graphic showed the same amount whatever the real usage
            was — only the linear bar below tracks the number. */}
        <View className="mx-5 mt-4 bg-card rounded-3xl p-6 items-center" style={{ shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 5 }}>
          <View className="items-center justify-center mb-4" style={{ width: 140, height: 140, borderRadius: 70, borderWidth: 14, borderColor: isDark ? '#2A2522' : '#F0E8E2' }}>
            <Text className="text-foreground text-4xl font-extrabold">
              {storageLimitBytes != null ? usedPct : fileCount}
              <Text className="text-muted-foreground text-lg">{storageLimitBytes != null ? '%' : ''}</Text>
            </Text>
            <Text className="text-muted-foreground text-xs mt-0.5">
              {storageLimitBytes != null ? 'used' : `file${fileCount === 1 ? '' : 's'}`}
            </Text>
          </View>
          <Text className="text-foreground text-lg font-bold">
            {formatBytes(storageUsedBytes)}
            {storageLimitBytes != null && (
              <Text className="text-muted-foreground text-sm font-medium"> of {formatBytes(storageLimitBytes)}</Text>
            )}
          </Text>
          {storageLimitBytes != null && (
            <>
              <View className="w-full h-2.5 bg-muted rounded-full mt-4 overflow-hidden">
                <View className="h-full rounded-full" style={{ width: `${usedPct}%`, backgroundColor: usedPct > 80 ? '#C76B4A' : '#B66A40' }} />
              </View>
              <Text className="text-muted-foreground text-xs mt-2 font-medium">
                {formatBytes(remainingBytes ?? 0)} remaining
              </Text>
            </>
          )}
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
            {breakdown.byType.length === 0 ? (
              <Text className="text-muted-foreground text-sm text-center py-2">
                Nothing stored yet.
              </Text>
            ) : (
              breakdown.byType.map((row) => {
                const meta = TYPE_META[row.kind] ?? TYPE_META.other;
                const Icon = meta.icon;
                const pct = storageUsedBytes > 0 ? (row.bytes / storageUsedBytes) * 100 : 0;
                return (
                  <View key={row.kind}>
                    <View className="flex-row items-center justify-between mb-1.5">
                      <View className="flex-row items-center gap-2">
                        <View style={{ width: 24, height: 24, borderRadius: 8, backgroundColor: `${meta.color}18`, alignItems: 'center', justifyContent: 'center' }}>
                          <Icon size={12} style={{ color: meta.color }} />
                        </View>
                        <Text className="text-foreground text-sm font-semibold">{meta.label}</Text>
                      </View>
                      <Text className="text-foreground text-sm font-bold">{formatBytes(row.bytes)}</Text>
                    </View>
                    <View className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <View className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: meta.color }} />
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </View>

        {/* Album breakdown. Files are attached to albums, not workspaces, so
            this reports the level the data actually has. */}
        <View className="px-5 mt-6">
          <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-3 ml-1">Album Breakdown</Text>
          <View className="bg-card rounded-2xl overflow-hidden" style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            {breakdown.byAlbum.length === 0 ? (
              <Text className="text-muted-foreground text-sm text-center py-5">
                Nothing stored yet.
              </Text>
            ) : (
              breakdown.byAlbum.map((row, i) => (
                <Pressable
                  key={row.albumId ?? 'unfiled'}
                  onPress={row.albumId ? () => router.push(`/albums/${row.albumId}`) : undefined}
                  disabled={!row.albumId}
                  className="flex-row items-center gap-3 px-4 py-3 active:bg-muted/30"
                  style={i < breakdown.byAlbum.length - 1 ? { borderBottomWidth: 1, borderBottomColor: isDark ? '#2A2522' : '#F0E8E2' } : undefined}
                >
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: ALBUM_COLORS[i % ALBUM_COLORS.length] }} />
                  <Text className="text-foreground text-sm flex-1" numberOfLines={1}>
                    {row.name ?? 'Not in an album'}
                  </Text>
                  <Text className="text-foreground text-sm font-bold">{formatBytes(row.bytes)}</Text>
                </Pressable>
              ))
            )}
          </View>
        </View>

        {/* Wipe lives on the Sync & Storage screen; link rather than duplicate. */}
        <Pressable onPress={() => router.push('/settings/sync')}
          className="mx-5 mt-6 bg-card rounded-2xl p-4 flex-row items-center gap-4 active:scale-[0.98]"
          style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
          <View className="w-10 h-10 rounded-xl items-center justify-center" style={{ backgroundColor: '#8B5E3C18' }}>
            <CloudIcon size={18} style={{ color: '#8B5E3C' }} />
          </View>
          <View className="flex-1">
            <Text className="text-foreground text-sm font-semibold">Sync & Storage</Text>
            <Text className="text-muted-foreground text-xs mt-0.5">Manage or wipe your cloud data</Text>
          </View>
          <ChevronRightIcon size={14} className="text-muted-foreground" />
        </Pressable>

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
