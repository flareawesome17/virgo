import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CheckIcon, FileIcon, FolderInputIcon, Trash2Icon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useQueryClient } from '@tanstack/react-query';
import { ScreenHeader } from '@/components/ScreenHeader';
import { LoadFailed } from '@/components/LoadFailed';
import { RemoteImage } from '@/components/RemoteImage';
import { ChoiceSheet } from '@/components/WorkspaceBits';
import {
  fileNameFromKey,
  unassignedFilesKey,
  useAlbums,
  useAttachToAlbum,
  useAuth,
  useDeleteFiles,
  useUnassignedFiles,
} from '@/src/hooks';
import { formatBytes } from '@/src/api';

for (const Icon of [CheckIcon, FileIcon, FolderInputIcon, Trash2Icon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * Files that belong to no album.
 *
 * Deleting an album keeps its files — they are still billed — and an upload
 * cut off before its album was chosen lands here too. The phone had nowhere
 * to see them: the delete dialog said they "can be filed into another album",
 * and nothing on the phone could. This lists them, files them into one of your
 * albums, or deletes them.
 */
export default function UnfiledScreen() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { files, isLoading, loadFailed, refetch } = useUnassignedFiles();
  const { albums } = useAlbums({ limit: 100 });
  const attach = useAttachToAlbum();
  const remove = useDeleteFiles(undefined);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [choosing, setChoosing] = useState(false);

  // Only your own: the server files into an album it checks you own.
  const ownAlbums = useMemo(
    () =>
      albums.filter((album) =>
        album.my_access ? album.my_access === 'owner' : album.user_id === user?.id,
      ),
    [albums, user?.id],
  );
  const busy = attach.isPending || remove.isPending;
  const keys = [...picked];
  const allPicked = files.length > 0 && picked.size === files.length;

  const toggle = (key: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const fileInto = (albumId: string) =>
    attach.mutate(
      { keys, albumId },
      {
        onSuccess: () => setPicked(new Set()),
        onError: () => Alert.alert('Could not file them', 'Check your connection and try again.'),
      },
    );

  const confirmDelete = () =>
    Alert.alert(
      `Delete ${keys.length} ${keys.length === 1 ? 'file' : 'files'}?`,
      'They are removed from storage for good, along with their previews. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            remove.mutate(keys, {
              onSuccess: (result) => {
                setPicked(new Set());
                // useDeleteFiles refreshes album lists; this one is its own key.
                void queryClient.invalidateQueries({ queryKey: unassignedFilesKey });
                if (result.failed > 0) {
                  Alert.alert(
                    'Some files were not deleted',
                    `${result.failed} ${result.failed === 1 ? 'is' : 'are'} still here — try those again.`,
                  );
                }
              },
              onError: () =>
                Alert.alert('Could not delete', 'Check your connection and try again.'),
            }),
        },
      ],
    );

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScreenHeader title="Not in an album" subtitle="Still counted in your storage" />

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#B66A40" />
        </View>
      ) : loadFailed && files.length === 0 ? (
        <LoadFailed what="these files" onRetry={() => void refetch()} />
      ) : files.length === 0 ? (
        <View className="flex-1 items-center justify-center px-10">
          <Text className="text-foreground text-[15px] font-bold text-center">
            Every file is in an album
          </Text>
          <Text className="text-muted-foreground text-[13px] text-center mt-1.5 leading-5">
            Files left behind by a deleted album, or an upload that stopped before its album
            was chosen, show up here.
          </Text>
        </View>
      ) : (
        <>
          <View className="flex-row items-center px-5 py-3 border-b border-border">
            <Pressable
              onPress={() => setPicked(allPicked ? new Set() : new Set(files.map((f) => f.key)))}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: allPicked }}
              hitSlop={8}
              className="flex-row items-center gap-2.5 flex-1"
            >
              <Tick on={allPicked} />
              <Text className="text-muted-foreground text-xs font-semibold">
                {picked.size > 0 ? `${picked.size} selected` : `${files.length} files`}
              </Text>
            </Pressable>
          </View>

          <FlatList
            data={files}
            keyExtractor={(file) => file.key}
            contentContainerStyle={{ paddingBottom: 120 }}
            renderItem={({ item: file }) => {
              const on = picked.has(file.key);
              const isImage = file.contentType?.startsWith('image/');
              return (
                <Pressable
                  onPress={() => toggle(file.key)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  className={`flex-row items-center gap-3 px-5 py-2.5 ${on ? 'bg-secondary' : ''}`}
                >
                  <Tick on={on} />
                  {isImage && file.url ? (
                    <RemoteImage
                      source={{ uri: file.url }}
                      style={{ width: 40, height: 40, borderRadius: 8 }}
                      contentFit="cover"
                    />
                  ) : (
                    <View className="w-10 h-10 rounded-lg bg-muted items-center justify-center">
                      <FileIcon size={16} className="text-muted-foreground" />
                    </View>
                  )}
                  <View className="flex-1 min-w-0">
                    <Text className="text-foreground text-sm" numberOfLines={1}>
                      {fileNameFromKey(file.key)}
                    </Text>
                    <Text className="text-muted-foreground text-xs mt-0.5">
                      {formatBytes(file.sizeBytes)}
                    </Text>
                  </View>
                </Pressable>
              );
            }}
          />

          {picked.size > 0 && (
            <SafeAreaView
              edges={['bottom']}
              className="absolute left-0 right-0 bottom-0 bg-card border-t border-border"
            >
              <View className="flex-row gap-2.5 px-4 pt-3 pb-2">
                <Pressable
                  onPress={() => setChoosing(true)}
                  disabled={busy || ownAlbums.length === 0}
                  accessibilityRole="button"
                  className="flex-1 min-h-12 flex-row items-center justify-center gap-2 rounded-xl bg-action active:opacity-90"
                  style={{ opacity: busy || ownAlbums.length === 0 ? 0.5 : 1 }}
                >
                  {attach.isPending ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <FolderInputIcon size={16} className="text-action-foreground" />
                  )}
                  <Text className="text-action-foreground text-[13px] font-bold">
                    {ownAlbums.length === 0 ? 'Make an album first' : 'File into an album'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={confirmDelete}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel="Delete the selected files"
                  className="min-h-12 px-4 flex-row items-center justify-center gap-2 rounded-xl border border-border active:opacity-70"
                >
                  {remove.isPending ? (
                    <ActivityIndicator size="small" color="#C76B4A" />
                  ) : (
                    <Trash2Icon size={16} className="text-destructive" />
                  )}
                </Pressable>
              </View>
            </SafeAreaView>
          )}
        </>
      )}

      <ChoiceSheet
        visible={choosing}
        title="File into an album"
        hint={`${picked.size} ${picked.size === 1 ? 'file' : 'files'}`}
        options={ownAlbums.map((album) => ({ value: album.id, label: album.name }))}
        value={null}
        onChoose={fileInto}
        onClose={() => setChoosing(false)}
      />
    </SafeAreaView>
  );
}

function Tick({ on }: { on: boolean }) {
  return (
    <View
      className={`w-5 h-5 rounded-md items-center justify-center ${on ? 'bg-action' : 'border border-border'}`}
    >
      {on && <CheckIcon size={12} className="text-action-foreground" />}
    </View>
  );
}
