import { View, Text, ScrollView, Pressable, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useAuth,
  useCollaborators,
  useOffline,
  usePromoOffers,
  useScheduleEvents,
  useTheme,
  useUsage,
  useWorkspaces,
} from '@/src/hooks';
import { formatBytes } from '@/src/api';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import {
  SettingsIcon,
  ChevronRightIcon,
  HardDriveIcon,
  WifiIcon,
  WifiOffIcon,
  LogOutIcon,
  FolderIcon,
  ImageIcon,
  UsersIcon,
  CalendarIcon,
  UserCogIcon,
  CreditCardIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { PALETTES } from '@/theme';

for (const Icon of [
  SettingsIcon, ChevronRightIcon, HardDriveIcon, WifiIcon, WifiOffIcon,
  LogOutIcon, FolderIcon, ImageIcon, UsersIcon, CalendarIcon, UserCogIcon,
  CreditCardIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

const STATS = [
  { label: 'Workspaces', icon: FolderIcon },
  { label: 'Assets', icon: ImageIcon },
  { label: 'Collaborators', icon: UsersIcon },
  { label: 'Events', icon: CalendarIcon },
];

/**
 * Rows about *this account*.
 *
 * The app's preferences — appearance, notifications, privacy, sync, support —
 * used to be duplicated here as well as in Settings, with two entry points to
 * Settings itself and two Sign Out buttons. They live in Settings now; what
 * stays is only what is about you.
 */
const ACCOUNT_ROWS: {
  icon: typeof UserCogIcon;
  label: string;
  detail: string;
  route: string;
  color: string;
}[] = [
  {
    icon: UserCogIcon,
    label: 'Account & security',
    detail: 'Email and password',
    route: '/settings/account',
    color: '#B66A40',
  },
  {
    icon: CreditCardIcon,
    label: 'Storage & plan',
    detail: 'What you are using, and your limits',
    route: '/settings/storage',
    color: '#8B5E3C',
  },
];

export default function ProfileScreen() {
  const { user, profile, signOut } = useAuth();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { isOffline } = useOffline();

  // The button below used to have no onPress at all, which is why signing out
  // appeared to do nothing. The auth guard in (app)/_layout.tsx handles the
  // redirect once the session clears, so no manual navigation is needed here.
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

  const enabled = { enabled: !!user?.id };

  const { workspaces } = useWorkspaces({ limit: 100 }, enabled);
  const { collaborators } = useCollaborators({ limit: 100 }, enabled);
  const { events } = useScheduleEvents({ limit: 100 }, enabled);
  const { storageUsedBytes, usage } = useUsage(enabled);
  // Behind the gear, so this screen has to carry the signal through.
  // A bare boolean, unlike the object the list hooks above take.
  const { offers: rewards } = usePromoOffers(!!user?.id);

  const totalAssets = workspaces.reduce((s, w) => s + (w.media_count || 0), 0);
  const statValues = [workspaces.length, totalAssets, collaborators.length, events.length];

  const version = Constants.expoConfig?.version ?? '1.0';
  const border = palette.border;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* Header. The gear is the only route into Settings — there used to be
            this button and an "App Settings" row further down the same page. */}
        <View className="px-5 pt-4 pb-2 flex-row items-center justify-between">
          <Text className="text-foreground text-[28px] font-bold tracking-tight">Profile</Text>
          <Pressable
            onPress={() => router.push('/settings')}
            accessibilityLabel={
              rewards.length > 0
                ? `Settings, ${rewards.length} reward waiting`
                : 'Settings'
            }
            className="w-11 h-11 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
          >
            <SettingsIcon size={20} className="text-muted-foreground" />
            {/* Rewards are behind this gear, and an offer expires. A dot rather
                than a count: the number is on the row itself one screen in, and
                what matters here is only that something is waiting. */}
            {rewards.length > 0 && (
              <View
                className="absolute rounded-full"
                style={{
                  top: 8,
                  right: 8,
                  width: 9,
                  height: 9,
                  backgroundColor: palette.primary,
                }}
              />
            )}
          </Pressable>
        </View>

        {/* Profile card */}
        <View className="mx-5 mt-2 bg-card rounded-3xl border border-border/40 p-5 items-center">
          {profile?.avatarUrl ? (
            <Image
              source={{ uri: profile.avatarUrl }}
              style={{ width: 80, height: 80, borderRadius: 40 }}
            />
          ) : (
            // Initial-letter placeholder rather than a stock photo, so an
            // unset avatar reads as "not set yet" instead of someone else's face.
            <View
              style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: `${palette.primary}18`, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: palette.primary, fontSize: 30, fontWeight: '700' }}>
                {(profile?.displayName || user?.email || '?').charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <Text className="text-foreground text-xl font-bold mt-3">
            {profile?.displayName || 'Add your name'}
          </Text>
          {profile?.title ? (
            <Text className="text-muted-foreground text-xs font-semibold mt-0.5">
              {profile.title}
            </Text>
          ) : null}
          <Text className="text-muted-foreground text-sm mt-0.5">{user?.email ?? ''}</Text>

          <Pressable
            onPress={() => router.push('/settings/profile')}
            className="mt-3 bg-muted rounded-full px-4 py-1.5 active:scale-[0.96]"
          >
            <Text className="text-foreground text-xs font-bold">Edit profile</Text>
          </Pressable>

          <View className="flex-row items-center gap-2 mt-3">
            <Pressable
              onPress={() => router.push('/settings/storage')}
              className="flex-row items-center gap-1 bg-muted rounded-full px-3 py-1.5 active:scale-[0.96]"
            >
              <HardDriveIcon size={12} className="text-muted-foreground" />
              <Text className="text-muted-foreground text-xs font-semibold">
                {formatBytes(storageUsedBytes)} used
                {usage?.plan ? ` · ${usage.plan}` : ''}
              </Text>
            </Pressable>
            {/* Was a hardcoded green "Synced" that said the same thing with the
                network off. */}
            <Pressable
              onPress={() => router.push('/settings/offline')}
              className="flex-row items-center gap-1 bg-muted rounded-full px-3 py-1.5 active:scale-[0.96]"
            >
              {isOffline ? (
                <WifiOffIcon size={12} color="#C76B4A" />
              ) : (
                <WifiIcon size={12} color="#6B8E4E" />
              )}
              <Text
                className="text-xs font-semibold"
                style={{ color: isOffline ? '#C76B4A' : '#6B8E4E' }}
              >
                {isOffline ? 'Offline' : 'Synced'}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Stats: two columns keep the labels readable at 320–375pt widths. */}
        <View className="mx-5 mt-4 gap-3">
          {[0, 2].map((start) => (
            <View key={start} className="flex-row gap-3">
              {STATS.slice(start, start + 2).map((stat, offset) => {
                const i = start + offset;
                const Icon = stat.icon;
                return (
                  <View key={stat.label} className="flex-1 bg-card rounded-2xl border border-border/30 p-4 flex-row items-center gap-3">
                    <View className="w-9 h-9 rounded-xl bg-primary/10 items-center justify-center">
                      <Icon size={17} className="text-primary" />
                    </View>
                    <View>
                      <Text className="text-foreground text-lg font-bold">{statValues[i].toLocaleString()}</Text>
                      <Text className="text-muted-foreground text-xs font-medium mt-0.5">{stat.label}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
        </View>

        {/* Account */}
        <View className="px-5 mt-6">
          <Text className="text-foreground text-xl font-bold tracking-tight mb-3 px-1">
            Account
          </Text>
          <View className="bg-card rounded-2xl overflow-hidden border border-border/30">
            {ACCOUNT_ROWS.map((row, i) => {
              const Icon = row.icon;
              return (
                <Pressable
                  key={row.label}
                  onPress={() => router.push(row.route as never)}
                  className="flex-row items-center gap-3 px-4 py-3.5 active:bg-muted/30"
                  style={i < ACCOUNT_ROWS.length - 1 ? { borderBottomWidth: 1, borderBottomColor: border } : undefined}
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
                  <View className="flex-1">
                    <Text className="text-foreground text-sm font-semibold">{row.label}</Text>
                    <Text className="text-muted-foreground text-xs mt-0.5">{row.detail}</Text>
                  </View>
                  <ChevronRightIcon size={14} className="text-muted-foreground" />
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Sign out. The only one in the app — Settings carried a second copy. */}
        <View className="px-5 mt-6">
          <Pressable
            onPress={handleSignOut}
            disabled={signOut.isPending}
            className="bg-card rounded-2xl border border-border/30 p-4 flex-row items-center justify-center gap-2 active:scale-[0.98]"
          >
            <LogOutIcon size={17} className="text-destructive" />
            <Text className="text-destructive text-sm font-semibold">
              {signOut.isPending ? 'Signing out…' : 'Sign Out'}
            </Text>
          </Pressable>
        </View>

        <View className="items-center mt-8 mb-4">
          <Text className="text-muted-foreground text-xs">
            Virgo v{version} · Made for creators
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
