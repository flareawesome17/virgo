import { View, Text, ScrollView, Pressable, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth, useTheme } from '@/src/hooks';
import {
  ArrowLeftIcon, ChevronRightIcon, UserIcon, BellIcon, LockIcon, ShieldIcon,
  PaletteIcon, HardDriveIcon, WifiIcon, CloudIcon, HelpCircleIcon,
  InfoIcon, LogOutIcon, FileTextIcon, StarIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ChevronRightIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UserIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(BellIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(LockIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ShieldIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PaletteIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(HardDriveIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(WifiIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CloudIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(HelpCircleIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(InfoIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(LogOutIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(FileTextIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(StarIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

interface SettingsRow {
  icon: React.ComponentType<any>;
  label: string;
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

const SECTIONS: { title: string; rows: SettingsRow[] }[] = [
  {
    title: 'Account',
    rows: [
      // `value` is filled in from the signed-in user at render — it used to be
      // a hardcoded placeholder address.
      { icon: UserIcon, label: 'Account', route: '/settings/account', color: '#B66A40' },
      { icon: UserIcon, label: 'Profile', route: '/settings/profile', color: '#C17745' },
    ],
  },
  {
    title: 'Preferences',
    rows: [
      { icon: BellIcon, label: 'Notifications', color: '#B66A40', soon: true },
      { icon: PaletteIcon, label: 'Theme', route: '/settings/theme', color: '#C17745' },
    ],
  },
  {
    title: 'Privacy & Security',
    rows: [
      { icon: LockIcon, label: 'Privacy', route: '/settings/privacy', color: '#5B7B9A' },
      // The old row read "2FA enabled" — there is no 2FA in the backend, so
      // that was a claim the app could not honour.
      { icon: ShieldIcon, label: 'Security', color: '#6B8E4E', soon: true },
    ],
  },
  {
    title: 'Storage & Sync',
    rows: [
      { icon: HardDriveIcon, label: 'Storage', route: '/settings/storage', color: '#B66A40' },
      { icon: CloudIcon, label: 'Offline Sync', route: '/settings/offline', color: '#C17745' },
    ],
  },
  {
    title: 'Support',
    rows: [
      { icon: HelpCircleIcon, label: 'Help Center', route: '/settings/help', color: '#B66A40' },
      { icon: FileTextIcon, label: 'Terms of Service', route: '/legal', color: '#54433C' },
      // Nothing to rate against until the app is on a store listing, and a row
      // that opens nowhere is worse than one that says so.
      { icon: StarIcon, label: 'Rate Virgo', color: '#C17745', soon: true },
    ],
  },
  {
    title: 'About',
    rows: [
      { icon: InfoIcon, label: 'About', value: 'Version 1.0', route: '/settings/about', color: '#8B5E3C' },
    ],
  },
];

export default function SettingsHomeScreen() {
  const { isDark } = useTheme();
  const { user, profile, signOut } = useAuth();

  // This button had no onPress either — there were two dead Sign Out buttons,
  // here and on the Profile tab. The auth guard handles the redirect.
  const handleSignOut = () => {
    Alert.alert('Sign out', 'You will need to sign in again to continue.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut.mutate() },
    ]);
  };

  // Show the real signed-in address on the Account row rather than a
  // placeholder baked into the section table.
  const sections = SECTIONS.map((section) => ({
    ...section,
    rows: section.rows.map((row) =>
      row.label === 'Account' ? { ...row, value: user?.email } : row,
    ),
  }));

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* Header */}
        <View className="px-5 pt-4 pb-4 flex-row items-center gap-3">
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
          <Text className="text-foreground text-[28px] font-bold tracking-tight">Settings</Text>
        </View>

        {/* User card */}
        <Pressable
          onPress={() => router.push('/settings/profile')}
          className="mx-5 mb-2 bg-card rounded-2xl p-4 flex-row items-center gap-4 active:scale-[0.98]"
          style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3 }}
        >
          {profile?.avatarUrl ? (
            <Image
              source={{ uri: profile.avatarUrl }}
              style={{ width: 48, height: 48, borderRadius: 24 }}
            />
          ) : (
            <View
              style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#B66A4018', alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: '#B66A40', fontSize: 18, fontWeight: '700' }}>
                {(profile?.displayName || user?.email || '?').charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <View className="flex-1">
            <Text className="text-foreground text-base font-bold">
              {profile?.displayName || 'Add your name'}
            </Text>
            <Text className="text-muted-foreground text-xs mt-0.5">
              {profile?.title || user?.email || ''}
            </Text>
          </View>
          <ChevronRightIcon size={16} className="text-muted-foreground" />
        </Pressable>

        {/* Sections */}
        <View className="px-5 mt-4 gap-5">
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
                      onPress={() => { if (row.route) router.push(row.route); }}
                      className="flex-row items-center gap-3 px-4 py-3.5 active:bg-muted/30"
                      style={
                        i < section.rows.length - 1
                          ? { borderBottomWidth: 1, borderBottomColor: isDark ? '#2A2522' : '#F0E8E2' }
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
                      <Text className="text-foreground text-sm font-semibold flex-1">
                        {row.label}
                      </Text>
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

        {/* Logout */}
        <View className="px-5 mt-6">
          <Pressable
            onPress={handleSignOut}
            disabled={signOut.isPending}
            className="bg-card rounded-2xl p-4 flex-row items-center justify-center gap-2 active:scale-[0.98]"
            style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            <LogOutIcon size={17} className="text-destructive" />
            <Text className="text-destructive text-sm font-semibold">
              {signOut.isPending ? 'Signing out…' : 'Sign Out'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
