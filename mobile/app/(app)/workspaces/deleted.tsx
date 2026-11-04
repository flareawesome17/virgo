import { View, Text, SectionList, Pressable, RefreshControl, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ArrowLeftIcon, ImagesIcon, Trash2Icon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  useDeletedAlbums,
  useDeletedWorkspaces,
  useRestoreAlbum,
  useRestoreWorkspace,
  useTheme,
} from '@/src/hooks';
import type { DeletedAlbum, DeletedWorkspace } from '@/src/api';
import { TRASH_EXPLAINER, albumTrashLine, trashLine } from '@/src/lib/workspaces';
import { LoadFailed } from '@/components/LoadFailed';
import { RemoteImage } from '@/components/RemoteImage';
import { PALETTES } from '@/theme';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ImagesIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(Trash2Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

type Row =
  | { kind: 'album'; id: string; item: DeletedAlbum }
  | { kind: 'workspace'; id: string; item: DeletedWorkspace };

/**
 * Recently deleted: the owner's deleted albums and workspaces, for the 30
 * days before they go for good with their files, each with a Restore button.
 * Nothing here counts toward storage, which is why deleting makes room.
 *
 * Rows are not cards that open: a deleted album or workspace has nothing to
 * open until it is back. Restoring puts everything back where it was and
 * opens it.
 */
export default function RecentlyDeletedScreen() {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const [refreshing, setRefreshing] = useState(false);
  const deletedWorkspaces = useDeletedWorkspaces();
  const deletedAlbums = useDeletedAlbums();
  const restoreWorkspace = useRestoreWorkspace();
  const restoreAlbum = useRestoreAlbum();
  const { workspaces } = deletedWorkspaces;
  const { albums } = deletedAlbums;

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([deletedWorkspaces.refetch(), deletedAlbums.refetch()]);
    setRefreshing(false);
  };

  // At the plan's limit, or without room for its files, the message says
  // what to do about it.
  const refused = useCallback((err: Error) => Alert.alert('Could not restore it', err.message), []);

  const restoreOne = useCallback(
    (row: Row) =>
      row.kind === 'album'
        ? restoreAlbum.mutate(row.id, {
            onSuccess: () => router.replace(`/albums/${row.id}`),
            onError: refused,
          })
        : restoreWorkspace.mutate(row.id, {
            onSuccess: () => router.replace(`/workspaces/${row.id}`),
            onError: refused,
          }),
    [restoreAlbum, restoreWorkspace, refused],
  );

  const restoring = restoreWorkspace.isPending
    ? restoreWorkspace.variables
    : restoreAlbum.isPending
      ? restoreAlbum.variables
      : null;

  const sections = useMemo(
    () =>
      [
        {
          title: 'Albums',
          data: albums.map((item): Row => ({ kind: 'album', id: item.id, item })),
        },
        {
          title: 'Workspaces',
          data: workspaces.map((item): Row => ({ kind: 'workspace', id: item.id, item })),
        },
      ].filter((section) => section.data.length > 0),
    [albums, workspaces],
  );

  const renderItem = useCallback(
    ({ item: row }: { item: Row }) => (
      <View className="mx-5 mb-3 flex-row items-center gap-3 rounded-2xl bg-card px-4 py-3.5">
        {row.kind === 'workspace' ? (
          <View className="w-10 h-10 rounded-xl" style={{ backgroundColor: row.item.accent_color }} />
        ) : row.item.cover_url ? (
          <View className="w-10 h-10 rounded-xl overflow-hidden bg-muted">
            <RemoteImage source={{ uri: row.item.cover_url }} style={{ width: 40, height: 40 }} />
          </View>
        ) : (
          <View className="w-10 h-10 rounded-xl items-center justify-center bg-muted">
            <ImagesIcon size={18} className="text-muted-foreground" />
          </View>
        )}
        <View className="flex-1 min-w-0">
          <Text className="text-foreground text-[15px] font-semibold" numberOfLines={1}>
            {row.item.name}
          </Text>
          <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={2}>
            {row.kind === 'album' ? albumTrashLine(row.item) : trashLine(row.item)}
          </Text>
        </View>
        <Pressable
          onPress={() => restoreOne(row)}
          disabled={restoring !== null}
          accessibilityRole="button"
          accessibilityLabel={`Restore ${row.item.name}`}
          className={`h-9 px-4 rounded-xl items-center justify-center bg-action ${
            restoring !== null ? 'opacity-60' : 'active:scale-[0.97]'
          }`}
        >
          {restoring === row.id ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-action-foreground text-sm font-bold">Restore</Text>
          )}
        </Pressable>
      </View>
    ),
    [restoreOne, restoring],
  );

  const isLoading = deletedWorkspaces.isLoading || deletedAlbums.isLoading;
  const loadFailed = deletedWorkspaces.loadFailed || deletedAlbums.loadFailed;

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
      <SectionList
        sections={sections}
        keyExtractor={(row) => `${row.kind}:${row.id}`}
        renderItem={renderItem}
        renderSectionHeader={({ section }) => (
          <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[1.2px] mx-6 mt-2 mb-2">
            {section.title}
          </Text>
        )}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />
        }
        ListHeaderComponent={
          sections.length > 0 ? (
            <Text className="text-muted-foreground text-xs leading-[17px] mx-6 mb-3">{TRASH_EXPLAINER}</Text>
          ) : null
        }
        ListEmptyComponent={
          isLoading ? null : loadFailed ? (
            <LoadFailed what="Recently deleted" onRetry={onRefresh} compact />
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
