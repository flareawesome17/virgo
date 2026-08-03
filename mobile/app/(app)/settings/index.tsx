import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { useTheme } from '@/src/hooks';
import {
  ArrowLeftIcon, ChevronRightIcon, BellIcon, LockIcon, ShieldIcon,
  PaletteIcon, HardDriveIcon, CloudIcon, HelpCircleIcon,
  InfoIcon, FileTextIcon, StarIcon,
  GlobeIcon,
  BriefcaseIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';

for (const Icon of [
  ArrowLeftIcon, ChevronRightIcon, BellIcon, LockIcon, ShieldIcon,
  PaletteIcon, HardDriveIcon, CloudIcon, HelpCircleIcon, InfoIcon,
  FileTextIcon, StarIcon, GlobeIcon, BriefcaseIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

interface SettingsRow {
  icon: React.ComponentType<any>;
  label: string;
  /** One line saying what the screen behind the row is for. */
  detail?: string;
  value?: string;
  route?: string;
  color: string;
  /**
   * Marks a row whose feature has no implementation behind it yet. These
   * previously carried a `route` to a screen that did not exist, so tapping
   * them dropped the user on Expo's raw "Unmatched Route" page. Showing an
   * honest "Soon" badge beats both that and a fake screen.
   */
  soon?: boolean;
}

/**
 * How the app behaves — nothing about who you are.
 *
 * Account, profile editing and signing out live on the Profile tab, which is
 * where they belong and where they already were: this screen used to restate
 * all three, so the same actions existed twice with two different labels.
 */
const SECTIONS: { title: string; rows: SettingsRow[] }[] = [
  {
    title: 'Preferences',
    rows: [
      {
        icon: PaletteIcon,
        label: 'Appearance',
        detail: 'Light, dark, or follow your device',
        route: '/settings/theme',
        color: '#C17745',
      },
      {
        icon: BellIcon,
        label: 'Notifications',
        detail: 'Which alerts reach you',
        color: '#B66A40',
        soon: true,
      },
    ],
  },
  {
    title: 'Privacy & Security',
    rows: [
      {
        icon: GlobeIcon,
        label: 'Public profile',
        detail: 'Your virgo.ph address, and the work you show on it',
        route: '/settings/public-profile',
        color: '#B66A40',
      },
      {
        icon: BriefcaseIcon,
        label: 'Hire enquiries',
        detail: 'Work people have offered you',
        route: '/friends/enquiries',
        color: '#7C9A5B',
      },
      {
        icon: LockIcon,
        label: 'Privacy',
        detail: 'Who can find you, and what leaves your device',
        route: '/settings/privacy',
        color: '#5B7B9A',
      },
      // The old row read "2FA enabled" — there is no 2FA in the backend, so
      // that was a claim the app could not honour.
      {
        icon: ShieldIcon,
        label: 'Two-factor authentication',
        detail: 'A second step when signing in',
        color: '#6B8E4E',
        soon: true,
      },
    ],
  },
  {
    title: 'Storage & Sync',
    rows: [
      {
        icon: HardDriveIcon,
        label: 'Storage',
        detail: 'What you have uploaded, and your plan',
        route: '/settings/storage',
        color: '#B66A40',
      },
      {
        icon: CloudIcon,
        label: 'Offline Sync',
        detail: 'What works without a connection',
        route: '/settings/offline',
        color: '#C17745',
      },
    ],
  },
  {
    title: 'Support',
    rows: [
      {
        icon: HelpCircleIcon,
        label: 'Help Center',
        detail: 'Answers, and how to reach us',
        route: '/settings/help',
        color: '#B66A40',
      },
      {
        icon: FileTextIcon,
        label: 'Terms & Privacy Policy',
        route: '/legal',
        color: '#54433C',
      },
      // Nothing to rate against until the app is on a store listing, and a row
      // that opens nowhere is worse than one that says so.
      { icon: StarIcon, label: 'Rate Virgo', color: '#C17745', soon: true },
    ],
  },
  {
    title: 'About',
    rows: [
      { icon: InfoIcon, label: 'About Virgo', route: '/settings/about', color: '#8B5E3C' },
    ],
  },
];

export default function SettingsHomeScreen() {
  const { isDark } = useTheme();

  const version = Constants.expoConfig?.version ?? '1.0';
  const border = isDark ? '#2A2522' : '#F0E8E2';

  // Was a literal 'Version 1.0' baked into the section table, which would have
  // kept saying 1.0 through every release.
  const sections = SECTIONS.map((section) => ({
    ...section,
    rows: section.rows.map((row) =>
      row.label === 'About Virgo' ? { ...row, value: `v${version}` } : row,
    ),
  }));

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 60 }}
      >
        {/* Header */}
        <View className="px-5 pt-4 pb-2 flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
            style={{
              shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 }, elevation: 2,
            }}
          >
            <ArrowLeftIcon size={18} className="text-foreground" />
          </Pressable>
          <View className="flex-1">
            <Text className="text-foreground text-[22px] font-bold tracking-tight">
              Settings
            </Text>
            <Text className="text-muted-foreground text-sm mt-0.5">
              How the app behaves on this device
            </Text>
          </View>
        </View>

        {/* Sections */}
        <View className="px-5 mt-5 gap-5">
          {sections.map((section) => (
            <View key={section.title}>
              <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 px-1">
                {section.title}
              </Text>
              <View
                className="bg-card rounded-2xl overflow-hidden"
                style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
              >
                {section.rows.map((row, i) => {
                  const IconComp = row.icon;
                  return (
                    <Pressable
                      key={row.label}
                      onPress={
                        row.route
                          ? () => router.push(row.route as never)
                          : () => Alert.alert(row.label, 'This is not available yet.')
                      }
                      className="flex-row items-center gap-3 px-4 py-3.5 active:bg-muted/30"
                      style={
                        i < section.rows.length - 1
                          ? { borderBottomWidth: 1, borderBottomColor: border }
                          : undefined
                      }
                    >
                      <View
                        style={{
                          width: 32, height: 32, borderRadius: 10,
                          backgroundColor: `${row.color}14`,
                          alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <IconComp size={15} style={{ color: row.color }} />
                      </View>
                      <View className="flex-1 min-w-0">
                        <Text className="text-foreground text-sm font-semibold">
                          {row.label}
                        </Text>
                        {row.detail ? (
                          <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
                            {row.detail}
                          </Text>
                        ) : null}
                      </View>
                      {row.value && (
                        <Text className="text-muted-foreground text-xs mr-1" numberOfLines={1}>
                          {row.value}
                        </Text>
                      )}
                      {row.soon ? (
                        <View className="rounded-md px-2 py-0.5 bg-muted">
                          <Text className="text-muted-foreground text-[10px] font-bold uppercase tracking-wide">
                            Soon
                          </Text>
                        </View>
                      ) : (
                        <ChevronRightIcon size={14} className="text-muted-foreground" />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </View>

        {/* Signing out lives on Profile, next to the account it belongs to. */}
        <Text className="text-muted-foreground text-[11px] text-center mt-7">
          Account, profile and sign out are on the Profile tab.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
