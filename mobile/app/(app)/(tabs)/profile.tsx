import { View, Text, ScrollView, RefreshControl, Pressable, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApp, useAuth, useTheme } from '@/src/hooks';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  SettingsIcon,
  ChevronRightIcon,
  HardDriveIcon,
  CloudIcon,
  WifiIcon,
  BellIcon,
  LockIcon,
  PaletteIcon,
  HelpCircleIcon,
  LogOutIcon,
  ShieldIcon,
  FolderIcon,
  ImageIcon,
  UsersIcon,
  CalendarIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';

cssInterop(SettingsIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ChevronRightIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(HardDriveIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CloudIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(WifiIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(BellIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(LockIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PaletteIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(HelpCircleIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(LogOutIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ShieldIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(FolderIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ImageIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UsersIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CalendarIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const STATS = [
  { label: 'Workspaces', icon: FolderIcon },
  { label: 'Assets', icon: ImageIcon },
  { label: 'Collaborators', icon: UsersIcon },
  { label: 'Events', icon: CalendarIcon },
];

const SETTINGS_SECTIONS = [
  {
    title: 'Preferences',
    items: [
      { icon: BellIcon, label: 'Notifications', color: '#B66A40' },
      { icon: PaletteIcon, label: 'Appearance', color: '#C17745' },
      { icon: CloudIcon, label: 'Sync & Storage', color: '#8B5E3C' },
    ],
  },
  {
    title: 'Security',
    items: [
      { icon: LockIcon, label: 'Privacy', color: '#5B7B9A' },
      { icon: ShieldIcon, label: 'Two-Factor Auth', color: '#6B8E4E' },
    ],
  },
  {
    title: 'Support',
    items: [
      { icon: HelpCircleIcon, label: 'Help Center', color: '#B66A40' },
      { icon: SettingsIcon, label: 'App Settings', color: '#54433C' },
    ],
  },
];

export default function ProfileScreen() {
  const { client } = useApp();
  const { user } = useAuth();
  const { isDark } = useTheme();

  const { data: workspaces = [] } = useQuery({
    queryKey: ['workspaces', user?.id],
    queryFn: async () => {
      const { data, error } = await client
        .from('workspaces')
        .select('*')
        .eq('user_id', user?.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const { data: collaborators = [] } = useQuery({
    queryKey: ['collaborators', user?.id],
    queryFn: async () => {
      const { data, error } = await client
        .from('collaborators')
        .select('*')
        .eq('user_id', user?.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const { data: events = [] } = useQuery({
    queryKey: ['schedule_events', user?.id],
    queryFn: async () => {
      const { data, error } = await client
        .from('schedule_events')
        .select('*')
        .eq('user_id', user?.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const totalAssets = workspaces.reduce((s, w) => s + (w.media_count || 0), 0);
  const statValues = [workspaces.length, totalAssets, collaborators.length, events.length];

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* Header */}
        <View className="px-5 pt-4 pb-2 flex-row items-center justify-between">
          <Text className="text-foreground text-[28px] font-bold tracking-tight">Profile</Text>
          <Pressable onPress={() => router.push('/settings')} className="w-11 h-11 rounded-2xl bg-card items-center justify-center active:scale-[0.94]" style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            <SettingsIcon size={20} className="text-muted-foreground" />
          </Pressable>
        </View>

        {/* Profile card */}
        <View className="mx-5 mt-2 bg-card rounded-3xl p-5 items-center" style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 4 }}>
          <Image
            source={{ uri: 'https://picsum.photos/seed/virgo-user/200/200' }}
            style={{ width: 80, height: 80, borderRadius: 40 }}
          />
          <Text className="text-foreground text-xl font-bold mt-3">Riya Kapoor</Text>
          <Text className="text-muted-foreground text-sm mt-0.5">Creative Director & Photographer</Text>
          <View className="flex-row items-center gap-2 mt-3">
            <View className="flex-row items-center gap-1 bg-muted rounded-full px-3 py-1.5">
              <HardDriveIcon size={12} className="text-muted-foreground" />
              <Text className="text-muted-foreground text-[11px] font-semibold">128.4 GB used</Text>
            </View>
            <View className="flex-row items-center gap-1 bg-muted rounded-full px-3 py-1.5">
              <WifiIcon size={12} className="text-[#6B8E4E]" />
              <Text className="text-[#6B8E4E] text-[11px] font-semibold">Synced</Text>
            </View>
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
                style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
              >
                <Icon size={16} className="text-primary mb-1.5" />
                <Text className="text-foreground text-lg font-bold">{statValues[i].toLocaleString()}</Text>
                <Text className="text-muted-foreground text-[10px] font-medium mt-0.5">{stat.label}</Text>
              </View>
            );
          })}
        </View>

        {/* Settings sections */}
        <View className="px-5 mt-6 gap-5">
          {SETTINGS_SECTIONS.map((section) => (
            <View key={section.title}>
              <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 px-1">
                {section.title}
              </Text>
              <View className="bg-card rounded-2xl overflow-hidden" style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
                {section.items.map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <Pressable
                      key={item.label}
                      className="flex-row items-center gap-3 px-4 py-3.5 active:bg-muted/30"
                      style={
                        i < section.items.length - 1
                          ? { borderBottomWidth: 1, borderBottomColor: '#F0E8E2' }
                          : undefined
                      }
                    >
                      <View
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 10,
                          backgroundColor: `${item.color}14`,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Icon size={15} style={{ color: item.color }} />
                      </View>
                      <Text className="text-foreground text-sm font-semibold flex-1">{item.label}</Text>
                      <ChevronRightIcon size={14} className="text-muted-foreground" />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </View>

        {/* Sign out */}
        <View className="px-5 mt-6">
          <Pressable className="bg-card rounded-2xl p-4 flex-row items-center gap-3 active:scale-[0.98]" style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            <LogOutIcon size={18} className="text-destructive" />
            <Text className="text-destructive text-sm font-semibold">Sign Out</Text>
          </Pressable>
        </View>

        {/* App version */}
        <View className="items-center mt-8 mb-4">
          <Text className="text-muted-foreground text-xs">Virgo v1.0 · Made for creators</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
