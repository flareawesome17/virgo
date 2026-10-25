import { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  Alert,
  ActivityIndicator,
  RefreshControl,
  type ListRenderItem,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  ArrowLeftIcon,
  GlobeIcon,
  KeyRoundIcon,
  LaptopIcon,
  MonitorSmartphoneIcon,
  SmartphoneIcon,
  type LucideIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useSessions, useSignOutOtherSessions, useSignOutSession, useTheme } from '@/src/hooks';
import { ApiError, type DeviceSession } from '@/src/api';
import { LoadFailed } from '@/components/LoadFailed';
import { PALETTES } from '@/theme';

for (const Icon of [
  ArrowLeftIcon,
  GlobeIcon,
  KeyRoundIcon,
  LaptopIcon,
  MonitorSmartphoneIcon,
  SmartphoneIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

function iconFor(session: DeviceSession): LucideIcon {
  if (session.client === 'ios' || session.client === 'android') return SmartphoneIcon;
  if (session.client === 'desktop') return LaptopIcon;
  return GlobeIcon;
}

/**
 * "Active now" for anything used in the last quarter hour — a session in use
 * refreshes every 15 minutes, so that is as fine as the server can tell.
 */
function lastActive(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const minutes = (now - then) / 60_000;
  if (minutes < 16) return 'Active now';
  if (minutes < 60) return `Active ${Math.round(minutes)}m ago`;
  const hours = minutes / 60;
  if (hours < 24) return `Active ${Math.round(hours)}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'Active yesterday' : `Active ${days} days ago`;
}

function signedInOn(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function problem(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Check your connection and try again.';
}

/**
 * Every device signed in to your account, and a Sign out for each.
 *
 * Before this the only way to end a session you did not recognise was to
 * change your password, which ends all of them — and nothing showed you there
 * was one to end. On 2026-10-25 a stranger's iPhone was signed in to an
 * account for three hours, after deleting a workspace in the first two
 * minutes.
 */
export default function DevicesScreen() {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { sessions, isLoading, loadFailed, refetch } = useSessions();
  const signOut = useSignOutSession();
  const signOutOthers = useSignOutOtherSessions();
  /** The row whose sign-out is on its way, for its spinner. */
  const [ending, setEnding] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const others = sessions.filter((s) => !s.current);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const confirmSignOut = useCallback(
    (session: DeviceSession) =>
      Alert.alert(
        `Sign out ${session.device}?`,
        `${session.app} will need your password to get back in. If you don't recognise it, change your password too.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Sign out',
            style: 'destructive',
            onPress: () => {
              setEnding(session.id);
              signOut.mutate(session.id, {
                onError: (err) => Alert.alert('Could not sign it out', problem(err)),
                onSettled: () => setEnding(null),
              });
            },
          },
        ],
      ),
    [signOut],
  );

  const confirmSignOutOthers = useCallback(
    () =>
      Alert.alert(
        'Sign out every other device?',
        'Everything but this phone will need your password to get back in.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Sign out all',
            style: 'destructive',
            onPress: () =>
              signOutOthers.mutate(undefined, {
                onError: (err) => Alert.alert('Could not sign them out', problem(err)),
              }),
          },
        ],
      ),
    [signOutOthers],
  );

  const keyExtractor = useCallback((session: DeviceSession) => session.id, []);

  const renderItem = useCallback<ListRenderItem<DeviceSession>>(
    ({ item }) => {
      const Icon = iconFor(item);
      return (
        <View className="bg-card rounded-2xl border border-border/30 px-4 py-3 flex-row items-center gap-3">
          <View className="w-11 h-11 rounded-full bg-primary/10 items-center justify-center">
            <Icon size={20} className="text-primary" />
          </View>
          <View className="flex-1 min-w-0">
            <View className="flex-row items-center gap-2">
              <Text className="text-foreground text-sm font-semibold shrink" numberOfLines={1}>
                {item.device}
              </Text>
              {item.current ? (
                <View className="bg-primary/10 rounded-full px-2 py-0.5">
                  <Text className="text-primary text-[10px] font-bold uppercase">This device</Text>
                </View>
              ) : null}
            </View>
            <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
              {item.app}
            </Text>
            <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
              {item.current
                ? `Signed in ${signedInOn(item.signedInAt)}`
                : `${lastActive(item.lastActiveAt)} · Signed in ${signedInOn(item.signedInAt)}`}
            </Text>
          </View>
          {item.current ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Sign out ${item.device}, ${item.app}`}
              onPress={() => confirmSignOut(item)}
              disabled={ending !== null || signOutOthers.isPending}
              className="bg-muted rounded-xl px-3 py-2 flex-row items-center gap-1.5 active:opacity-70"
            >
              {ending === item.id ? (
                <ActivityIndicator size="small" color={palette.foreground} />
              ) : null}
              <Text className="text-foreground text-xs font-bold">Sign out</Text>
            </Pressable>
          )}
        </View>
      );
    },
    [confirmSignOut, ending, signOutOthers.isPending, palette.foreground],
  );

  const intro = (
    <Text className="text-muted-foreground text-sm leading-5 mb-4">
      {"Everywhere your account is signed in. We email you whenever a new device signs in. If you don't recognise one, sign it out and change your password."}
    </Text>
  );

  const footer = (
    <View className="mt-5 gap-3">
      {others.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={confirmSignOutOthers}
          disabled={signOutOthers.isPending}
          className="bg-card rounded-2xl border border-border/30 px-4 py-3.5 flex-row items-center justify-center gap-2 active:opacity-70"
        >
          {signOutOthers.isPending ? (
            <ActivityIndicator size="small" color={palette.destructive} />
          ) : null}
          <Text className="text-destructive text-sm font-bold">Sign out all other devices</Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/settings/password')}
        className="flex-row items-center gap-3 px-1 py-2 active:opacity-70"
      >
        <KeyRoundIcon size={16} className="text-muted-foreground" />
        <Text className="text-muted-foreground text-xs leading-5 flex-1">
          Changing your password signs out every device, this one included, and is the way to
          lock out someone who knows it.
        </Text>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <View className="px-5 pt-4 pb-2 flex-row items-center gap-3">
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="w-11 h-11 rounded-2xl bg-card border border-border/30 items-center justify-center active:scale-[0.94]"
        >
          <ArrowLeftIcon size={18} className="text-foreground" />
        </Pressable>
        <Text className="text-foreground text-[22px] font-bold tracking-tight flex-1">Devices</Text>
      </View>

      {isLoading && sessions.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={palette.primary} />
        </View>
      ) : loadFailed && sessions.length === 0 ? (
        <LoadFailed what="your devices" onRetry={() => refetch()} />
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ListHeaderComponent={intro}
          ListFooterComponent={footer}
          ItemSeparatorComponent={Gap}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 60 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />
          }
          ListEmptyComponent={
            <View className="items-center px-6 pt-10">
              <View className="w-16 h-16 rounded-full bg-muted items-center justify-center mb-4">
                <MonitorSmartphoneIcon size={26} className="text-muted-foreground" />
              </View>
              <Text className="text-foreground text-base font-bold text-center">
                Nothing to show yet
              </Text>
              <Text className="text-muted-foreground text-sm text-center mt-2 leading-5">
                Pull down in a minute to see the devices signed in to your account.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function Gap() {
  return <View className="h-2.5" />;
}
