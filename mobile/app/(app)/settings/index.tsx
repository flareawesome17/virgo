import { View, Text, ScrollView, Pressable, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { useAuth, usePromoOffers, useTheme } from '@/src/hooks';
import * as StoreReview from 'expo-store-review';
import {
  ArrowLeftIcon, ChevronRightIcon, BellIcon, LockIcon, ShieldIcon,
  PaletteIcon, HardDriveIcon, CloudIcon, HelpCircleIcon, LifeBuoyIcon, GiftIcon,
  InfoIcon, FileTextIcon, StarIcon,
  GlobeIcon,
  BriefcaseIcon,
  type LucideIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';

// Every icon used below has to appear here too. One left out renders without
// its colour rather than failing, so the omission shows up as a grey icon
// nobody traces back to this list.
for (const Icon of [
  ArrowLeftIcon, ChevronRightIcon, BellIcon, LockIcon, ShieldIcon,
  PaletteIcon, HardDriveIcon, CloudIcon, HelpCircleIcon, LifeBuoyIcon, GiftIcon, InfoIcon,
  FileTextIcon, StarIcon, GlobeIcon, BriefcaseIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

interface SettingsRow {
  icon: LucideIcon;
  label: string;
  /** One line saying what the screen behind the row is for. */
  detail?: string;
  value?: string;
  route?: string;
  action?: 'rate';
  color: string;
  /**
   * Which live count fills this row's badge slot, if any.
   *
   * A name rather than a number because SECTIONS is a module constant and
   * cannot call a hook. The screen resolves it at render.
   */
  badge?: 'rewards';
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
        detail: 'Sounds for messages, events and everything else',
        route: '/settings/notifications',
        color: '#B66A40',
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
        label: 'Jobs',
        detail: 'Browse the board, or post what you need doing',
        route: '/jobs',
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
      {
        icon: ShieldIcon,
        label: 'Two-factor authentication',
        detail: 'A code sent to your email when signing in',
        route: '/settings/two-factor',
        color: '#6B8E4E',
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
      // In this group because a promo is quota: what it gives is storage,
      // workspaces and albums, which is exactly what the rows above are about.
      {
        icon: GiftIcon,
        label: 'Rewards',
        detail: 'Offers waiting for you, and your invite code',
        route: '/rewards',
        color: '#C17745',
        badge: 'rewards',
      },
    ],
  },
  {
    title: 'Support',
    rows: [
      {
        icon: LifeBuoyIcon,
        label: 'Contact support',
        detail: 'Ask us anything — we answer in the app',
        route: '/support',
        color: '#B66A40',
      },
      {
        icon: HelpCircleIcon,
        label: 'Help Center',
        detail: 'Answers to common questions',
        route: '/settings/help',
        color: '#B66A40',
      },
      {
        icon: FileTextIcon,
        label: 'Terms & Privacy Policy',
        route: '/legal',
        color: '#54433C',
      },
      { icon: StarIcon, label: 'Rate Virgo', detail: 'Leave a review in your app store', color: '#C17745', action: 'rate' },
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
  const { profile } = useAuth();

  const version = Constants.expoConfig?.version ?? '1.0';
  // Fills the Rewards row's badge. SECTIONS is a module constant, so the count
  // is resolved here and matched to the row by name.
  const { offers: rewards } = usePromoOffers();
  const border = isDark ? '#2A2522' : '#F0E8E2';

  // Was a literal 'Version 1.0' baked into the section table, which would have
  // kept saying 1.0 through every release.
  const sections = SECTIONS.map((section) => ({
    ...section,
    rows: section.rows.map((row) => {
      if (row.label === 'About Virgo') return { ...row, value: `v${version}` };
      if (row.label === 'Two-factor authentication') {
        return { ...row, value: profile?.twoFactorEnabled ? 'On' : 'Off' };
      }
      return row;
    }),
  }));

  const rateVirgo = async () => {
    try {
      const storeUrl = StoreReview.storeUrl();
      if (storeUrl && await Linking.canOpenURL(storeUrl)) {
        await Linking.openURL(storeUrl);
        return;
      }
      if (await StoreReview.isAvailableAsync()) {
        await StoreReview.requestReview();
        return;
      }
      Alert.alert('Rate Virgo', 'Store ratings are available in the installed iOS or Android app.');
    } catch {
      Alert.alert('Could not open the store', 'Please try again from the installed app.');
    }
  };

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
                        row.action === 'rate'
                          ? rateVirgo
                          : row.route
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
                        <IconComp size={15} color={row.color} />
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
                      {row.badge === 'rewards' && rewards.length > 0 && (
                        <View
                          className="rounded-full items-center justify-center mr-1"
                          style={{
                            minWidth: 18,
                            height: 18,
                            paddingHorizontal: 5,
                            backgroundColor: '#B66A40',
                          }}
                        >
                          <Text className="text-white text-[10px] font-bold">
                            {rewards.length > 99 ? '99+' : rewards.length}
                          </Text>
                        </View>
                      )}
                      <ChevronRightIcon size={14} className="text-muted-foreground" />
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
