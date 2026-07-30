import { View, Text, ScrollView, Pressable, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
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
}

const SECTIONS: { title: string; rows: SettingsRow[] }[] = [
  {
    title: 'Account',
    rows: [
      { icon: UserIcon, label: 'Account', value: 'riya@virgo.studio', route: '/settings/account', color: '#B66A40' },
      { icon: UserIcon, label: 'Profile', value: 'Riya Kapoor', route: '/settings/profile', color: '#C17745' },
    ],
  },
  {
    title: 'Preferences',
    rows: [
      { icon: BellIcon, label: 'Notifications', route: '/settings/notifications', color: '#B66A40' },
      { icon: PaletteIcon, label: 'Theme', value: 'Light', route: '/settings/theme', color: '#C17745' },
    ],
  },
  {
    title: 'Privacy & Security',
    rows: [
      { icon: LockIcon, label: 'Privacy', route: '/settings/privacy', color: '#5B7B9A' },
      { icon: ShieldIcon, label: 'Security', value: '2FA enabled', route: '/settings/security', color: '#6B8E4E' },
    ],
  },
  {
    title: 'Storage & Sync',
    rows: [
      { icon: HardDriveIcon, label: 'Storage', value: '128.4 GB of 512 GB', route: '/settings/storage', color: '#B66A40' },
      { icon: CloudIcon, label: 'Offline Sync', value: '3 workspaces', route: '/settings/sync', color: '#C17745' },
    ],
  },
  {
    title: 'Support',
    rows: [
      { icon: HelpCircleIcon, label: 'Help Center', route: '/settings/help', color: '#B66A40' },
      { icon: FileTextIcon, label: 'Terms of Service', color: '#54433C' },
      { icon: StarIcon, label: 'Rate Virgo', color: '#C17745' },
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
          <Image
            source={{ uri: 'https://picsum.photos/seed/virgo-user/100/100' }}
            style={{ width: 48, height: 48, borderRadius: 24 }}
          />
          <View className="flex-1">
            <Text className="text-foreground text-base font-bold">Riya Kapoor</Text>
            <Text className="text-muted-foreground text-xs mt-0.5">Creative Director & Photographer</Text>
          </View>
          <ChevronRightIcon size={16} className="text-muted-foreground" />
        </Pressable>

        {/* Sections */}
        <View className="px-5 mt-4 gap-5">
          {SECTIONS.map((section) => (
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
                          ? { borderBottomWidth: 1, borderBottomColor: '#F0E8E2' }
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
                      <ChevronRightIcon size={14} className="text-muted-foreground" />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </View>

        {/* Logout */}
        <View className="px-5 mt-6">
          <Pressable className="bg-card rounded-2xl p-4 flex-row items-center justify-center gap-2 active:scale-[0.98]"
            style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            <LogOutIcon size={17} className="text-destructive" />
            <Text className="text-destructive text-sm font-semibold">Sign Out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
