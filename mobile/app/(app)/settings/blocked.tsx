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
import { ArrowLeftIcon, UserXIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useBlocks, useTheme, useUnblock } from '@/src/hooks';
import type { BlockedPerson } from '@/src/api';
import { LoadFailed } from '@/components/LoadFailed';
import { RemoteImage } from '@/components/RemoteImage';
import { askToUnblock, safetyError } from '@/components/PersonSafetySheet';
import { PALETTES } from '@/theme';

for (const Icon of [ArrowLeftIcon, UserXIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

function blockedOn(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * The people you have blocked, and the way back from each.
 *
 * Each row is what you could see of them when you blocked them, not who they
 * are now: the list is for recognising someone and undoing it, and it must not
 * keep telling you about an account you asked never to hear from.
 */
export default function BlockedPeopleScreen() {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { blocks, isLoading, loadFailed, refetch } = useBlocks();
  const unblock = useUnblock();
  /** The row whose unblock is on its way, for its spinner. */
  const [unblocking, setUnblocking] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const confirmUnblock = useCallback(
    (person: BlockedPerson) =>
      askToUnblock(person.name, () => {
        setUnblocking(person.id);
        unblock.mutate(person.id, {
          onError: (err) => Alert.alert('Could not unblock', safetyError(err)),
          onSettled: () => setUnblocking(null),
        });
      }),
    [unblock],
  );

  const keyExtractor = useCallback((person: BlockedPerson) => person.id, []);

  const renderItem = useCallback<ListRenderItem<BlockedPerson>>(
    ({ item }) => (
      <View className="bg-card rounded-2xl border border-border/30 px-4 py-3 flex-row items-center gap-3">
        {/* The initial always, the photograph over it: a snapshot avatar that
            has since been replaced no longer exists, and falls back to the
            initial instead of an empty circle. */}
        <View className="w-11 h-11 rounded-full bg-primary/10 items-center justify-center overflow-hidden">
          <Text className="text-primary text-base font-bold">
            {item.name.trim().charAt(0).toUpperCase() || '?'}
          </Text>
          {item.avatarUrl ? (
            <RemoteImage
              source={{ uri: item.avatarUrl }}
              style={{ position: 'absolute', top: 0, left: 0, width: 44, height: 44 }}
            />
          ) : null}
        </View>
        <View className="flex-1 min-w-0">
          <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
            {item.name}
          </Text>
          <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
            {`Blocked ${blockedOn(item.blockedAt)}`}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Unblock ${item.name}`}
          onPress={() => confirmUnblock(item)}
          disabled={unblocking !== null}
          className="bg-muted rounded-xl px-3 py-2 flex-row items-center gap-1.5 active:opacity-70"
        >
          {unblocking === item.id ? (
            <ActivityIndicator size="small" color={palette.foreground} />
          ) : null}
          <Text className="text-foreground text-xs font-bold">Unblock</Text>
        </Pressable>
      </View>
    ),
    [confirmUnblock, unblocking, palette.foreground],
  );

  const intro = (
    <Text className="text-muted-foreground text-sm leading-5 mb-4">
      {"People you block can't message you, send you connection requests or enquiries, or find you in search and Nearby. They aren't told."}
    </Text>
  );

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <View className="px-5 pt-4 pb-2 flex-row items-center gap-3">
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="w-10 h-10 rounded-2xl bg-card border border-border/30 items-center justify-center active:scale-[0.94]"
        >
          <ArrowLeftIcon size={18} className="text-foreground" />
        </Pressable>
        <Text className="text-foreground text-[22px] font-bold tracking-tight flex-1">
          Blocked people
        </Text>
      </View>

      {isLoading && blocks.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={palette.primary} />
        </View>
      ) : loadFailed && blocks.length === 0 ? (
        <LoadFailed what="your blocked list" onRetry={() => refetch()} />
      ) : (
        <FlatList
          data={blocks}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ListHeaderComponent={intro}
          ItemSeparatorComponent={Gap}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 60 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={palette.primary}
            />
          }
          ListEmptyComponent={
            <View className="items-center px-6 pt-10">
              <View className="w-16 h-16 rounded-full bg-muted items-center justify-center mb-4">
                <UserXIcon size={26} className="text-muted-foreground" />
              </View>
              <Text className="text-foreground text-base font-bold text-center">
                You haven’t blocked anyone
              </Text>
              <Text className="text-muted-foreground text-sm text-center mt-2 leading-5">
                If someone bothers you, open their profile or your chat with them and choose
                Block.
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
