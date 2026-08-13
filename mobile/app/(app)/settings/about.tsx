import { View, Text, ScrollView, Pressable } from 'react-native';
import { useServerVersion, useTheme } from '@/src/hooks';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { ArrowLeftIcon, InfoIcon, GlobeIcon, LayersIcon, TagIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { API_BASE_URL } from '@/src/api';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(InfoIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(GlobeIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(LayersIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(TagIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/**
 * Build and environment info.
 *
 * Values are read from the running build rather than hardcoded, so this stays
 * correct across releases — and it doubles as a quick way to confirm which API
 * a given install is pointed at.
 */
export default function AboutScreen() {
  const { isDark } = useTheme();
  // Two different numbers, deliberately shown as two rows.
  //
  // "App version" is this binary, from app.json — what is actually installed
  // on the phone. "Release" is what the API reports, stamped into its image by
  // the release workflow from the GitHub tag.
  //
  // They are not the same thing and collapsing them would hide the case that
  // matters: an install that is behind the deployed release. Mobile ships
  // through EAS and the app stores, not through the workflow that builds the
  // server images, so it cannot know the release number without asking.
  const { version: release } = useServerVersion();
  const rows = [
    {
      icon: InfoIcon,
      label: 'App version',
      value: Constants.expoConfig?.version ?? '—',
      color: '#8B5E3C',
    },
    {
      icon: TagIcon,
      label: 'Release',
      value: release ?? '—',
      color: '#6B8E4E',
    },
    {
      icon: LayersIcon,
      label: 'Environment',
      value: process.env.EXPO_PUBLIC_ENV ?? 'development',
      color: '#C17745',
    },
    {
      icon: GlobeIcon,
      label: 'API',
      value: API_BASE_URL.replace(/^https?:\/\//, '') || 'not configured',
      color: '#B66A40',
    },
  ];

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <View className="px-5 pt-4 pb-2 flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
            style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
          >
            <ArrowLeftIcon size={18} className="text-foreground" />
          </Pressable>
          <Text className="text-foreground text-[22px] font-bold tracking-tight">About</Text>
        </View>

        <View className="px-5 mt-8 items-center">
          <Text className="text-foreground text-3xl font-extrabold tracking-tight">Virgo</Text>
          <Text className="text-muted-foreground text-sm mt-1">Studio workspace for photographers</Text>
        </View>

        <View className="px-5 mt-8">
          <View
            className="bg-card rounded-2xl overflow-hidden"
            style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
          >
            {rows.map((row, i) => {
              const Icon = row.icon;
              return (
                <View
                  key={row.label}
                  className="flex-row items-center gap-3 px-4 py-3.5"
                  style={i < rows.length - 1 ? { borderBottomWidth: 1, borderBottomColor: isDark ? '#2A2522' : '#F0E8E2' } : undefined}
                >
                  <View
                    style={{
                      width: 32, height: 32, borderRadius: 10,
                      backgroundColor: `${row.color}14`,
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Icon size={15} color={row.color} />
                  </View>
                  <Text className="text-foreground text-sm font-semibold flex-1">{row.label}</Text>
                  <Text className="text-muted-foreground text-xs" numberOfLines={1}>
                    {row.value}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
