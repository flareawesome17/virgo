import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import Constants from 'expo-constants';
import * as StoreReview from 'expo-store-review';
import {
  BellIcon,
  BriefcaseIcon,
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
  PaletteIcon,
  PencilIcon,
  ShieldIcon,
  SlidersHorizontalIcon,
  StarIcon,
  UserCogIcon,
  UserIcon,
  UserXIcon,
  type LucideIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { AppTopBar } from '@/components';
import { RemoteImage } from '@/components/RemoteImage';
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
  BellIcon, BriefcaseIcon, ChevronRightIcon, CloudIcon, FileTextIcon, GiftIcon,
  GlobeIcon, HardDriveIcon, HelpCircleIcon, InfoIcon, LifeBuoyIcon, LockIcon,
  LogOutIcon, PaletteIcon, PencilIcon, ShieldIcon, SlidersHorizontalIcon,
  StarIcon, UserCogIcon, UserIcon, UserXIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

type SettingsView = 'account' | 'app';

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
 * Settings, as a tab of its own, in two halves.
 *
 * This replaces two screens that each held half of it. The Profile tab had
 * the account — identity, security, storage, signing out — and a gear that
 * pushed a separate Settings screen with the app's preferences, plus rows
 * that belonged to neither (Public profile, Jobs, Hire enquiries). Here the
 * split is by what a row is about: you and your account, or how this app
 * behaves. The Jobs row is gone; Jobs is a tab in the top bar.
 *
 * `?view=app` opens the second half, so links and the old /settings deep
 * link land on the right one.
 */
export default function SettingsScreen() {
  const params = useLocalSearchParams<{ view?: string }>();
  const requestedView: SettingsView = params.view === 'app' ? 'app' : 'account';
  const [view, setView] = useState<SettingsView>(requestedView);

  useEffect(() => {
    setView(requestedView);
  }, [requestedView]);

  // Kept in the address as well as in state: otherwise, having switched to
  // App by hand, a link asking for the account half would carry the same
  // param as before, change nothing, and leave you on App.
  const show = (next: SettingsView) => {
    setView(next);
    router.setParams({ view: next });
  };

  const { user } = useAuth();
  const { offers: rewards } = usePromoOffers(!!user?.id);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <AppTopBar />
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        <View className="px-5 pt-4 pb-2">
          <Text className="text-foreground text-[28px] font-bold tracking-tight">Settings</Text>
          <Text className="text-muted-foreground text-sm mt-1">
            Your account, and how the app works
          </Text>
        </View>

        <View
          accessibilityRole="tablist"
          className="mx-5 mt-3 mb-1 flex-row rounded-xl bg-secondary p-1"
        >
          <SegmentTab
            label="Profile & account"
            icon={UserIcon}
            active={view === 'account'}
            badge={rewards.length}
            onPress={() => show('account')}
          />
          <SegmentTab
            label="App"
            icon={SlidersHorizontalIcon}
            active={view === 'app'}
            badge={0}
            onPress={() => show('app')}
          />
        </View>

        {view === 'account' ? <AccountHalf rewards={rewards.length} /> : <AppHalf />}
      </ScrollView>
    </SafeAreaView>
  );
}

