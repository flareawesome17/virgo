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
  const border = isDark ? '#2A2522' : '#F0E8E2';
  const cardShadow = {
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  } as const;

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
            style={cardShadow}
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
                  backgroundColor: '#B66A40',
                }}
              />
            )}
          </Pressable>
        </View>

        {/* Profile card */}
        <View
          className="mx-5 mt-2 bg-card rounded-3xl p-5 items-center"
          style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 4 }}
        >
          {profile?.avatarUrl ? (
            <Image
              source={{ uri: profile.avatarUrl }}
              style={{ width: 80, height: 80, borderRadius: 40 }}
            />
          ) : (
            // Initial-letter placeholder rather than a stock photo, so an
            // unset avatar reads as "not set yet" instead of someone else's face.
            <View
              style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#B66A4018', alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: '#B66A40', fontSize: 30, fontWeight: '700' }}>
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
            <Text className="text-foreground text-[11px] font-bold">Edit profile</Text>
          </Pressable>

          <View className="flex-row items-center gap-2 mt-3">
            <Pressable
              onPress={() => router.push('/settings/storage')}
              className="flex-row items-center gap-1 bg-muted rounded-full px-3 py-1.5 active:scale-[0.96]"
            >
              <HardDriveIcon size={12} className="text-muted-foreground" />
              <Text className="text-muted-foreground text-[11px] font-semibold">
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
                className="text-[11px] font-semibold"
                style={{ color: isOffline ? '#C76B4A' : '#6B8E4E' }}
              >
                {isOffline ? 'Offline' : 'Synced'}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Stats row */}
        <View className="mx-5 mt-4 flex-row gap-3">
          {STATS.map((stat, i) => {
            const Icon = stat.icon;
            return (
              <View
                key={stat.label}
                className="flex-1 bg-card rounded-2xl p-3 items-center"
                style={cardShadow}
              >
                <Icon size={16} className="text-primary mb-1.5" />
                <Text className="text-foreground text-lg font-bold">
                  {statValues[i].toLocaleString()}
                </Text>
                <Text className="text-muted-foreground text-[10px] font-medium mt-0.5">
                  {stat.label}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Account */}
        <View className="px-5 mt-6">
          <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 px-1">
            Account
          </Text>
          <View className="bg-card rounded-2xl overflow-hidden" style={cardShadow}>
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
            className="bg-card rounded-2xl p-4 flex-row items-center justify-center gap-2 active:scale-[0.98]"
            style={cardShadow}
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
