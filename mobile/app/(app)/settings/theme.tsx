import { View, Text, ScrollView, Pressable, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import {
  ArrowLeftIcon, PaletteIcon, SunIcon, MoonIcon, MonitorIcon,
  CheckIcon, EyeIcon, TypeIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useTheme } from '@/src/hooks';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PaletteIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(SunIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MoonIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MonitorIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CheckIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(EyeIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(TypeIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const THEMES = [
  {
    key: 'light',
    label: 'Light',
    description: 'Warm cream studio feel',
    icon: SunIcon,
    bg: '#FFF8F4',
    fg: '#1E1B18',
    card: '#FFFFFF',
    primary: '#B66A40',
  },
  {
    key: 'dark',
    label: 'Dark',
    description: 'Espresso night mode',
    icon: MoonIcon,
    bg: '#161311',
    fg: '#F2EDE8',
    card: '#1E1B18',
    primary: '#C17745',
  },
  {
    key: 'system',
    label: 'System',
    description: 'Follows device settings',
    icon: MonitorIcon,
    bg: '#F5F0EC',
    fg: '#1E1B18',
    card: '#FFFFFF',
    primary: '#B66A40',
  },
];

export default function ThemeSettingsScreen() {
  const systemScheme = useColorScheme();
  // This was `useState('light')` — the selection lived only in this component,
  // so tapping an option moved the checkmark and changed nothing. It now reads
  // and writes the real, persisted preference.
  const { preference: selected, setPreference: setSelected } = useTheme();

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 80 }}
      >
        {/* Header */}
        <View className="px-5 pt-4 pb-2 flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
            style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
          >
            <ArrowLeftIcon size={18} className="text-foreground" />
          </Pressable>
          <View>
            <Text className="text-foreground text-[22px] font-bold tracking-tight">Theme</Text>
            <Text className="text-muted-foreground text-sm mt-0.5">Choose your app appearance</Text>
          </View>
        </View>

        {/* Theme cards */}
        <View className="px-5 mt-5 gap-4">
          {THEMES.map((theme) => {
            const IconComp = theme.icon;
            const isActive = selected === theme.key;
            return (
              <Pressable
                key={theme.key}
                onPress={() => setSelected(theme.key as 'light' | 'dark' | 'system')}
                className={`rounded-2xl p-5 active:scale-[0.98] border-2 ${
                  isActive ? 'border-primary' : 'border-transparent'
                }`}
                style={{
                  backgroundColor: theme.key === 'light' ? '#FFFFFF' : theme.key === 'dark' ? '#1E1B18' : '#FFFFFF',
                  shadowColor: '#000',
                  shadowOpacity: isActive ? 0.08 : 0.04,
                  shadowRadius: 12,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: isActive ? 4 : 2,
                }}
              >
                {/* Preview bar */}
                <View className="mb-4 flex-row gap-2">
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: `${theme.primary}22`, alignItems: 'center', justifyContent: 'center' }}>
                    <IconComp size={18} style={{ color: theme.primary }} />
                  </View>
                  <View className="flex-1">
                    <Text style={{ color: theme.fg, fontSize: 15, fontWeight: '700' }}>{theme.label}</Text>
                    <Text style={{ color: theme.fg, opacity: 0.5, fontSize: 12, marginTop: 1 }}>{theme.description}</Text>
                  </View>
                  {isActive && (
                    <View className="w-7 h-7 rounded-full bg-primary items-center justify-center">
                      <CheckIcon size={13} className="text-white" />
                    </View>
                  )}
                </View>

                {/* Mini preview */}
                <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: isActive ? '#D9C2B7' : 'transparent' }}>
                  {/* Simulated header */}
                  <View style={{ height: 20, backgroundColor: theme.bg, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 6 }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.fg, opacity: 0.6 }} />
                    <View style={{ width: 20, height: 3, borderRadius: 2, backgroundColor: theme.fg, opacity: 0.2 }} />
                  </View>
                  {/* Simulated content */}
                  <View style={{ height: 32, backgroundColor: theme.card || theme.bg, padding: 8, flexDirection: 'row', gap: 6 }}>
                    <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: theme.primary, opacity: 0.15 }} />
                    <View style={{ width: 16, height: 8, borderRadius: 4, backgroundColor: theme.primary, opacity: 0.35 }} />
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Accent color hint */}
        <View className="mx-5 mt-6 bg-card rounded-2xl p-4 flex-row items-center gap-4"
          style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
          <View className="w-10 h-10 rounded-xl bg-primary/10 items-center justify-center">
            <EyeIcon size={18} className="text-primary" />
          </View>
          <View className="flex-1">
            <Text className="text-foreground text-sm font-semibold">Appearance preview</Text>
            <Text className="text-muted-foreground text-xs mt-0.5">
              Changes apply immediately. Light mode uses the warm cream Virgo palette.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
