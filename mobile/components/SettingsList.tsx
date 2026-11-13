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
  Trash2Icon,
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

// Every icon used below has to appear here too. One left out renders without
// its colour rather than failing, so the omission shows up as a grey icon
// nobody traces back to this list.
for (const Icon of [
  BellIcon, ChevronRightIcon, CloudIcon, FileTextIcon, GiftIcon, GlobeIcon,
  HardDriveIcon, HelpCircleIcon, InfoIcon, LifeBuoyIcon, LockIcon, LogOutIcon,
  MonitorSmartphoneIcon, PaletteIcon, ShieldIcon, StarIcon, Trash2Icon, UserCogIcon,
  UserXIcon,
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
  const { preference } = useTheme();
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
      title: 'Account',
      rows: [
        {
          icon: UserCogIcon,
          label: 'Account & security',
          detail: 'Email, password, pause or delete',
          route: '/settings/account',
        },
        {
          icon: ShieldIcon,
          label: 'Two-factor authentication',
          detail: 'A code sent to your email when signing in',
          value: profile?.twoFactorEnabled ? 'On' : 'Off',
          route: '/settings/two-factor',
        },
        {
          icon: MonitorSmartphoneIcon,
          label: 'Devices',
          detail: 'Where you are signed in, and signing one out',
          route: '/settings/devices',
        },
        // No "Edit profile" row: About, two tabs along, opens with it.
        {
          icon: GlobeIcon,
          label: 'Public profile',
          detail: 'Your virgo.ph address, and the work you show on it',
          value: settings ? (settings.published ? 'On' : 'Off') : undefined,
          route: '/settings/public-profile',
        },
        {
          icon: GiftIcon,
          label: 'Rewards',
          detail: 'Offers waiting for you, and your invite code',
          route: '/rewards',
          badge: rewards.length,
        },
      ],
    },
    {
      // Everything about what you keep here and what it takes up. It was
      // split between Account and a section of one row.
      title: 'Your files',
      rows: [
        {
          icon: HardDriveIcon,
          label: 'Storage & plan',
          detail: 'What you are using, and your limits',
          // Nothing until usage has loaded: the hook's fallback is 0, and
          // "0 MB" while offline would read as an empty account.
          value: usage
            ? `${formatBytes(usage.storage.usedBytes)}${
                usage.storage.limitBytes != null ? ` of ${formatBytes(usage.storage.limitBytes)}` : ''
              }`
            : undefined,
          route: '/settings/storage',
        },
        {
          icon: Trash2Icon,
          label: 'Recently deleted',
          detail: 'Workspaces you deleted, for 30 days',
          route: '/workspaces/deleted',
        },
        {
          icon: CloudIcon,
          label: 'Offline sync',
          detail: 'What works without a connection',
          value: isOffline ? 'Offline' : 'Synced',
          route: '/settings/offline',
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
        },
        {
          icon: BellIcon,
          label: 'Notifications',
          detail: 'Sounds for messages, events and everything else',
          route: '/settings/notifications',
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
        },
        {
          icon: UserXIcon,
          label: 'Blocked people',
          detail: 'People you’ve blocked, and how to unblock them',
          route: '/settings/blocked',
        },
      ],
    },
    {
      title: 'Help',
      rows: [
        {
          icon: LifeBuoyIcon,
          label: 'Contact support',
          detail: 'Ask us anything — we answer in the app',
          route: '/support',
        },
        {
          icon: HelpCircleIcon,
          label: 'Help center',
          detail: 'Answers to common questions',
          route: '/settings/help',
        },
        {
          icon: FileTextIcon,
          label: 'Terms & Privacy Policy',
          route: '/legal',
        },
        {
          icon: StarIcon,
          label: 'Rate Virgo',
          detail: 'Leave a review in your app store',
          action: 'rate',
        },
        {
          icon: InfoIcon,
          label: 'About Virgo',
          value: `v${version}`,
          route: '/settings/about',
        },
      ],
    },
  ];

  return (
    <View className="px-5 pt-5 gap-6">
      {sections.map((section) => (
        <Section key={section.title} title={section.title} rows={section.rows} onRate={rateVirgo} />
      ))}

      {/* On its own, and plain: it is the one row here that takes you out. */}
      <Pressable
        onPress={handleSignOut}
        disabled={signOut.isPending}
        accessibilityRole="button"
        className="min-h-12 flex-row items-center justify-center gap-2 active:opacity-60"
      >
        <LogOutIcon size={17} className="text-destructive" />
        <Text className="text-destructive text-[15px] font-semibold">
          {signOut.isPending ? 'Signing out…' : 'Sign out'}
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * One group of settings: a quiet title and a card of rows.
 *
 * A row is one line — icon, name, what it is set to — at 52pt. Each used to
 * carry a sentence under its name and an icon in its own colour, which made
 * seventeen rows read as seventeen different things. The sentence is still
 * what a screen reader hears.
 */
function Section({
  title,
  rows,
  onRate,
}: {
  title: string;
  rows: SettingsRow[];
  onRate?: () => void;
}) {
  return (
    <View>
      <Text
        accessibilityRole="header"
        className="text-muted-foreground text-[13px] leading-[18px] font-semibold mb-2 px-1"
      >
        {title}
      </Text>
      <View className="bg-card rounded-[20px] border border-border/40 overflow-hidden">
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
                [row.label, row.value, row.badge ? `${row.badge} waiting` : null]
                  .filter(Boolean)
                  .join(', ')
              }
              accessibilityHint={row.detail}
              className={`min-h-[52px] flex-row items-center gap-3 pl-4 pr-3 active:bg-muted/40 ${
                i > 0 ? 'border-t border-border/30' : ''
              }`}
            >
              <IconComp size={20} className="text-secondary-foreground" />
              <Text className="flex-1 text-foreground text-[15px] leading-5 font-medium" numberOfLines={1}>
                {row.label}
              </Text>
              {row.value ? (
                <Text className="text-muted-foreground text-[14px]" numberOfLines={1}>
                  {row.value}
                </Text>
              ) : null}
              {row.badge ? (
                <View className="min-w-[20px] h-5 rounded-full items-center justify-center px-1.5 bg-action">
                  <Text allowFontScaling={false} className="text-action-foreground text-[12px] font-bold">
                    {row.badge > 99 ? '99+' : row.badge}
                  </Text>
                </View>
              ) : null}
              <ChevronRightIcon size={16} className="text-muted-foreground" />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
