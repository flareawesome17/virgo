import { View, Text, FlatList, Pressable, RefreshControl, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { ArrowLeftIcon, Trash2Icon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useDeletedWorkspaces, useRestoreWorkspace, useTheme } from '@/src/hooks';
import type { DeletedWorkspace } from '@/src/api';
import { TRASH_EXPLAINER, trashLine } from '@/src/lib/workspaces';
import { LoadFailed } from '@/components/LoadFailed';
import { PALETTES } from '@/theme';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(Trash2Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/**
 * Recently deleted: the owner's deleted workspaces, for the 30 days before
 * they go for good, each with a Restore button.
 *
 * Rows are not cards that open: a deleted workspace has nothing to open until
 * it is back. Restoring puts everything back where it was and opens it.
 */
export default function RecentlyDeletedScreen() {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const [refreshing, setRefreshing] = useState(false);
  const { workspaces, isLoading, loadFailed, refetch } = useDeletedWorkspaces();
  const restore = useRestoreWorkspace();

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const restoreOne = useCallback(
    (workspace: DeletedWorkspace) =>
      restore.mutate(workspace.id, {
        onSuccess: () => router.replace(`/workspaces/${workspace.id}`),
        // At the plan's limit, the message says what to do about it.
        onError: (err: Error) => Alert.alert('Could not restore it', err.message),
      }),
    [restore],
  );

  const restoring = restore.isPending ? restore.variables : null;

  const renderItem = useCallback(
    ({ item }: { item: DeletedWorkspace }) => (
      <View className="mx-5 mb-3 flex-row items-center gap-3 rounded-2xl bg-card px-4 py-3.5">
        <View className="w-10 h-10 rounded-xl" style={{ backgroundColor: item.accent_color }} />
        <View className="flex-1 min-w-0">
          <Text className="text-foreground text-[15px] font-semibold" numberOfLines={1}>
            {item.name}
          </Text>
          <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={2}>
            {trashLine(item)}
          </Text>
        </View>
        <Pressable
          onPress={() => restoreOne(item)}
          disabled={restoring !== null}
          accessibilityRole="button"
          accessibilityLabel={`Restore ${item.name}`}
          className={`h-9 px-4 rounded-xl items-center justify-center bg-action ${
            restoring !== null ? 'opacity-60' : 'active:scale-[0.97]'
          }`}
        >
          {restoring === item.id ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-action-foreground text-sm font-bold">Restore</Text>
          )}
        </Pressable>
      </View>
    ),
    [restoreOne, restoring],
  );

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <View className="px-3 pt-2 pb-1 flex-row items-center gap-1">
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="w-11 h-11 items-center justify-center active:opacity-60"
        >
          <ArrowLeftIcon size={20} className="text-foreground" />
        </Pressable>
        <Text className="text-foreground text-[17px] font-semibold">Recently deleted</Text>
      </View>
      <FlatList
        data={workspaces}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />
        }
        ListHeaderComponent={
          workspaces.length > 0 ? (
            <Text className="text-muted-foreground text-xs leading-[17px] mx-6 mb-3">{TRASH_EXPLAINER}</Text>
          ) : null
        }
        ListEmptyComponent={
          isLoading ? null : loadFailed ? (
            <LoadFailed what="Recently deleted" onRetry={() => refetch()} compact />
          ) : (
            <View className="px-8 pt-12 items-center gap-2">
              <Trash2Icon size={26} className="text-muted-foreground" />
              <Text className="text-foreground text-base font-bold">Nothing deleted</Text>
              <Text className="text-muted-foreground text-sm text-center">{TRASH_EXPLAINER}</Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}
