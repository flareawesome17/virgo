import { View, Text, Pressable, Alert, Linking } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import * as StoreReview from 'expo-store-review';
import {
  BellIcon,
  ChevronRightIcon,
  CloudIcon,
  FileTextIcon,
  GiftIcon,
  GlobeIcon,
  HardDriveIcon,
  HelpCircleIcon,
  InfoIcon,
  LifeBuoyIcon,
  LockIcon,
  LogOutIcon,
  MonitorSmartphoneIcon,
  PaletteIcon,
  ShieldIcon,
  StarIcon,
  UserCogIcon,
  UserXIcon,
  type LucideIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  useAuth,
  useOffline,
  useProfileSettings,
  usePromoOffers,
  useTheme,
  useUsage,
} from '@/src/hooks';
import { formatBytes } from '@/src/api';
import { CHART_COLORS, PALETTES } from '@/theme';

// Every icon used below has to appear here too. One left out renders without
// its colour rather than failing, so the omission shows up as a grey icon
// nobody traces back to this list.
for (const Icon of [
  BellIcon, ChevronRightIcon, CloudIcon, FileTextIcon, GiftIcon, GlobeIcon,
  HardDriveIcon, HelpCircleIcon, InfoIcon, LifeBuoyIcon, LockIcon, LogOutIcon,
  MonitorSmartphoneIcon, PaletteIcon, ShieldIcon, StarIcon, UserCogIcon, UserXIcon,
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
  badge?: number;
}

const APPEARANCE: Record<string, string> = { light: 'Light', dark: 'Dark', system: 'System' };

/**
 * Every setting, in one list: the Settings tab of the Dashboard.
 *
 * It was a tab of its own, behind your photo in the top bar, split into
 * "Profile & account" and "App" halves. The Dashboard is your profile now, so
 * the photo left the bar and the halves became one list under it — a second
 * row of tabs inside a tab would have been one switch too many. The card that
 * opened "Your profile" went with it: the profile is the page this sits on.
 *
 * It draws no scroll view; the Dashboard's carries it.
 */
export function SettingsList() {
  const { user, profile, signOut } = useAuth();
  const { preference, isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { settings } = useProfileSettings();
  const { usage } = useUsage({ enabled: !!user?.id });
  const { offers: rewards } = usePromoOffers(!!user?.id);
  const { isOffline } = useOffline();
  const version = Constants.expoConfig?.version ?? '1.0';

  // The auth guard in (app)/_layout.tsx handles the redirect once the session
  // clears, so no manual navigation is needed here.
  const handleSignOut = () => {
    Alert.alert('Sign out', 'You will need to sign in again to continue.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => signOut.mutate(),
      },
    ]);
  };

  const rateVirgo = async () => {
    try {
      const storeUrl = StoreReview.storeUrl();
      // Tried, not asked about: see help.tsx — canOpenURL says no on Android
      // 11+ for anything the manifest does not declare.
      if (storeUrl) {
        try {
          await Linking.openURL(storeUrl);
          return;
        } catch {
          // Fall through to the in-app review.
        }
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

  const sections: { title: string; rows: SettingsRow[] }[] = [
    {
      // No "Edit profile" row: About, the tab beside this one, opens with it.
      title: 'Your profile',
      rows: [
        {
          icon: GlobeIcon,
          label: 'Public profile',
          detail: 'Your virgo.ph address, and the work you show on it',
          value: settings ? (settings.published ? 'On' : 'Off') : undefined,
          route: '/settings/public-profile',
          color: palette.primary,
        },
      ],
    },
    {
      title: 'Account',
      rows: [
        {
          icon: UserCogIcon,
          label: 'Account & security',
          detail: 'Email, password, pause or delete',
          route: '/settings/account',
          color: palette.primary,
        },
        {
          icon: ShieldIcon,
          label: 'Two-factor authentication',
          detail: 'A code sent to your email when signing in',
          value: profile?.twoFactorEnabled ? 'On' : 'Off',
          route: '/settings/two-factor',
          color: CHART_COLORS.green,
        },
        {
          icon: MonitorSmartphoneIcon,
          label: 'Devices',
          detail: 'Where you are signed in, and signing one out',
          route: '/settings/devices',
          color: palette.primary,
        },
        {
          icon: HardDriveIcon,
          label: 'Storage & plan',
          detail: 'What you are using, and your limits',
          // Nothing until usage has loaded: the hook's fallback is 0, and
          // "0 MB" while offline would read as an empty account.
          value: usage
            ? `${formatBytes(usage.storage.usedBytes)}${usage.plan ? ` · ${usage.plan}` : ''}`
            : undefined,
          route: '/settings/storage',
          color: CHART_COLORS.brown,
        },
        // Here because a promo is quota: what it gives is storage, workspaces
        // and albums, which is what the row above is about.
        {
          icon: GiftIcon,
          label: 'Rewards',
          detail: 'Offers waiting for you, and your invite code',
          route: '/rewards',
          color: palette.accent,
          badge: rewards.length,
        },
      ],
    },
    {
      title: 'Preferences',
      rows: [
        {
          icon: PaletteIcon,
          label: 'Appearance',
          detail: 'Light, dark, or follow your device',
          value: APPEARANCE[preference],
          route: '/settings/theme',
          color: palette.accent,
        },
        {
          icon: BellIcon,
          label: 'Notifications',
          detail: 'Sounds for messages, events and everything else',
          route: '/settings/notifications',
          color: palette.primary,
        },
      ],
    },
    {
      title: 'Privacy',
      rows: [
        {
          icon: LockIcon,
          label: 'Privacy',
          detail: 'Who can find you, and what leaves your device',
          route: '/settings/privacy',
          color: CHART_COLORS.blue,
        },
        {
          icon: UserXIcon,
          label: 'Blocked people',
          detail: 'People you’ve blocked, and how to unblock them',
          route: '/settings/blocked',
          color: palette.destructive,
        },
      ],
    },
    {
      title: 'Storage & sync',
      rows: [
        {
          icon: CloudIcon,
          label: 'Offline sync',
          detail: 'What works without a connection',
          value: isOffline ? 'Offline' : 'Synced',
          route: '/settings/offline',
          color: palette.accent,
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
          color: palette.primary,
        },
        {
          icon: HelpCircleIcon,
          label: 'Help center',
          detail: 'Answers to common questions',
          route: '/settings/help',
          color: palette.primary,
        },
        {
          icon: FileTextIcon,
          label: 'Terms & Privacy Policy',
          route: '/legal',
          color: palette.secondaryForeground,
        },
        {
          icon: StarIcon,
          label: 'Rate Virgo',
          detail: 'Leave a review in your app store',
          color: palette.accent,
          action: 'rate',
        },
      ],
    },
    {
      title: 'About',
      rows: [
        {
          icon: InfoIcon,
          label: 'About Virgo',
          value: `v${version}`,
          route: '/settings/about',
          color: CHART_COLORS.brown,
        },
      ],
    },
  ];

  return (
    <View className="px-5 mt-5 gap-5">
      {sections.map((section) => (
        <Section key={section.title} title={section.title} rows={section.rows} onRate={rateVirgo} />
      ))}

      <Pressable
        onPress={handleSignOut}
        disabled={signOut.isPending}
        accessibilityRole="button"
        className="bg-card rounded-2xl border border-border/30 p-4 flex-row items-center justify-center gap-2 active:scale-[0.98]"
      >
        <LogOutIcon size={17} className="text-destructive" />
        <Text className="text-destructive text-sm font-semibold">
          {signOut.isPending ? 'Signing out…' : 'Sign out'}
        </Text>
      </Pressable>
    </View>
  );
}

function Section({
  title,
  rows,
  onRate,
}: {
  title: string;
  rows: SettingsRow[];
  onRate?: () => void;
}) {
  const { isDark } = useTheme();
  const border = (isDark ? PALETTES.dark : PALETTES.light).muted;

  return (
    <View>
      <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 px-1">
        {title}
      </Text>
      <View
        className="bg-card rounded-2xl overflow-hidden"
        style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
      >
        {rows.map((row, i) => {
          const IconComp = row.icon;
          return (
            <Pressable
              key={row.label}
              onPress={
                row.action === 'rate'
                  ? onRate
                  : row.route
                    ? () => router.push(row.route as never)
                    : undefined
              }
              accessibilityRole="button"
              accessibilityLabel={
                row.badge ? `${row.label}, ${row.badge} waiting` : row.label
              }
              className="flex-row items-center gap-3 px-4 py-3.5 active:bg-muted/30"
              style={
                i < rows.length - 1
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
                <Text className="text-foreground text-sm font-semibold">{row.label}</Text>
                {row.detail ? (
                  <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
                    {row.detail}
                  </Text>
                ) : null}
              </View>
              {row.value ? (
                <Text className="text-muted-foreground text-xs mr-1" numberOfLines={1}>
                  {row.value}
                </Text>
              ) : null}
              {row.badge ? (
                <View className="min-w-[18px] h-[18px] rounded-full items-center justify-center mr-1 px-[5px] bg-action">
                  <Text className="text-action-foreground text-[10px] font-bold">
                    {row.badge > 99 ? '99+' : row.badge}
                  </Text>
                </View>
              ) : null}
              <ChevronRightIcon size={14} className="text-muted-foreground" />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
