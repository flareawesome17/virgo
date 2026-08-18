import { View, Text, ScrollView, Pressable, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftIcon,
  WifiIcon,
  WifiOffIcon,
  RefreshCwIcon,
  CheckIcon,
  XIcon,
  ChevronRightIcon,
  HardDriveIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useOffline, useTheme } from '@/src/hooks';

for (const Icon of [
  ArrowLeftIcon, WifiIcon, WifiOffIcon, RefreshCwIcon, CheckIcon, XIcon,
  ChevronRightIcon, HardDriveIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * What actually survives a lost connection.
 *
 * Listed rather than promised in the abstract: the app persists its query
 * cache to device storage, so reads work offline and writes do not. Saying so
 * plainly is more useful than a switch, and it is the honest version of the
 * "Soon" badge this row used to carry.
 */
const CAPABILITIES: { label: string; works: boolean; detail: string }[] = [
  {
    label: 'Browse workspaces and albums',
    works: true,
    detail: 'Anything loaded before you went offline, including after a restart',
  },
  {
    label: 'Read your schedule and reminders',
    works: true,
    detail: 'Alarms are scheduled on the device and fire with no network at all',
  },
  {
    label: 'Read chat history',
    works: true,
    detail: 'Conversations you had already opened',
  },
  {
    label: 'Upload photos, video and audio',
    works: false,
    detail: 'Uploads go straight to cloud storage and need a connection',
  },
  {
    label: 'Send messages',
    works: false,
    detail: 'Kept in the thread and marked unsent, so you can retry rather than retype',
  },
  {
    label: 'Create or edit anything',
    works: false,
    detail: 'Albums, events and invitations are written on the server',
  },
];

function whenLabel(at: Date | null): string {
  if (!at) return 'not yet this session';
  const mins = Math.floor((Date.now() - at.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  return at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function OfflineSyncScreen() {
  const { isDark } = useTheme();
  const { isOffline, lastSyncTime } = useOffline();
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);

  /** Refetches everything currently cached, so the whole app catches up at once. */
  const syncNow = async () => {
    if (isOffline) {
      Alert.alert('No connection', 'Reconnect and try again.');
      return;
    }
    setSyncing(true);
    try {
      await queryClient.refetchQueries({ type: 'active' });
      await queryClient.invalidateQueries();
    } finally {
      setSyncing(false);
    }
  };

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
        contentContainerStyle={{ paddingBottom: 60 }}
      >
        <View className="px-5 pt-4 pb-2 flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
            style={cardShadow}
          >
            <ArrowLeftIcon size={18} className="text-foreground" />
          </Pressable>
          <View className="flex-1">
            <Text className="text-foreground text-[22px] font-bold tracking-tight">
              Offline Sync
            </Text>
            <Text className="text-muted-foreground text-sm mt-0.5">
              What works without a connection
            </Text>
          </View>
        </View>

        {/* Status */}
        <View className="px-5 mt-5">
          <View className="bg-card rounded-2xl p-4" style={cardShadow}>
            <View className="flex-row items-center gap-3">
              <View
                className="w-11 h-11 rounded-2xl items-center justify-center"
                style={{ backgroundColor: isOffline ? '#C76B4A18' : '#6B8E4E18' }}
              >
                {isOffline ? (
                  <WifiOffIcon size={19} color="#C76B4A" />
                ) : (
                  <WifiIcon size={19} color="#6B8E4E" />
                )}
              </View>
              <View className="flex-1">
                <Text className="text-foreground text-base font-bold">
                  {isOffline ? 'Offline' : 'Online'}
                </Text>
                <Text className="text-muted-foreground text-xs mt-0.5">
                  Last synced {whenLabel(lastSyncTime)}
                </Text>
              </View>
            </View>

            <Pressable
              onPress={() => void syncNow()}
              disabled={syncing || isOffline}
              className={`mt-4 rounded-xl py-3 flex-row items-center justify-center gap-2 active:scale-[0.97] ${
                isOffline ? 'bg-muted' : 'bg-action'
              }`}
            >
              {syncing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <RefreshCwIcon
                  size={15}
                  color={isOffline ? '#A89489' : '#FFFFFF'}
                />
              )}
              <Text
                className={`text-sm font-bold ${isOffline ? 'text-muted-foreground' : 'text-white'}`}
              >
                {syncing ? 'Syncing…' : 'Sync now'}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* What works */}
        <View className="px-5 mt-6">
          <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">
            Without a connection
          </Text>
          <View className="bg-card rounded-2xl overflow-hidden" style={cardShadow}>
            {CAPABILITIES.map((c, i) => (
              <View
                key={c.label}
                className="px-4 py-3 flex-row items-start gap-3"
                style={i < CAPABILITIES.length - 1 ? { borderBottomWidth: 1, borderBottomColor: border } : undefined}
              >
                <View
                  className="w-5 h-5 rounded-full items-center justify-center mt-0.5"
                  style={{ backgroundColor: c.works ? '#6B8E4E18' : '#C76B4A18' }}
                >
                  {c.works ? (
                    <CheckIcon size={12} color="#6B8E4E" />
                  ) : (
                    <XIcon size={12} color="#C76B4A" />
                  )}
                </View>
                <View className="flex-1">
                  <Text className="text-foreground text-sm font-semibold">{c.label}</Text>
                  <Text className="text-muted-foreground text-xs mt-0.5 leading-4">
                    {c.detail}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View className="px-5 mt-6">
          <Pressable
            onPress={() => router.push('/settings/sync')}
            className="bg-card rounded-2xl px-4 py-3.5 flex-row items-center gap-3 active:bg-muted/30"
            style={cardShadow}
          >
            <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: '#8B5E3C14', alignItems: 'center', justifyContent: 'center' }}>
              <HardDriveIcon size={15} color="#8B5E3C" />
            </View>
            <View className="flex-1">
              <Text className="text-foreground text-sm font-semibold">Sync &amp; Storage</Text>
              <Text className="text-muted-foreground text-xs mt-0.5">
                What is stored in the cloud, and how to wipe it
              </Text>
            </View>
            <ChevronRightIcon size={14} className="text-muted-foreground" />
          </Pressable>
        </View>

        <Text className="text-muted-foreground text-[11px] px-6 mt-5 leading-5">
          Cached data is kept on this device so the app opens with your work
          already on screen. Signing out clears it.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
