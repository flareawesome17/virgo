import { View, Text, FlatList, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { ArchiveIcon, ArrowLeftIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useTheme, useWorkspaces } from '@/src/hooks';
import type { Workspace } from '@/src/api';
import { LoadFailed } from '@/components/LoadFailed';
import { WorkspaceCard } from '@/components/WorkspaceCard';
import { PALETTES } from '@/theme';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ArchiveIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/**
 * Workspaces put away when their job was done. Each still opens as it was —
 * albums, members and sharing untouched — and its owner can bring it back
 * from its settings.
 */
export default function ArchivedWorkspacesScreen() {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const [refreshing, setRefreshing] = useState(false);
  const { workspaces, isLoading, loadFailed, refetch } = useWorkspaces({
    archived: 'only',
    orderBy: 'name',
    direction: 'asc',
    limit: 100,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const renderItem = useCallback(
    ({ item }: { item: Workspace }) => <WorkspaceCard workspace={item} ring={palette.card} />,
    [palette.card],
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
        <Text className="text-foreground text-[17px] font-semibold">Archived</Text>
      </View>
      <FlatList
        data={workspaces}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />
        }
        ListEmptyComponent={
          isLoading ? null : loadFailed ? (
            <LoadFailed what="your archived workspaces" onRetry={() => refetch()} compact />
          ) : (
            <View className="px-8 pt-12 items-center gap-2">
              <ArchiveIcon size={26} className="text-muted-foreground" />
              <Text className="text-foreground text-base font-bold">Nothing archived</Text>
              <Text className="text-muted-foreground text-sm text-center">
                Archive a workspace from its settings when the job is done.
              </Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}
