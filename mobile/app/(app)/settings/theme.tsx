import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  ArrowLeftIcon,
  SunIcon,
  MoonIcon,
  SmartphoneIcon,
  CheckIcon,
  FolderIcon,
  CalendarIcon,
  MessageCircleIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useTheme } from '@/src/hooks';
import { PALETTES, type Palette } from '@/theme';
import type { ThemePreference } from '@/src/lib/themePreference';

for (const Icon of [
  ArrowLeftIcon, SunIcon, MoonIcon, SmartphoneIcon, CheckIcon,
  FolderIcon, CalendarIcon, MessageCircleIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

const OPTIONS: {
  key: ThemePreference;
  label: string;
  icon: typeof SunIcon;
  /** Which palette the swatch shows. `system` reads as split. */
  swatch: 'light' | 'dark' | 'split';
}[] = [
  { key: 'light', label: 'Light', icon: SunIcon, swatch: 'light' },
  { key: 'dark', label: 'Dark', icon: MoonIcon, swatch: 'dark' },
  { key: 'system', label: 'System', icon: SmartphoneIcon, swatch: 'split' },
];

/**
 * A miniature of a real Virgo screen, drawn in a given palette.
 *
 * Replaces three abstract grey bars that told you nothing about what you were
 * choosing. Every colour comes from `PALETTES`, the same values the app runs
 * on, so what this shows is genuinely what you get.
 */
function Preview({ palette }: { palette: Palette }) {
  return (
    <View
      style={{
        backgroundColor: palette.background,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: palette.border,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <View style={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10, flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: palette.foreground, fontSize: 15, fontWeight: '700', letterSpacing: -0.3 }}>
            Workspaces
          </Text>
          <Text style={{ color: palette.mutedForeground, fontSize: 10, marginTop: 2 }}>
            3 active · 128 photos
          </Text>
        </View>
        <View
          style={{
            width: 26, height: 26, borderRadius: 13,
            backgroundColor: `${palette.primary}26`,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Text style={{ color: palette.primary, fontSize: 11, fontWeight: '700' }}>A</Text>
        </View>
      </View>

      {/* An album card */}
      <View
        style={{
          marginHorizontal: 14,
          backgroundColor: palette.card,
          borderRadius: 12,
          padding: 10,
          flexDirection: 'row',
          gap: 10,
          alignItems: 'center',
        }}
      >
        <View
          style={{
            width: 34, height: 34, borderRadius: 9,
            backgroundColor: `${palette.primary}26`,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <FolderIcon size={16} color={palette.primary} />
        </View>
        <View style={{ flex: 1, gap: 5 }}>
          <View style={{ height: 7, width: '62%', borderRadius: 4, backgroundColor: palette.foreground, opacity: 0.75 }} />
          <View style={{ height: 5, width: '40%', borderRadius: 3, backgroundColor: palette.mutedForeground, opacity: 0.6 }} />
        </View>
        <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7, backgroundColor: palette.primary }}>
          <Text style={{ color: palette.primaryForeground, fontSize: 9, fontWeight: '700' }}>Open</Text>
        </View>
      </View>

      {/* A muted secondary row, so the third surface is visible too */}
      <View
        style={{
          margin: 14,
          marginBottom: 10,
          backgroundColor: palette.muted,
          borderRadius: 10,
          paddingHorizontal: 10,
          paddingVertical: 8,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <CalendarIcon size={12} color={palette.mutedForeground} />
        <View style={{ height: 5, flex: 1, borderRadius: 3, backgroundColor: palette.mutedForeground, opacity: 0.4 }} />
      </View>

      {/* Tab bar */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-around',
          alignItems: 'center',
          paddingVertical: 9,
          backgroundColor: palette.card,
          borderTopWidth: 1,
          borderTopColor: palette.border,
        }}
      >
        <FolderIcon size={14} color={palette.primary} />
        <CalendarIcon size={14} color={palette.mutedForeground} />
        <MessageCircleIcon size={14} color={palette.mutedForeground} />
      </View>
    </View>
  );
}

/** The colour chip on an option card. */
function Swatch({ kind, size = 44 }: { kind: 'light' | 'dark' | 'split'; size?: number }) {
  const half = size / 2;
  const chip = (palette: Palette, style: object) => (
    <View style={[{ backgroundColor: palette.background }, style]}>
      <View
        style={{
          position: 'absolute',
          left: size * 0.16,
          top: size * 0.28,
          width: size * 0.5,
          height: size * 0.16,
          borderRadius: 99,
          backgroundColor: palette.card,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: size * 0.16,
          top: size * 0.54,
          width: size * 0.32,
          height: size * 0.16,
          borderRadius: 99,
          backgroundColor: palette.primary,
        }}
      />
    </View>
  );

  if (kind === 'split') {
    // Two halves, because System is genuinely both depending on the device.
    return (
      <View style={{ width: size, height: size, borderRadius: 12, overflow: 'hidden', flexDirection: 'row' }}>
        <View style={{ width: half, overflow: 'hidden' }}>
          {chip(PALETTES.light, { width: size, height: size })}
        </View>
        <View style={{ width: half, overflow: 'hidden' }}>
          <View style={{ marginLeft: -half }}>
            {chip(PALETTES.dark, { width: size, height: size })}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ width: size, height: size, borderRadius: 12, overflow: 'hidden' }}>
      {chip(PALETTES[kind], { width: size, height: size })}
    </View>
  );
}

/**
 * Appearance.
 *
 * The old screen stacked three large cards that each hardcoded a white or
 * espresso background, so in dark mode two of them sat on the page as bright
 * white slabs, and the System card always previewed light regardless of what
 * the device was set to. This shows one honest preview of the *selected*
 * theme, with the three choices as compact swatches under it.
 */
export default function AppearanceScreen() {
  const { preference, setPreference, isDark } = useTheme();

  // What the app is actually rendering right now — for System that is the
  // device's answer, which is the only truthful thing to preview.
  const resolved: 'light' | 'dark' = isDark ? 'dark' : 'light';
  const palette = preference === 'system' ? PALETTES[resolved] : PALETTES[preference];

  const cardShadow = {
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
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
            <Text className="text-foreground text-[22px] font-bold tracking-tight">
              Appearance
            </Text>
            <Text className="text-muted-foreground text-sm mt-0.5">
              How Virgo looks on this device
            </Text>
          </View>
        </View>

        {/* Live preview */}
        <View className="px-5 mt-5">
          <Preview palette={palette} />
        </View>

        {/* The choice */}
        <View className="px-5 mt-5 flex-row gap-3">
          {OPTIONS.map((option) => {
            const active = preference === option.key;
            const Icon = option.icon;
            return (
              <Pressable
                key={option.key}
                onPress={() => setPreference(option.key)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={option.label}
                className={`flex-1 rounded-2xl p-3 items-center active:scale-[0.97] ${
                  active ? 'bg-primary/[0.08]' : 'bg-card'
                }`}
                style={[
                  cardShadow,
                  {
                    borderWidth: 2,
                    borderColor: active
                      ? isDark
                        ? PALETTES.dark.primary
                        : PALETTES.light.primary
                      : 'transparent',
                  },
                ]}
              >
                <Swatch kind={option.swatch} />
                <View className="flex-row items-center gap-1.5 mt-2.5">
                  <Icon size={12} className={active ? 'text-primary' : 'text-muted-foreground'} />
                  <Text
                    className={`text-xs font-bold ${active ? 'text-primary' : 'text-foreground'}`}
                  >
                    {option.label}
                  </Text>
                </View>
                {/* Reserved height either way, so picking an option does not
                    nudge the row's height as the tick appears. */}
                <View className="h-5 justify-center">
                  {active && (
                    <View className="w-5 h-5 rounded-full bg-primary items-center justify-center">
                      <CheckIcon size={11} className="text-white" />
                    </View>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* What the choice means */}
        <View className="mx-5 mt-4 bg-card rounded-2xl px-4 py-3.5" style={cardShadow}>
          <Text className="text-foreground text-sm font-semibold">
            {preference === 'system'
              ? `Following your device — ${resolved === 'dark' ? 'Dark' : 'Light'} right now`
              : preference === 'dark'
                ? 'Always dark'
                : 'Always light'}
          </Text>
          <Text className="text-muted-foreground text-xs mt-1 leading-5">
            {preference === 'system'
              ? 'Switches with your device, including on a schedule if you have one set.'
              : 'Stays this way whatever your device is set to. Saved on this device.'}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