/** You, your public presence, and the account behind it. */
function AccountHalf({ rewards }: { rewards: number }) {
  const { user, profile, signOut } = useAuth();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { settings } = useProfileSettings();
  const { usage } = useUsage({ enabled: !!user?.id });

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

  const sections: { title: string; rows: SettingsRow[] }[] = [
    {
      title: 'Your profile',
      rows: [
        {
          icon: PencilIcon,
          label: 'Edit profile',
          detail: 'Name, photo, bio and contact',
          route: '/settings/profile',
          color: palette.primary,
        },
        {
          icon: GlobeIcon,
          label: 'Public profile',
          detail: 'Your virgo.ph address, and the work you show on it',
          value: settings ? (settings.published ? 'On' : 'Off') : undefined,
          route: '/settings/public-profile',
          color: palette.primary,
        },
        {
          icon: BriefcaseIcon,
          label: 'Hire enquiries',
          detail: 'Work people have offered you',
          route: '/friends/enquiries',
          color: CHART_COLORS.green,
        },
      ],
    },
    {
      title: 'Account',
      rows: [
        {
          icon: UserCogIcon,
          label: 'Account & security',
          detail: 'Email and password',
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
          badge: rewards,
        },
      ],
    },
  ];

  return (
    <View className="px-5 mt-5 gap-5">
      {/* Two sibling buttons rather than one inside the other: a Pressable is
          a single accessibility element on iOS, so a button nested in the
          card could never be reached with VoiceOver.

          The card edits; View profile opens "Your profile", which exists
          whether or not the profile is published — unpublished is exactly
          when somebody most needs to see what publishing would show. */}
      <View className="bg-card rounded-2xl border border-border/40 p-4 flex-row items-center gap-3">
        <Pressable
          onPress={() => router.push('/settings/profile')}
          accessibilityRole="button"
          accessibilityLabel={`${profile?.displayName || 'Your profile'}, edit profile`}
          className="flex-1 min-w-0 flex-row items-center gap-3 active:opacity-80"
        >
          {profile?.avatarUrl ? (
            <RemoteImage
              source={{ uri: profile.avatarUrl }}
              style={{ width: 56, height: 56, borderRadius: 28 }}
            />
          ) : (
            // Initial-letter placeholder rather than a stock photo, so an
            // unset avatar reads as "not set yet" instead of someone else's face.
            <View
              style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: `${palette.primary}18`, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: palette.primary, fontSize: 22, fontWeight: '700' }}>
                {(profile?.displayName || user?.email || '?').charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View className="flex-1 min-w-0">
            <Text className="text-foreground text-base font-bold" numberOfLines={1}>
              {profile?.displayName || 'Add your name'}
            </Text>
            {profile?.title ? (
              <Text className="text-muted-foreground text-xs font-semibold mt-0.5" numberOfLines={1}>
                {profile.title}
              </Text>
            ) : null}
            <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
              {user?.email ?? ''}
            </Text>
          </View>
        </Pressable>
        <Pressable
          onPress={() => router.push('/profile')}
          accessibilityRole="button"
          accessibilityLabel="View your profile"
          className="min-h-11 justify-center rounded-full bg-muted px-3.5 active:opacity-70"
        >
          <Text className="text-foreground text-xs font-bold">View profile</Text>
        </Pressable>
      </View>

      {sections.map((section) => (
        <Section key={section.title} title={section.title} rows={section.rows} />
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

/** How the app behaves on this device — nothing about who you are. */
function AppHalf() {
  const { preference, isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { isOffline } = useOffline();
  const version = Constants.expoConfig?.version ?? '1.0';

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

  const sections: { title: string; rows: SettingsRow[] }[] = [
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
      title: 'Storage & Sync',
      rows: [
        {
          icon: CloudIcon,
          label: 'Offline Sync',
          detail: 'What works without a connection',
          // Was a hardcoded green "Synced" chip on the Profile tab that said
          // the same thing with the network off.
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
          label: 'Help Center',
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
          // Was a literal 'Version 1.0', which would have kept saying 1.0
          // through every release.
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
        <Section
          key={section.title}
          title={section.title}
          rows={section.rows}
          onRate={rateVirgo}
        />
      ))}
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

/** The two halves, drawn like Connect's Messages/People switch. */
function SegmentTab({
  label,
  icon: Icon,
  active,
  badge,
  onPress,
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  badge: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={badge > 0 ? `${label}, ${badge} waiting` : label}
      className={`min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-lg px-3 active:scale-[0.98] ${
        active ? 'bg-card' : 'bg-transparent'
      }`}
    >
      <Icon size={17} className={active ? 'text-primary' : 'text-muted-foreground'} />
      <Text className={`text-sm font-semibold ${active ? 'text-foreground' : 'text-muted-foreground'}`}>
        {label}
      </Text>
      {badge > 0 && (
        <View className="min-w-[20px] rounded-full bg-action px-1.5 py-0.5">
          <Text className="text-action-foreground text-[11px] font-bold text-center">
            {badge > 99 ? '99+' : badge}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
